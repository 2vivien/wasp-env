'use client'

import { useState } from 'react'
import { Button, Text, TextInput, Textarea } from '@primer/react'
import { encryptVaultItemPayload, type SecretCategory, type VaultItemMetadata } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type EditableItem = { id: string; encryptedPayload: EncryptedVaultItem }

export function VaultItemEditor({
  vaultId,
  item,
  initialName,
  initialValue,
  initialMeta,
  onCancel,
  onSaved,
}: {
  vaultId: string
  item: EditableItem
  initialName: string
  initialValue: string
  initialMeta?: VaultItemMetadata
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [value, setValue] = useState(initialValue)
  const [category, setCategory] = useState<SecretCategory>(initialMeta?.category ?? 'custom')
  const [description, setDescription] = useState(initialMeta?.description ?? '')
  const [tags, setTags] = useState(initialMeta?.tags.join(', ') ?? '')
  const [notes, setNotes] = useState(initialMeta?.notes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [hasError, setHasError] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !name.trim()) return
    setIsSaving(true)
    setHasError(false)
    const expectedVersion = item.encryptedPayload.version
    const nextVersion = expectedVersion + 1
    try {
      const encryptedPayload = await encryptVaultItemPayload(
        vaultId, item.id, nextVersion, name, value, initialMeta?.kind ?? 'secret',
        item.encryptedPayload.scopeKeyVersion ?? 1, item.encryptedPayload.scopeKeyEnvelope,
        !item.encryptedPayload.scopeKeyEnvelope,
        {
          ...initialMeta,
          category,
          description,
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          notes,
        },
      )
      const response = await fetch(`/api/vault-items/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId, expectedVersion, nextVersion,
          metadata: encryptedPayload.metadata, value: encryptedPayload.value,
        }),
      })
      if (!response.ok) throw new Error('Update failed.')
      await onSaved()
    } catch { setHasError(true) }
    finally { setIsSaving(false) }
  }

  return (
    <form className="wasp-edit-secret-form" onSubmit={handleSubmit}>
      <label className="wasp-field"><span>Nom du secret</span><TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required autoComplete="off" /></label>
      <label className="wasp-field"><span>Valeur</span><TextInput type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" maxLength={65536} /></label>
      <label className="wasp-field"><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value as SecretCategory)}>
        <option value="passwords">Mots de passe</option><option value="api-keys">Clés API</option><option value="tokens">Jetons</option>
        <option value="emails">E-mails</option><option value="databases">Bases de données</option><option value="ssh">SSH</option>
        <option value="certificates">Certificats</option><option value="infrastructure">Infrastructure</option>
        <option value="env">ENV</option><option value="custom">Personnalisé</option>
      </select></label>
      <label className="wasp-field"><span>Description</span><TextInput value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} /></label>
      <label className="wasp-field"><span>Tags</span><TextInput value={tags} onChange={(event) => setTags(event.target.value)} maxLength={512} /></label>
      <label className="wasp-field"><span>Notes</span><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={16384} /></label>
      {hasError && <Text role="alert" className="wasp-auth-error">Modification impossible. Le secret peut avoir changé ailleurs ; rechargez puis réessayez.</Text>}
      <div className="wasp-inline-action">
        <Button type="submit" variant="primary" disabled={isSaving || !name.trim()}>{isSaving ? 'Chiffrement…' : 'Enregistrer une nouvelle version'}</Button>
        <Button type="button" variant="default" onClick={onCancel} disabled={isSaving}>Annuler</Button>
      </div>
    </form>
  )
}
