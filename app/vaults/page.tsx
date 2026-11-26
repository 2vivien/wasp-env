import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { VaultsWorkspace } from '@/components/vault/vaults-workspace'

export const dynamic = 'force-dynamic'

export default async function VaultsPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fvaults')
  return <VaultsWorkspace />
}
