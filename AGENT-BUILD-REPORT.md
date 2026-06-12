# AGENT-BUILD-REPORT.md

Pre-build codebase reconnaissance for the AI "Clip Agent" (paying-viewer bot
that buys video per-second via Circle Gateway / EIP-3009, transcribes with
Whisper, and selects clip-worthy moments with the Claude API).

This report is **read-only reconnaissance**. It maps what exists today. Every
file path, function name, table, and column below is real and verified against
the working tree unless explicitly flagged as inferred or missing.

A note on schema sources up front: **there is no schema DDL checked into this
repo.** `supabase/sql/` contains only RPC helper functions
(`payment_helpers.sql`) and mock seed data (`mock_watch_e2e.sql`). Every table
shape below is reconstructed from `app/lib/types.ts` and from the columns the
code actually reads/writes. Treat all column lists as "confirmed used by code"
rather than "confirmed by migration." This matters for the agent build — see
OPEN QUESTIONS.

---

## 1. SETTLEMENT ENGINE

### 1.1 The full payment path

The live payment route is **`app/api/gateway/settle-session/route.ts`** (POST).
Its import graph is shallow:

| Import | Source | Role |
|---|---|---|
| `BatchFacilitatorClient` | `@circle-fin/x402-batching/server` | Submits each signed authorization to Circle for on-chain settlement |
| `getWalletIdByAddress`, `signTypedDataWithWallet` | `app/lib/circle-wallets.ts` | Resolve a Circle wallet ID from an address; produce an EIP-712 signature using Circle's developer-controlled-wallets signer |
| `getSupabaseAdmin` | `app/lib/supabase-server.ts` | Service-role Supabase client (bypasses RLS) |

That is the entire dependency surface. There is no shared "settlement service"
module — the route inlines everything (domain, types, payload builders,
DB writes).

#### Hardcoded constants in the route

```
GATEWAY_WALLET   = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"   // line 8
USDC_ADDRESS     = "0x3600000000000000000000000000000000000000"   // line 9 (Arc USDC)
CHAIN_ID         = 5042002                                        // line 10 (Arc testnet)
platformWallet   = "0xfa53779d7cb905489d84f1ab2da309624427cafa"   // line 75
network string   = "eip155:5042002"                               // payload/requirements
rate fallback    = 0.00005                                        // line 51 (NOTE: differs from constants.ts 0.00003)
fee split        = 80% creator / 20% platform                     // lines 77-78
validBefore      = now + 2592000  (30 days)                       // line 83
validAfter       = now - 600      (10 min skew)                   // lines 136/149
```

> **Rate inconsistency flag:** the route's fallback `rate_per_sec` is `0.00005`
> (line 51), but `app/lib/constants.ts` `PAYMENT_CONFIG.ratePerSecond` is
> `0.00003`, and the upload default (`app/api/stream/upload-url/route.ts`) is
> also `0.00003`. The fallback only fires if a video row has a null
> `rate_per_sec`; for real videos the DB value wins. The agent should read
> `videos.rate_per_sec` and not assume a constant.

#### Exact inputs / outputs of `settle-session`

**Input (JSON body):** `{ session_id, viewer_id, creator_id, video_id, seconds_watched }`

**Processing (verified, route lines):**
1. Load `watch_sessions` row by `(id = session_id, viewer_id = viewer_id)`; 403 if absent (lines 22–31).
2. If `seconds_watched <= 0`: mark `settled = true`, return `{success, amount: 0}` (lines 33–36).
3. Read `users.wallet_address, circle_wallet_id` for the viewer (lines 38–42).
4. Read `videos.rate_per_sec`; compute `actualAmount = seconds_watched * rate` (lines 45–52).
5. Resolve viewer Circle wallet ID: `viewer.circle_wallet_id ?? getWalletIdByAddress(viewer.wallet_address)` (lines 58–62).
6. Read creator `users.wallet_address` by `creator_id` (lines 64–73). **No owner/`owner_id` resale check here** (unlike the legacy `transfer`/`sessions` routes — see §4).
7. Compute `creatorAmount = round(actual * 0.80 * 1e6)`, `platformAmount = round(actual * 0.20 * 1e6)` as 6-decimal strings (lines 77–78).
8. Generate two random 32-byte nonces; check/reserve them in `used_nonces` (lines 80–100).
9. Build EIP-712 domain + `TransferWithAuthorization` types (lines 102–118).
10. Sign twice (creator, platform) via `signTypedDataWithWallet` (lines 127–156).
11. Call `facilitator.settle(payload, requirements)` once for creator, once for platform (lines 207–221).
12. Update `watch_sessions` (actual_amount, authorized_amount, seconds_paid, total_cost) (lines 240–248).
13. Insert `payment_batches` row, then `earnings` row (lines 250–276).

**Output:** `{ success, amount, net_to_creator, platform_fee, creator_tx, platform_tx }`.

### 1.2 Is the payer an arbitrary Circle wallet, or coupled to the session?

**The payer is decoupled from any auth session, but coupled to a Supabase
`users` row.** Concretely:

