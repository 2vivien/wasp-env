import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { Heading, Text } from '@primer/react'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { environments } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function EnvPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fenv')
  const rows = await db.select({ id: environments.id, kind: environments.kind, updatedAt: environments.updatedAt })
    .from(environments)
    .where(and(eq(environments.userId, session.user.id), isNull(environments.deletedAt)))

  return (
    <section>
      <Heading as="h1">Variables ENV</Heading>
      <Text>Ouvrez un environnement pour éditer son fichier chiffré.</Text>
      {rows.length === 0 && <Text>Aucun environnement.</Text>}
      <ul className="wasp-environment-list">
        {rows.map((environment) => (
          <li key={environment.id}>
            <span>{environment.kind} · {new Date(environment.updatedAt).toLocaleDateString('fr-FR')}</span>
            <Link href={`/environments/${environment.id}`}>Ouvrir</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
