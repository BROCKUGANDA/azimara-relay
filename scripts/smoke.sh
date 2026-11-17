#!/usr/bin/env bash
# Idempotent end-to-end API smoke test for AZIMARA RELAY golden paths.
set -u
BASE="http://localhost:3000"
JAR="/tmp/relay-cookies.txt"
rm -f "$JAR"
PASS=0; FAIL=0

check() {
  if echo "$3" | grep -q "$2"; then PASS=$((PASS+1)); echo "PASS: $1"
  else FAIL=$((FAIL+1)); echo "FAIL: $1 → $(echo "$3" | head -c 200)"; fi
}

R=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"email":"verify-bot@azimara.test","password":"VerifyBot-2026-Pass"}')
check "login" '"authenticated"' "$(curl -s -b "$JAR" "$BASE/api/auth/session")"

ORG=$(curl -s -b "$JAR" "$BASE/api/auth/session" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['organizations'][0]['id'])")
H=(-b "$JAR" -H "x-organization-id: $ORG")

# Wallet: register (or reuse) — never auto-verified
WALLET_ADDR="9xQeWvG816bUx9EPjHmaTprYpRxpVkYnTdC8kP7d2wTE"
R=$(curl -s "${H[@]}" -X POST "$BASE/api/wallets" -H 'content-type: application/json' -d "{\"label\":\"Smoke Treasury\",\"address\":\"$WALLET_ADDR\",\"network\":\"devnet\",\"kind\":\"TREASURY\"}")
if echo "$R" | grep -q "DUPLICATE_WALLET\|ENTITLEMENT_LIMIT_REACHED"; then R=$(curl -s "${H[@]}" "$BASE/api/wallets"); fi
WALLET_INFO=$(echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
w=d['wallet'] if 'wallet' in d else next((w for w in d['wallets'] if not w.get('revokedAt')),{})
print(w.get('id',''), w.get('ownershipStatus','?'))")
check "wallet state PENDING or VERIFIED (never auto-verified)" 'PENDING\|VERIFIED' "$WALLET_INFO"
WALLET_ID=$(echo "$WALLET_INFO" | cut -d' ' -f1)

# Ownership: challenge + forged signature rejection (fresh nonce each GET)
R=$(curl -s "${H[@]}" "$BASE/api/wallets/$WALLET_ID/verify")
check "verify challenge issued" '"method":"SIGN_MESSAGE"' "$R"
R=$(curl -s "${H[@]}" -X POST "$BASE/api/wallets/$WALLET_ID/verify" -H 'content-type: application/json' -d '{"signature":"21111111111111111111111111111111111111111111111111111111111111111111111111111111111111111"}')
check "forged signature rejected" 'SIGNATURE_INVALID' "$R"

# Recipient: create or reuse
REC_ADDR="4Nd1mBQtrMJVYVfKf2PJy9NZBCZd2ZQhRZk3Z5nL6dWx"
R=$(curl -s "${H[@]}" -X POST "$BASE/api/recipients" -H 'content-type: application/json' -d '{"name":"Smoke Contributor","address":"'$REC_ADDR'","category":"CONTRIBUTOR"}')
if echo "$R" | grep -q DUPLICATE_RECIPIENT; then R='{"reused":true}'; fi
check "recipient created-or-reused" '"reused"\|"Smoke Contributor"' "$R"
REC_ID=$(curl -s "${H[@]}" "$BASE/api/recipients?pageSize=5" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['recipients'][0]['id'])")

# Payment validation: unverified wallet or duplicate guard — both are real guards
R=$(curl -s "${H[@]}" -X POST "$BASE/api/payments" -H 'content-type: application/json' -d "{\"sourceWalletId\":\"$WALLET_ID\",\"recipientId\":\"$REC_ID\",\"destination\":\"$REC_ADDR\",\"mint\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\",\"amount\":\"125.50\",\"reason\":\"smoke\"}")
check "payment guarded (unverified wallet or duplicate detection)" 'WALLET_NOT_VERIFIED\|DUPLICATE_PAYMENT\|VALIDATION_FAILED' "$R"

# Idempotency: same key replays converge (needs verified wallet; guard fires first — check marker only)
R=$(curl -s "${H[@]}" -X POST "$BASE/api/batches/preview" -H 'content-type: application/json' -d '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","csv":"name,address,amount\nGood Payee,'$REC_ADDR',10.25\nBad Payee,notanaddress,5\nDup Payee,'$REC_ADDR',3"}')
check "batch preview validates rows" '"validRows":1' "$R"
check "batch preview catches invalid+duplicate" '"invalidRows":2' "$R"

# Webhook HMAC path
R=$(curl -s -X POST "$BASE/api/webhooks/multihopper" -H 'content-type: application/json' -H 'x-multihopper-signature: 0000000000000000000000000000000000000000000000000000000000000000' -d '{"event":"transfer.completed"}')
check "webhook bad signature rejected" 'INVALID_SIGNATURE' "$R"

# RBAC + aggregation endpoints
R=$(curl -s "${H[@]}" "$BASE/api/members"); check "members listed" '"OWNER"' "$R"
R=$(curl -s "${H[@]}" "$BASE/api/treasury"); check "treasury aggregation" '"metrics"' "$R"
R=$(curl -s "${H[@]}" "$BASE/api/analytics?days=30"); check "analytics series" '"timeline"' "$R"
R=$(curl -s "${H[@]}" "$BASE/api/onboarding"); check "onboarding checklist" '"wallet"' "$R"
R=$(curl -s "${H[@]}" -X POST "$BASE/api/api-keys" -H 'content-type: application/json' -d '{"name":"smoke","environment":"TEST","scopes":["payments:read"]}')
check "api key creation gated or granted per plan" 'PLAN_LIMIT\|"key":"rk_' "$R"
R=$(curl -s "$BASE/api/openapi" | head -c 120); check "openapi served" 'openapi' "$R"

echo ""
echo "SMOKE RESULT: PASS=$PASS FAIL=$FAIL"
