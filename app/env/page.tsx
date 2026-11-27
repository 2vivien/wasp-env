import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Heading, Text } from '@primer/react'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { environments } from '@/lib/db/schema'
import { EnvDiff } from '@/components/projects/env-diff'
import { serverData } from '@/lib/server/guard'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'

export const dynamic = 'force-dynamic'

export default async function EnvPage() {
  const loaded = await serverData(async () => {
    const session = await getCurrentSession()
    if (!session?.user) return null
    const rows = await db
      .select({ id: environments.id, kind: environments.kind, updatedAt: environments.updatedAt })
      .from(environments)
      .where(and(eq(environments.userId, session.user.id), isNull(environments.deletedAt)))
    return { rows }
  })
  if (!loaded.ok) return <ServerErrorNotice />
  if (!loaded.value) redirect('/login?callbackURL=%2Fenv')
  const { rows } = loaded.value

  return (
    <section>
      <Heading as="h1">Variables ENV</Heading>
      <Text>Ouvrez un environnement pour éditer son fichier chiffré.</Text>
      <EnvDiff />
      {rows.length === 0 && <Text>Aucun environnement.</Text>}
      <ul className="wasp-environment-list">
        {rows.map((environment) => (
          <li key={environment.id}>
            <span>
              {environment.kind} · {new Date(environment.updatedAt).toLocaleDateString('fr-FR')}
            </span>
            <Link href={`/environments/${environment.id}`}>Ouvrir</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
