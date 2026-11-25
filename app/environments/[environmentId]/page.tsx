import { and, eq, isNull } from 'drizzle-orm'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { environments, profiles } from '@/lib/db/schema'
import { EnvFileEditor } from '@/components/projects/env-file-editor'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ environmentId: string }> }

export default async function EnvironmentPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fprojects')
  const [profile] = await db.select({ handle: profiles.handle }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
  if (!profile?.handle) redirect('/onboarding')
  const { environmentId } = await params
  const [environment] = await db.select({ id: environments.id, vaultId: environments.vaultId }).from(environments)
    .where(and(eq(environments.id, environmentId), eq(environments.userId, session.user.id), isNull(environments.deletedAt))).limit(1)
  if (!environment) notFound()
  return <EnvFileEditor environmentId={environment.id} vaultId={environment.vaultId} name="Environnement chiffré" />
}
