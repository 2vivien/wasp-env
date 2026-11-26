'use client'

import { Button, Heading, Text } from '@primer/react'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" data-color-mode="dark" data-dark-theme="dark">
      <body className="wasp-state-wrap">
        <section className="wasp-state-card" aria-labelledby="global-error-title">
          <Heading as="h1" id="global-error-title">Une erreur est survenue.</Heading>
          <Text>Réessayez pour recharger l’application.</Text>
          <Button variant="primary" onClick={reset}>Réessayer</Button>
        </section>
      </body>
    </html>
  )
}