- There is **no authentication** on this route (no `getServerSession`, no
  middleware — confirmed, see §6.1). The "session" it checks is the
  `watch_sessions` DB row, not a login session.
- The payer wallet is derived **entirely from the `viewer_id` body parameter**:
  it reads `users.wallet_address` + `users.circle_wallet_id` for that
  `viewer_id` (lines 38–42, 58–59). The signature is produced by Circle for
  whatever `circle_wallet_id` that row points at.
- So today the payer **must be a row in the `users` table** with a populated
  `wallet_address` and (ideally) `circle_wallet_id`. It cannot be a bare
  `circle_wallet_id` passed in directly.

**Implication for the agent:** the cleanest path is to give the agent its own
`users` row (or a dedicated agent-wallet row) with `wallet_address` +
`circle_wallet_id` set, OR to build a new settle-core that takes
`payerWalletId` + `payerAddress` directly and skips the `users` lookup. The
signing primitive itself (`signTypedDataWithWallet`) only needs a Circle
`walletId` — it has no concept of a user. The user-coupling lives only in the
route, not in the lib.

### 1.3 Where the two EIP-3009 signatures are generated, and their parameters

Both signatures are generated in `settle-session/route.ts` by calling
`signTypedDataWithWallet` (defined in `app/lib/circle-wallets.ts:255`), which
wraps Circle's `client.signTypedData({ walletId, data })`.

**EIP-712 domain** (lines 102–107):
```js
{ name: "GatewayWalletBatched", version: "1", chainId: 5042002,
  verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" }
```

**Type** `TransferWithAuthorization` (the EIP-3009 struct, lines 109–118):
`from, to, value, validAfter, validBefore, nonce` (address/address/uint256/uint256/uint256/bytes32).

**Message parameters per signature:**

| Param | Creator sig (line 132) | Platform sig (line 148) |
|---|---|---|
| `from` | `viewer.wallet_address` (EOA that owns the Gateway balance) | same |
| `to` | `creatorWallet` (from `users.wallet_address`) | `platformWallet` (hardcoded) |
| `value` | `round(actual * 0.80 * 1e6)` | `round(actual * 0.20 * 1e6)` |
| `validAfter` | `now - 600` | `now - 600` |
| `validBefore` | `now + 2592000` | `now + 2592000` |
| `nonce` | `creatorNonce` (random32, reserved in DB) | `platformNonce` (random32, reserved in DB) |

`signTypedDataWithWallet(walletId, domain, types, primaryType, message)`
returns the signature string or `null` on failure. It internally adds the
`EIP712Domain` type array and JSON-stringifies the typed-data document before
calling Circle.

### 1.4 What it takes to extract `lib/settle-core/`

Target signature requested: `settle(payerWalletId, creatorAddress, seconds, ratePerSecond)`.

**Functions to copy / move:**

1. **`signTypedDataWithWallet`** — copy as-is from `circle-wallets.ts:255`. It
   already takes a raw `walletId` and is user-agnostic. Pure dependency:
   `getClient()` (the `initiateDeveloperControlledWalletsClient` factory,
   `circle-wallets.ts:36`).
2. **`getClient()`** — copy (circle-wallets.ts:36). Depends only on
   `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET` env.
3. **`getWalletIdByAddress`** — copy if you want address→ID resolution
   (circle-wallets.ts:245). Optional if the agent already holds its
   `walletId`.
4. **`randomNonce()`** — copy from `settle-session/route.ts:12` (8 lines, uses
   Web Crypto `crypto.getRandomValues`).
5. **The domain/types/payload/requirements builders** — extract verbatim from
   `settle-session/route.ts:102–204` (`domain`, `types`, `buildPayload`,
   `buildRequirements`). These are the EIP-3009 / x402 envelope.
6. **`BatchFacilitatorClient`** — import as-is from
   `@circle-fin/x402-batching/server`; instantiate once at module load.

**Things to parameterize instead of hardcode:**
`GATEWAY_WALLET`, `USDC_ADDRESS`, `CHAIN_ID`, `platformWallet`, fee split.

**Things to drop from the route when extracting:** the `watch_sessions` /
`users` / `videos` Supabase reads, and the `payment_batches` / `earnings`
writes. A clean `settle-core` should do **only** sign + settle and return the
tx hashes; the caller decides what to persist. (But see §4 — the agent's
payments must land in `earnings` to show up in the studio, so the agent's
route should still do those inserts after calling settle-core.)

**Proposed core API:**
```
// lib/settle-core/index.ts
settlePerSecond({
  payerWalletId,        // Circle walletId
  payerAddress,         // EOA that owns Gateway balance (the EIP-3009 `from`)
  creatorAddress,
  seconds,
  ratePerSecond,
  platformWallet?,      // default to the existing constant
  feeSplit?,            // default 0.80 / 0.20
}) => { creatorTx, platformTx, amount, netToCreator, platformFee }
```

