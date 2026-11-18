// AZIMARA RELAY — end-to-end edge-case probe.
// Exercises hostile/edge inputs against the live API and prints a verdict per case.
// Read-only in spirit: creates its own throwaway org, never touches other data.

const BASE = 'http://localhost:3000'
let cookie = ''
let orgHeader = ''

async function req(path, { method = 'GET', json, raw = false } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (cookie) headers.cookie = cookie
  if (orgHeader) headers['x-organization-id'] = orgHeader
  const res = await fetch(`${BASE}${path}`, { method, headers, body: json ? JSON.stringify(json) : undefined })
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const c of setCookie) {
    if (c.startsWith('relay_session=')) cookie = c.split(';')[0]
  }
  const text = await res.text()
  if (raw) return { status: res.status, text }
  let body = null
  try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 120) } }
  return { status: res.status, body }
}

const results = []
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail: String(detail).slice(0, 140) })
}

// ─── Setup: register → verify → login (registration does not auto-login) ───
const email = `edge-${Date.now()}@azimara-test.dev`
const reg = await req('/api/auth/register', { method: 'POST', json: { name: 'Edge Probe', email, password: 'Edge-Test-2026!', organizationName: 'Edge Probe Org' } })
check('register succeeds', reg.status === 200, `status=${reg.status}`)
await req('/api/auth/verify-email', { method: 'POST', json: { token: reg.body?.data?.emailDelivery?.verificationToken ?? 'x' } })
const login = await req('/api/auth/login', { method: 'POST', json: { email, password: 'Edge-Test-2026!' } })
check('login after verify succeeds', login.status === 200 && login.body?.data?.mfaRequired === false, `status=${login.status}`)
const session0 = await req('/api/auth/session')
check('session authenticated after login', session0.body?.data?.authenticated === true, JSON.stringify(session0.body?.data ?? {}).slice(0, 80))
// Org-scoped endpoints require the x-organization-id context header.
orgHeader = session0.body?.data?.organizations?.[0]?.id ?? ''
check('org context available from session', !!orgHeader, `org=${orgHeader.slice(0, 10)}…`)

// ─── 1. Auth edge cases ─────────────────────────────────────────────────────
const badLogin = await req('/api/auth/login', { method: 'POST', json: { email, password: 'wrong-password-1' } })
check('wrong password rejected 401 INVALID_CREDENTIALS', badLogin.status === 401 && badLogin.body?.error?.code === 'INVALID_CREDENTIALS', `status=${badLogin.status} code=${badLogin.body?.error?.code}`)

const weakReg = await req('/api/auth/register', { method: 'POST', json: { name: 'X', email: `weak-${Date.now()}@t.dev`, password: 'short' } })
check('weak password rejected', weakReg.status >= 400, `status=${weakReg.status}`)

const dupReg = await req('/api/auth/register', { method: 'POST', json: { name: 'X', email, password: 'Edge-Test-2026!' } })
check('duplicate email rejected 409', dupReg.status === 409, `status=${dupReg.status} code=${dupReg.body?.error?.code}`)

const noMfaCode = await req('/api/auth/mfa', { method: 'POST', json: { action: 'enable' } })
check('MFA enable without code 422', noMfaCode.status === 422, `status=${noMfaCode.status}`)

const usedToken = await req('/api/auth/verify-email', { method: 'POST', json: { token: reg.body?.data?.emailDelivery?.verificationToken ?? 'x' } })
check('verification token single-use', usedToken.status >= 400, `status=${usedToken.status}`)

// ─── 2. Password change edge cases ──────────────────────────────────────────
const pwWrong = await req('/api/auth/password-change', { method: 'POST', json: { currentPassword: 'not-my-password', newPassword: 'New-Password-2026!' } })
check('password change with wrong current password 401', pwWrong.status === 401, `status=${pwWrong.status} code=${pwWrong.body?.error?.code}`)
const pwShort = await req('/api/auth/password-change', { method: 'POST', json: { currentPassword: 'Edge-Test-2026!', newPassword: 'short' } })
check('password change weak new password rejected', pwShort.status >= 400, `status=${pwShort.status}`)
const pwOk = await req('/api/auth/password-change', { method: 'POST', json: { currentPassword: 'Edge-Test-2026!', newPassword: 'Edge-Test-2026b!' } })
check('password change succeeds', pwOk.status === 200, `status=${pwOk.status}`)

// ─── 3. Recipient edge cases ────────────────────────────────────────────────
const validAddr = '9xQeWvG816bUx9EPjHmaTprYpRxpVkYnTdC8kP7d2wTE'
const rBadAddr = await req('/api/recipients', { method: 'POST', json: { name: 'Bad Addr', address: 'not-an-address', category: 'VENDOR' } })
check('invalid solana address rejected', rBadAddr.status >= 400, `status=${rBadAddr.status} code=${rBadAddr.body?.error?.code}`)
const rLongName = await req('/api/recipients', { method: 'POST', json: { name: 'N'.repeat(300), address: validAddr, category: 'VENDOR' } })
check('300-char name rejected', rLongName.status >= 400, `status=${rLongName.status}`)
const rtlName = 'شركة المشاريع \u202Egnp.company\u202C Ltd'
const rRtl = await req('/api/recipients', { method: 'POST', json: { name: rtlName, address: validAddr, category: 'VENDOR', notes: 'emoji 🚀 test' } })
check('RTL/emoji name accepted (stored verbatim)', rRtl.status === 200, `status=${rRtl.status}`)
const rDup = await req('/api/recipients', { method: 'POST', json: { name: 'Duplicate', address: validAddr, category: 'VENDOR' } })
check('duplicate address rejected 409', rDup.status === 409, `status=${rDup.status} code=${rDup.body?.error?.code}`)
const recipientId = rRtl.body?.data?.recipient?.id
if (recipientId) {
  const hist = await req(`/api/recipients/${recipientId}`)
  check('recipient detail returns change history array', Array.isArray(hist.body?.data?.changeHistory), `hist=${hist.status}`)
  const restored = await req(`/api/recipients/${recipientId}`, { method: 'DELETE' })
  check('recipient archive works', restored.status === 200, `status=${restored.status}`)
  const back = await req(`/api/recipients/${recipientId}`, { method: 'PATCH', json: { status: 'ACTIVE' } })
  check('archived recipient restore works', back.status === 200, `status=${back.status}`)
}
const r404 = await req('/api/recipients/does-not-exist-123')
check('unknown recipient id 404', r404.status === 404, `status=${r404.status}`)

