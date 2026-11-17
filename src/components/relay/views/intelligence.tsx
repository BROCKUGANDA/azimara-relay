'use client'

import { useEffect, useRef, useState } from 'react'
import { useApi, api } from '@/lib/client/hooks'
import { useRouter } from '@/lib/client/store'
import { PageHeader, EmptyState, ErrorState, SectionCard } from '../ui'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { BrainCircuit, Send, CheckCircle2, XCircle, FileText, ShieldCheck, Lightbulb } from 'lucide-react'

type SessionRow = { id: string; title: string; updatedAt: string }
type ProposalRow = { id: string; title: string; kind: string; status: string; checks: Record<string, unknown>; createdAt: string }
type Message = { id: string; role: string; content: string; data: { kind?: string; proposalId?: string; title?: string; items?: { recipientName: string; address: string; amount: string; note?: string; issues?: string[] }[]; checks?: Record<string, unknown>; mint?: string; evidenceRefs?: string[]; extraction?: Record<string, unknown> } }
type ProposalAction = { created: { reference: string; recipient: string; status: string }[]; errors: { recipient: string; error: string }[] }

const SUGGESTIONS = [
  'Summarize my pending approvals and anything blocking them',
  'Prepare a monthly USDC payout batch for all contractors',
  'Which recipients have not been paid in over 30 days?',
  'Explain why a transfer could become RECOVERABLE',
]