`payerAddress` is required as a distinct argument because the EIP-3009 `from`
must be the **EOA address that owns the Gateway balance**, not the walletId.
The route reuses `viewer.wallet_address` for this (lines 133/149/182).

### 1.5 Batching: is it real today? What does `BatchFacilitatorClient.settle` accept?

**There is no batching today, despite the name.** The route calls
`facilitator.settle(...)` **twice** — once for the creator authorization
(line 207) and once for the platform authorization (line 218). Each call passes
**a single `(payload, requirements)` pair**, not an array:

```js
const creatorResult  = await facilitator.settle(buildPayload(...), buildRequirements(...))
const platformResult = await facilitator.settle(buildPayload(...), buildRequirements(...))
```

Both args are cast `as never` (lines 208–209, 219–220), so TypeScript is not
enforcing the SDK's real signature here — a sign the integration was done by
trial. The "batched" naming comes from the EIP-712 domain
(`GatewayWalletBatched`) and the contract, not from the call pattern. Each
authorization settles as its own on-chain transaction (`creatorResult.transaction`,
`platformResult.transaction`).

> If the agent buys video in many small per-second increments, this two-tx-per-
> settlement pattern is expensive. The agent should **accumulate seconds and
> settle in larger chunks** (e.g. once per N seconds or once at end-of-watch),
> exactly as the human viewer flow effectively does (settle on pause/unmount —
> see §4). Whether the underlying SDK supports a true multi-authorization batch
> call is **unconfirmed** (the code does not use it). See OPEN QUESTIONS.

There is also a **legacy, non-Gateway path** in
`app/api/gateway/transfer/route.ts` and `app/api/sessions/route.ts` that does a
plain ERC-20 `transfer(address,uint256)` via
`client.createContractExecutionTransaction` (sessions/route.ts:148). This is a
direct on-chain USDC transfer, **not** EIP-3009/Gateway, and the UI no longer
drives it (the live client calls `settle-session`). Ignore it for the agent
except as a fallback reference.

---

## 2. WALLETS — `app/lib/circle-wallets.ts`

### 2.1 How a new Circle EOA wallet is created

`createGatewayWallet(userId)` (line 66):
1. Requires `CIRCLE_WALLET_SET_ID` env (returns null if missing).
2. Calls `client.listWallets({ refId: userId })` first — **idempotent**: if a
   wallet already exists for that `refId`, it returns the existing one.
3. Otherwise `client.createWallets({ walletSetId, blockchains: ["ARC-TESTNET"],
   count: 1, accountType: "EOA", metadata: [{ name: \`streamarc-${userId}\`,
   refId: userId }] })`.
4. Returns `{ id, address }` (the Circle `walletId` and the EOA address).

**IDs / secrets needed to create a wallet:**
- `CIRCLE_API_KEY` (Bearer auth)
- `CIRCLE_ENTITY_SECRET` (hex; encrypted per-request to a ciphertext via
  `generateEntitySecretCiphertext`, lines 26–34, using Circle's entity public
  key fetched at `getCirclePublicKey`, lines 8–24)
- `CIRCLE_WALLET_SET_ID` (which wallet set the new wallet belongs to)

The developer-controlled-wallets client (`getClient`, line 36) only needs
`CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`. The SDK handles entity-secret
encryption internally for `createWallets`/`signTypedData`; the manual
`generateEntitySecretCiphertext` is only used for the raw-fetch
`deriveWalletByAddress` call (cross-chain, line 158).

### 2.2 Steps to create a dedicated agent wallet + deposit USDC into the Gateway on Arc

**Create the wallet (no human needed):**
- `createGatewayWallet(...)` takes a `userId` only to use as the Circle `refId`
  and metadata name. There is **no Google OAuth / Supabase requirement inside
  this function** — it talks only to Circle. You can pass any stable string
  (e.g. `"clip-agent-001"`). It returns `{ id, address }`.
- **However**, to reuse `settle-session` (and to have payments flow through the
  existing studio earnings), the agent's `{ id, address }` must be stored
  somewhere the settlement code reads. Today that's a `users` row's
  `wallet_address` + `circle_wallet_id`. See the human-assumptions note below.

**Deposit USDC into the Gateway on Arc** — the existing mechanism is in
`app/api/gateway/deposit/route.ts`, function `depositArc` (lines 99–152):
1. Check the wallet's on-chain USDC balance via `getWalletBalance(address)`
   (circle-wallets.ts:227, uses `client.getWalletTokenBalance`).
2. Build a Circle EIP-1193 provider for the wallet
   (`createCircleEip1193Provider({ walletId, address })`, `app/lib/circle-eip1193.ts`).
3. Wrap it in a viem adapter (`createViemAdapterFromProvider`,
   `@circle-fin/adapter-viem-v2`).
4. `kit.deposit({ from: { adapter, address, chain: "Arc_Testnet" }, amount,
   token: "USDC" })` where `kit = new UnifiedBalanceKit()`
   (`@circle-fin/unified-balance-kit`).

