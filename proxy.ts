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

function hasSessionCookie(request: NextRequest): boolean {
  return [...request.cookies.getAll()].some(({ name }) =>
    name === 'better-auth.session_token' ||
    name === '__Secure-better-auth.session_token' ||
    name.endsWith('.session_token'),
  )
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAppPath = APP_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (!isAppPath || hasSessionCookie(request)) return NextResponse.next()

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  loginUrl.searchParams.set('callbackURL', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/environments/:path*',
    '/groups/:path*',
    '/onboarding/:path*',
    '/projects/:path*',
    '/security/:path*',
    '/shared/:path*',
  ],
}
