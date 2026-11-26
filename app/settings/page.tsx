import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { SettingsWorkspace } from '@/components/settings/settings-workspace'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fsettings')
  return <SettingsWorkspace />
}