For **cross-chain** funding (Base Sepolia / Avalanche Fuji / Ethereum Sepolia
→ Arc), `depositCrossChain` (lines 154–287) does: derive a same-address wallet
on the source chain (`deriveChainWallet`), check native gas + USDC, then
`approve(GATEWAY_WALLET, raw)` followed by `deposit(USDC, raw)` as two
`createContractExecutionTransaction` calls, polling each to completion
(`pollTransactionToComplete`, 60 attempts × 2s).

The Gateway contract is the same on Arc: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`.

**For the agent:** the simplest funded path is — create an EOA on Arc, send it
testnet USDC (Circle faucet), then call `depositArc` logic (or POST
`/api/gateway/deposit` with the agent's `user_id`) to move that USDC into the
Gateway balance so EIP-3009 authorizations can draw on it.

### 2.3 What assumes a human user

- **`createGatewayWallet` does not** assume a human — it only needs a `refId`
  string. ✅ Agent-friendly.
- **`deriveChainWallet`** writes/reads a `user_chain_wallets` table keyed by
  `user_id` (lines 116–225). Only needed for cross-chain; not needed if the
  agent funds directly on Arc.
- **Google OAuth linkage** lives only in `app/lib/auth.ts` (NextAuth providers)
  and is **not** referenced by wallet creation or settlement. The wallet/
  payment libs have zero coupling to OAuth.
- The **coupling to `users` rows** is the real human assumption, and it lives in
  the *routes* (`settle-session`, `deposit`), not the wallet lib. The agent
  either gets a `users` row or a new route that bypasses that lookup.

---

## 3. VIDEO PIPELINE

### 3.1 `videos` table (reconstructed from `types.ts` + code; no DDL in repo)

| Column | Type | Confirmed by | Notes |
|---|---|---|---|
| `id` | uuid | types.ts:13, all queries | PK |
| `creator_id` | uuid | types.ts:14, upload-url:66 | original uploader |
| `owner_id` | uuid? | sessions/route.ts:122, offers/accept | set after resale; **not** read by `settle-session` |
| `original_creator_id` | uuid? | offers/accept | resale royalty tracking |
| `title` | text | types.ts:15 | |
| `description` | text? | types.ts:16 | |
| `cloudflare_uid` | text? | types.ts:17, upload-url:71 | **the Cloudflare Stream video ID** |
| `thumbnail_url` | text? | types.ts:18, webhook:26 | |
| `duration_secs` | int | types.ts:19, webhook:25 | **stored in DB** (see §3.4) |
| `rate_per_sec` | numeric | types.ts:20, settle-session:47 | price per second; default `0.00003` |
| `status` | enum `pending\|processing\|live\|removed` | types.ts:21 | |
| `views` | int | types.ts:22 | bumped via `increment_video_views` RPC |
| `total_earned` | numeric | types.ts:23 | bumped via `increment_video_earnings` RPC (helper exists; **not** called by settle-session) |
| `created_at` | timestamptz | types.ts:24 | |
| `updated_at` | timestamptz? | payment_helpers.sql:6 | only column confirmed by SQL |
| `chapters` | json? | save-chapters:44 | |
| `categories` | json[]? | upload-url:74 | inferred |
| `accepts_offers` | bool | offers/route.ts | inferred |

> The agent only needs: `id`, `cloudflare_uid`, `rate_per_sec`, `duration_secs`,
> and the creator wallet (resolved via `creator_id`/`owner_id` → `users.wallet_address`).

### 3.2 Playback URLs and signing

**Playback is PUBLIC / UNSIGNED.** No `requireSignedURLs`, no JWT/token signing
anywhere in the repo. URL patterns:

- **HLS manifest** (used for hover-preview): `https://videodelivery.net/{cloudflare_uid}/manifest/video.m3u8` (`app/components/browse/VideoShelf.tsx:136`).
- **Thumbnail fallback**: `https://videodelivery.net/{cloudflare_uid}/thumbnails/thumbnail.jpg?height=720` (`app/components/watch/WatchPage.tsx:46`).
- **Main player**: `<Stream src={cloudflareUid} />` from `@cloudflare/stream-react` (`WatchPage.tsx:631`) — constructs playback internally from the bare uid.

**Implication for the agent:** it can fetch the HLS manifest at
`https://videodelivery.net/{cloudflare_uid}/manifest/video.m3u8` directly and
pull segments for transcription **without any signed token** — anyone with the
`cloudflare_uid` can stream. This is a security weakness in production but
convenient for the hackathon agent. Whether the agent should *pay before*
pulling segments is a design choice the code does not enforce (playback is not
gated on payment at all today).

### 3.3 Cloudflare Stream API calls

