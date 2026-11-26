export const ATOMIC_PERMISSIONS = [
  'view',
  'reveal',
  'copy',
  'create',
  'update',
  'delete',
  'share',
  'manage',
] as const

export type Permission = (typeof ATOMIC_PERMISSIONS)[number]
export type Role = 'viewer' | 'user' | 'editor' | 'admin' | 'owner'
export type PermissionOverrides = Partial<Record<Permission, boolean>>

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ['view'],
  user: ['view', 'reveal', 'copy'],
  editor: ['view', 'reveal', 'copy', 'create', 'update', 'delete'],
  admin: ['view', 'reveal', 'copy', 'create', 'update', 'delete', 'share', 'manage'],
  owner: ATOMIC_PERMISSIONS,
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

export function can(
  role: Role,
  action: Permission,
  overrides: PermissionOverrides = {},
): boolean {
  if (Object.prototype.hasOwnProperty.call(overrides, action)) return overrides[action] === true
  return ROLE_PERMISSIONS[role].includes(action)
}

export function normalizeOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== 'object') return {}
  const result: PermissionOverrides = {}
  for (const permission of ATOMIC_PERMISSIONS) {
    const entry = (value as Record<string, unknown>)[permission]
    if (typeof entry === 'boolean') result[permission] = entry
  }
  return result
}
