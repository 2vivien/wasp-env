'use client'

import { useState } from 'react'
import { Button, Text, TextInput } from '@primer/react'
import { decodeBase64Url, encodeBase64Url } from '@/src/crypto/encoding'
import { sealKeyForMember } from '@/src/crypto/keys'
import { withKey } from '@/src/crypto/key-store'

type KeyResponse = { publicKeyX25519: string }

export function VaultMemberAddForm({ vaultId, onAdded }: { vaultId: string; onAdded: () => Promise<void> }) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState<'viewer' | 'user' | 'editor' | 'admin'>('viewer')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function add() {
    const normalized = handle.trim().replace(/^@/, '').toLowerCase()
    if (!normalized || busy) return
    setBusy(true); setNotice('')
    try {
      const [recipientResponse, senderResponse] = await Promise.all([
        fetch(`/api/users/${encodeURIComponent(normalized)}/keys`, { cache: 'no-store' }),
        fetch('/api/me/keys', { cache: 'no-store' }),
      ])
      if (!recipientResponse.ok || !senderResponse.ok) throw new Error('Clés indisponibles.')
      const recipient = await recipientResponse.json() as KeyResponse
      const sender = await senderResponse.json() as KeyResponse
      const sealed = await withKey(vaultId, (key) => sealKeyForMember(key, decodeBase64Url(recipient.publicKeyX25519)))
      const response = await fetch(`/api/vaults/${vaultId}/members`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipientHandle: normalized, role,
          sealedKey: { v: 1, alg: 'X25519-SEAL', ct: encodeBase64Url(sealed) },
          senderPublicKey: sender.publicKeyX25519,
        }),
      })
      if (!response.ok) throw new Error('Ajout impossible.')
      setHandle('')
      await onAdded()
      setNotice('Invitation créée. Le destinataire doit déverrouiller ses clés pour ouvrir le coffre.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Ajout impossible.')
    } finally { setBusy(false) }
  }

  return (
    <div className="wasp-inline-action">
      <TextInput aria-label="Pseudo à inviter" placeholder="@pseudo" value={handle} onChange={(event) => setHandle(event.target.value)} />
      <select aria-label="Rôle" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
        <option value="viewer">Lecteur</option><option value="user">Utilisateur</option><option value="editor">Éditeur</option><option value="admin">Administrateur</option>
      </select>
      <Button variant="primary" disabled={busy || !handle.trim()} onClick={() => void add()}>{busy ? 'Envoi…' : 'Inviter'}</Button>
      {notice && <Text role="status" size="small">{notice}</Text>}
    </div>
  )
}