All use `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (Bearer):

| Route | Endpoint | Method | Purpose |
|---|---|---|---|
| `app/api/stream/upload-url/route.ts:32` | `POST /accounts/{ACCT}/stream/direct_upload` | POST | get tus upload URL + `uid`; body `{maxDurationSeconds:300, meta.name, creator:user_id}` |
| `app/api/stream/video-status/route.ts:13` | `GET /accounts/{ACCT}/stream/{uid}` | GET | poll `readyToStream`, `duration`, `thumbnail`; writes `status=live`, `duration_secs`, `thumbnail_url` |
| `app/api/stream/webhook/route.ts` | (inbound from Cloudflare) | POST | on ready: write `duration_secs`, `thumbnail_url`, `status`; fire-and-forget chapter trigger |
| `app/api/stream/delete/route.ts:36` | `DELETE /accounts/{ACCT}/stream/{uid}` | DELETE | delete on Cloudflare + DB (requires creator or admin) |
| `app/lib/generate-chapters-transcription-legacy.ts:42` | `GET /accounts/{ACCT}/stream/{uid}/captions` then VTT at `https://customer-{CODE}.cloudflarestream.com/{uid}/captions/{lang}` | GET | **DISABLED** legacy caption→chapter pipeline |

`NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_CODE` is only used for the legacy VTT URL.

### 3.4 Is duration stored or fetched live?

**Stored in the DB** (`videos.duration_secs`), written from Cloudflare's value
at two points: the webhook (`webhook/route.ts:25`,
`Math.round(body.duration)`) and the status poll
(`video-status/route.ts:37`). Mock data hardcodes `272`. The agent can read
`duration_secs` from the row and does not need a live Cloudflare call for it.

### 3.5 How `rate_per_sec` is set

Written at upload in `app/api/stream/upload-url/route.ts:70`:
`rate_per_sec: rate_per_sec ?? 0.00003`. **No min/max validation** in the route.
Read back at watch time (`WatchPage.tsx`) and in `settle-session` (line 47).

---

## 4. PRICING & EARNINGS

### 4.1 Price-per-second

Set per video at upload (`videos.rate_per_sec`, default `0.00003`). The
client-side accrual constant is `PAYMENT_CONFIG.ratePerSecond = 0.00003`
(`constants.ts`), used for the **live balance display only**; the **authoritative
charge** uses `videos.rate_per_sec` in `settle-session` (line 51, with the
`0.00005` fallback quirk noted in §1.1).

### 4.2 How earnings are recorded after settlement

In `settle-session/route.ts`, after a successful creator settlement:

1. **`watch_sessions`** UPDATE (lines 240–248): `actual_amount`,
   `authorized_amount`, `seconds_paid`, `total_cost`.
2. **`payment_batches`** INSERT (lines 250–265): `session_id, viewer_id,
   creator_id (= creator_id from body), video_id, amount, seconds_covered,
   chain:"arcTestnet", circle_transaction_id, status:"settled", settled_at`.
3. **`earnings`** INSERT (lines 268–275, only if the batch insert returned a
   row): `creator_id, video_id, batch_id, gross_amount, platform_fee,
   net_amount`.

> Note: `settle-session` does **not** call `increment_video_earnings` or
> `increment_user_spent` (those RPC helpers exist in `payment_helpers.sql` but
> are only referenced by the legacy `payments`/`sessions` flow). So
> `videos.total_earned` and `users.total_spent` are **not** updated by the live
> settlement path — the studio computes earnings from the `earnings` table
> instead (below).

### 4.3 What the studio reads

| Route | Tables | Aggregation | Creator key |
|---|---|---|---|
| `app/api/studio/earnings/route.ts` | `earnings` (sum `net_amount`, today vs total), `videos` (ids), `watch_sessions` (views, avg) | sums net_amount | `creator_id` in POST body |
| `app/api/studio/earnings-chart/route.ts` | `earnings` (last 30d, bucket by day) | daily net_amount | `creator_id` in POST body |
| `app/api/studio/videos/route.ts` | `videos`, `watch_sessions`, `earnings` (sum per video) | per-video earned | `creator_id` in POST body |

### 4.4 Will the agent's payments show up in creator earnings?

**Yes — automatically — IF the agent settles through `settle-session` (or a
clone that performs the same `payment_batches` + `earnings` inserts).** The
studio reads exclusively from the `earnings` table, keyed by `creator_id`.
`settle-session` writes an `earnings` row with `creator_id` = the `creator_id`
passed in the body. As long as the agent passes the correct `creator_id`, the
creator's studio dashboard will reflect the agent's spend with **no extra
writes needed**.

**Two caveats:**
1. `settle-session` records earnings against the **`creator_id` body param**, and
   does **not** apply the resale `owner_id` redirect that the legacy
   `sessions`/`transfer` routes do (`sessions/route.ts:127` pays
   `owner_id ?? creator_id`). If the agent watches a resold video, paying the
   original `creator_id` will both pay the wrong wallet and credit the wrong
   studio. The agent route should replicate the `owner_id ?? creator_id`
   resolution if resale matters for the demo.
2. `videos.total_earned` will **not** increment (see §4.2), so any UI reading
   that column directly (rather than the `earnings` table) won't reflect agent
   spend. The studio routes use `earnings`, so the dashboards are fine; spot-
   check any card that reads `total_earned`.

### 4.5 Viewer payment flow (for reference — the agent mimics this)

