import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { env } from './env'

// Production SMTP mailer. Gated entirely on configuration: when SMTP_HOST is
// absent the platform reports "delivery unavailable" instead of pretending an
// email was sent — callers fall back to surfacing the link in the interface
// (development convenience only, never shown as a fake success).

export type MailInput = {
  to: string
  subject: string
  text: string
  html: string
}

export type MailResult = {
  delivered: boolean
  reason?: string
  messageId?: string
}

let transporter: Transporter | null = null
let transporterKey: string | null = null

function resendConfigured(): boolean {
  return !!env().RESEND_API_KEY
}

function smtpConfigured(): boolean {
  const e = env()
  return !!e.SMTP_HOST && !!e.SMTP_PORT
}

function mailConfigured(): boolean {
  return resendConfigured() || smtpConfigured()
}

async function getTransport(): Promise<Transporter> {
  const e = env()
  const key = `${e.SMTP_HOST}:${e.SMTP_PORT}:${e.SMTP_USER ?? ''}`
  if (transporter && transporterKey === key) return transporter
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE ?? e.SMTP_PORT === 465,
    auth: e.SMTP_USER && e.SMTP_PASSWORD ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    // Timeouts keep a hung SMTP server from blocking a request thread.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  transporterKey = key
  return transporter
}

export function mailFrom(): { address: string; name: string } {
  const e = env()
  return { address: e.SMTP_FROM ?? 'no-reply@aiazimara.com', name: e.SMTP_FROM_NAME ?? 'AZIMARA RELAY' }
}

export async function sendEmail(input: MailInput): Promise<MailResult> {
  if (resendConfigured()) {
    try {
      const from = mailFrom()
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env().RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${from.name} <${from.address}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(JSON.stringify({ level: 'error', msg: 'resend_delivery_failed', status: res.status, reason: String((data as any)?.message ?? res.statusText).slice(0, 200) }))
        return { delivered: false, reason: 'RESEND_DELIVERY_FAILED' }
      }
      return { delivered: true, messageId: (data as any)?.id }
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'resend_delivery_failed', reason: String(err instanceof Error ? err.message : err).slice(0, 200) }))
      return { delivered: false, reason: 'RESEND_DELIVERY_FAILED' }
    }
  }
  if (!smtpConfigured()) {
    return { delivered: false, reason: 'SMTP_NOT_CONFIGURED' }
  }
  try {
    const transport = await getTransport()
    const from = mailFrom()
    const info = await transport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
    return { delivered: true, messageId: info.messageId }
  } catch (err) {
    // Never leak SMTP credentials or raw transport errors to callers; the
    // failure is logged server-side with the reason only.
    console.error(JSON.stringify({ level: 'error', msg: 'smtp_delivery_failed', reason: String(err instanceof Error ? err.message : err).slice(0, 200) }))
    return { delivered: false, reason: 'SMTP_DELIVERY_FAILED' }
  }
}

// ─── Shared email chrome ────────────────────────────────────────────────────

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): { html: string; text: string } {
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 8px auto"><tr><td style="border-radius:10px;background:#0EA5B7;text-align:center">
        <a href="${cta.url}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#04121A;text-decoration:none;border-radius:10px">${cta.label}</a>
      </td></tr></table>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5B6B7A;text-align:center;word-break:break-all">Or paste this link into your browser:<br>${cta.url}</p>`
    : ''
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0B1420">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B1420;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#101C2C;border:1px solid #1D2E42;border-radius:16px;padding:36px">
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#E6F2F7;letter-spacing:1px;padding-bottom:4px">AZIMARA <span style="color:#0EA5B7">RELAY</span></td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:600;color:#E6F2F7;padding:18px 0 8px 0">${title}</td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#9FB3C4">${bodyHtml}</td></tr>
      ${ctaHtml}
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5B6B7A;padding-top:26px;border-top:1px solid #1D2E42;margin-top:20px">
        AZIMARA RELAY · Non-custodial financial operations on Solana · Dubai, UAE<br>
        If you did not request this email, you can safely ignore it — your account is unchanged.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
  const text = `${title}\n\n${bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}`
  return { html, text }
}

// ─── Concrete transactional emails ─────────────────────────────────────────

export function verificationEmail(to: string, name: string, verifyUrl: string): MailInput {
  const { html, text } = layout(
    'Verify your email address',
    `<p>Hi ${escapeHtml(name)},</p><p>Welcome to AZIMARA RELAY. Confirm this address to activate your workspace. This link expires in 24 hours.</p>`,
    { label: 'Verify email', url: verifyUrl },
  )
  return { to, subject: 'Verify your AZIMARA RELAY email', html, text }
}

export function passwordResetEmail(to: string, resetUrl: string): MailInput {
  const { html, text } = layout(
    'Reset your password',
    `<p>We received a request to reset the password for <strong>${escapeHtml(to)}</strong>. This link expires in 1 hour and can be used once.</p><p>If you did not request a reset, ignore this email — your current password keeps working.</p>`,
    { label: 'Choose a new password', url: resetUrl },
  )
  return { to, subject: 'Reset your AZIMARA RELAY password', html, text }
}

export function invitationEmail(to: string, orgName: string, roleName: string, inviteUrl: string): MailInput {
  const { html, text } = layout(
    `You're invited to ${escapeHtml(orgName)}`,
    `<p>You have been invited to join the <strong>${escapeHtml(orgName)}</strong> workspace on AZIMARA RELAY as <strong>${escapeHtml(roleName)}</strong>.</p><p>This invitation expires in 7 days.</p>`,
    { label: 'Accept invitation', url: inviteUrl },
  )
  return { to, subject: `Join ${orgName} on AZIMARA RELAY`, html, text }
}

export function alertEmail(to: string, subject: string, bodyHtml: string): MailInput {
  const { html, text } = layout('Operations alert', bodyHtml)
  return { to, subject, html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

export function isMailConfigured(): boolean {
  return mailConfigured()
}
