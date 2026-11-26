import { NextResponse, type NextRequest } from 'next/server'

const APP_PATH_PREFIXES = [
  '/dashboard',
  '/environments',
  '/groups',
  '/onboarding',
  '/projects',
  '/security',
  '/shared',
] as const

const SENSITIVE_PREFIXES = ['/l', '/share/private', '/unlock', ...APP_PATH_PREFIXES] as const

function hasSessionCookie(request: NextRequest): boolean {
  return [...request.cookies.getAll()].some(({ name }) =>
    name === 'better-auth.session_token' ||
    name === '__Secure-better-auth.session_token' ||
    name.endsWith('.session_token'),
  )
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const nonce = btoa(crypto.randomUUID())
  const isDev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const isAppPath = matchesPrefix(pathname, APP_PATH_PREFIXES)
  if (isAppPath && !hasSessionCookie(request)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('callbackURL', pathname)
    return NextResponse.redirect(loginUrl, { headers: { 'Content-Security-Policy': csp } })
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  if (matchesPrefix(pathname, SENSITIVE_PREFIXES)) {
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('Cache-Control', 'no-store, max-age=0')
  }
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
