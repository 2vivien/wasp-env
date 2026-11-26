import { Button, Heading, Text } from '@primer/react'

export default function NotFound() {
  return (
    <main className="wasp-state-wrap">
      <section className="wasp-state-card" aria-labelledby="not-found-title">
        <Text className="wasp-eyebrow">404</Text>
        <Heading as="h1" id="not-found-title">Page introuvable.</Heading>
        <Text>Cette page n’existe pas ou n’est pas accessible.</Text>
        <Button as="a" href="/dashboard" variant="primary">Retour à la vue générale</Button>
      </section>
    </main>
  )
}
