'use client'

import { useState } from 'react'
import { Button, Text, TextInput, Textarea } from '@primer/react'
import {
  encryptVaultItemPayload,
  type SecretCategory,
  type SecretCustomField,
} from '@/src/crypto/vault-items'
import { CATEGORY_FIELDS, SECRET_CATEGORIES } from '@/lib/secret-categories'

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_!@#$%^&*'

function generatePassword(length = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map((byte) => CHARSET[byte % CHARSET.length] ?? '').join('')
}

function parseCustomFields(source: string): SecretCustomField[] {
  return source
    .split('\n')
    .flatMap((line) => {
      const index = line.indexOf('=')
      if (index < 1) return []
      return [
        {
          key: line.slice(0, index).trim(),
          value: line.slice(index + 1),
          secret: line.startsWith('!'),
        },
      ]
    })
    .map((field) => ({ ...field, key: field.key.replace(/^!/, '') }))
}

export function VaultItemForm({ vaultId, onSaved }: { vaultId: string; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [category, setCategory] = useState<SecretCategory>('custom')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [customFields, setCustomFields] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [favorite, setFavorite] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || !name.trim()) return
    setIsSaving(true)
    setError(false)
    const itemId = crypto.randomUUID()
    try {
      const encryptedPayload = await encryptVaultItemPayload(
        vaultId,
        itemId,
        1,
        name,
        value,
        'secret',
        1,
        undefined,
        false,
        {
          category,
          fields,
          description,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          notes,
          customFields: parseCustomFields(customFields),
          favorite,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
      )
      const response = await fetch('/api/vault-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, vaultId, encryptedPayload }),
      })
      if (!response.ok) throw new Error('Save failed.')
      setName('')
      setValue('')
      setDescription('')
      setTags('')
      setNotes('')
      setCustomFields('')
      setFields({})
      setFavorite(false)
      setExpiresAt('')
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
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={128}
          required
          autoComplete="off"
        />
      </label>
      <label className="wasp-field">
        <span>Valeur</span>
        <TextInput
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          maxLength={65536}
        />
      </label>
      <label className="wasp-field">
        <span>Catégorie</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as SecretCategory)}
        >
          {SECRET_CATEGORIES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {CATEGORY_FIELDS[category].map((field) => (
        <label className="wasp-field" key={field.key}>
          <span>{field.label}</span>
          {field.type === 'textarea' ? (
            <Textarea
              value={fields[field.key] ?? ''}
              onChange={(event) =>
                setFields((current) => ({ ...current, [field.key]: event.target.value }))
              }
              rows={3}
            />
          ) : (
            <TextInput
              type={
                field.type === 'password'
                  ? 'password'
                  : field.type === 'date'
                    ? 'date'
                    : field.type === 'url'
                      ? 'url'
                      : 'text'
              }
              value={fields[field.key] ?? ''}
              onChange={(event) =>
                setFields((current) => ({ ...current, [field.key]: event.target.value }))
              }
              autoComplete="off"
            />
          )}
        </label>
      ))}
      <label className="wasp-field">
        <span>Description</span>
        <TextInput
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={200}
        />
      </label>
      <label className="wasp-field">
        <span>Tags (séparés par des virgules)</span>
        <TextInput value={tags} onChange={(event) => setTags(event.target.value)} maxLength={512} />
      </label>
      <label className="wasp-field">
        <span>Notes</span>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={16384}
        />
      </label>
      <label className="wasp-field">
        <span>Champs personnalisés (clé=valeur, !clé=valeur pour secret)</span>
        <Textarea
          value={customFields}
          onChange={(event) => setCustomFields(event.target.value)}
          rows={3}
        />
      </label>
      <label className="wasp-field">
        <span>Expiration</span>
        <TextInput
          type="date"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
        />
      </label>
      <label className="wasp-field">
        <span>Favori</span>
        <input
          type="checkbox"
          checked={favorite}
          onChange={(event) => setFavorite(event.target.checked)}
        />
      </label>
      <Button type="button" variant="default" onClick={() => setValue(generatePassword())}>
        Générer un mot de passe
      </Button>
      {error && (
        <Text role="alert" className="wasp-auth-error">
          Enregistrement impossible. Vérifiez votre connexion et réessayez.
        </Text>
      )}
      <Button type="submit" variant="primary" disabled={isSaving || !name.trim()}>
        {isSaving ? 'Chiffrement…' : 'Ajouter le secret'}
      </Button>
    </form>
  )
}
