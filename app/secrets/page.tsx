import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { vaults } from '@/lib/db/schema'
import { VaultItemsPanel } from '@/components/vault/vault-items-panel'

export const dynamic = 'force-dynamic'

export default async function SecretsPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fsecrets')
  const [vault] = await db.select({ id: vaults.id }).from(vaults)
    .where(eq(vaults.userId, session.user.id)).limit(1)

  if (!vault) return <p>Aucun coffre. Créez-en un depuis la vue générale.</p>
  return <VaultItemsPanel vaultId={vault.id} onLock={() => undefined} />
}
