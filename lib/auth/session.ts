import 'server-only'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { hasVerifiedEmail } from './verification'

export async function getCurrentSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !hasVerifiedEmail(session.user)) return null
  return session
}
