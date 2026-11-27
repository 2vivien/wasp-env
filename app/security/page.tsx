import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { SecurityWorkspace } from '@/components/security/security-workspace'
import { serverData } from '@/lib/server/guard'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'

export const dynamic = 'force-dynamic'

export default async function SecurityPage() {
  const loaded = await serverData(async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    const [profile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1)
    return { email: session.user.email, needsOnboarding: !profile?.handle }
  })
  if (!loaded.ok) return <ServerErrorNotice />
  if (!loaded.value) redirect('/login?callbackURL=%2Fsecurity')
  if (loaded.value.needsOnboarding) redirect('/onboarding')
  return <SecurityWorkspace userEmail={loaded.value.email} />
}
