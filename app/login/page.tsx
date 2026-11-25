import { Button, Heading, Link, Text } from '@primer/react'

export default function LoginPage() {
  return (
    <main className="wasp-login-wrap">
      <section className="wasp-login-card" aria-labelledby="login-title">
        <Link href="/" className="wasp-wordmark">
          Wasp
        </Link>
        <Heading as="h1" id="login-title">
          Connexion
        </Heading>
        <Text>
          Google confirme votre identité. Il ne déverrouille jamais vos secrets.
        </Text>
        <Button variant="primary" disabled aria-describedby="google-status">
          Continuer avec Google
        </Button>
        <Text id="google-status" role="status" size="small">
          La connexion Google sera activée après l’ajout des identifiants OAuth.
        </Text>
        <Link href="/" className="wasp-login-back">
          Retour à l’accueil
        </Link>
      </section>
    </main>
  )
}
