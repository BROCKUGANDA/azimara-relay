// Next.js instrumentation — boots the asset seed and background worker once
// per server process, before handling requests.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrap } = await import('@/lib/bootstrap')
    await bootstrap()
  }
}
