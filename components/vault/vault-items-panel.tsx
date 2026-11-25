'use client'

import useSWR from 'swr'
import { Button, Heading, Text } from '@primer/react'
import { useIdleVaultLock } from './use-idle-vault-lock'
import { VaultItemForm } from './vault-item-form'
import { VaultItemList } from './vault-item-list'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type Item = { id: string; encryptedPayload: EncryptedVaultItem; createdAt: string }
type ItemResponse = { items: Item[] }

async function fetchItems(url: string): Promise<ItemResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Unable to load encrypted items.')
  return response.json() as Promise<ItemResponse>
}

export function VaultItemsPanel({ vaultId, onLock }: { vaultId: string; onLock: () => void }) {
  const key = `/api/vault-items?vaultId=${encodeURIComponent(vaultId)}`
  const { data, error, isLoading, mutate } = useSWR<ItemResponse>(key, fetchItems, { revalidateOnFocus: false })
  const lockVault = useIdleVaultLock(onLock)

  async function deleteItem(id: string) {
    const response = await fetch(`/api/vault-items/${id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Unable to delete encrypted item.')
    await mutate()
  }

  async function refreshItems() {
    await mutate()
  }

  return (
    <section className="wasp-vault-card wasp-vault-open" aria-labelledby="vault-items-title">
      <div className="wasp-vault-panel-heading">
        <div>
          <Text className="wasp-eyebrow">CHIFFRÉ SUR CET APPAREIL</Text>
          <Heading as="h2" id="vault-items-title">Secrets privés</Heading>
        </div>
        <Button variant="default" onClick={lockVault}>Verrouiller</Button>
      </div>
      <Text size="small">Seuls les blocs chiffrés sont envoyés au serveur. Les clés restent en mémoire dans cet onglet.</Text>
      <VaultItemForm vaultId={vaultId} onSaved={() => void mutate()} />
      {isLoading && <Text role="status">Chargement des éléments chiffrés…</Text>}
      {error && <Text role="alert" className="wasp-auth-error">Impossible de charger le coffre. Réessayez.</Text>}
      {data && <VaultItemList vaultId={vaultId} items={data.items} onDelete={deleteItem} onUpdated={refreshItems} />}
    </section>
  )
}
