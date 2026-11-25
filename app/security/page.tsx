import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { SecurityWorkspace } from '@/components/security/security-workspace'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fsecurity')
  const [profile] = await db.select({ handle: profiles.handle }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
  if (!profile?.handle) redirect('/onboarding')
  return <SecurityWorkspace userEmail={session.user.email} />
}
