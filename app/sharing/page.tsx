import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { ScopedSharesWorkspace } from '@/components/vault/scoped-shares-workspace'
import { PrivateLinksManager } from '@/components/security/private-links-manager'

export const dynamic = 'force-dynamic'

export default async function SharingPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fsharing')
  return (
    <section className="wasp-dashboard-content">
      <ScopedSharesWorkspace />
      <PrivateLinksManager />
    </section>
  )
}
