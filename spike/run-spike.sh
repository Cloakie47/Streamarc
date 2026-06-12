#!/usr/bin/env bash
# Throwaway validation spike for the Clip Agent build. Not app code.
# Reads CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN from ../.env.local.
# Re-run with:  bash spike/run-spike.sh
set -uo pipefail

# --- load creds from .env.local (no values committed) ---
ENV_FILE="$(dirname "$0")/../.env.local"
ACCT=$(grep -E '^CLOUDFLARE_ACCOUNT_ID=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
AUTH="Authorization: Bearer $TOKEN"
API="https://api.cloudflare.com/client/v4/accounts/$ACCT/stream"

# Pick a test video: first ready video on the account (override with $1).
VID="${1:-}"
if [ -z "$VID" ]; then
  VID=$(curl -sS "$API?limit=20" -H "$AUTH" \
    | python -c "import sys,json;[print(v['uid']) for v in json.load(sys.stdin)['result'] if v.get('readyToStream')]" \
    | head -1)
fi
echo "Test video: $VID"

# 1. Captions
echo "== generate captions (en) =="
curl -sS -X POST "$API/$VID/captions/en/generate" -H "$AUTH" -H "Content-Type: application/json"; echo

# 2. Clip (10s -> 30s)
echo "== create 20s clip =="
CLIP=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCT/stream/clip" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"clippedFromVideoUID\":\"$VID\",\"startTimeSeconds\":10,\"endTimeSeconds\":30}" \
  | python -c "import sys,json;print(json.load(sys.stdin)['result']['uid'])")
echo "clip uid: $CLIP"

# 3. Enable downloads
echo "== enable downloads =="
curl -sS -X POST "$API/$VID/downloads" -H "$AUTH"; echo

# Poll all three until ready (<=5 min)
echo "== poll until ready =="
START=$(date +%s); cap=0; clip=0; dl=0
for i in $(seq 1 40); do
  EL=$(( $(date +%s) - START ))
  [ $cap -eq 0 ] && curl -sS "$API/$VID/captions/en" -H "$AUTH" \
    | python -c "import sys,json;sys.exit(0 if json.load(sys.stdin)['result'].get('status')=='ready' else 1)" && cap=$EL
  [ $clip -eq 0 ] && curl -sS "$API/$CLIP" -H "$AUTH" \
    | python -c "import sys,json;sys.exit(0 if json.load(sys.stdin)['result']['status']['state']=='ready' else 1)" && clip=$EL
  [ $dl -eq 0 ] && curl -sS "$API/$VID/downloads" -H "$AUTH" \
    | python -c "import sys,json;sys.exit(0 if json.load(sys.stdin)['result']['default'].get('status')=='ready' else 1)" && dl=$EL
  echo "[$EL s] captions=$cap clip=$clip download=$dl"
  { [ $cap -ne 0 ] && [ $clip -ne 0 ] && [ $dl -ne 0 ]; } && break
  sleep 8
done

# 1b. Download VTT
echo "== VTT (head) =="
curl -sS "$API/$VID/captions/en/vtt" -H "$AUTH" | head -20

# 3b. Download MP4 (no auth header; follow redirect)
CUST=$(grep -E '^NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_CODE=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
echo "== MP4 download (no auth) =="
curl -sS -L "https://$CUST/$VID/downloads/default.mp4" -o /tmp/spike_dl.mp4 \
  -w "http=%{http_code} bytes=%{size_download} type=%{content_type}\n"
rm -f /tmp/spike_dl.mp4

echo "Done. Clip uid $CLIP left on account (delete with DELETE $API/$CLIP)."
