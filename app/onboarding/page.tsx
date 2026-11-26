import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles, vaults } from '@/lib/db/schema'
import { HandleOnboardingForm } from '@/components/identity/handle-onboarding-form'
import { OnboardingStepper } from '@/components/identity/onboarding-stepper'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fonboarding')

  const [profile] = await db.select({ handle: profiles.handle }).from(profiles)
    .where(eq(profiles.userId, session.user.id)).limit(1)
  if (!profile?.handle) {
    return <HandleOnboardingForm next="/onboarding" />
  }

  const [vault] = await db.select({ id: vaults.id }).from(vaults)
    .where(eq(vaults.userId, session.user.id)).limit(1)
  if (vault) redirect('/dashboard')

  return <OnboardingStepper />
}
