import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { Heading, Text } from '@primer/react'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { vaults } from '@/lib/db/schema'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function VaultsPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fvaults')

  const rows = await db.select({ id: vaults.id, updatedAt: vaults.updatedAt })
    .from(vaults).where(eq(vaults.userId, session.user.id)).orderBy(desc(vaults.updatedAt))

  return (
    <section>
      <Heading as="h1">Coffres</Heading>
      <Text>Les noms de coffres sont chiffrés dans le navigateur.</Text>
      {rows.length === 0 && <Text>Aucun coffre. Créez-en un depuis la vue générale.</Text>}
      <ul className="wasp-environment-list">
        {rows.map((vault) => (
          <li key={vault.id}>
            <span>{vault.id.slice(0, 8)} · modifié le {new Date(vault.updatedAt).toLocaleDateString('fr-FR')}</span>
            <Link href="/dashboard">Ouvrir</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
