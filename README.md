# StreamArc

**Pay-per-second video on Arc, settled gaslessly in USDC through Circle Gateway nanopayments.**

Viewers pay only for the seconds they actually watch. Creators earn in real time, 80/20. And AI agents do metered work (clipping, captions, dubbing) whose consumption settles on-chain as a stream of sub-cent nanopayments from a budget the user sets. One settlement core serves humans and agents alike.

Live on Arc testnet: **[streamarc.app](https://streamarc.app)**

> Testnet only. Uses testnet USDC and Circle's sandbox (`gateway-api-testnet`). No mainnet funds are involved.

---

## What it is

Subscription billing is the wrong model for content: someone who watches three minutes of a thirty-minute video should not pay the same as someone who watches all of it. And the natural units of media (one second watched, one clip, one translation) were never worth charging for on their own, because transaction fees cost more than the payment itself.

Small payments were always technically possible. Gas made them pointless. Gasless USDC settlement on Arc removes that economic floor, so StreamArc prices content at its real unit: the second.

StreamArc does three things:

1. **Per-second viewing.** Deposit USDC once into Circle Gateway. Every second of playback emits an EIP-3009 signature off-chain (zero gas, invisible to the viewer). Signatures settle in batches, 80% to the creator and 20% to the platform. Pause, and payments stop.

2. **An agent economy on the same rail.** A creator funds an AI clipping agent with a USDC budget. The agent then works through the video and settles its own consumption chunk by chunk as separate on-chain nanopayments, roughly fifty sub-cent settlements per job. The human authorizes the spend; the agent executes it, verifiably, on the same rail human viewers use.

3. **Localization agents.** Caption and dubbing agents translate a video into other languages, each paid once in USDC and then free for all viewers.

---

## How payment works

The direction matters, so to be precise:

- **Viewers pay creators** for watching (viewer wallet to creator, per second, 80/20 split).
- **The requester pays** for agent work. A creator funds a budget; the agent settles metered consumption from that budget as it works. The agent does not hold its own money. It executes spending a human authorized.

This is the delegated agent-payment pattern that standards like Google's AP2 are formalizing, working today on Circle rails: a human sets a budget, an agent executes bounded spend against it, and every settlement is a real on-chain transaction with an audit trail.

There are no custom smart contracts by design. Value moves as native USDC through Circle's rails, and the platform wallet is publicly verifiable on the Arc testnet explorer. The rails are the contract.

---

## The clipping agent, in detail

The clipping agent is the clearest example of budget-bounded, metered, on-chain agent spend. Given a video and a budget, it:

1. **Quotes the job up front.** The cost is computed from the video's length (a service fee plus metered processing), shown as an estimate and a hard cap before the user confirms. There is no guesswork budget to misjudge.
2. **Settles a service fee** as its own on-chain payment, after free pre-checks (funding, transcript, speech density) so a job that cannot run charges nothing.
3. **Reads the full transcript** at a low skim rate, settling each chunk as a separate sub-cent nanopayment.
4. **Derives an editorial brief** for that specific video, then scores every candidate moment against it.
5. **Buys footage** at the top-scored moments, rationing its budget across them and extending when a thought runs long.
6. **Critiques its own cuts**, dropping weak ones and swapping in better ones, then proposes the best clips for the creator to review and publish.

Every decision is priced and logged. A representative line from the decision log:

```
[settle-chunk] 15s consumed, paid 0.000750 (tx a06c4999-6f8...)
[stop-extend] region spend cap reached, reserving budget for other top moments
[self-critique] hook OK, stands-alone no, complete no: ends mid-sentence
```

A single clip job typically fires 30 to 50 separate on-chain settlements. The agent does not just pay once; it makes dozens of small, real, budget-bounded spending decisions, each cleared on Arc.

---

## Circle integration

Every Circle product below is real integration code in this repo, not a reference.

| Product | Where | What it does |
|---|---|---|
| **Gateway** | `app/lib/gateway-balance.ts`, deposit/withdraw/balance routes | Holds each user's USDC balance; the verifying contract for every settlement |
| **EIP-3009** | `lib/settle-core/eip3009.ts` | `TransferWithAuthorization` typed-data signing for gasless transfers |
| **x402 BatchFacilitatorClient** | `lib/settle-core/index.ts` (+ tip, watch-session) | Settles every per-chunk agent charge and every per-second watch payment |
| **Developer-Controlled Wallets** | `app/lib/circle-wallets.ts` | Auto-creates a wallet on signup, signs every EIP-3009 authorization. No seed phrase |
| **Unified Balance Kit** | deposit / withdraw / balance routes | `kit.deposit()` powers top-up, `kit.spend()` powers withdrawal, `kit.getBalances()` powers balance display |

The same `settle-core` module is shared across human viewers, the clip agent, paid captions, and paid dubbing, so people and agents transact on one code path.

---

## Tech stack

- **Frontend:** Next.js, TypeScript, Tailwind
- **Backend:** Next.js API routes plus a standalone Node worker (`worker/`) that drains three job queues: clips, captions, and dubs
- **Payments:** Circle Gateway, Developer-Controlled Wallets, EIP-3009, x402 BatchFacilitatorClient, Unified Balance Kit, on Arc testnet
- **Video:** Cloudflare Stream (video, captions, alternate audio tracks)
- **AI:** Claude (agent reasoning and translation), ElevenLabs (voice-preserving dubbing)
- **Data:** Supabase (Postgres)
- **Hosting:** Railway (web and worker)

---

## Getting started

### Prerequisites

- Node.js 24+ (`"engines": { "node": ">=24" }`), npm
- A Circle Developer account and API key ([console.circle.com](https://console.circle.com))
- A Supabase project
- Cloudflare Stream, ElevenLabs, and Anthropic API keys

### Setup

```bash
# 1. Install
npm install

# 2. Configure environment
#    Create .env.local at the repo root with the values below

# 3. Run the database migrations
#    Apply the SQL in supabase/sql/ to your Supabase project

# 4. Start the web app
npm run dev                  # http://localhost:3000

# 5. In a second terminal, start the settlement worker
npm run agent:worker         # drains clip, caption, and dub jobs
```

The worker is required for the AI agents. The web app handles per-second viewing and payments on its own, but clip, caption, and dub jobs are processed by the worker queue.

### Environment variables

Set these in `.env.local` (web) and in the worker's environment on your host:

```
# Circle
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
PLATFORM_WALLET_ID=
PLATFORM_WALLET_ADDRESS=

# Arc testnet
ARC_TESTNET_RPC_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare Stream
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_CODE=

# AI
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=

# Auth (NextAuth + Google OAuth)
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email (verification codes for the password flow)
EMAIL_FROM=
EMAIL_PASSWORD=

# Misc
AGENT_API_KEY=               # key for the server-to-server agent enqueue route
NEXT_PUBLIC_DEFAULT_VIDEO_ID=  # optional: fallback video for the Watch nav link
```

These names match exactly what the code reads (`process.env.*`); there is no `.env.example` in the repo.

---

## Repository layout

```
app/            Next.js app: pages, components, and API routes
  api/          payment, agent, caption, dub, auth, and video endpoints
  components/   UI (watch, studio, browse, layout, auth, agent)
  lib/          Circle wallets, Gateway balance, auth, shared config
lib/            settle-core (EIP-3009 + x402), clip agent, captions, dubs
worker/         standalone job worker (clips, captions, dubs)
supabase/sql/   database schema and migrations
scripts/        operational scripts (agent CLI, setup)
types/          shared TypeScript types
public/         static assets
```

---

## Pricing model

- **Viewing:** creator-set, between $0.00005 and $0.0001 per second.
- **Clipping:** a computed quote, service fee (a small base plus a per-minute component) plus metered consumption, settled per chunk. The user accepts a quote rather than guessing a budget.
- **Captions:** a few cents per language, paid once, then free for all viewers.
- **Dubbing:** paid once per language, then free for all viewers.

---

## Status and roadmap

**Now (Arc testnet):** per-second viewing, the full creator economy (tips, comments, follows, chapters, explore, notifications, analytics), and three live AI agents, all settling real testnet USDC.

**Next:** Circle Gas Station for gasless cross-chain deposits, a multichain deposit UI, and migration to Arc mainnet. Then live streaming with the same per-second model.

---

## License

MIT. See [LICENSE](LICENSE).

---

Built solo by Justin T Roy.
