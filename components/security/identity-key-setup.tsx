'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { createPendingIdentityMaterial } from '@/src/crypto/identity-material'

type KeyRecord = { publicKeyX25519: string; publicKeyEd25519: string; encryptedPrivateKeys: unknown; accountKeyPassphraseEnvelope: unknown; accountKeyRecoveryEnvelope: unknown; kdfParameters: unknown }
type Pending = { record: KeyRecord; recoveryKey: string }

async function loadKeyStatus(url: string): Promise<{ configured: boolean; publicKeyX25519?: string }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 404) return { configured: false }
  if (!response.ok) throw new Error('Impossible de charger les clés.')
  const record = await response.json() as { publicKeyX25519: string }
  return { configured: true, publicKeyX25519: record.publicKeyX25519 }
}

export function IdentityKeySetup() {
  const { data, error, mutate } = useSWR('/api/me/keys', loadKeyStatus, { revalidateOnFocus: false })
  const [passphrase, setPassphrase] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function prepare() {
    setBusy(true); setNotice('')
    try {
      const material = await createPendingIdentityMaterial(passphrase)
      setPending(material); setPassphrase('')
    } catch { setNotice('Impossible de générer les clés sur cet appareil.') }
    finally { setBusy(false) }
  }

  async function save() {
    if (!pending || confirmation !== pending.recoveryKey.slice(0, 6)) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/me/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending.record) })
      if (!response.ok) throw new Error(response.status === 409 ? 'Des clés existent déjà pour ce compte.' : 'Enregistrement impossible.')
      setPending(null); setConfirmation(''); setNotice('Clés enregistrées. Gardez la clé de récupération hors ligne.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Enregistrement impossible.') }
    finally { setBusy(false) }
  }

  return <section className="wasp-vault-card" aria-labelledby="identity-keys-title"><div><Text className="wasp-eyebrow">IDENTITÉ CRYPTOGRAPHIQUE</Text><Heading as="h2" id="identity-keys-title">Clés de partage</Heading><Text size="small">Les clés privées sont chiffrées dans votre navigateur. Le serveur conserve uniquement les enveloppes chiffrées et les clés publiques.</Text></div>
    {data?.configured ? <><Text>Clé X25519 configurée · {data.publicKeyX25519?.slice(0, 10)}…</Text><Text size="small">La clé privée chiffrée et les enveloppes de récupération ne sont jamais renvoyées à l’interface.</Text></> : pending ? <><div className="wasp-security-note">Clé de récupération affichée une seule fois. Copiez-la et conservez-la hors ligne : <strong>{pending.recoveryKey}</strong></div><Button onClick={() => void navigator.clipboard.writeText(pending.recoveryKey)}>Copier la clé</Button><label className="wasp-field"><span>Saisissez les 6 premiers caractères pour confirmer</span><TextInput autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><Button variant="primary" disabled={busy || confirmation !== pending.recoveryKey.slice(0, 6)} onClick={() => void save()}>Enregistrer les clés chiffrées</Button><Button disabled={busy} onClick={() => { setPending(null); setConfirmation('') }}>Annuler</Button></> : <><label className="wasp-field"><span>Phrase secrète de récupération des clés</span><TextInput type="password" autoComplete="new-password" minLength={12} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label><Button variant="primary" disabled={busy || passphrase.length < 12} onClick={() => void prepare()}>{busy ? 'Génération sécurisée…' : 'Générer les clés'}</Button></>}
    {error && <Text role="alert">Impossible de vérifier les clés de partage.</Text>}{notice && <Text role="status">{notice}</Text>}
  </section>
}