- `createWatchSession(viewerId, videoId)` → POST `/api/sessions` (only
  `viewer_id` + `video_id`) → inserts `watch_sessions` row, returns
  `session_id` (`payments.ts:127`, `sessions/route.ts:51`).
- Client accrues seconds locally; **settlement fires on pause and on
  unload/tab-close** (`keepalive: true`), not on a periodic timer — the
  interval `fireBatch()` is effectively a no-op in the current `WatchPage`.
- `settleWatchSession(...)` → POST `/api/gateway/settle-session`
  (`payments.ts:69`).
- `endWatchSession(...)` → PATCH `/api/sessions/{id}` with `ended_at`,
  `seconds_watched`, `completed` (`payments.ts:145`).

The agent does not need the browser lifecycle — it can call
`createWatchSession` → (consume/transcribe) → `settle-session` directly with
its accumulated `seconds_watched`.

---

## 5. ENVIRONMENT & DEPLOY

### 5.1 Every env var referenced (names only)

**Supabase**
- `NEXT_PUBLIC_SUPABASE_URL` (`supabase.ts`, `supabase-server.ts`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`supabase.ts`)
- `SUPABASE_SERVICE_ROLE_KEY` (`supabase-server.ts`)

**Circle**
- `CIRCLE_API_KEY` (circle-wallets, circle, circle-eip1193, deposit, send-external, sessions, register-circle-entity-secret.cjs)
- `CIRCLE_ENTITY_SECRET` (same set)
- `CIRCLE_WALLET_SET_ID` (circle-wallets.ts)

**Cloudflare**
- `CLOUDFLARE_ACCOUNT_ID` (upload-url, video-status, delete, legacy chapters)
- `CLOUDFLARE_API_TOKEN` (same)
- `NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_CODE` (legacy chapters VTT URL)

**Auth / app**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`auth.ts`)
- `NEXTAUTH_SECRET` (`auth.ts`)
- `NEXTAUTH_URL` (`webhook/route.ts` — used to self-fetch the chapter route)

**Email**
- `EMAIL_FROM`, `EMAIL_PASSWORD` (`email.ts`, nodemailer/Gmail)

**AI**
- `ANTHROPIC_API_KEY` (`generate-chapters-transcription-legacy.ts` only — the
  one existing Claude API integration, currently disabled)

**Blockchain / misc**
- `ARC_TESTNET_RPC_URL` (`circle-eip1193.ts`, defaults to `https://rpc-testnet.arcscan.app`)
- `NEXT_PUBLIC_DEFAULT_VIDEO_ID` (`constants.ts`)

> **New env the agent will add:** an OpenAI/Whisper key (no media/transcription
> key exists today beyond `ANTHROPIC_API_KEY`). The Claude key already exists
> and the existing legacy file shows the call shape (`POST
> https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5`,
> `generate-chapters-transcription-legacy.ts:73-81`) — though for the clip
> decision you'll likely want a stronger model than haiku.

### 5.2 Railway

