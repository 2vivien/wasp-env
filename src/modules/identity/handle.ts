import { LIMITS } from '@/lib/limits'

const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/

const RESERVED_HANDLES = new Set([
  'admin',
  'api',
  'google',
  'me',
  'null',
  'root',
  'security',
  'support',
  'system',
  'vault',
])

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase()
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle)
}

export function canChangeHandle(changedAt: Date | null, now = new Date()): boolean {
  if (!changedAt) return true
  return now.getTime() - changedAt.getTime() >= LIMITS.handleChangeCooldownMs
}

export function handleChangeRetryAt(changedAt: Date, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), changedAt.getTime() + LIMITS.handleChangeCooldownMs))
}
