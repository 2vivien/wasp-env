'use client'

import { useState } from 'react'
import { Button, Text, TextInput } from '@primer/react'
import { encryptVaultItemPayload } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type EditableItem = { id: string; encryptedPayload: EncryptedVaultItem }

export function VaultItemEditor({
  vaultId,
  item,
  initialName,
  initialValue,
  onCancel,
  onSaved,
}: {
  vaultId: string
  item: EditableItem
  initialName: string
  initialValue: string
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [value, setValue] = useState(initialValue)
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
      const encryptedPayload = await encryptVaultItemPayload(vaultId, item.id, nextVersion, name, value, 'secret', item.encryptedPayload.scopeKeyVersion ?? 1, item.encryptedPayload.scopeKeyEnvelope, !item.encryptedPayload.scopeKeyEnvelope)
      const response = await fetch(`/api/vault-items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          expectedVersion,
          nextVersion,
          metadata: encryptedPayload.metadata,
          value: encryptedPayload.value,
        }),
      })
      if (response.status === 409) throw new Error('Conflict.')
      if (!response.ok) throw new Error('Update failed.')
      await onSaved()
    } catch {
      setHasError(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="wasp-edit-secret-form" onSubmit={handleSubmit}>
      <label className="wasp-field">
        <span>Nom du secret</span>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required autoComplete="off" />
      </label>
      <label className="wasp-field">
        <span>Valeur</span>
        <TextInput type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" maxLength={65_536} />
      </label>
      {hasError && <Text role="alert" className="wasp-auth-error">Modification impossible. Le secret peut avoir changé ailleurs ; rechargez puis réessayez.</Text>}
      <div className="wasp-inline-action">
        <Button type="submit" variant="primary" disabled={isSaving || !name.trim()}>
          {isSaving ? 'Chiffrement…' : 'Enregistrer une nouvelle version'}
        </Button>
        <Button type="button" variant="default" onClick={onCancel} disabled={isSaving}>Annuler</Button>
      </div>
    </form>
  )
}