`railway.json` (entire contents):
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK", "buildCommand": "npm install && npm run build" }
}
```
No Dockerfile, Procfile, or nixpacks config. Start command is implicit
(`next start` via the `start` script). **No custom timeout / worker config** —
this is a single Next.js web service.

### 5.3 Node version

`package.json` has **no `engines` field** — Node version is whatever Railpack
defaults to. If the agent needs a specific Node (e.g. for an ffmpeg static
binary or a Whisper SDK), pin it explicitly.

### 5.4 ffmpeg / media tooling

**None present.** No `ffmpeg`, `fluent-ffmpeg`, `whisper`, or `openai`
dependency in `package.json`. The only media handling is Cloudflare Stream
(`@cloudflare/stream-react`, `tus-js-client` for uploads) and the **disabled**
legacy caption pipeline. Transcription today is whatever Cloudflare auto-
captions produce — there is no local audio extraction.

**For the agent's Whisper step you will need to add, from scratch:** audio
extraction (ffmpeg, to pull audio from HLS segments) and a Whisper client
(OpenAI API or a local model). Note Railpack images may not ship ffmpeg — plan
to install it (apt/nix layer) or use a managed transcription API that takes a
URL/file and skips local ffmpeg entirely.

### 5.5 Background-job infrastructure

- **`inngest@^4.0.1` is in `package.json` but completely unused** — no client
  init, no functions, no handlers anywhere in the repo. It is available to wire
  up.
- The only async pattern today is **fire-and-forget `fetch(...).catch()`** in
  `webhook/route.ts:34-41` (no `await`, no retry) to kick chapter generation.
- No `after()`, no `waitUntil`, no queue, no cron.

This is the single biggest gap for the agent — see §6.3.

---

## 6. RISKS FOR THIS BUILD

### 6.1 Missing auth on money-moving routes (confirmed)

**Confirmed: no API route verifies the caller.** There is no `middleware.ts`,
and no route calls `getServerSession`. Auth in `app/lib/auth.ts` is NextAuth v5
JWT, but it is only consulted client-side / for the NextAuth handler — the API
routes trust body params blindly. Every financial route resolves the actor from
an **unauthenticated body ID**:

- `settle-session` — trusts `viewer_id` (only check: the `(session_id, viewer_id)`
  pair exists; lines 22–27). Anyone who knows both can trigger a settlement.
- `deposit`, `withdraw`, `send-external`, `tip`, `transfer` — all resolve the
  payer from `user_id`/`viewer_id` in the body with no ownership check.
- `sessions/[id]` **PATCH** applies an **arbitrary body** directly to the row
  (`.update(body).eq("id", id)`, `sessions/[id]/route.ts:11-14`) — a viewer can
  mark a session `settled` or rewrite `seconds_watched`.
- `studio/earnings*` — returns any creator's earnings for any `creator_id`.

**Which agent-facing routes must NOT repeat this:** any new route that
**moves the agent's funds or sets the amount** (the agent's settle endpoint,
any agent deposit/top-up endpoint). The agent's wallet holds real (testnet)
USDC; an unauthenticated "settle for arbitrary walletId" route would let anyone
drain the agent. The new agent routes should require a server-side secret
(e.g. `AGENT_API_KEY` header) or run the agent as a server-side job that is not
exposed as a public route at all. **Do not** copy the `viewer_id`-from-body
trust model into agent payment routes.

### 6.2 Fragile / shared paths the agent could break

- **Shared `settle-session` route:** if the agent calls the *same* route the
  human viewer flow uses, a bug in agent input (e.g. huge `seconds_watched`,
  wrong `creator_id`) writes real `earnings`/`payment_batches` rows and signs
  real authorizations. **Recommendation: give the agent its own route** that
  imports a shared `settle-core`, rather than reusing `settle-session` directly,
  so a change for the agent can't regress the viewer path.
- **Nonce reservation is not transactional:** `settle-session` checks
  `used_nonces` then inserts (lines 86–100) in separate calls — a race could
  collide, and a settlement failure after reserving nonces leaves them
  orphaned. The agent settling rapidly in a loop is exactly the workload that
  surfaces this. Settle in larger chunks and serialize the agent's settlements.
- **Partial-failure handling:** if the **creator** settle succeeds but the
  **platform** settle fails, the route logs a warning and proceeds (lines
  223–226) — the `earnings` row still records the full 20% platform_fee that
  was never collected. Not agent-specific, but the agent's volume makes it
  visible.
- **No idempotency on `settle-session`:** unlike the legacy `sessions` route
  (which uses an `idempotencyKey`, line 154), `settle-session` has none. A
  retried agent request double-settles. Add an idempotency guard in the agent
  route.
- **`as never` casts on the facilitator calls** (lines 208–209, 219–220) mean
  the SDK's real types aren't enforced — if you upgrade `@circle-fin/x402-batching`,
  the payload shape could silently drift. Pin the version.
- **Rate fallback mismatch** (`0.00005` vs `0.00003`, §1.1) — the agent should
  always pass/read the explicit `videos.rate_per_sec`.

### 6.3 Long-running work on Next.js + Railway

**There is no existing pattern for multi-minute background work.** The repo's
only async-after-response trick is an un-awaited `fetch` (§5.5), which on a
serverless/edge host would be killed when the response returns, and even on a
long-lived Node server (Railway runs `next start` as a persistent process) is
unmonitored and un-retried.

Transcribe-plus-analyze for a multi-minute video will exceed a normal request
window. Options, best-first for this stack:

1. **Run the agent as its own long-lived worker process, not an API route.**
   Railway can run a second service (or a `worker` start command) that is a
   plain Node script / loop — no HTTP timeout applies. This is the cleanest fit
   and avoids the route-handler timeout entirely. The agent polls a queue table
   (or just a list of target videos) and does sign→buy→transcribe→analyze→clip
   end to end.
2. **Wire up the already-installed Inngest.** It's in `package.json`; adding a
   client + a step function gives durable, retryable, long-running steps with
   no timeout, triggered by an event from a thin API route. More setup, but
   production-grade.
3. **Avoid:** doing the whole pipeline inline in a single POST handler. Even on
   a persistent Railway Node server, a multi-minute synchronous handler ties up
   a connection, has no retry, and risks proxy/idle timeouts.

Because Railway runs a persistent Node process (not serverless functions),
option 1 (a dedicated worker) is both the simplest and the most robust, and
needs no new infra. Kick it off with a small enqueue route (authenticated) that
the worker drains.

---

## 7. RECOMMENDED INTEGRATION POINTS

### 7.1 Directory layout

```
lib/settle-core/
  index.ts            # settlePerSecond(...) — sign + facilitator.settle, returns tx hashes (NO db)
  eip3009.ts          # domain, types, buildPayload, buildRequirements (copied from settle-session)
  circle.ts           # getClient, signTypedDataWithWallet, getWalletIdByAddress, randomNonce (copied)
  constants.ts        # GATEWAY_WALLET, USDC_ADDRESS, CHAIN_ID, platformWallet, feeSplit

