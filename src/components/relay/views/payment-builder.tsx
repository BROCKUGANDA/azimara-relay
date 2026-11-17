'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { formatAmount, shortAddress } from '@/lib/client/format'
import { PageHeader, StatusBadge, Amount, EmptyState, SetupRequiredState } from '../ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle2, Wallet, Coins, Users, FileText, ShieldCheck, Send, AlertTriangle } from 'lucide-react'
import { isValidSolanaAddress } from '@/lib/client/address'

type WalletRow = { id: string; label: string; address: string; network: string; ownershipStatus: string; revokedAt?: string | null; balance: { available: boolean; sol?: { lamports: string }; tokens?: { mint: string; amount: string; decimals: number | null }[] } | null }
type AssetRow = { mint: string; symbol: string; name: string; decimals: number; verified: boolean; providerEligible: boolean }
type RecipientRow = { id: string; name: string; address: string; category: string | null; status: string }
type PolicyData = { policies: { id: string; name: string; version: number; active: boolean; rules: { id: string; description: string; approversRequired: number; condition?: Record<string, unknown> }[] }[] }

const STEPS = [
  { id: 'wallet', label: 'Source wallet', icon: <Wallet className="h-4 w-4" /> },
  { id: 'asset', label: 'Asset', icon: <Coins className="h-4 w-4" /> },
  { id: 'recipient', label: 'Recipient', icon: <Users className="h-4 w-4" /> },
  { id: 'details', label: 'Amount & purpose', icon: <FileText className="h-4 w-4" /> },
  { id: 'policy', label: 'Review & submit', icon: <ShieldCheck className="h-4 w-4" /> },
]

// Client-side address validation mirrors server rules (base58, 32 bytes).
function validAddress(a: string): boolean {
  return isValidSolanaAddress(a)
}

function localAmountBase(amount: string, decimals: number): string | null {
  const s = amount.trim()
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null
  const [w, f = ''] = s.split('.')
  if (f.length > decimals) return null
  return `${w === '' ? '0' : w}${(f + '0'.repeat(decimals)).slice(0, decimals)}`.replace(/^0+(?=\d)/, '') || '0'
}

