'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decodeBase64Url } from '@/src/crypto/encoding'
import { openSealedKey } from '@/src/crypto/keys'
import { recoverIdentityPrivateKeys, unlockIdentityPrivateKeys } from '@/src/crypto/identity-material'
import { removeKey, storeKey } from '@/src/crypto/key-store'
import { VaultItemsPanel } from './vault-items-panel'

type Share = { id: string; vaultId: string; encryptedVaultKey: { v: 1; alg: 'X25519-SEAL'; ct: string }; permission: 'read' | 'write'; status: 'pending' | 'accepted'; expiresAt: string | null; createdAt: string; ownerName: string | null }

async function fetchShares(url: string): Promise<{ shares: Share[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les invitations.')
  return response.json() as Promise<{ shares: Share[] }>
}

export function SharedVaultWorkspace() {
  const { data, error, mutate } = useSWR<{ shares: Share[] }>('/api/me/shares', fetchShares, { revalidateOnFocus: false })
  const [passphrase, setPassphrase] = useState('')
  const [unlockMode, setUnlockMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function accept(shareId: string) {
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/shares/${shareId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!response.ok) throw new Error('Invitation expirée ou inaccessible.')
      await mutate()
      setNotice('Invitation acceptée. Déverrouillez vos clés de partage pour ouvrir le coffre.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible d’accepter cette invitation.') }
    finally { setBusy(false) }
  }

  async function unlockAcceptedShares() {
    const accepted = data?.shares.filter((share) => share.status === 'accepted') ?? []
    if (!accepted.length) return
    setBusy(true); setNotice('')
    let identity: Awaited<ReturnType<typeof unlockIdentityPrivateKeys>> | undefined
    try {
      const response = await fetch('/api/me/keys?includeEncrypted=1', { cache: 'no-store' })
      if (!response.ok) throw new Error('Configurez vos clés de partage avant de déverrouiller une invitation.')
      const material = await response.json()
      identity = unlockMode === 'recovery'
        ? await recoverIdentityPrivateKeys(passphrase, material)
        : await unlockIdentityPrivateKeys(passphrase, material)
      const ready: string[] = []
      for (const share of accepted) {
        try {
          const envelope = decodeBase64Url(share.encryptedVaultKey.ct)
          const rootKey = await openSealedKey(envelope, identity.publicKeyX25519, identity.privateKeyX25519)
          storeKey(share.vaultId, rootKey)
          rootKey.fill(0)
          ready.push(share.id)
        } catch { continue }
      }
      setUnlocked(ready)
      setPassphrase('')
      setNotice(ready.length ? `${ready.length} coffre(s) déverrouillé(s) dans cet onglet.` : 'Aucun coffre n’a pu être déverrouillé avec ces clés.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible de déverrouiller les coffres.') }
    finally {
      identity?.privateKeyX25519.fill(0)
      identity?.privateKeyEd25519.fill(0)
      identity?.publicKeyX25519.fill(0)
      identity?.publicKeyEd25519.fill(0)
      setBusy(false)
    }
  }

  function lockShare(share: Share) {
    removeKey(share.vaultId)
    setUnlocked((current) => current.filter((id) => id !== share.id))
  }

  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><a className="wasp-wordmark" href="/dashboard">Wasp</a><nav className="wasp-dashboard-nav" aria-label="Navigation principale"><a href="/dashboard">Coffre</a><a href="/projects">Projets</a><a href="/security">Sécurité</a></nav></header><section className="wasp-dashboard-content"><Text className="wasp-eyebrow">COFFRES PARTAGÉS</Text><Heading as="h1">Invitations et accès</Heading><Text>Les clés de coffre sont scellées pour votre identité et ne transitent jamais en clair.</Text>
    {data?.shares.some((share) => share.status === 'accepted') && <div className="wasp-inline-action"><label className="wasp-field"><span>Mode de déverrouillage</span><select aria-label="Mode de déverrouillage" value={unlockMode} onChange={(event) => setUnlockMode(event.target.value as 'passphrase' | 'recovery')}><option value="passphrase">Phrase secrète</option><option value="recovery">Clé de récupération</option></select></label><label className="wasp-field"><span>{unlockMode === 'passphrase' ? 'Phrase secrète de vos clés de partage' : 'Clé de récupération'}</span><TextInput type={unlockMode === 'passphrase' ? 'password' : 'text'} autoComplete="off" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /></label><Button variant="primary" disabled={busy || passphrase.trim().length < (unlockMode === 'passphrase' ? 12 : 43)} onClick={() => void unlockAcceptedShares()}>{busy ? 'Déverrouillage…' : 'Déverrouiller les coffres acceptés'}</Button></div>}
    {notice && <Text role="status">{notice}</Text>}{error && <Text role="alert">Impossible de charger les invitations.</Text>}
    {data?.shares.map((share) => <article className="wasp-vault-card" key={share.id}><div><Heading as="h2">Coffre de {share.ownerName ?? 'un utilisateur'}</Heading><Text size="small">{share.permission === 'read' ? 'Lecture seule' : 'Lecture et écriture'} · {share.status === 'pending' ? 'Invitation en attente' : 'Acceptée'}</Text></div>{share.status === 'pending' && <Button variant="primary" disabled={busy} onClick={() => void accept(share.id)}>Accepter l’invitation</Button>}{unlocked.includes(share.id) && <VaultItemsPanel vaultId={share.vaultId} onLock={() => lockShare(share)} canWrite={share.permission === 'write'} allowShare={false} />}</article>)}
    {data && data.shares.length === 0 && <Text>Aucune invitation pour le moment.</Text>}
  </section></main>
}