export function IntelligenceView() {
  const { navigate } = useRouter()
  const sessions = useApi<{ sessions: SessionRow[]; proposals: ProposalRow[] }>(['ai-sessions'], '/api/intelligence/sessions')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function loadSession(id: string) {
    setSessionId(id)
    try {
      const d = await api<{ messages: Message[] }>(`/api/intelligence/chat?sessionId=${id}`)
      setMessages(d.messages)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load session')
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim()
    if (!message || busy) return
    setInput('')
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: message, data: {} }])
    setBusy(true)
    try {
      const res = await api<{ sessionId: string; message: Message }>('/api/intelligence/chat', { json: { sessionId: sessionId ?? undefined, message } })
      setSessionId(res.sessionId)
      setMessages((m) => [...m, res.message])
      sessions.refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed'
      if (msg.includes('AI_PROVIDER_UNAVAILABLE')) {
        setMessages((m) => [...m, { id: `err-${Date.now()}`, role: 'assistant', content: 'The AI provider is unreachable from this environment. Deterministic tools (payment records, duplicate checks, exports) remain fully available — nothing is simulated.', data: { kind: 'ERROR' } }])
      } else {
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  async function decideProposal(proposalId: string, action: 'ACCEPT' | 'REJECT') {
    try {
      if (action === 'ACCEPT') {
        const res = await api<ProposalAction>(`/api/intelligence/proposals/${proposalId}/action`, { json: { action } })
        toast.success(`Converted to ${res.created.length} real payment(s) — approvals still apply`)
        if (res.errors.length) toast.warning(`${res.errors.length} item(s) failed validation: ${res.errors.map((e) => e.recipient).join(', ')}`)
        navigate('/app/payments')
      } else {
        await api(`/api/intelligence/proposals/${proposalId}/action`, { json: { action } })
        toast.success('Proposal rejected')
        setMessages((m) => m.filter((msg) => msg.data?.proposalId !== proposalId))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    }
  }

  function ProposalCard({ data }: { data: Message['data'] }) {
    const checks = data.checks ?? {}
    return (
      <div className="rounded-lg border border-[#A18BEB]/30 bg-[#A18BEB]/5 p-3">
        <div className="text-xs font-semibold text-[#A18BEB]">Proposed payment batch: {data.title}</div>
        <div className="mt-2 space-y-1.5">
          {(data.items ?? []).map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded border border-[#26374C] bg-[#0B1220] px-2 py-1.5 text-xs">
              <span className="text-secondary">{it.recipientName}</span>
              <span className="font-mono text-[#35D6C0]">{it.amount}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-dim">
          <div><CheckCircle2 className="mr-1 inline h-3 w-3 text-[#36C995]" /> Deterministic validation: {String(checks.recipientsMatched ?? 0)} recipient(s) matched, {String(checks.recipientsMissing ?? []).length ? `${(checks.recipientsMissing as string[]).length} missing` : 'none missing'}</div>
          <div><ShieldCheck className="mr-1 inline h-3 w-3 text-[#A18BEB]" /> Policy: ~{String(checks.policyApproversRequired ?? 1)} approver(s) required by the active policy</div>
          <div><Lightbulb className="mr-1 inline h-3 w-3 text-[#F2BB62]" /> Estimated total: {String(checks.estimatedTotal ?? '0')} base units ({String(checks.totalCurrency ?? '')}) — recalculated by code, never by the model</div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => decideProposal(data.proposalId!, 'ACCEPT')} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Accept → create payments
          </Button>
          <Button size="sm" variant="outline" onClick={() => decideProposal(data.proposalId!, 'REJECT')} className="border-[#F27683]/40 text-[#F27683]">
            <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-dim">Accepting runs the normal pipeline: validation → policy → approval queue. The AI never signs, never approves, and cannot bypass policy.</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Relay Intelligence"
        description="Contextual AI treasury assistant. Every proposal carries evidence, deterministic checks and a human approval handoff."
        breadcrumb={['Relay', 'Assurance', 'Relay Intelligence']}
      />
      <div className="grid gap-5 lg:grid-cols-4">
        {/* Sessions */}
        <div className="space-y-3">
          <SectionCard title="Conversations">
            <div className="space-y-1">
              {(sessions.data?.sessions ?? []).map((s) => (
                <button key={s.id} onClick={() => loadSession(s.id)} className={`block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs hover:bg-[#142135] ${sessionId === s.id ? 'bg-[#142135] text-[#35D6C0]' : 'text-secondary'}`}>
                  {s.title}
                </button>
              ))}
              {(sessions.data?.sessions ?? []).length === 0 ? <div className="text-xs text-dim">No conversations yet.</div> : null}
            </div>
          </SectionCard>
          <SectionCard title="Proposals">
            <div className="space-y-1.5">
              {(sessions.data?.proposals ?? []).slice(0, 6).map((p) => (
                <div key={p.id} className="rounded-lg border border-[#26374C] bg-[#0B1220] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs">{p.title}</span>
                    <Badge variant="outline" className={`border text-[9px] ${p.status === 'PROPOSED' ? 'border-[#A18BEB]/40 text-[#A18BEB]' : p.status === 'ACCEPTED' || p.status === 'CONVERTED' ? 'border-[#36C995]/40 text-[#36C995]' : 'border-[#26374C] text-dim'}`}>{p.status}</Badge>
                  </div>
                </div>
              ))}
              {(sessions.data?.proposals ?? []).length === 0 ? <div className="text-xs text-dim">No proposals yet.</div> : null}
            </div>
          </SectionCard>
        </div>

        {/* Chat */}
        <div className="lg:col-span-3">
          <div className="flex h-[560px] flex-col rounded-xl border border-[#26374C] bg-[#0E1725]">
            <div className="flex items-center gap-2 border-b border-[#1A293D] px-4 py-3">
              <BrainCircuit className="h-4 w-4 text-[#A18BEB]" />
              <span className="text-sm font-medium">Relay Intelligence</span>
              <span className="ml-auto rounded border border-[#26374C] px-1.5 py-0.5 text-[10px] text-dim">no signing authority · no custody</span>
            </div>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <BrainCircuit className="h-10 w-10 text-[#A18BEB]/40" />
                  <div className="text-sm text-dim">Ask about your payments, propose a batch, or extract invoice details.</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-lg border border-[#26374C] bg-[#0B1220] px-3 py-2 text-left text-xs text-secondary hover:border-[#A18BEB]/40 hover:text-foreground">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-[#35D6C0]/15 text-foreground' : 'border border-[#26374C] bg-[#0B1220] text-secondary'}`}>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.data?.kind === 'PROPOSAL' ? <div className="mt-2"><ProposalCard data={m.data} /></div> : null}
                      {m.data?.kind === 'INVOICE_EXTRACTION' ? (
                        <div className="mt-2 rounded-lg border border-[#26374C] bg-[#0B1220] p-2 text-xs text-dim">
                          <FileText className="mr-1 inline h-3 w-3 text-[#35D6C0]" /> Extracted fields are suggestions only; amounts are recalculated on payment creation.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {busy ? <div className="flex items-center gap-2 text-xs text-dim"><span className="h-2 w-2 animate-pulse rounded-full bg-[#A18BEB]" /> Relay Intelligence is thinking…</div> : null}
            </div>
            <div className="border-t border-[#1A293D] p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  rows={2}
                  placeholder="e.g. Prepare the approved contributor payments for this month and flag duplicate recipients…"
                  className="flex-1 resize-none border-[#26374C] bg-[#0B1220]"
                />
                <Button onClick={() => send()} disabled={busy || !input.trim()} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
