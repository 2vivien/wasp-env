'use client'

import { useState } from 'react'
import { Button, Text } from '@primer/react'
import { rotateVaultItemPayload } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type Item = { id: string; encryptedPayload: EncryptedVaultItem }
type Job = {
  id: string
  status: string
  completedCount: number
  totalCount: number | null
  toVersion: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

export function VaultRotationRunner({ vaultId }: { vaultId: string }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function rotate() {
    if (busy) return
    if (
      !window.confirm(
        'Renouveler la clé du coffre et rechiffrer tous les secrets ? Les anciens partages et liens seront révoqués.',
      )
    )
      return
    setBusy(true)
    setNotice('Démarrage…')
    try {
      const started = await fetch(`/api/vaults/${vaultId}/rotate`, {
        method: 'POST',
        headers: { origin: window.location.origin },
      })
      if (!started.ok) throw new Error('Démarrage impossible')
      const { jobId } = (await started.json()) as { jobId: string }
      const { items } = await fetchJson<{ items: Item[] }>(
        `/api/vault-items?vaultId=${encodeURIComponent(vaultId)}`,
      )
      let completed = 0
      for (const item of items) {
        const current = item.encryptedPayload.scopeKeyVersion ?? 1
        const payload = await rotateVaultItemPayload(
          vaultId,
          item.id,
          item.encryptedPayload,
          current + 1,
        )
        const response = await fetch(`/api/vault-items/${item.id}/rotate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            vaultId,
            expectedVersion: item.encryptedPayload.version,
            expectedScopeKeyVersion: current,
            encryptedPayload: payload,
          }),
        })
        if (!response.ok) throw new Error(`Échec sur ${completed + 1}/${items.length}`)
        completed += 1
        setNotice(`Rechiffrement : ${completed}/${items.length}`)
      }
      const batch = await fetch(`/api/vaults/${vaultId}/rotate/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, expectedVersion: 1, completedCount: completed }),
      })
      if (!batch.ok) throw new Error('Finalisation impossible')
      const job = (await batch.json()) as Job
      setNotice(`Rotation terminée, clé v${job.toVersion}.`)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Rotation interrompue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wasp-inline-action">
      <Button variant="danger" disabled={busy} onClick={() => void rotate()}>
        {busy ? 'Rotation…' : 'Renouveler la clé du coffre'}
      </Button>
      {notice && (
        <Text role="status" size="small">
          {notice}
        </Text>
      )}
    </div>
  )
}
