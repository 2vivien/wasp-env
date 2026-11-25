'use client'

import { useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { encryptBackup } from '@/src/crypto/backup'

export function SecurityBackup() {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  async function exportBackup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || passphrase.length < 12 || passphrase !== confirmation) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const response = await fetch('/api/me/backup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Backup request failed.')
      const snapshot = await response.json()
      const backup = await encryptBackup(snapshot, passphrase)
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `wasp-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setPassphrase('')
      setConfirmation('')
      setMessage('Sauvegarde chiffrée téléchargée. Conservez séparément le fichier et sa phrase de sauvegarde.')
    } catch {
      setFailed(true)
      setMessage('La sauvegarde n’a pas pu être créée. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="backup-title">
      <Text className="wasp-eyebrow">EXPORT HORS LIGNE</Text>
      <Heading as="h2" id="backup-title">Sauvegarde chiffrée</Heading>
      <Text>Le fichier contient les données chiffrées du compte. Elles sont ensuite chiffrées une seconde fois dans le navigateur avec une phrase dédiée (Argon2id + AES-256-GCM). La phrase n’est ni transmise ni récupérable. L’import/restauration d’une sauvegarde n’est pas encore disponible.</Text>
      <form className="wasp-edit-secret-form" onSubmit={exportBackup}>
        <label className="wasp-field">
          <span>Phrase de sauvegarde (12 caractères minimum)</span>
          <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={12} autoComplete="new-password" required />
        </label>
        <label className="wasp-field">
          <span>Confirmer la phrase de sauvegarde</span>
          <TextInput type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} autoComplete="new-password" required />
        </label>
        {message && <Text role={failed ? 'alert' : 'status'} className={failed ? 'wasp-auth-error' : 'wasp-copy-notice'}>{message}</Text>}
        <Button type="submit" variant="primary" disabled={busy || passphrase.length < 12 || passphrase !== confirmation}>
          {busy ? 'Chiffrement en cours…' : 'Créer la sauvegarde chiffrée'}
        </Button>
      </form>
    </section>
  )
}
