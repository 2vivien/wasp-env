import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { ProjectsWorkspace } from '@/components/projects/projects-workspace'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fprojects')
  const [profile] = await db.select({ handle: profiles.handle }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
  if (!profile?.handle) redirect('/onboarding')
  const ownedVaults = await db.select({ id: vaults.id }).from(vaults).where(eq(vaults.userId, session.user.id)).limit(20)
  return <ProjectsWorkspace vaults={ownedVaults} />
}
