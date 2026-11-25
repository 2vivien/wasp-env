'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Text, TextInput } from '@primer/react'
import { decryptVaultItemMetadata, decryptVaultItemValue, encryptVaultItemPayload } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'
import type { VaultItemKind } from '@/src/crypto/vault-items'
import { VaultItemEditor } from './vault-item-editor'

type Item = { id: string; encryptedPayload: EncryptedVaultItem }
type ItemName = { id: string; name: string; kind: VaultItemKind; item: Item }
type EditingItem = ItemName & { value: string }

export function VaultItemList({
  vaultId,
  items,
  onDelete,
  onUpdated,
  canWrite = true,
}: {
  vaultId: string
  items: Item[]
  onDelete: (id: string) => Promise<void>
  onUpdated: () => Promise<void>
  canWrite?: boolean
}) {
  const [nameResult, setNameResult] = useState<{ signature: string; items: ItemName[] } | null>(null)
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [hasError, setHasError] = useState(false)
  const [query, setQuery] = useState('')
  const [historyItemId, setHistoryItemId] = useState<string | null>(null)
  const timers = useRef(new Map<string, number>())
  const signature = items.map((item) => `${item.id}:${item.encryptedPayload.version}`).join('|')
  const names = nameResult?.signature === signature ? nameResult.items : []

  useEffect(() => {
    let active = true
    const timerMap = timers.current
    void Promise.all(items.map(async (item) => ({
      id: item.id,
      ...await decryptVaultItemMetadata(vaultId, item.id, item.encryptedPayload),
      item,
    })))
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

  async function handleRestore(entry: ItemName, revision: NonNullable<EncryptedVaultItem['history']>[number]) {
    if (!window.confirm(`Restaurer la version ${revision.version} de « ${entry.name} » ? La version actuelle sera conservée dans l’historique.`)) return
    try {
      const previous = { version: revision.version, metadata: revision.metadata, value: revision.value }
      const [metadata, value] = await Promise.all([
        decryptVaultItemMetadata(vaultId, entry.id, previous),
        decryptVaultItemValue(vaultId, entry.id, previous, entry.kind),
      ])
      const nextVersion = entry.item.encryptedPayload.version + 1
      const payload = await encryptVaultItemPayload(vaultId, entry.id, nextVersion, metadata.name, value, metadata.kind)
      const response = await fetch(`/api/vault-items/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          expectedVersion: entry.item.encryptedPayload.version,
          nextVersion,
          metadata: payload.metadata,
          value: payload.value,
        }),
      })
      if (!response.ok) throw new Error('Unable to restore revision.')
      await onUpdated()
      setHistoryItemId(null)
    } catch {
      setHasError(true)
    }
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

  async function handleExport(item: ItemName) {
    if (!window.confirm('Le fichier téléchargé contiendra vos valeurs en clair. Continuer ?')) return
    try {
      const source = await decryptVaultItemValue(vaultId, item.id, item.item.encryptedPayload, 'env-file')
      const filename = /^\.env(?:\.[A-Za-z0-9._-]+)?$/.test(item.name) ? item.name : '.env.local'
      const file = new Blob([source], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setHasError(true)
    }
  }

  const filteredNames = names.filter(({ name }) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  if (items.length === 0) return <Text className="wasp-empty-note">Aucun secret pour le moment. Les noms et les valeurs ne quittent jamais votre navigateur en clair.</Text>

  return (
    <div className="wasp-secret-list" aria-live="polite">
      <label className="wasp-field">
        <span>Rechercher dans les noms des secrets</span>
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du secret…" aria-label="Rechercher dans les noms des secrets" autoComplete="off" />
      </label>
      {hasError && <Text role="alert" className="wasp-auth-error">Un élément ne peut pas être déchiffré ou restauré. Vérifiez que le coffre est déverrouillé et réessayez.</Text>}
      {notice && <Text role="status" className="wasp-copy-notice">{notice}</Text>}
      {filteredNames.length === 0 && <Text className="wasp-empty-note">Aucun secret ne correspond à cette recherche.</Text>}
      {filteredNames.map(({ id, name, kind, item }) => (
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
                <Text size="small">{kind === 'env-file' ? 'Fichier chiffré' : `Version ${item.encryptedPayload.version}`}</Text>
                {kind === 'secret' && <code>{revealed[id] ?? '••••••••'}</code>}
              </div>
              <div className="wasp-secret-actions">
                {kind === 'env-file' ? (
                  <Button variant="invisible" onClick={() => void handleExport({ id, name, kind, item })} aria-label={`Exporter ${name}`}>
                    Exporter .env
                  </Button>
                ) : (
                  <>
                    {canWrite && <Button variant="invisible" onClick={() => void handleEdit({ id, name, kind, item })} aria-label={`Modifier ${name}`}>Modifier</Button>}
                    <Button variant="invisible" onClick={() => void handleReveal(item)} aria-label={`Révéler ${name}`}>
                      {revealed[id] === undefined ? 'Révéler 10 s' : 'Masquer'}
                    </Button>
                    <Button variant="invisible" onClick={() => void handleCopy(item)} aria-label={`Copier ${name}`}>Copier</Button>
                  </>
                )}
                {canWrite && <Button variant="invisible" onClick={() => void handleDelete(id, name)} aria-label={`Supprimer ${name}`}>Supprimer</Button>}
              </div>
              {canWrite && (item.encryptedPayload.history?.length ?? 0) > 0 && (
                <div className="wasp-version-history">
                  <Button
                    variant="invisible"
                    aria-expanded={historyItemId === id}
                    onClick={() => setHistoryItemId(historyItemId === id ? null : id)}
                  >
                    Versions précédentes ({item.encryptedPayload.history?.length})
                  </Button>
                  {historyItemId === id && (
                    <ul aria-label={`Versions précédentes de ${name}`}>
                      {[...(item.encryptedPayload.history ?? [])].reverse().map((revision) => (
                        <li key={`${id}-${revision.version}`}>
                          <Text size="small">Version {revision.version} · {new Date(revision.createdAt).toLocaleString('fr-FR')}</Text>
                          <Button variant="default" onClick={() => void handleRestore({ id, name, kind, item }, revision)}>
                            Restaurer
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  )
}
