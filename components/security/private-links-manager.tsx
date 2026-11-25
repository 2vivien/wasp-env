'use client'

import useSWR from 'swr'
import { Button, Heading, Text } from '@primer/react'

type PrivateLink = { id: string; resourceType: string; resourceId: string; maxUses: number | null; useCount: number; expiresAt: string | null; revokedAt: string | null; createdAt: string }

async function fetchLinks(url: string): Promise<{ links: PrivateLink[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les liens privés.')
  return response.json() as Promise<{ links: PrivateLink[] }>
}

export function PrivateLinksManager() {
  const { data, error, isLoading, mutate } = useSWR('/api/private-links', fetchLinks, { revalidateOnFocus: false })
  async function revoke(id: string) {
    if (!window.confirm('Révoquer ce lien ? Les copies déjà consultées ne peuvent pas être récupérées.')) return
    const response = await fetch(`/api/private-links/${id}`, { method: 'DELETE' })
    if (response.ok) await mutate()
  }
  return <section className="wasp-vault-card" aria-labelledby="private-links-title">
    <Heading as="h2" id="private-links-title">Liens privés</Heading>
    <Text>Les clés ne sont pas conservées par Wasp. Les liens ne peuvent donc pas être affichés à nouveau ici, mais ils restent révocables.</Text>
    {isLoading && <Text role="status">Chargement des liens…</Text>}{error && <Text role="alert">Impossible de charger les liens privés.</Text>}
    {data?.links.map((link) => <div className="wasp-security-row" key={link.id}>
      <div><Text>Secret · {link.resourceId.slice(0, 8)}</Text><Text size="small">{link.revokedAt ? 'Révoqué' : 'Actif'} · {link.useCount}/{link.maxUses ?? '∞'} ouvertures · {link.expiresAt ? `expire ${new Date(link.expiresAt).toLocaleString('fr-FR')}` : 'sans expiration'}</Text></div>
      {!link.revokedAt && <Button variant="danger" onClick={() => void revoke(link.id)}>Révoquer</Button>}
    </div>)}
    {!isLoading && data?.links.length === 0 && <Text>Aucun lien privé créé.</Text>}
  </section>
}
