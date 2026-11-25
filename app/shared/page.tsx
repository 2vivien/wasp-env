import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SharedVaultWorkspace } from '@/components/vault/shared-vault-workspace'

export const dynamic = 'force-dynamic'

export default async function SharedVaultPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fshared')
  return <SharedVaultWorkspace />
}
