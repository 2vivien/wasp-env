import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { vaults } from '@/lib/db/schema'
import { VaultItemsPanel } from '@/components/vault/vault-items-panel'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'

export const dynamic = 'force-dynamic'

export default async function SecretsPage() {
  let session: Awaited<ReturnType<typeof getCurrentSession>>
  try {
    session = await getCurrentSession()
  } catch {
    return <ServerErrorNotice retryHref="/login" />
  }
  if (!session?.user) redirect('/login?callbackURL=%2Fsecrets')

  let vault: { id: string } | undefined
  try {
    ;[vault] = await db
      .select({ id: vaults.id })
      .from(vaults)
      .where(eq(vaults.userId, session.user.id))
      .limit(1)
  } catch {
    return <ServerErrorNotice />
  }

  if (!vault) return <p>Aucun coffre. Créez-en un depuis la vue générale.</p>
  return <VaultItemsPanel vaultId={vault.id} onLock={() => undefined} />
}