export function PaymentBuilderView() {
  const { navigate } = useRouter()
  const [step, setStep] = useState(0)
  const [walletId, setWalletId] = useState('')
  const [mint, setMint] = useState('')
  const [mode, setMode] = useState<'REGISTERED' | 'NEW'>('REGISTERED')
  const [recipientId, setRecipientId] = useState('')
  const [newRecipient, setNewRecipient] = useState({ name: '', address: '' })
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ id: string; reference: string; status: string; approvalsRequired: number } | null>(null)

  const wallets = useApi<{ wallets: WalletRow[] }>(['wallets'], '/api/wallets')
  const assets = useApi<{ assets: AssetRow[] }>(['assets'], '/api/assets')
  const recipients = useApi<{ recipients: RecipientRow[] }>(['recipients-payment'], '/api/recipients?status=ACTIVE&pageSize=100')
  const policies = useApi<PolicyData>(['policies'], '/api/policies')
  const ruleConditions = new Map<string, Record<string, unknown>>()

  const wallet = wallets.data?.wallets.find((w) => w.id === walletId)
  const asset = assets.data?.assets.find((a) => a.mint === mint)
  const decimals = asset?.decimals ?? 6
  const baseAmount = useMemo(() => (amount ? localAmountBase(amount, decimals) : null), [amount, decimals])
  const tok = asset ? (wallet?.balance?.tokens ?? []).find((t) => t.mint === asset.mint) : undefined

  // Defaults
  useEffect(() => {
    if (!walletId && wallets.data?.wallets.length) {
      const verified = wallets.data.wallets.find((w) => w.ownershipStatus === 'VERIFIED')
      if (verified) setWalletId(verified.id)
    }
  }, [wallets.data, walletId])
  useEffect(() => {
    if (!mint && assets.data?.assets.length) {
      const usdc = assets.data.assets.find((a) => a.providerEligible)
      if (usdc) setMint(usdc.mint)
    }
  }, [assets.data, mint])

  const activePolicy = policies.data?.policies.find((p) => p.active)
  const estimatedApprovers = useMemo(() => {
    if (!activePolicy || !baseAmount || !asset) return 1
    let required = 0
    for (const rule of activePolicy.rules) {
      const c = (rule.condition ?? {}) as { field: string; amountBaseUnits?: string; mint?: string; withinDays?: number }
      try {
        if (c.field === 'ALWAYS') required = Math.max(required, rule.approversRequired)
        if (c.field === 'AMOUNT_LT' && (!c.mint || c.mint === asset.mint) && BigInt(baseAmount) < BigInt(c.amountBaseUnits ?? '0')) required = Math.max(required, rule.approversRequired)
        if (c.field === 'AMOUNT_GTE' && (!c.mint || c.mint === asset.mint) && BigInt(baseAmount) >= BigInt(c.amountBaseUnits ?? '0')) required = Math.max(required, rule.approversRequired)
      } catch {
        // Malformed rule (unparseable amount) — treat the rule as not matched and skip it.
      }
    }
    return Math.max(1, required)
  }, [activePolicy, baseAmount, asset])

  const canContinue = [!!walletId, !!mint, mode === 'NEW' ? validAddress(newRecipient.address) : !!recipientId, !!baseAmount && BigInt(baseAmount) > 0n][step]

  const destination = mode === 'NEW' ? newRecipient.address.trim() : recipients.data?.recipients.find((r) => r.id === recipientId)?.address ?? ''
  const recipientName = mode === 'NEW' ? newRecipient.name || 'New recipient' : recipients.data?.recipients.find((r) => r.id === recipientId)?.name

  async function submit() {
    setBusy(true)
    try {
      let rid = recipientId
      if (mode === 'NEW') {
        const createdRec = await api<{ id: string }>('/api/recipients', {
          json: { name: newRecipient.name, address: newRecipient.address, category: 'OTHER' },
        })
        rid = createdRec.id
      }
      const res = await api<{ payment: { id: string; reference: string; status: string; approvalsRequired: number }; idempotentReplay: boolean }>('/api/payments', {
        json: {
          sourceWalletId: walletId,
          recipientId: rid || undefined,
          destination,
          mint,
          amount,
          reason: reason || undefined,
          invoiceRef: invoiceRef || undefined,
        },
      })
      if (res.idempotentReplay) toast.info('Identical payment already exists (idempotency guard) — returning the original.')
      else toast.success(`Payment ${res.payment.reference} submitted for approval`)
      setCreated(res.payment)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment creation failed')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg">
        <Card className="border-[#43D48E]/40 bg-[#15111D] p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-[#43D48E]" />
          <h2 className="mt-4 text-lg font-semibold">Payment {created.reference} submitted</h2>
          <p className="mt-2 text-sm text-secondary">
            Validation passed and the policy engine evaluated your organization&apos;s rules. The payment now needs <strong>{created.approvalsRequired} approver{created.approvalsRequired > 1 ? 's' : ''}</strong> before quoting and execution.
          </p>
          <div className="mt-4 rounded-lg border border-[#2E2540] bg-[#100D16] p-3 text-left text-xs text-dim">
            <div>Next steps: approval → provider quote → wallet signature → onchain settlement → reconciliation.</div>
            <div className="mt-1">The approved payload is hash-frozen; any material change restarts approval.</div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1 border-[#2E2540]" onClick={() => navigate(`/app/payments/${created.id}`)}>View payment</Button>
            <Button
              className="flex-1 bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90"
              onClick={() => {
                setCreated(null)
                setStep(0)
                setAmount('')
                setReason('')
                setRecipientId('')
                setMode('REGISTERED')
                setNewRecipient({ name: '', address: '' })
              }}
            >
              Create another
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New payment" description="Multi-step builder: every field is validated before submission, and the policy engine decides approvals." breadcrumb={['Relay', 'Payments', 'New']} />

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors ${i === step ? 'bg-[#1d1826] text-[#E7B458]' : i < step ? 'text-[#43D48E] hover:bg-[#1d1826]' : 'text-dim'}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.icon}
              {s.label}
            </button>
            {i < STEPS.length - 1 ? <div className="h-px w-4 bg-[#2E2540]" /> : null}
          </div>
        ))}
      </div>

      <Card className="border-[#2E2540] bg-[#15111D] p-6">
        {step === 0 && (
          <div>
            <h3 className="text-sm font-semibold">Choose the source wallet</h3>
            <p className="mt-1 text-xs text-dim">Only verified wallets can source payments. The wallet owner signs every transfer — Relay never can.</p>
            {wallets.data?.wallets.length === 0 ? (
              <EmptyState title="No wallets yet" description="Register and verify a wallet first." action={<Button size="sm" onClick={() => navigate('/app/wallets')} className="bg-[#E7B458] text-[#221202]">Go to wallets</Button>} />
            ) : (
              <div className="mt-4 space-y-2">
                {(wallets.data?.wallets ?? []).filter((w) => !w.revokedAt).map((w) => (
                  <button
                    key={w.id}
                    onClick={() => w.ownershipStatus === 'VERIFIED' && setWalletId(w.id)}
                    disabled={w.ownershipStatus !== 'VERIFIED'}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${walletId === w.id ? 'border-[#E7B458] bg-[#E7B458]/5' : 'border-[#2E2540] hover:bg-[#1d1826]'} ${w.ownershipStatus !== 'VERIFIED' ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <div>
                      <div className="text-sm font-medium">{w.label}</div>
                      <div className="font-mono text-[11px] text-dim">{shortAddress(w.address, 6)} · {w.network}</div>
                    </div>
                    {w.ownershipStatus === 'VERIFIED' ? (
                      walletId === w.id ? <CheckCircle2 className="h-5 w-5 text-[#E7B458]" /> : <span className="text-[10px] text-dim">verified</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-[#F2BB62]"><AlertTriangle className="h-3 w-3" /> unverified</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 className="text-sm font-semibold">Select the token</h3>
            <p className="mt-1 text-xs text-dim">Assets come from the supported-asset registry; mints are validated against provider eligibility.</p>
            <div className="mt-4 space-y-2">
              {(assets.data?.assets ?? []).filter((a) => a.mint !== 'native:SOL').map((a) => (
                <button
                  key={a.mint}
                  onClick={() => setMint(a.mint)}
                  className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${mint === a.mint ? 'border-[#E7B458] bg-[#E7B458]/5' : 'border-[#2E2540] hover:bg-[#1d1826]'}`}
                >
                  <div>
                    <div className="text-sm font-medium">{a.symbol} <span className="text-xs text-dim">· {a.name}</span></div>
                    <div className="font-mono text-[10px] text-dim">{shortAddress(a.mint, 6)}</div>
                  </div>
                  <span className="text-[10px] text-dim">{a.providerEligible ? 'Provider eligible' : 'Registry only'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="text-sm font-semibold">Select the recipient</h3>
            <p className="mt-1 text-xs text-dim">Registered recipients match against your directory; addresses can never be silently changed after approval.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant={mode === 'REGISTERED' ? 'secondary' : 'outline'} onClick={() => setMode('REGISTERED')} className={mode === 'REGISTERED' ? 'bg-[#1d1826] text-[#E7B458]' : 'border-[#2E2540]'}>
                From directory
              </Button>
              <Button size="sm" variant={mode === 'NEW' ? 'secondary' : 'outline'} onClick={() => setMode('NEW')} className={mode === 'NEW' ? 'bg-[#1d1826] text-[#E7B458]' : 'border-[#2E2540]'}>
                New recipient
              </Button>
            </div>
            {mode === 'REGISTERED' ? (
              <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                {(recipients.data?.recipients ?? []).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRecipientId(r.id)}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left ${recipientId === r.id ? 'border-[#E7B458] bg-[#E7B458]/5' : 'border-[#2E2540] hover:bg-[#1d1826]'}`}
                  >
                    <div>
                      <div className="text-sm">{r.name}</div>
                      <div className="font-mono text-[10px] text-dim">{shortAddress(r.address, 6)}{r.category ? ` · ${r.category}` : ''}</div>
                    </div>
                    {recipientId === r.id ? <CheckCircle2 className="h-4 w-4 text-[#E7B458]" /> : null}
                  </button>
                ))}
                {(recipients.data?.recipients ?? []).length === 0 ? <EmptyState title="Directory is empty" description="Add recipients first, or create a new one here." /> : null}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Recipient name</Label>
                  <Input value={newRecipient.name} onChange={(e) => setNewRecipient({ ...newRecipient, name: e.target.value })} className="mt-1 border-[#2E2540] bg-[#100D16]" placeholder="Who is being paid" />
                </div>
                <div>
                  <Label>Solana address</Label>
                  <Input value={newRecipient.address} onChange={(e) => setNewRecipient({ ...newRecipient, address: e.target.value })} className={`mt-1 border-[#2E2540] bg-[#100D16] font-mono text-xs ${newRecipient.address && !validAddress(newRecipient.address) ? 'border-[#F27683]' : ''}`} placeholder="Base58 public key" />
                  {newRecipient.address && !validAddress(newRecipient.address) ? <p className="mt-1 text-[11px] text-[#F27683]">Not a valid Solana public key</p> : null}
                </div>
                <p className="text-[11px] text-dim">This creates a directory entry first, so future payments and duplicate detection benefit immediately.</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="text-sm font-semibold">Amount and business purpose</h3>
            <p className="mt-1 text-xs text-dim">Amounts are converted to exact integer base units — floating point is never used for money.</p>
            <div className="mt-4 space-y-3">
              <div>
                <Label>Amount ({asset?.symbol ?? ''})</Label>
                <div className="relative mt-1">
                  <Input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} className={`border-[#2E2540] bg-[#100D16] pr-28 font-mono ${amount && !baseAmount ? 'border-[#F27683]' : ''}`} placeholder="0.00" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dim">{asset?.symbol}</span>
                </div>
                {amount && baseAmount ? <p className="mt-1 font-mono text-[11px] text-dim">= {BigInt(baseAmount).toLocaleString('en-US')} base units ({decimals} decimals)</p> : null}
                {amount && !baseAmount ? <p className="mt-1 text-[11px] text-[#F27683]">Exceeds {decimals} decimal places</p> : null}
                {wallet?.balance?.available && asset ? (
                  <p className="mt-1 text-[11px] text-dim">
                    Wallet observed: {tok ? formatAmount(tok.amount, decimals) + ' ' + asset.symbol : `no ${asset.symbol} balance observed`}
                    {' · '}SOL {formatAmount(wallet.balance.sol?.lamports ?? '0', 9)}
                  </p>
                ) : null}
              </div>
              <div>
                <Label>Business reason</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 border-[#2E2540] bg-[#100D16]" placeholder="e.g. March contributor distributions" />
              </div>
              <div>
                <Label>Invoice / document reference (optional)</Label>
                <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} className="mt-1 border-[#2E2540] bg-[#100D16]" placeholder="INV-2026-014" />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3 className="text-sm font-semibold">Review and submit</h3>
            <p className="mt-1 text-xs text-dim">Approving users will see exactly these fields. Any later change to destination, token, amount or wallet invalidates approvals.</p>
            <div className="mt-4 space-y-2 rounded-lg border border-[#2E2540] bg-[#100D16] p-4 text-sm">
              <Row k="Source wallet" v={`${wallet?.label ?? ''} · ${shortAddress(wallet?.address ?? '', 4)} (${wallet?.network})`} />
              <Row k="Destination" v={recipientName ? `${recipientName} · ${shortAddress(destination, 6)}` : shortAddress(destination, 6)} />
              <Row k="Token" v={`${asset?.symbol ?? ''} · ${shortAddress(mint, 4)}`} />
              <Row k="Amount" v={baseAmount ? formatAmount(baseAmount, decimals, asset?.symbol) : '—'} mono />
              <Row k="Reason" v={reason || '—'} />
              {invoiceRef ? <Row k="Invoice ref" v={invoiceRef} /> : null}
            </div>
            <div className="mt-4 rounded-lg border border-[#B79BF0]/30 bg-[#B79BF0]/5 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-[#B79BF0]"><ShieldCheck className="h-4 w-4" /> Policy preview</div>
              <p className="mt-1.5 text-xs text-[#B79BF0]/80">
                Active policy: <strong>{activePolicy?.name ?? 'Default policy'}</strong> (v{activePolicy?.version ?? 1}) — approximately <strong>{estimatedApprovers} independent approver{estimatedApprovers > 1 ? 's' : ''}</strong> required for this amount.
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-dim">
                {(activePolicy?.rules ?? []).slice(0, 4).map((r) => (
                  <li key={r.id}>• {r.description}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4 rounded-lg border border-[#2E2540] bg-[#100D16] p-3 text-[11px] leading-relaxed text-dim">
              On submission: validation runs → policy evaluates → payment enters <StatusBadge status="PENDING_APPROVAL" />. Quoting happens only after approval, using live provider quotes. The quote is authoritative — never a stale estimate.
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)} className="border-[#2E2540]">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canContinue} onClick={() => setStep(step + 1)} className="bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">
              Continue <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button disabled={busy || !baseAmount} onClick={submit} className="bg-[#E7B458] font-medium text-[#221202] hover:bg-[#E7B458]/90">
              <Send className="mr-1.5 h-4 w-4" /> {busy ? 'Submitting…' : 'Submit for approval'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-dim">{k}</span>
      <span className={`text-right text-xs ${mono ? 'font-mono tabular-nums text-[#E7B458]' : 'text-secondary'}`}>{v}</span>
    </div>
  )
}