// ─── 4. Money edge cases via batch preview ──────────────────────────────────
const csvCases = [
  ['scientific notation', `Sci,${validAddr},1e10`, false],
  ['negative', `Neg,${validAddr},-5`, false],
  ['double dot', `DD,${validAddr},1.2.3`, false],
  ['zero', `Zero,${validAddr},0`, false],
  ['excess decimals', `Prec,${validAddr},0.0000000001`, false],
  ['valid with commas', `Group,${validAddr},"1,250.50"`, true],
  ['huge amount', `Huge,${validAddr},${'9'.repeat(30)}`, true], // bigint, no float overflow
]
for (const [label, row, shouldPass] of csvCases) {
  const pv = await req('/api/batches/preview', { method: 'POST', json: { csv: `name,address,amount\n${row}`, mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' } })
  const rows = pv.body?.data?.rows ?? []
  const first = rows[0]
  const pass = first ? first.valid === shouldPass : false
  check(`amount edge: ${label} → ${shouldPass ? 'valid' : 'rejected'}`, pass, `valid=${first?.valid} issues=${(first?.issues ?? []).join('|').slice(0, 80)}`)
}

// ─── 5. Contact form edge cases ─────────────────────────────────────────────
const cShort = await req('/api/contact', { method: 'POST', json: { name: 'A', email: 'a@b.co', message: 'hi' } })
check('contact message <10 chars rejected 422', cShort.status === 422, `status=${cShort.status}`)
const cBad = await req('/api/contact', { method: 'POST', json: { name: 'A', email: 'not-an-email', message: 'This is a long enough message.' } })
check('contact invalid email rejected', cBad.status === 422 || cBad.status === 400, `status=${cBad.status}`)
const cOk = await req('/api/contact', { method: 'POST', json: { name: 'Edge Probe', email: 'edge@probe.dev', topic: 'security', message: 'Automated edge probe — please disregard. This message is longer than ten characters.' } })
check('contact valid submission recorded', cOk.status === 200 && cOk.body?.data?.recorded === true, `status=${cOk.status} ref=${cOk.body?.data?.reference?.slice(0, 8)}`)
const cLong = await req('/api/contact', { method: 'POST', json: { name: 'A', email: 'a@b.co', message: 'x'.repeat(5000) } })
check('contact 5000-char message rejected', cLong.status === 422, `status=${cLong.status}`)

// ─── 6. Schedule edge cases ─────────────────────────────────────────────────
const schedNoWallet = await req('/api/schedules', { method: 'POST', json: { name: 'S', walletId: 'nope', recipientId: 'nope', mint: 'native:SOL', amount: '5', recurrence: 'MONTHLY', firstRunAt: new Date(Date.now() + 86400000).toISOString() } })
check('schedule with unknown wallet rejected', schedNoWallet.status >= 400, `status=${schedNoWallet.status}`)
const schedBadAmount = await req('/api/schedules', { method: 'POST', json: { name: 'S', walletId: 'nope', recipientId: 'nope', mint: 'native:SOL', amount: 'abc', recurrence: 'MONTHLY', firstRunAt: new Date(Date.now() + 86400000).toISOString() } })
check('schedule with non-numeric amount rejected', schedBadAmount.status >= 400, `status=${schedBadAmount.status}`)
const schedPast = await req('/api/schedules', { method: 'POST', json: { name: 'S', walletId: 'nope', recipientId: 'nope', mint: 'native:SOL', amount: '5', recurrence: 'MONTHLY', firstRunAt: new Date(Date.now() - 86400000).toISOString() } })
check('schedule creation does not crash on past date (wallet check fires first)', schedPast.status >= 400, `status=${schedPast.status}`)

// ─── 7. Unauthenticated / cross-org access ──────────────────────────────────
const savedCookie = cookie
cookie = ''
const anonTreasury = await req('/api/treasury')
check('anonymous business API → 401 UNAUTHENTICATED', anonTreasury.status === 401 && anonTreasury.body?.error?.code === 'UNAUTHENTICATED', `status=${anonTreasury.status} code=${anonTreasury.body?.error?.code}`)
const anonContact = await req('/api/contact', { method: 'POST', json: { name: 'A', email: 'a@b.co', message: 'Public contact endpoint works without a session — long enough message.' } })
check('contact endpoint is public', anonContact.status === 200, `status=${anonContact.status}`)
cookie = savedCookie

// ─── 8. Health + openapi ────────────────────────────────────────────────────
const health = await req('/api/health')
check('health endpoint ok', health.status === 200, `status=${health.status}`)

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('\n=== EDGE-CASE AUDIT RESULTS ===')
let passed = 0
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  [${r.detail}]` : ''}`)
  if (r.pass) passed++
}
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
