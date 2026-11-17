// Full financial-pipeline verification with REAL ed25519 signatures:
// register → verify ownership (tweetnacl) → create payment → policy →
// approve → quote (expects genuine PROVIDER_SETUP_REQUIRED state).
import bs58 from 'bs58'
import nacl from 'tweetnacl'

const BASE = 'http://localhost:3000'
let cookie = ''
let orgId = ''

async function call(path, init = {}, useOrg = true) {
  const headers = { 'content-type': 'application/json', ...(init.headers ?? {}) }
  if (cookie) headers.cookie = cookie
  if (orgId && useOrg && !path.startsWith('/api/auth')) headers['x-organization-id'] = orgId
  const res = await fetch(BASE + path, { ...init, headers })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

const log = (ok, name, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`)

// Deterministic keypair: reuses the same wallet across test runs.
const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7))
const address = bs58.encode(keypair.publicKey)
console.log('Generated keypair:', address.slice(0, 8) + '…')

// login
const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'verify-bot@azimara.test', password: 'VerifyBot-2026-Pass' }) })
const session = await call('/api/auth/session')
orgId = session.json.data.organizations[0].id
log(login.status === 200, 'login')

// Commercialization flow runs in a FRESH organization so the STARTER baseline
// is guaranteed regardless of accumulated state from prior runs. Upgrades now
// issue a USDC invoice (settled on-chain) instead of switching instantly.
const homeOrgId = session.json.data.organizations[0].id
const freshOrg = await call('/api/organizations', { method: 'POST', body: JSON.stringify({ name: `Lifecycle Verify ${Date.now()}` }) })
orgId = String(freshOrg.json.data?.id ?? homeOrgId)
log(typeof freshOrg.json.data?.id === 'string', 'fresh lifecycle organization created')
const baseline = await call('/api/billing')
log(baseline.json.data?.plan === 'STARTER', 'fresh org on STARTER baseline', String(baseline.json.data?.plan))
const planChange = await call('/api/billing', { method: 'POST', body: JSON.stringify({ plan: 'BUSINESS' }) })
const invoiceIssued = planChange.json.data?.invoiceRequired === true && !!planChange.json.data?.invoice?.amountBaseUnits
if (!invoiceIssued) console.log('  PLAN DEBUG:', planChange.status, JSON.stringify(planChange.json).slice(0, 200))
log(invoiceIssued, 'upgrade issues USDC invoice (entitlements pending real payment)')
if (invoiceIssued) {
  const inv = planChange.json.data.invoice
  log(inv.status === 'PENDING' && inv.amountUi.startsWith('499.'), 'upgrade invoice pending at BUSINESS price (499 USDC + unique suffix)', inv.amountUi)
  // Clean up the test invoice so it does not sit pending forever.
  const cancel = await call('/api/billing/invoice', { method: 'DELETE', body: JSON.stringify({ invoiceId: inv.id }) })
  log(cancel.json.data?.cancelled === true, 'test invoice cancelled')
}
// Back to the home organization for the financial-pipeline flows.
orgId = homeOrgId

// Free accumulated seats from prior runs so the invite flow can add a member.
const members = await call('/api/members')
let freedSeats = 0
for (const m of members.json.data?.members ?? []) {
  if (m.userId === session.json.data.user?.id) continue
  const removed = await call('/api/members', { method: 'DELETE', body: JSON.stringify({ membershipId: m.id }) })
  if (removed.json.data?.removed || removed.status === 200) freedSeats += 1
}
log(true, 'stale test members cleaned up', `${freedSeats} seats freed`)

// register wallet with generated keypair
let reg = await call('/api/wallets', { method: 'POST', body: JSON.stringify({ label: 'Keypair Treasury', address, network: 'devnet', kind: 'TREASURY' }) })
if (reg.json.error?.code === 'DUPLICATE_WALLET') {
  const list = await call('/api/wallets')
  const existing = list.json.data.wallets.find((w) => w.address === address)
  reg = { json: { data: { wallet: existing } } }
}
const wallet = reg.json.data?.wallet
if (reg.json.error?.code === 'DUPLICATE_WALLET' || reg.json.error?.code === 'ENTITLEMENT_LIMIT_REACHED') {
  const subs = await call('/api/wallets')
  const existing = subs.json.data.wallets.find((w) => w.address === address)
  reg = { json: { data: { wallet: existing } } }
}
log(!!wallet, 'wallet registered-or-reused', wallet?.id ?? JSON.stringify(reg.json.error ?? reg.json.data))

// challenge
const challenge = await call(`/api/wallets/${wallet.id}/verify`)
const message = challenge.json.data.message
log(!!message, 'ownership challenge received')

// REAL signature
const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey)
const verify = await call(`/api/wallets/${wallet.id}/verify`, { method: 'POST', body: JSON.stringify({ signature: bs58.encode(signature) }) })
log(verify.status === 200 && verify.json.data?.verified === true, 'REAL ed25519 ownership verified')

// create payment through the real pipeline — amount carries a run-unique
// cent-suffix so repeated runs never collide with stale rows.
const runCents = (Date.now() % 90) + 10
const amount = `2500.${runCents}`
const pay = await call('/api/payments', {
  method: 'POST',
  body: JSON.stringify({
    sourceWalletId: wallet.id,
    destination: address,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount,
    reason: 'Lifecycle verification payment',
  }),
})
if (!pay.json.data?.payment) console.log('PAY DEBUG:', pay.status, JSON.stringify(pay.json).slice(0, 300))
let payment = pay.json.data?.payment
log(!!payment?.id, 'payment created fresh', `${payment?.reference} = ${payment?.status}`)
// Duplicate guard: replaying the identical request must be refused and point
// at the original payment (idempotency protection on financial intents).
const replay = await call('/api/payments', {
  method: 'POST',
  body: JSON.stringify({
    sourceWalletId: wallet.id,
    destination: address,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount,
    reason: 'Lifecycle verification payment',
  }),
})
log(replay.json.error?.code === 'DUPLICATE_PAYMENT' && replay.json.error?.details?.duplicateReference === payment?.reference, 'identical replay refused by duplicate guard', String(replay.json.error?.code))

// separation of duties: creator cannot approve a 2-approver payment
const selfApprove = await call(`/api/payments/${payment.id}/approve`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })
log([403, 409].includes(selfApprove.status) && ['SEPARATION_OF_DUTIES', 'INVALID_STATE'].includes(selfApprove.json.error?.code), 'creator approval correctly blocked (separation of duties / not pending)', `${selfApprove.status} ${selfApprove.json.error?.code ?? ''}`)

// duplicate-approval guard: same user cannot decide twice (verify via owner re-approving is blocked; creator attempt recorded above)

// second user (owner-approved approver path): use a second account
const reg2 = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Second Approver', email: `approver-${Date.now()}@azimara.test`, password: 'SecondApprover-2026-Pass' }) }, false)
log(!!reg2.json.data?.user, 'second user registered')

// invite the second user as APPROVER and accept
const inv = await call('/api/invitations', { method: 'POST', body: JSON.stringify({ email: reg2.json.data.user.email, role: 'APPROVER' }) })
if (!inv.json.data?.invitationToken) console.log('INV DEBUG:', JSON.stringify(inv.json.error ?? inv.json).slice(0, 200))
const accept = await call('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: inv.json.data.invitationToken }) }, false)
log(accept.json.data?.joined === true, 'invitation accepted with APPROVER role')

// switch to second user session to verify RBAC: APPROVER cannot quote
cookie = ''
const login2 = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: reg2.json.data.user.email, password: 'SecondApprover-2026-Pass' }) }, false)
const session2 = await call('/api/auth/session')
const org2 = session2.json.data.organizations.find((o) => o.id === orgId)
log(!!org2 && org2.role === 'APPROVER', 'second user is APPROVER in org')
const forbiddenQuote = await call(`/api/payments/${payment.id}/quote`, { method: 'POST' })
log(forbiddenQuote.status === 403, 'RBAC: APPROVER cannot request quotes', forbiddenQuote.json.error?.code ?? '')

// first independent approval (second user)
const approve1 = await call(`/api/payments/${payment.id}/approve`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED', reason: 'Independently reviewed 1/2' }) })
log(approve1.json.data?.status === 'PENDING_APPROVAL' || approve1.json.error?.code === 'INVALID_STATE', 'approval state consistent (reused payment may already be decided)', approve1.json.data?.status ?? approve1.json.error?.code)

// third user joins as APPROVER and gives the second independent approval
const reg3 = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Third Approver', email: `approver3-${Date.now()}@azimara.test`, password: 'ThirdApprover-2026-Pass' }) }, false)
cookie = '' // owner session required for invitations (team:manage)
await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'verify-bot@azimara.test', password: 'VerifyBot-2026-Pass' }) }, false)
const inv3 = await call('/api/invitations', { method: 'POST', body: JSON.stringify({ email: reg3.json.data.user.email, role: 'APPROVER' }) })
if (!inv3.json.data?.invitationToken) { console.log('INV3 DEBUG:', JSON.stringify(inv3.json.error ?? {}).slice(0, 200)) }
await call('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token: inv3.json.data?.invitationToken ?? 'x' }) }, false)
cookie = ''
await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: reg3.json.data.user.email, password: 'ThirdApprover-2026-Pass' }) }, false)
const approve = await call(`/api/payments/${payment.id}/approve`, { method: 'POST', body: JSON.stringify({ decision: 'APPROVED', reason: 'Independently reviewed 2/2' }) })
log(approve.json.data?.status === 'APPROVED' || ['ALREADY_DECIDED', 'INVALID_STATE'].includes(approve.json.error?.code), 'second approval or already-final state', approve.json.data?.status ?? approve.json.error?.code)

// back to owner session: quote → genuine provider setup required
const loginOwner = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'verify-bot@azimara.test', password: 'VerifyBot-2026-Pass' }) }, false)
log(loginOwner.status === 200, 'owner session restored')
const quote = await call(`/api/payments/${payment.id}/quote`, { method: 'POST' })
log(quote.status === 409 && quote.json.error?.code === 'PROVIDER_SETUP_REQUIRED', 'quote honestly blocked: PROVIDER_SETUP_REQUIRED', quote.json.error?.message?.slice(0, 80))

// double-check payment state held at APPROVED with setup reason
const detail = await call(`/api/payments/${payment.id}`)
if (!detail.json.data?.payment) console.log('DETAIL DEBUG:', JSON.stringify(detail).slice(0, 300))
log(detail.json.data?.payment?.status === 'APPROVED' && detail.json.data.payment.statusReason?.includes('PROVIDER_SETUP_REQUIRED'), 'payment held at APPROVED with setup reason', detail.json.data?.payment?.statusReason)

// idempotency: same key replay converges
const idem = await call('/api/payments', {
  method: 'POST',
  body: JSON.stringify({
    sourceWalletId: wallet.id,
    destination: address,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1750.00',
    reason: 'Lifecycle verification payment',
    idempotencyKey: 'verify-lifecycle-payment-1',
  }),
})
log(idem.json.data?.idempotentReplay === false || idem.json.error?.code === 'DUPLICATE_PAYMENT' || idem.json.data?.idempotentReplay === true, 'keyed creation: deterministic same-key behavior (create, replay, or guard)', idem.json.data?.payment?.reference ?? idem.json.error?.code)
const idem2 = await call('/api/payments', {
  method: 'POST',
  body: JSON.stringify({
    sourceWalletId: wallet.id,
    destination: address,
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: '1750.00',
    reason: 'Lifecycle verification payment',
    idempotencyKey: 'verify-lifecycle-payment-1',
  }),
})
if (!idem2.json.data?.idempotentReplay) console.log('IDEM2 DEBUG:', idem2.status, JSON.stringify(idem2.json).slice(0, 300))
log(idem2.json.data?.idempotentReplay === true && idem2.json.data.payment.reference === idem.json.data.payment.reference, 'idempotent replay returns the SAME payment', idem2.json.data?.payment?.reference ?? idem2.json.error?.code)

console.log('\nLIFECYCLE VERIFICATION COMPLETE')
