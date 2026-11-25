import { auth } from '@/lib/auth'
import { safeCallbackPath } from '@/lib/auth/paths'
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import { Button, Heading, Link, Text } from '@primer/react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; callbackURL?: string | string[] }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams
  const callbackPath = safeCallbackPath(typeof query.callbackURL === 'string' ? query.callbackURL : undefined)
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect(callbackPath)

  const errorMessage = query.error === 'access_denied' || query.error === 'cancelled'
    ? 'Connexion annulée.'
    : query.error === 'email_not_verified'
      ? 'Ce compte Google n’est pas vérifié.'
      : query.error
        ? 'Connexion impossible. Réessayez.'
        : null

  return (
    <main className="wasp-login-wrap">
      <section className="wasp-login-card" aria-labelledby="login-title">
        <Link href="/" className="wasp-wordmark">Wasp</Link>
        <div className="wasp-login-copy">
          <Heading as="h1" id="login-title">Connexion</Heading>
          <Text>Google confirme votre identité. Il ne déverrouille jamais vos secrets.</Text>
          <Link href="/#security">En savoir plus sur le chiffrement</Link>
        </div>
        <GoogleSignInButton callbackURL={callbackPath} />
        {errorMessage && <Text role="alert" className="wasp-auth-error">{errorMessage}</Text>}
        <Text size="small" className="wasp-login-footnote">
          En vous connectant, vous gardez le contrôle de vos clés de chiffrement.
        </Text>
        <Button as="a" href="/" variant="invisible" className="wasp-login-back">
          Retour à l’accueil
        </Button>
      </section>
    </main>
  )
}
