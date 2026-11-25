'use client'

import { useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decryptBackup, encryptBackup } from '@/src/crypto/backup'
import { backupSnapshotSchema } from '@/src/crypto/backup-snapshot'

export function SecurityBackup() {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [restorePassphrase, setRestorePassphrase] = useState('')
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoreSnapshot, setRestoreSnapshot] = useState<unknown>(null)
  const [restoreSummary, setRestoreSummary] = useState('')

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

  async function inspectRestoreFile(file: File | null) {
    setRestoreFile(file)
    setRestoreSnapshot(null)
    setRestoreSummary('')
    if (!file) return
    if (file.size > 24 * 1024 * 1024) {
      setFailed(true)
      setRestoreSummary('Le fichier dépasse la taille maximale de 24 Mio.')
      return
    }
    setBusy(true); setFailed(false)
    try {
      const parsedFile: unknown = JSON.parse(await file.text())
      const decrypted = await decryptBackup(parsedFile, restorePassphrase)
      const validated = backupSnapshotSchema.safeParse(decrypted)
      if (!validated.success) throw new Error('Le contenu de cette sauvegarde est incomplet ou invalide.')
      setRestoreSnapshot(validated.data)
      setRestoreSummary(`${validated.data.vaults.length} coffre(s), ${validated.data.vaultItems.length} secret(s), ${validated.data.projects.length} projet(s), ${validated.data.groups.length} groupe(s) et ${validated.data.privateLinks.length} lien(s) privé(s) prêts à fusionner.`)
    } catch (cause) {
      setFailed(true)
      setRestoreSummary(cause instanceof Error && cause.message.includes('incomplet') ? cause.message : 'Impossible de déchiffrer ce fichier. Vérifiez la phrase de sauvegarde et le format du fichier.')
    } finally { setBusy(false) }
  }

  async function restoreBackup() {
    if (!restoreSnapshot || busy) return
    if (!window.confirm('Restaurer cette sauvegarde en ajoutant uniquement les identifiants absents ? Les données existantes ne seront pas remplacées.')) return
    setBusy(true); setFailed(false)
    try {
      const response = await fetch('/api/me/backup/restore', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(restoreSnapshot), cache: 'no-store',
      })
      const result = await response.json() as { restored?: Record<string, number>; error?: { code?: string } }
      if (!response.ok) throw new Error(result.error?.code === 'BACKUP_ACCOUNT_MISMATCH' ? 'Cette sauvegarde appartient à un autre compte.' : 'La restauration a été refusée. Vérifiez que vous utilisez le compte d’origine.')
      const total = Object.values(result.restored ?? {}).reduce((sum, count) => sum + count, 0)
      setRestoreSnapshot(null); setRestoreFile(null); setRestorePassphrase('')
      setRestoreSummary(`${total} élément(s) ajouté(s). Les éléments déjà présents ont été conservés.`)
    } catch (cause) { setFailed(true); setRestoreSummary(cause instanceof Error ? cause.message : 'La restauration a échoué.') }
    finally { setBusy(false) }
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="backup-title">
      <Text className="wasp-eyebrow">EXPORT HORS LIGNE</Text>
      <Heading as="h2" id="backup-title">Sauvegarde chiffrée</Heading>
      <Text>Le fichier contient les données chiffrées du compte. Elles sont ensuite chiffrées une seconde fois dans le navigateur avec une phrase dédiée (Argon2id + AES-256-GCM). La phrase n’est ni transmise ni récupérable.</Text>
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
      <div className="wasp-edit-secret-form" aria-labelledby="restore-title">
        <Heading as="h3" id="restore-title">Restaurer une sauvegarde</Heading>
        <Text>La phrase déchiffre le fichier dans ce navigateur. La restauration exige le compte d’origine et ajoute uniquement les éléments absents; les conflits ne remplacent jamais vos données.</Text>
        <label className="wasp-field">
          <span>Fichier de sauvegarde JSON</span>
          <input type="file" accept="application/json,.json" onChange={(event) => { setRestoreFile(event.target.files?.[0] ?? null); setRestoreSnapshot(null); setRestoreSummary(''); setFailed(false) }} aria-label="Choisir un fichier de sauvegarde chiffrée" />
        </label>
        <label className="wasp-field">
          <span>Phrase de sauvegarde</span>
          <TextInput type="password" value={restorePassphrase} onChange={(event) => { setRestorePassphrase(event.target.value); setRestoreSnapshot(null); setRestoreSummary('') }} autoComplete="current-password" />
        </label>
        {restoreFile && <Button variant="default" disabled={busy || restorePassphrase.length < 12} onClick={() => void inspectRestoreFile(restoreFile)}>{busy ? 'Vérification…' : 'Déchiffrer et vérifier'}</Button>}
        {restoreSummary && <Text role={failed ? 'alert' : 'status'} className={failed ? 'wasp-auth-error' : 'wasp-copy-notice'}>{restoreSummary}</Text>}
        {restoreSnapshot !== null && <Button variant="primary" disabled={busy} onClick={() => void restoreBackup()}>{busy ? 'Restauration…' : 'Restaurer sans écraser les données'}</Button>}
      </div>
    </section>
  )
}
