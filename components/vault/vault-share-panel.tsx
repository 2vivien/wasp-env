'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decodeBase64Url, encodeBase64Url } from '@/src/crypto/encoding'
import { sealKeyForMember } from '@/src/crypto/keys'
import { withKey } from '@/src/crypto/key-store'

type Share = { id: string; recipientHandle: string | null; permission: 'read' | 'write'; status: string; createdAt: string; expiresAt: string | null }

async function loadShares(url: string): Promise<{ shares: Share[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les partages.')
  return response.json() as Promise<{ shares: Share[] }>
}

export function VaultSharePanel({ vaultId }: { vaultId: string }) {
  const { data, error, mutate } = useSWR<{ shares: Share[] }>(`/api/vaults/${vaultId}/shares`, loadShares, { revalidateOnFocus: false })
  const [recipientHandle, setRecipientHandle] = useState('')
  const [permission, setPermission] = useState<'read' | 'write'>('read')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function createShare() {
    const handle = recipientHandle.trim().replace(/^@/, '')
    if (!handle) return
    setBusy(true); setNotice('')
    try {
      const keyResponse = await fetch(`/api/users/${encodeURIComponent(handle)}/keys`, { cache: 'no-store' })
      if (!keyResponse.ok) throw new Error('Aucune clé de partage trouvée pour ce nom d’utilisateur.')
      const { publicKeyX25519 } = await keyResponse.json() as { publicKeyX25519: string }
      const recipientKey = decodeBase64Url(publicKeyX25519)
      const sealed = await withKey(vaultId, (vaultKey) => sealKeyForMember(vaultKey, recipientKey))
      const response = await fetch(`/api/vaults/${vaultId}/shares`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipientHandle: handle, encryptedVaultKey: { v: 1, alg: 'X25519-SEAL', ct: encodeBase64Url(sealed) }, permission }),
      })
      sealed.fill(0); recipientKey.fill(0)
      if (!response.ok) throw new Error('Impossible de partager ce coffre.')
      setRecipientHandle(''); setNotice('Invitation de partage envoyée.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function revoke(shareId: string) {
    const response = await fetch(`/api/shares/${shareId}`, { method: 'DELETE' })
    if (!response.ok) { setNotice('Impossible de révoquer le partage.'); return }
    await mutate()
  }

  return <section className="wasp-vault-card" aria-labelledby="vault-shares-title"><div><Text className="wasp-eyebrow">PARTAGE CHIFFRÉ</Text><Heading as="h2" id="vault-shares-title">Partager le coffre</Heading><Text size="small">La clé du coffre est scellée pour la clé publique du destinataire. Elle n’est jamais envoyée en clair.</Text></div><div className="wasp-inline-action"><TextInput aria-label="Nom d’utilisateur du destinataire" placeholder="Nom d’utilisateur" value={recipientHandle} onChange={(event) => setRecipientHandle(event.target.value)} /><label className="wasp-share-permission">Accès<select aria-label="Niveau d’accès" value={permission} onChange={(event) => setPermission(event.target.value as 'read' | 'write')}><option value="read">Lecture</option><option value="write">Lecture et écriture</option></select></label><Button variant="primary" disabled={busy || !recipientHandle.trim()} onClick={() => void createShare()}>Envoyer l’invitation</Button></div>{notice && <Text role="status">{notice}</Text>}{error && <Text role="alert">Impossible de charger les partages.</Text>}{data?.shares.map((share) => <div className="wasp-security-row" key={share.id}><div><Text>@{share.recipientHandle ?? 'utilisateur'} · {share.permission === 'read' ? 'Lecture' : 'Écriture'}</Text><Text size="small">{share.status} · {new Date(share.createdAt).toLocaleDateString('fr-FR')}</Text></div><Button variant="default" onClick={() => void revoke(share.id)}>Révoquer</Button></div>)}</section>
}
