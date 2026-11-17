// Organization-level RBAC. Permissions are enforced server-side on every
// request; the frontend merely reflects them.

export const ROLES = ['OWNER', 'TREASURY_ADMIN', 'FINANCE_OPERATOR', 'APPROVER', 'ANALYST', 'AUDITOR'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'org:read',
  'org:manage',
  'team:manage',
  'wallet:manage',
  'wallet:read',
  'recipient:manage',
  'recipient:read',
  'payment:create',
  'payment:read',
  'payment:execute',
  'approval:decide',
  'policy:manage',
  'schedule:manage',
  'reconciliation:read',
  'reconciliation:manage',
  'analytics:read',
  'intelligence:use',
  'audit:read',
  'apikey:manage',
  'billing:manage',
  'export:create',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const ALL: Permission[] = [...PERMISSIONS]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  TREASURY_ADMIN: [
    'org:read',
    'wallet:manage',
    'wallet:read',
    'recipient:manage',
    'recipient:read',
    'payment:create',
    'payment:read',
    'payment:execute',
    'approval:decide',
    'policy:manage',
    'schedule:manage',
    'reconciliation:read',
    'reconciliation:manage',
    'analytics:read',
    'intelligence:use',
    'export:create',
    'apikey:manage',
  ],
  FINANCE_OPERATOR: [
    'org:read',
    'wallet:read',
    'recipient:manage',
    'recipient:read',
    'payment:create',
    'payment:read',
    'schedule:manage',
    'analytics:read',
    'intelligence:use',
    'reconciliation:read',
  ],
  APPROVER: ['org:read', 'payment:read', 'approval:decide', 'recipient:read', 'wallet:read', 'analytics:read'],
  ANALYST: ['org:read', 'payment:read', 'recipient:read', 'wallet:read', 'analytics:read', 'reconciliation:read'],
  AUDITOR: ['org:read', 'payment:read', 'recipient:read', 'wallet:read', 'audit:read', 'reconciliation:read', 'analytics:read'],
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

export function hasPermission(role: string, permission: Permission): boolean {
  if (!isRole(role)) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function permissionsFor(role: string): Permission[] {
  return isRole(role) ? ROLE_PERMISSIONS[role] : []
}
