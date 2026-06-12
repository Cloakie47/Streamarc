# SPIKE-RESULTS.md

Validation spike for the Clip Agent build. Throwaway — all probe commands live
in `/spike/run-spike.sh`. No app code was modified.

**Run date:** 2026-06-11 (UTC ~17:00–17:05)
**Cloudflare account:** `359758a138b587d83c4d1a81eb210b29` (token + keys read from
`.env.local`; secret values are redacted throughout this doc).

## Test video selection — note on Supabase

The plan was to pull a `cloudflare_uid` from the Supabase `videos` table, but
**the Supabase host does not resolve**:

```
$ curl https://ykfgeghvlgdrxfliermb.supabase.co/rest/v1/
curl: (6) Could not resolve host: ykfgeghvlgdrxfliermb.supabase.co
```

(Cloudflare and other hosts resolve fine from the same shell, so this is the
Supabase project specifically — almost certainly paused/deleted on the free
tier, or its DNS is gone. Flagging because the agent's settlement path reads
this same Supabase project — see OPEN ITEMS.)

I sidestepped it by listing videos directly from the Cloudflare Stream account
(`GET /accounts/{ACCT}/stream`), which returns real uids that definitely exist:

| uid | duration | ready | name |
|---|---|---|---|
| `7f8ac7357d421d85ff9dc812d74c7137` | 100.1s | ✅ | TO BE HERO X - Opening - INERTIA.mp4 |
| `e7f48b3b8dac8feb02f0a7a998f726ee` | 41.2s | ✅ | Sam - Circle and Arc Community (@samconnerone) - X.mp4 |
| **`bdcd3f5e6bbb857ef29eec4b602c26ed`** | **60.1s** | ✅ | **Money is now open.mp4** ← test video |
| `09354b52b74ec46b32bf67087f6dcaa5` | 50s | ✅ | Welcome to the Era of Open Money.mp4 |

Chose **`bdcd3f5e6bbb857ef29eec4b602c26ed`** ("Money is now open.mp4", 60.1s):
long enough for a 20s clip + 30s audio, and has narration for meaningful
captions.

---

## 1. CAPTIONS — ✅ WORKS (auto AI generation on this account/tier)

**Generate** (note: the language goes in the path, plus a `/generate` suffix —
this is the current "generate" variant, distinct from uploading your own VTT):

```
POST /accounts/{ACCT}/stream/bdcd3f5e6bbb857ef29eec4b602c26ed/captions/en/generate
Authorization: Bearer <CLOUDFLARE_API_TOKEN>
```

Response (HTTP 200):
```json
{
  "result": { "language": "en", "label": "English (auto-generated)",
              "generated": true, "status": "inprogress" },
  "success": true, "errors": [], "messages": []
}
```

**Poll** `GET /accounts/{ACCT}/stream/{uid}/captions/en` until
`result.status == "ready"`.

**Timing:** by the first poll (~40s after the generate call, accounting for
intervening probe calls) status was already `ready`. **Generation completed in
under ~40s** for a 60s video. (Re-confirmed `ready` on a follow-up poll 12s
later.)

**List languages** `GET /accounts/{ACCT}/stream/{uid}/captions`:
```json
{ "result": [ { "language": "en", "label": "English (auto-generated)",
                "generated": true, "status": "ready" } ], "success": true }
```
Only `en` exists because only `en` was requested. Generation is **per-language,
on demand** — request other languages by changing the path segment
(`/captions/{lang}/generate`). Supported language set was not enumerated in this
spike (only `en` was needed); confirm the full list against Cloudflare docs if
multi-language is required.

**Download VTT** `GET /accounts/{ACCT}/stream/{uid}/captions/en/vtt` → returns
raw `text/vtt`. First cues:

```
WEBVTT

1
00:00:01.120 --> 00:00:02.100
Continue straight.

2
00:00:03.320 --> 00:00:04.080
You've arrived.

3
00:00:04.220 --> 00:00:06.900
The open Internet has changed a few things in our lives.
...
```

- **Timestamp format:** `HH:MM:SS.mmm --> HH:MM:SS.mmm` (millisecond precision)
  — directly usable for clip boundary selection.
- **Cue count:** 20 cues across 81 VTT lines for the 60s video.
- **Quality:** real transcribed speech (not metadata filler), word-accurate on
  spot check.

