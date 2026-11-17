import { ok, fail, route } from '@/lib/api'
import { getAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { entitlementsFor } from '@/lib/entitlements'

export async function GET(request: Request) {
  try {
    const auth = await getAuth(request)
    if (!auth) return ok({ authenticated: false })
    const memberships = await db.membership.findMany({ where: { userId: auth.user.id }, include: { org: { include: { subscription: true } } }, orderBy: { createdAt: 'asc' } })
    return ok({
      authenticated: true,
      mfaPassed: auth.session.mfaPassed,
      mfaEnabled: !!auth.user.totpEnabledAt,
      emailVerified: !!auth.user.emailVerifiedAt,
      user: { id: auth.user.id, email: auth.user.email, name: auth.user.name },
      organizations: memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        slug: m.org.slug,
        role: m.role,
        status: m.org.status,
        plan: m.org.plan,
        planStatus: m.org.planStatus,
        entitlements: entitlementsFor(m.org.plan),
      })),
    })
  } catch (err) {
    return fail(request, err)
  }
}

void route
