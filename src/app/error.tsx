'use client'

// Per-route error boundary: a crashed view must never white-screen the whole
// single-page application. Users get a recovery path without losing their
// session or navigation.

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface for ops; never swallow silently.
    console.error('[relay] view error:', error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-[#26374C] bg-[#0E1725] p-8 text-center mt-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F27683]/10">
        <AlertTriangle className="h-6 w-6 text-[#F27683]" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">Something went wrong in this view</h2>
        <p className="mt-1 text-xs text-dim">
          The error was contained to this screen — your session and data are unaffected. Retry, or head back to the overview.
        </p>
      </div>
      {error.digest ? <p className="font-mono text-[10px] text-dim">Reference: {error.digest}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={reset} className="bg-[#35D6C0] font-medium text-[#062A26] hover:bg-[#35D6C0]/90">
          Try again
        </Button>
        <Button size="sm" variant="outline" className="border-[#26374C]" onClick={() => (window.location.hash = '#/app')}>
          Back to overview
        </Button>
      </div>
    </div>
  )
}
