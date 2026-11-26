import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { InvitationsWorkspace } from '@/components/sharing/invitations-workspace'

export const dynamic = 'force-dynamic'

export default async function InvitationsPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Finvitations')
  return <InvitationsWorkspace />
}
