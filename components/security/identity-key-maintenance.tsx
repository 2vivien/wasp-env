'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { rewrapIdentityPassphrase, rewrapIdentityRecovery } from '@/src/crypto/identity-material'

type Material = Parameters<typeof rewrapIdentityPassphrase>[0]

async function fetchMaterial(url: string): Promise<Material | null> {
  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Chargement impossible')
  const body = (await response.json()) as Material & { configured?: boolean }
  return body.configured === false ? null : body
}

export function IdentityKeyMaintenance() {
  const material = useSWR('/api/me/keys?includeEncrypted=1', fetchMaterial, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    errorRetryCount: 0,
  })
  const [currentPassphrase, setCurrentPassphrase] = useState('')
  const [nextPassphrase, setNextPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [recoveryConfirmation, setRecoveryConfirmation] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function changePassphrase() {
    if (!material.data || busy) return
    setBusy(true)
    setNotice('')
    try {
      const update = await rewrapIdentityPassphrase(
        material.data,
        currentPassphrase,
        nextPassphrase,
      )
      const response = await fetch('/api/me/keys/passphrase', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (!response.ok) throw new Error('Mise à jour impossible.')
      setCurrentPassphrase('')
      setNextPassphrase('')
      setConfirmation('')
      setNotice('Phrase de clés modifiée. La clé de récupération reste valide.')
      await material.mutate()
    } catch {
      setNotice('Phrase incorrecte ou mise à jour impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function regenerateRecovery() {
    if (!material.data || busy) return
    setBusy(true)
    setNotice('')
    try {
      const update = await rewrapIdentityRecovery(material.data, recoveryInput)
      const response = await fetch('/api/me/keys/recovery', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountKeyRecoveryEnvelope: update.accountKeyRecoveryEnvelope }),
      })
      if (!response.ok) throw new Error('Mise à jour impossible.')
      setNewRecoveryKey(update.recoveryKey)
      setRecoveryInput('')
      await material.mutate()
    } catch {
      setNotice('Clé de récupération incorrecte ou mise à jour impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (!material.data)
    return <Text size="small">Aucune clé de partage configurée sur ce compte.</Text>

  return (
    <section className="wasp-vault-card" aria-labelledby="identity-maintenance-title">
      <Heading as="h2" id="identity-maintenance-title">
        Phrase et récupération des clés de partage
      </Heading>
      <div className="wasp-inline-action">
        <TextInput
          type="password"
          aria-label="Phrase actuelle"
          placeholder="Phrase actuelle"
          value={currentPassphrase}
          onChange={(event) => setCurrentPassphrase(event.target.value)}
        />
        <TextInput
          type="password"
          aria-label="Nouvelle phrase"
          placeholder="Nouvelle phrase"
          value={nextPassphrase}
          onChange={(event) => setNextPassphrase(event.target.value)}
        />
        <TextInput
          type="password"
          aria-label="Confirmer la nouvelle phrase"
          placeholder="Confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <Button
          variant="primary"
          disabled={
            busy ||
            currentPassphrase.length < 12 ||
            nextPassphrase.length < 12 ||
            nextPassphrase !== confirmation
          }
          onClick={() => void changePassphrase()}
        >
          Changer la phrase
        </Button>
      </div>
      <div className="wasp-inline-action">
        <TextInput
          aria-label="Clé de récupération actuelle"
          placeholder="Clé de récupération actuelle"
          value={recoveryInput}
          onChange={(event) => setRecoveryInput(event.target.value)}
        />
        <Button
          disabled={busy || recoveryInput.length < 43}
          onClick={() => void regenerateRecovery()}
        >
          Régénérer la clé
        </Button>
      </div>
      {newRecoveryKey && (
        <div className="wasp-security-note">
          <Text>Nouvelle clé, affichée une seule fois :</Text>
          <code>{newRecoveryKey}</code>
          <Button onClick={() => void navigator.clipboard.writeText(newRecoveryKey)}>Copier</Button>
          <TextInput
            aria-label="Confirmer les 6 premiers caractères"
            value={recoveryConfirmation}
            onChange={(event) => setRecoveryConfirmation(event.target.value)}
          />
          {recoveryConfirmation === newRecoveryKey.slice(0, 6) && (
            <Text role="status">Confirmation reçue.</Text>
          )}
        </div>
      )}
      {notice && (
        <Text
          role={notice.includes('impossible') || notice.includes('incorrecte') ? 'alert' : 'status'}
          size="small"
        >
          {notice}
        </Text>
      )}
    </section>
  )
}
