'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Text } from '@primer/react'
import { decryptVaultItemName, decryptVaultItemValue } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'
import { VaultItemEditor } from './vault-item-editor'

type Item = { id: string; encryptedPayload: EncryptedVaultItem }
type ItemName = { id: string; name: string; item: Item }
type EditingItem = ItemName & { value: string }

export function VaultItemList({
  vaultId,
  items,
  onDelete,
  onUpdated,
}: {
  vaultId: string
  items: Item[]
  onDelete: (id: string) => Promise<void>
  onUpdated: () => Promise<void>
}) {
  const [nameResult, setNameResult] = useState<{ signature: string; items: ItemName[] } | null>(null)
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [hasError, setHasError] = useState(false)
  const timers = useRef(new Map<string, number>())
  const signature = items.map((item) => `${item.id}:${item.encryptedPayload.version}`).join('|')
  const names = nameResult?.signature === signature ? nameResult.items : []

  useEffect(() => {
    let active = true
    const timerMap = timers.current
    void Promise.all(items.map(async (item) => ({ id: item.id, name: await decryptVaultItemName(vaultId, item.id, item.encryptedPayload), item })))
      .then((decrypted) => { if (active) setNameResult({ signature, items: decrypted }) })
      .catch(() => { if (active) setHasError(true) })

    return () => {
      active = false
      for (const timer of timerMap.values()) window.clearTimeout(timer)
      timerMap.clear()
    }
  }, [items, signature, vaultId])

  async function handleReveal(item: Item) {
    if (revealed[item.id] !== undefined) {
      const timer = timers.current.get(item.id)
      if (timer) window.clearTimeout(timer)
      timers.current.delete(item.id)
      setRevealed((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      return
    }

    try {
      const value = await decryptVaultItemValue(vaultId, item.id, item.encryptedPayload)
      setRevealed((current) => ({ ...current, [item.id]: value }))
      const previous = timers.current.get(item.id)
      if (previous) window.clearTimeout(previous)
      timers.current.set(item.id, window.setTimeout(() => {
        setRevealed((current) => {
          const next = { ...current }
          delete next[item.id]
          return next
        })
      }, 10_000))
    } catch {
      setHasError(true)
    }
  }

  async function handleEdit(entry: ItemName) {
    try {
      const value = await decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload)
      setEditing({ ...entry, value })
    } catch {
      setHasError(true)
    }
  }

  async function handleUpdated() {
    await onUpdated()
    setEditing(null)
  }

  async function handleDelete(itemId: string, name: string) {
    if (!window.confirm(`Supprimer « ${name} » définitivement ?`)) return
    try {
      await onDelete(itemId)
    } catch {
      setHasError(true)
    }
  }

  async function handleCopy(item: Item) {
    try {
      const value = await decryptVaultItemValue(vaultId, item.id, item.encryptedPayload)
      await navigator.clipboard.writeText(value)
      setNotice('Copié. Le presse-papiers sera effacé dans 30 secondes si le navigateur l’autorise.')
      window.setTimeout(() => setNotice(''), 4000)
      window.setTimeout(async () => {
        try {
          if (await navigator.clipboard.readText() === value) await navigator.clipboard.writeText('')
        } catch {
          setNotice('')
        }
      }, 30_000)
    } catch {
      setHasError(true)
    }
  }

  if (items.length === 0) return <Text className="wasp-empty-note">Aucun secret pour le moment. Les noms et les valeurs ne quittent jamais votre navigateur en clair.</Text>

  return (
    <div className="wasp-secret-list" aria-live="polite">
      {hasError && <Text role="alert" className="wasp-auth-error">Un élément ne peut pas être déchiffré. Vérifiez que le coffre est déverrouillé.</Text>}
      {notice && <Text role="status" className="wasp-copy-notice">{notice}</Text>}
      {names.map(({ id, name, item }) => (
        <article className="wasp-secret-row" key={id}>
          {editing?.id === id ? (
            <VaultItemEditor
              vaultId={vaultId}
              item={item}
              initialName={editing.name}
              initialValue={editing.value}
              onCancel={() => setEditing(null)}
              onSaved={handleUpdated}
            />
          ) : (
            <>
              <div className="wasp-secret-row-copy">
                <strong>{name}</strong>
                <Text size="small">Version {item.encryptedPayload.version}</Text>
                <code>{revealed[id] ?? '••••••••'}</code>
              </div>
              <div className="wasp-secret-actions">
                <Button variant="invisible" onClick={() => void handleEdit({ id, name, item })} aria-label={`Modifier ${name}`}>Modifier</Button>
                <Button variant="invisible" onClick={() => void handleReveal(item)} aria-label={`Révéler ${name}`}>
                  {revealed[id] === undefined ? 'Révéler 10 s' : 'Masquer'}
                </Button>
                <Button variant="invisible" onClick={() => void handleCopy(item)} aria-label={`Copier ${name}`}>Copier</Button>
                <Button variant="invisible" onClick={() => void handleDelete(id, name)} aria-label={`Supprimer ${name}`}>Supprimer</Button>
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  )
}
