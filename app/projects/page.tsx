import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { ProjectsWorkspace } from '@/components/projects/projects-workspace'
import { serverData } from '@/lib/server/guard'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const loaded = await serverData(async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    const [profile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1)
    if (!profile?.handle)
      return { needsOnboarding: true as const, vaults: [] as Array<{ id: string }> }
    const ownedVaults = await db
      .select({ id: vaults.id })
      .from(vaults)
      .where(eq(vaults.userId, session.user.id))
      .limit(20)
    return { needsOnboarding: false as const, vaults: ownedVaults }
  })
  if (!loaded.ok) return <ServerErrorNotice />
  if (!loaded.value) redirect('/login?callbackURL=%2Fprojects')
  if (loaded.value.needsOnboarding) redirect('/onboarding')
  return <ProjectsWorkspace vaults={loaded.value.vaults} />
}
