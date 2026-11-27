import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { HandleOnboardingForm } from '@/components/identity/handle-onboarding-form'
import { OnboardingStepper } from '@/components/identity/onboarding-stepper'
import { serverData } from '@/lib/server/guard'
import { ServerErrorNotice } from '@/components/layout/server-error-notice'

export default async function OnboardingPage() {
  const loaded = await serverData(async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    const [profile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, session.user.id))
      .limit(1)
    const [vault] = await db
      .select({ id: vaults.id })
      .from(vaults)
      .where(eq(vaults.userId, session.user.id))
      .limit(1)
    return { hasHandle: Boolean(profile?.handle), hasVault: Boolean(vault) }
  })
  if (!loaded.ok) return <ServerErrorNotice retryHref="/login" />
  if (!loaded.value) redirect('/login?callbackURL=%2Fonboarding')
  if (!loaded.value.hasHandle) return <HandleOnboardingForm next="/onboarding" />
  if (loaded.value.hasVault) redirect('/dashboard')

  return <OnboardingStepper />
}
