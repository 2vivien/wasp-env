'use client'

import { Button, Heading, Text } from '@primer/react'

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wasp-state-wrap">
      <section className="wasp-state-card" aria-labelledby="error-title">
        <Text className="wasp-eyebrow">INCIDENT</Text>
        <Heading as="h1" id="error-title">Une erreur est survenue.</Heading>
        <Text>Réessayez. Si l’erreur persiste, rechargez l’application.</Text>
        <div className="wasp-inline-action">
          <Button variant="primary" onClick={reset}>Réessayer</Button>
          <Button as="a" href="/" variant="default">Accueil</Button>
        </div>
      </section>
    </main>
  )
}
