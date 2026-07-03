// lib/dubs/cloudflare.ts
// Cloudflare Stream operations for the dubbing pipeline:
//   - ensure an MP4 download exists (ElevenLabs needs a fetchable source URL)
//   - add an alternate audio track by URL (POST /audio/copy — VERIFIED working
//     on this account 2026-07-03: queued -> ready in <=90s)
//   - wait for the track to reach "ready"
// No payment and no database work here.

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

function base(uid: string): string {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in env")
  }
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`
}

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DOWNLOAD_POLL_MS = 5_000
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000 // spike measured <40s for a 60s video

/** Enable (idempotent) and wait for the video's default MP4 download; returns its public URL. */
export async function ensureMp4Download(uid: string): Promise<string> {
  const res = await fetch(`${base(uid)}/downloads`, { method: "POST", headers: auth() })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`MP4 download enable failed: ${res.status} ${body.slice(0, 300)}`)
  }
  const startedAt = Date.now()
  for (;;) {
    const poll = await fetch(`${base(uid)}/downloads`, { headers: auth() })
    if (!poll.ok) throw new Error(`MP4 download status failed: ${poll.status}`)
    const data = (await poll.json()) as { result?: { default?: { status?: string; url?: string } } }
    const dl = data.result?.default
    if (dl?.status === "ready" && dl.url) return dl.url
    if (Date.now() - startedAt > DOWNLOAD_TIMEOUT_MS) {
      throw new Error(`MP4 download not ready within ${DOWNLOAD_TIMEOUT_MS / 1000}s (status: ${dl?.status ?? "unknown"})`)
    }
    await sleep(DOWNLOAD_POLL_MS)
  }
}

const AUDIO_POLL_MS = 10_000
const AUDIO_TIMEOUT_MS = 5 * 60_000 // measured ~90s to ready

interface AudioTrack {
  uid?: string
  label?: string
  status?: string
  default?: boolean
}

/** Add an alternate audio track from a publicly fetchable URL. Returns the track uid. */
export async function addAudioTrackFromUrl(uid: string, label: string, url: string): Promise<string> {
  const res = await fetch(`${base(uid)}/audio/copy`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ label, url }),
  })
  const data = (await res.json().catch(() => null)) as { success?: boolean; result?: { uid?: string }; errors?: Array<{ message?: string }> } | null
  if (!res.ok || !data?.success || !data.result?.uid) {
    throw new Error(`audio track add failed: ${res.status} ${JSON.stringify(data?.errors ?? data).slice(0, 300)}`)
  }
  return data.result.uid
}

/** Poll until the given audio track is "ready". List shape is { result: { audio: [...] } }. */
export async function waitForAudioReady(uid: string, trackUid: string): Promise<void> {
  const startedAt = Date.now()
  for (;;) {
    const res = await fetch(`${base(uid)}/audio`, { headers: auth() })
    if (!res.ok) throw new Error(`audio track status failed: ${res.status}`)
    const data = (await res.json()) as { result?: { audio?: AudioTrack[] } }
    const track = (data.result?.audio ?? []).find((t) => t.uid === trackUid)
    if (track?.status === "ready") return
    if (track?.status === "error") throw new Error(`Cloudflare could not process the dubbed audio track (status: error)`)
    if (Date.now() - startedAt > AUDIO_TIMEOUT_MS) {
      throw new Error(`audio track not ready within ${AUDIO_TIMEOUT_MS / 1000}s (status: ${track?.status ?? "missing"})`)
    }
    await sleep(AUDIO_POLL_MS)
  }
}
