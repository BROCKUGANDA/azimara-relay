'use client'

// Root-level boundary of last resort: if the shell itself throws (outside the
// app boundary), render a minimal standalone page that can recover. Inline
// styles only — this page renders before/independent of the app stylesheet.

const COLORS = {
  bg: '#080D17',
  surface: '#0E1725',
  border: '#26374C',
  text: '#F0F5FA',
  dim: '#A0AEC0',
  faint: '#74849A',
  teal: '#35D6C0',
  red: '#F27683',
}

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ background: COLORS.bg, color: COLORS.text, fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', padding: 40, border: `1px solid ${COLORS.border}`, borderRadius: 12, background: COLORS.surface }}>
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden style={{ margin: '0 auto 16px', display: 'block' }}>
            <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke={COLORS.teal} strokeWidth="1.6" />
            <path d="M9 20.5 16 8l7 12.5" stroke={COLORS.teal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12.2 17.4h7.6" stroke="#658CFF" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
            AZIMARA <span style={{ color: COLORS.teal }}>RELAY</span> could not load
          </h1>
          <p style={{ fontSize: 13, color: COLORS.dim, margin: '0 0 20px', lineHeight: 1.5 }}>
            An unexpected error interrupted the application. Your session and data are unaffected — reloading usually resolves it.
          </p>
          {error?.digest ? <p style={{ fontSize: 11, color: COLORS.faint, margin: '0 0 16px', fontFamily: 'monospace' }}>Reference: {error.digest}</p> : null}
          <button
            onClick={reset}
            style={{ background: COLORS.teal, color: '#062A26', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
