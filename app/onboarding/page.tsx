import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { HandleOnboardingForm } from '@/components/identity/handle-onboarding-form'

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackURL=%2Fonboarding')

  const [profile] = await db.select({ handle: profiles.handle }).from(profiles)
    .where(eq(profiles.userId, session.user.id)).limit(1)
  if (profile?.handle) redirect('/dashboard')

  return <HandleOnboardingForm />
}
