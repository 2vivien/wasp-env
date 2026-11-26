import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { safeCallbackPath } from '@/lib/auth/paths'
import { UnlockWorkspace } from '@/components/vault/unlock-workspace'

export const dynamic = 'force-dynamic'

type UnlockPageProps = { searchParams: Promise<{ next?: string | string[] }> }

export default async function UnlockPage({ searchParams }: UnlockPageProps) {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Funlock')
  const query = await searchParams
  const next = safeCallbackPath(typeof query.next === 'string' ? query.next : undefined)
  return (
    <main className="wasp-login-wrap">
      <UnlockWorkspace next={next} />
    </main>
  )
}
