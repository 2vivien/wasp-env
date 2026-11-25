import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { GroupManager } from '@/components/groups/group-manager'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fgroups')
  return <GroupManager />
}
