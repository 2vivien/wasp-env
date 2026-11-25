'use client'

import { useEffect, useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { storeKey } from '@/src/crypto/key-store'
import { createPendingVaultKey, recoveryGroups, type PendingVaultKey } from '@/src/crypto/vault-key'
import { wipeBytes } from '@/src/crypto/encoding'
import type { VaultRecord } from './vault-workspace'

export function VaultSetupForm({ onCreated }: { onCreated: (vault: VaultRecord) => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState<PendingVaultKey | null>(null)
  const [answers, setAnswers] = useState(['', '', ''])
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (pending) wipeBytes(pending.rootKey)
  }, [pending])

  const strength = passphrase.length < 12
    ? 'Faible'
    : passphrase.length >= 20
      ? 'Forte'
      : 'Correcte'

  async function handlePrepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (passphrase.normalize('NFKC').length < 12 || passphrase.length > 256 || passphrase !== confirmation) {
      setError('Choisissez une phrase de 12 à 256 caractères et vérifiez qu’elle correspond.')
      return
    }

    setIsWorking(true)
    try {
      setPending(await createPendingVaultKey(passphrase))
      setPassphrase('')
      setConfirmation('')
      setAnswers(['', '', ''])
    } catch {
      setError('Impossible de préparer le coffre dans ce navigateur. Vérifiez sa compatibilité puis réessayez.')
    } finally {
      setIsWorking(false)
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pending) return
    setError(null)
    const groups = recoveryGroups(pending.recoveryKey)
    const isConfirmed = pending.confirmationGroups.every((groupIndex, answerIndex) =>
      answers[answerIndex] === groups[groupIndex],
    )
    if (!isConfirmed) {
      setError('Les groupes saisis ne correspondent pas à la clé affichée.')
      return
    }

    setIsWorking(true)
    try {
      const response = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pending.vaultId,
          keySalt: pending.keySalt,
          wrappedKey: pending.wrappedKey,
          kdfParameters: pending.kdfParameters,
        }),
      })
      if (!response.ok) throw new Error('Vault setup failed.')

      storeKey(pending.vaultId, pending.rootKey)
      onCreated({
        id: pending.vaultId,
        keySalt: pending.keySalt,
        wrappedKey: pending.wrappedKey,
        kdfParameters: pending.kdfParameters,
      })
      setPending(null)
    } catch {
      setError('Impossible d’enregistrer le coffre. Vos clés restent dans cet onglet : réessayez.')
    } finally {
      setIsWorking(false)
    }
  }

  function copyRecoveryKey() {
    if (!pending) return
    void navigator.clipboard.writeText(recoveryGroups(pending.recoveryKey).join(' '))
  }

  function downloadRecoveryKey() {
    if (!pending) return
    const file = new Blob([`Clé de récupération Wasp\n\n${recoveryGroups(pending.recoveryKey).join(' ')}\n\nConservez cette clé hors ligne. Elle ne peut pas être récupérée.`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wasp-cle-de-recuperation.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (pending) {
    const groups = recoveryGroups(pending.recoveryKey)
    return (
      <section className="wasp-vault-card" aria-labelledby="recovery-title">
        <Text className="wasp-eyebrow">ÉTAPE 2 · RÉCUPÉRATION</Text>
        <Heading as="h2" id="recovery-title">Gardez votre clé de récupération</Heading>
        <Text>Elle ne sera plus affichée après cette étape. Sans phrase secrète ni cette clé, le coffre est irrécupérable.</Text>
        <code className="wasp-recovery-key" aria-label="Clé de récupération">
          {groups.map((group, index) => <span key={`${group}-${index}`}>{group}</span>)}
        </code>
        <div className="wasp-inline-action">
          <Button variant="default" onClick={copyRecoveryKey}>Copier</Button>
          <Button variant="default" onClick={downloadRecoveryKey}>Télécharger .txt</Button>
          <Button variant="default" onClick={() => window.print()}>Imprimer</Button>
        </div>
        <form className="wasp-vault-form" onSubmit={handleSave}>
          <Text>Confirmez les groupes demandés pour terminer.</Text>
          {pending.confirmationGroups.map((groupIndex, answerIndex) => (
            <label className="wasp-field" key={groupIndex}>
              <span>Groupe {groupIndex + 1}</span>
              <TextInput
                value={answers[answerIndex] ?? ''}
                onChange={(event) => setAnswers((current) => current.map((value, index) => index === answerIndex ? event.target.value : value))}
                autoComplete="off"
                required
              />
            </label>
          ))}
          {error && <Text role="alert" className="wasp-auth-error">{error}</Text>}
          <Button type="submit" variant="primary" disabled={isWorking}>
            {isWorking ? 'Enregistrement…' : 'Confirmer et ouvrir le coffre'}
          </Button>
        </form>
      </section>
    )
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="create-vault-title">
      <Text className="wasp-eyebrow">CONFIGURATION INITIALE</Text>
      <Heading as="h2" id="create-vault-title">Créez votre phrase secrète</Heading>
      <Text>Elle chiffre la clé du coffre dans votre navigateur. Elle n’est jamais envoyée à Wasp et ne peut pas être réinitialisée par Google.</Text>
      <form className="wasp-vault-form" onSubmit={handlePrepare}>
        <label className="wasp-field">
          <span>Phrase secrète</span>
          <TextInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" required minLength={12} maxLength={256} />
        </label>
        <label className="wasp-field">
          <span>Confirmer la phrase secrète</span>
          <TextInput type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required minLength={12} maxLength={256} />
        </label>
        <Text size="small" role="status">Force estimée : {strength}</Text>
        <div className="wasp-security-note">Votre phrase ne quitte jamais cet appareil. Utilisez une phrase longue et unique.</div>
        {error && <Text role="alert" className="wasp-auth-error">{error}</Text>}
        <Button type="submit" variant="primary" disabled={isWorking || passphrase.length < 12 || passphrase !== confirmation}>
          {isWorking ? 'Dérivation de la clé…' : 'Créer le coffre'}
        </Button>
      </form>
    </section>
  )
}
