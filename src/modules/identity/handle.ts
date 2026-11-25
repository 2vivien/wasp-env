const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/

const RESERVED_HANDLES = new Set([
  'admin', 'api', 'google', 'me', 'null', 'root', 'security', 'support', 'system', 'vault',
])

export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase()
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle)
}
