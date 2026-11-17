'use client'

// Root-level boundary of last resort: if the shell itself throws (outside the
// app boundary), render a minimal standalone page that can recover.

import { Button } from '@/components/ui/button'

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ background: '#080D17', color: '#F0F5FA', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 32, border: '1px solid #26374C', borderRadius: 12, background: '#0E1725' }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>AZIMARA RELAY could not load</h1>
          <p style={{ fontSize: 13, color: '#A0AEC0', margin: '0 0 20px' }}>
            An unexpected error interrupted the application. Reloading usually resolves it.
          </p>
          {error?.digest ? <p style={{ fontSize: 11, color: '#74849A', margin: '0 0 16px' }}>Reference: {error.digest}</p> : null}
          <button
            onClick={reset}
            style={{ background: '#35D6C0', color: '#062A26', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
