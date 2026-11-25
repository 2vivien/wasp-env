'use client'

import { useState } from 'react'
import { Button, Text, TextInput } from '@primer/react'
import { encryptVaultItemPayload } from '@/src/crypto/vault-items'

export function VaultItemForm({ vaultId, onSaved }: { vaultId: string; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !name.trim()) return
    setIsSaving(true)
    setError(false)
    const itemId = crypto.randomUUID()
    const version = 1
    try {
      const encryptedPayload = await encryptVaultItemPayload(vaultId, itemId, version, name, value)
      const response = await fetch('/api/vault-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, vaultId, encryptedPayload }),
      })
      if (!response.ok) throw new Error('Save failed.')
      setName('')
      setValue('')
      onSaved()
    } catch {
      setError(true)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="wasp-secret-form" onSubmit={handleSubmit}>
      <label className="wasp-field">
        <span>Nom du secret</span>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required autoComplete="off" />
      </label>
      <label className="wasp-field">
        <span>Valeur</span>
        <TextInput type="password" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" maxLength={65_536} />
      </label>
      {error && <Text role="alert" className="wasp-auth-error">Enregistrement impossible. Vérifiez votre connexion et réessayez.</Text>}
      <Button type="submit" variant="primary" disabled={isSaving || !name.trim()}>
        {isSaving ? 'Chiffrement…' : 'Ajouter le secret'}
      </Button>
    </form>
  )
}