lib/agent/
  wallet.ts           # create/fund the agent's Arc EOA + Gateway deposit (wraps createGatewayWallet + depositArc)
  media.ts            # HLS fetch from videodelivery.net + ffmpeg audio extract
  transcribe.ts       # Whisper client
  analyze.ts          # Claude API clip-selection (model > haiku; see claude-api skill for ids)
  clip.ts             # cut selected moments
  run.ts              # orchestrator: session -> buy seconds -> settle-core -> transcribe -> analyze -> clip

worker/
  index.ts            # long-lived Railway worker; drains agent_jobs, calls lib/agent/run.ts

app/api/agent/
  enqueue/route.ts    # authenticated (AGENT_API_KEY): insert an agent_jobs row, return job id
  status/route.ts     # read agent_jobs status (read-only)
```

### 7.2 Copy into `lib/settle-core/` vs import as-is

**Copy (so the agent path can't regress the viewer path):**
- `signTypedDataWithWallet`, `getClient`, `getWalletIdByAddress` from
  `circle-wallets.ts`
- `randomNonce` + the `domain`/`types`/`buildPayload`/`buildRequirements`
  block from `settle-session/route.ts`

**Import as-is (stable, shared safely):**
- `getSupabaseAdmin` from `supabase-server.ts`
- `BatchFacilitatorClient` from `@circle-fin/x402-batching/server`
- `UnifiedBalanceKit` + viem adapter + `createCircleEip1193Provider` +
  `getWalletBalance`/`createGatewayWallet` for the funding step (reuse from
  `deposit/route.ts` and `circle-wallets.ts` directly)

**Do NOT reuse:** the `settle-session` route handler itself, or the legacy
`sessions`/`transfer`/`payments` routes.

### 7.3 Minimal new API routes

1. **`POST /api/agent/enqueue`** — authenticated by a server secret
   (`AGENT_API_KEY` header), inserts an `agent_jobs` row
   `{ video_id, budget_usdc, status:"queued" }`. **Not** the viewer trust model.
2. **`GET /api/agent/status?job_id=`** — read-only job status/results.

Everything else (buy → transcribe → analyze → clip) runs in the **worker
process**, which calls `lib/settle-core` directly and performs the same
`payment_batches` + `earnings` inserts that `settle-session` does (so the
creator studio reflects the spend — §4.4), applying the `owner_id ?? creator_id`
resale resolution. No new public money-moving HTTP surface is required, which
sidesteps the §6.1 auth gap entirely.

The agent needs a **payer identity row**: either a dedicated `users` row
(role e.g. `"agent"`) with `wallet_address` + `circle_wallet_id` populated, or
a new small `agent_wallets` table. A `users` row is the least-friction choice
because it makes `settle-core`/funding reuse trivial and gives the agent a
`viewer_id` to attach to `watch_sessions`/`payment_batches`.

---

## OPEN QUESTIONS

1. **No schema DDL in the repo.** `supabase/sql/` has only RPC helpers + mock
   seeds. The exact column types, nullability, defaults, FKs, and the existence
   of `used_nonces`, `transactions`, `user_chain_wallets`, `offers` are inferred
   from code usage. **Confirm against the live Supabase schema** before relying
   on any column type. In particular: is there a uniqueness constraint on
   `used_nonces.nonce` (the collision check assumes effectively-unique nonces
   but the insert isn't guarded by a DB constraint we can see)?

2. **Does `@circle-fin/x402-batching`'s `settle` actually accept an array of
   authorizations?** The code only ever passes single `(payload, requirements)`
   pairs cast `as never`, so the real SDK signature is unverified from this
   repo. If true batching is supported, the agent could settle creator+platform
   (and multiple chunks) in one on-chain tx — worth checking the package types
   in `node_modules/@circle-fin/x402-batching`.

3. **Does the Gateway/EIP-3009 flow require the payer EOA to hold native gas on
   Arc, or is settlement gasless via the facilitator?** The deposit cross-chain
   path explicitly checks native gas, but `settle-session` does not — unclear
   whether the facilitator sponsors gas for the `TransferWithAuthorization`
   settlement. Affects how the agent wallet must be funded.

4. **Is playback genuinely ungated on payment?** Nothing in the code gates the
   `videodelivery.net` HLS URL behind a settled session. Confirm the agent is
   *expected* to pay-then-consume by policy (the demo's premise), since the
   platform won't enforce it.

5. **Whisper/ffmpeg on Railpack:** does the Railway build image include ffmpeg,
   or must it be installed via a nix/apt layer? Determines whether to extract
   audio locally vs. use a URL-based managed transcription API.

6. **Which Claude model for clip selection?** The only existing call uses
   `claude-haiku-4-5` for chapter text. Clip-worthiness judgment likely wants a
   stronger model — confirm via the `claude-api` skill for current model IDs and
   pricing before wiring `lib/agent/analyze.ts`.

7. **Resale handling in the live path:** `settle-session` ignores
   `owner_id`/`original_creator_id` while the legacy routes honor them. Confirm
   whether the agent must pay current owners on resold videos (and whether the
   demo uses resale at all).
