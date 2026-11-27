'use client'

import { useState } from 'react'
import { Button, Heading, Text } from '@primer/react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [copied, setCopied] = useState(false)

  return (
    <main className="wasp-state-wrap">
      <section className="wasp-state-card" aria-labelledby="error-title">
        <Text className="wasp-eyebrow">INCIDENT</Text>
        <Heading as="h1" id="error-title">
          Une erreur est survenue.
        </Heading>
        <Text>Réessayez. Si l’erreur persiste, transmettez l’identifiant ci-dessous.</Text>
        {error.digest && (
          <div className="wasp-inline-action">
            <code aria-label="Identifiant de l’incident">{error.digest}</code>
            <Button
              variant="invisible"
              onClick={() => {
                void navigator.clipboard.writeText(error.digest ?? '').then(() => setCopied(true))
              }}
            >
              Copier l’identifiant
            </Button>
          </div>
        )}
        {copied && (
          <Text role="status" size="small">
            Identifiant copié.
          </Text>
        )}
        <div className="wasp-inline-action">
          <Button variant="primary" onClick={reset}>
            Réessayer
          </Button>
          <Button as="a" href="/" variant="default">
            Accueil
          </Button>
        </div>
      </section>
    </main>
  )
}