**Conclusion for the agent:** Cloudflare's native AI caption generation is a
viable transcription source — fast (sub-minute here), millisecond timestamps,
no extra infra. This likely removes the need for Whisper + ffmpeg entirely for
English content. (Whisper remains the fallback if you need languages Cloudflare
doesn't generate, word-level timestamps, or speaker diarization.)

---

## 2. CLIP API — ✅ WORKS

```
POST /accounts/{ACCT}/stream/clip
Authorization: Bearer <CLOUDFLARE_API_TOKEN>
Content-Type: application/json
{ "clippedFromVideoUID": "bdcd3f5e6bbb857ef29eec4b602c26ed",
  "startTimeSeconds": 10, "endTimeSeconds": 30 }
```

Response (HTTP 200) — a **new video uid** is returned immediately, initially
`state: "queued"`:
```json
{ "result": {
    "uid": "140c81aa5e8de2741afc6c7dbd2bb2d4",
    "readyToStream": false,
    "status": { "state": "queued" },
    "clippedFrom": "bdcd3f5e6bbb857ef29eec4b602c26ed",
    "playback": { "hls": "https://cloudflarestream.com/140c81aa5e8de2741afc6c7dbd2bb2d4/manifest/video.m3u8",
                  "dash": "https://cloudflarestream.com/140c81aa5e8de2741afc6c7dbd2bb2d4/manifest/video.mpd" },
    "requireSignedURLs": false, "duration": -1 },
  "success": true }
```

**Processing time:** ready within ~40s (already `state: "ready"`,
`duration: 20` by the first poll). Poll the new uid via
`GET /accounts/{ACCT}/stream/{clipUid}`.

**Playable confirmation:** fetched the clip's HLS master manifest with **no
auth** → HTTP 200, valid multi-rendition playlist (240p/360p/480p/720p/1080p,
H.264 + AAC, 23.976fps):
```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="avc1.4d4028,mp4a.40.2",...
...
```
- New clip uid: **`140c81aa5e8de2741afc6c7dbd2bb2d4`**, exact duration **20s**.
- `requireSignedURLs: false` → clip is publicly playable by uid, same as source.

> Artifact left on the account: clip `140c81aa5e8de2741afc6c7dbd2bb2d4`. Delete
> with `DELETE /accounts/{ACCT}/stream/140c81aa5e8de2741afc6c7dbd2bb2d4` if you
> want it gone.

---

## 3. MP4 DOWNLOADS — ✅ WORKS, no auth needed to fetch

**Enable:**
```
POST /accounts/{ACCT}/stream/bdcd3f5e6bbb857ef29eec4b602c26ed/downloads
Authorization: Bearer <CLOUDFLARE_API_TOKEN>
```
Response (HTTP 200):
```json
{ "result": { "default": {
    "status": "inprogress",
    "url": "https://customer-l6swr9mq7yyb3m7m.cloudflarestream.com/bdcd3f5e6bbb857ef29eec4b602c26ed/downloads/default.mp4",
    "percentComplete": 0 } }, "success": true }
```
Ready (`status: "ready"`, `percentComplete: 100`) by the first poll (~sub-40s).

**Fetching the MP4 — auth behavior (important):**
- The `default.mp4` URL is on the **public customer-stream domain**
  (`customer-l6swr9mq7yyb3m7m.cloudflarestream.com`), **not** the API domain.
- A bare `GET` (no `Authorization` header) returns **HTTP 302** redirecting to a
  short-lived **signed** URL (`/dl/default.mp4?p=<base64-payload>&s=<sig>`):
  ```
  HTTP/1.1 302 Found
  Location: https://customer-l6swr9mq7yyb3m7m.cloudflarestream.com/.../dl/default.mp4?p=...&s=...
  ```
- Following the redirect (`curl -L`, still **no auth header**) → **HTTP 200**,
  full file:
  ```
  final_http=200  size_bytes=29073834  content_type=video/mp4
  file type: ISO Media, MP4 Base Media v1 [ISO 14496-12:2003]
  ```

**So: no Bearer token / no API auth is needed to download the MP4.** Cloudflare
mints the signed delivery URL automatically on the public endpoint because the
video has `requireSignedURLs: false`. Any HTTP client that follows redirects
gets the bytes. (The decoded redirect payload confirms `totalByteSize:
29073834`, `durationSecs: 60.1`, `resolution: 1080`.)

- **Downloaded size:** 29,073,834 bytes (~29 MB) for the 60s 1080p source.

**Conclusion for the agent:** the MP4 download path is a clean, auth-free way to
get the full media file for local processing (e.g. Whisper/ffmpeg) if the
caption route is ever insufficient. Just use a redirect-following client.

---

## 4. SDK BATCHING — confirmed: `settle()` is SINGLE-PAIR, not array

Read from `node_modules/@circle-fin/x402-batching/dist/server/index.d.ts`. The
class implements `FacilitatorClient`, whose `settle` signature is:

```ts
interface FacilitatorClient {
    verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse>;
    settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse>;
    getSupported(): Promise<SupportedResponse>;
}

declare class BatchFacilitatorClient implements FacilitatorClient {
    constructor(config?: BatchFacilitatorConfig);
    verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse>;
    settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse>;
    getSupported(): Promise<SupportedResponse>;
}
```

```ts
interface SettleResponse {
    success: boolean;
    errorReason?: string;
    payer?: string;
    transaction: string;   // single tx hash
    network: string;
}
```

**`settle` accepts exactly one `(PaymentPayload, PaymentRequirements)` pair and
returns one `SettleResponse` with a single `transaction` hash. There is no
array/batch overload.** This resolves OPEN QUESTION #2 from
AGENT-BUILD-REPORT.md: the existing `settle-session` route's two separate
`settle()` calls (creator + platform) are the only way to do it — **there is no
true multi-authorization batch call** at the client API level.

The "batching" in the package name refers to **Gateway-side** settlement
semantics, not a client-side array. From the docstrings/types:
- The EIP-712 domain is `GatewayWalletBatched` / version `1`
  (`CIRCLE_BATCHING_NAME`, `CIRCLE_BATCHING_VERSION` in `types-DnHgU28a.d.ts`).
- `isBatchPayment(requirements)` / `supportsBatching()` just check
  `extra.name === "GatewayWalletBatched"`.
- The client `POST`s to `/v1/x402/settle` per call; default base URL is
  `https://gateway-api-testnet.circle.com` (`BatchFacilitatorConfig.url`).
- A docstring describes batching as "gas-free for users" — the benefit is that
  the **payer signs an off-chain EIP-3009 authorization** and Gateway settles
  it (no gas for the user), NOT that multiple payments collapse into one client
  call.

`BatchEvmSigner.signTypedData` (in `types-DnHgU28a.d.ts`) takes a single
`TransferWithAuthorizationMessage` (`from, to, value, validAfter, validBefore,
nonce`) — again, one authorization at a time.

**Implication for the agent:** each payment = one `settle()` = one on-chain tx.
The creator+platform split is inherently 2 settlements/2 txs. To control cost,
the agent must **accumulate seconds and settle in larger chunks** (e.g. once per
N seconds, or once at end of consumption), not per-second. No SDK-level batch
exists to fold those together.

> On gas: this spike did not exercise an actual settlement, so whether the payer
> EOA needs native gas on Arc (vs. fully Gateway-sponsored) is still unverified
> — the "gas-free for users" docstring suggests sponsored, but confirm before
> funding the agent wallet. (Carried over as an open item.)

---

## 5. ffmpeg fallback — SKIPPED (captions succeeded)

Per the spike instructions, step 5 runs **only if captions fail**. Captions
succeeded (§1), so the 30s-mp3 extraction was **not performed**.

Read-only availability check (no install attempted):
```
$ ffmpeg -version  → command not found
$ where ffmpeg     → not found
```
**ffmpeg is NOT installed / not on PATH on this Windows machine.** Not needed
for the spike, but relevant for the build: if the agent ever needs local audio
extraction (Whisper fallback), ffmpeg must be installed (`winget install
Gyan.FFmpeg` locally, or an apt/nix layer in the Railway image — Railpack does
not ship it). Given §1, the Cloudflare caption path likely avoids this
dependency for English content.

---

## SUMMARY

| # | Capability | Result | Time-to-ready | Auth to consume output |
|---|---|---|---|---|
| 1 | AI caption generation + VTT | ✅ works | < ~40s (60s video) | API token to generate; VTT via API token |
| 2 | 20s clip creation | ✅ works, new uid `140c81aa…` | < ~40s | none (public HLS) |
| 3 | MP4 download enable + fetch | ✅ works, 29 MB | < ~40s | **none** (302 → signed URL, auto) |
| 4 | x402 `settle()` batching | single pair only, no array | n/a | n/a |
| 5 | ffmpeg extraction | skipped (captions OK) | n/a | ffmpeg absent on PATH |

## OPEN ITEMS (could not determine in this spike)

1. **Supabase project does not resolve** (`ykfgeghvlgdrxfliermb.supabase.co`).
   The agent's settlement path (and `videos.rate_per_sec`, creator wallets,
   `earnings` writes) all depend on this exact project. Confirm whether it's
   paused (resumable from the Supabase dashboard) or gone before building.
2. **Full list of Cloudflare-supported caption languages** for AI generation —
   only `en` was tested.
3. **Gas model for Gateway settlement** — does the payer EOA need native Arc gas,
   or is it fully sponsored? No live settlement was run here.
4. **Caption quality on low-speech content** — the chosen video had clear
   narration. Music-heavy/anime clips (e.g. the "TO BE HERO X" opening) may
   yield sparse/empty captions; the agent should handle a near-empty VTT.
