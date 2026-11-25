const FALLBACK_CALLBACK = '/dashboard'

export function safeCallbackPath(value: string | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return FALLBACK_CALLBACK
  }

  try {
    const parsed = new URL(value, 'https://wasp.invalid')
    if (parsed.origin !== 'https://wasp.invalid') return FALLBACK_CALLBACK
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return FALLBACK_CALLBACK
  }
}
