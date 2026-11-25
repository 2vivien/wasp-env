'use client'

import { useEffect, useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { storeKey } from '@/src/crypto/key-store'
import { recoverVaultKey, rewrapVaultPassphrase, unlockVaultKey } from '@/src/crypto/vault-key'
import { wipeBytes } from '@/src/crypto/encoding'
import type { VaultRecord } from './vault-workspace'

export function VaultUnlockForm({ vault, onUnlocked }: { vault: VaultRecord; onUnlocked: (updatedVault?: VaultRecord) => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [recoveryValue, setRecoveryValue] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [newConfirmation, setNewConfirmation] = useState('')
  const [recoveredRootKey, setRecoveredRootKey] = useState<Uint8Array | null>(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [failures, setFailures] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const [isWorking, setIsWorking] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (cooldown < 1) return
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  useEffect(() => () => {
    if (recoveredRootKey) wipeBytes(recoveredRootKey)
  }, [recoveredRootKey])

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isWorking || cooldown > 0) return
    setHasError(false)
    setIsWorking(true)
    let temporaryRootKey: Uint8Array | undefined

    try {
      if (recoveredRootKey) {
        if (newPassphrase.normalize('NFKC').length < 12 || newPassphrase.length > 256 || newPassphrase !== newConfirmation) {
          setHasError(true)
          return
        }
        const rewrapped = await rewrapVaultPassphrase(recoveredRootKey, newPassphrase, vault.id, vault.wrappedKey)
        const response = await fetch(`/api/vaults/${vault.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rewrapped),
        })
        if (!response.ok) throw new Error('Passphrase update failed.')
        storeKey(vault.id, recoveredRootKey)
        setNewPassphrase('')
        setNewConfirmation('')
        onUnlocked({ ...vault, ...rewrapped })
        setRecoveredRootKey(null)
        return
      }

      if (isRecoveryMode) {
        temporaryRootKey = await recoverVaultKey(vault.id, vault.wrappedKey, recoveryValue)
        setRecoveredRootKey(temporaryRootKey)
        temporaryRootKey = undefined
        setRecoveryValue('')
        setFailures(0)
        return
      }

      temporaryRootKey = await unlockVaultKey(vault.id, vault.keySalt, vault.wrappedKey, vault.kdfParameters, passphrase)
      storeKey(vault.id, temporaryRootKey)
      setPassphrase('')
      setFailures(0)
      onUnlocked()
    } catch {
      const nextFailures = failures + 1
      setFailures(nextFailures)
      setCooldown(Math.min(30, 2 ** Math.min(nextFailures - 1, 5)))
      setHasError(true)
    } finally {
      if (temporaryRootKey) wipeBytes(temporaryRootKey)
      setIsWorking(false)
    }
  }

  if (recoveredRootKey) {
    return (
      <section className="wasp-vault-card" aria-labelledby="reset-passphrase-title">
        <Text className="wasp-eyebrow">RÉCUPÉRATION VALIDÉE</Text>
        <Heading as="h2" id="reset-passphrase-title">Choisissez une nouvelle phrase secrète</Heading>
        <Text>Votre clé de récupération reste valide. Cette phrase sera nécessaire au prochain déverrouillage.</Text>
        <form className="wasp-vault-form" onSubmit={handleUnlock}>
          <label className="wasp-field">
            <span>Nouvelle phrase secrète</span>
            <TextInput type="password" value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required />
          </label>
          <label className="wasp-field">
            <span>Confirmer la phrase secrète</span>
            <TextInput type="password" value={newConfirmation} onChange={(event) => setNewConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required />
          </label>
          {hasError && <Text role="alert" className="wasp-auth-error">Les phrases ne correspondent pas ou la mise à jour a échoué.</Text>}
          <Button type="submit" variant="primary" disabled={isWorking || newPassphrase.normalize('NFKC').length < 12 || newPassphrase !== newConfirmation}>
            {isWorking ? 'Mise à jour…' : 'Enregistrer et ouvrir'}
          </Button>
        </form>
      </section>
    )
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="unlock-title">
      <Text className="wasp-eyebrow">VOTRE CLÉ RESTE LOCALE</Text>
      <Heading as="h2" id="unlock-title">Déverrouillez votre coffre</Heading>
      <Text>La session Google identifie votre compte ; seule votre phrase secrète ouvre les données.</Text>
      <form className="wasp-vault-form" onSubmit={handleUnlock}>
        <label className="wasp-field">
          <span>{isRecoveryMode ? 'Clé de récupération' : 'Phrase secrète'}</span>
          <TextInput
            type={isRecoveryMode ? 'text' : 'password'}
            value={isRecoveryMode ? recoveryValue : passphrase}
            onChange={(event) => isRecoveryMode ? setRecoveryValue(event.target.value) : setPassphrase(event.target.value)}
            autoComplete={isRecoveryMode ? 'off' : 'current-password'}
            required
            autoFocus
          />
        </label>
        {hasError && <Text role="alert" className="wasp-auth-error">{isRecoveryMode ? 'Clé de récupération incorrecte.' : `Phrase secrète incorrecte. Réessayez dans ${cooldown} s.`}</Text>}
        {failures >= 5 && !isRecoveryMode && <Text size="small">Après plusieurs échecs, vous pouvez utiliser votre clé de récupération.</Text>}
        <Button type="submit" variant="primary" disabled={isWorking || cooldown > 0 || (isRecoveryMode ? recoveryValue.length === 0 : passphrase.length === 0)}>
          {isWorking ? 'Vérification…' : cooldown > 0 ? `Réessayez dans ${cooldown} s` : isRecoveryMode ? 'Récupérer le coffre' : 'Déverrouiller'}
        </Button>
      </form>
      <Button variant="invisible" onClick={() => {
        setIsRecoveryMode((current) => !current)
        setRecoveryValue('')
        setPassphrase('')
        setCooldown(0)
        setHasError(false)
      }}>
        {isRecoveryMode ? 'Utiliser la phrase secrète' : 'Utiliser la clé de récupération'}
      </Button>
    </section>
  )
}
