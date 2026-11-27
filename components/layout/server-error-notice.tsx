import Link from 'next/link'
import { Heading, Text } from '@primer/react'

/** État d'erreur serveur sans détail technique (aucun secret, SQL ou stack visible). */
export function ServerErrorNotice({ retryHref = '/dashboard' }: { retryHref?: string }) {
  return (
    <section className="wasp-vault-card" aria-labelledby="server-error-title">
      <Heading as="h2" id="server-error-title">
        Données indisponibles
      </Heading>
      <Text>Les données n’ont pas pu être chargées. Réessayez dans un instant.</Text>
      <Link href={retryHref}>Réessayer</Link>
    </section>
  )
}
