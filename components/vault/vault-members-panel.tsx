'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { can, normalizeOverrides, type Role } from '@/lib/permissions'
import { VaultMemberAddForm } from './vault-member-add-form'
import { VaultRotationRunner } from './vault-rotation-runner'

type Member = {
  userId: string
  handle: string | null
  displayName: string | null
  role: Role
  permissions: unknown
  createdAt: string
}
type Job = { id: string; status: string; completedCount: number; totalCount: number | null }

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

export function VaultMembersPanel({
  vaultId,
  kind,
}: {
  vaultId: string
  kind: 'personal' | 'shared'
}) {
  const members = useSWR<{ members: Member[] }>(`/api/vaults/${vaultId}/members`, fetcher, {
    revalidateOnFocus: false,
  })
  const me = useSWR<{ userId: string }>('/api/me', fetcher, { revalidateOnFocus: false })
  const rotation = useSWR<{ job: Job | null }>(`/api/vaults/${vaultId}/rotate/status`, fetcher, {
    revalidateOnFocus: false,
  })
  const [transferHandle, setTransferHandle] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const current = members.data?.members.find((member) => member.userId === me.data?.userId)
  const role = current?.role ?? (kind === 'personal' ? 'owner' : 'viewer')
  const permissions = normalizeOverrides(current?.permissions)
  const canManage = can(role, 'manage', permissions) || role === 'owner'
  const isOwner = role === 'owner'

  async function mutateAll() {
    await Promise.all([members.mutate(), rotation.mutate()])
  }

  async function updateRole(userId: string, nextRole: Role) {
    setBusy(true)
    setNotice('')
    const response = await fetch(`/api/vaults/${vaultId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    setNotice(response.ok ? 'Rôle mis à jour.' : 'Modification impossible.')
    setBusy(false)
    await mutateAll()
  }

  async function remove(userId: string) {
    if (!window.confirm('Retirer ce membre ? Une rotation de clé sera nécessaire.')) return
    setBusy(true)
    const response = await fetch(`/api/vaults/${vaultId}/members/${userId}`, { method: 'DELETE' })
    setNotice(response.ok ? 'Membre retiré. Démarrez la rotation des clés.' : 'Retrait impossible.')
    setBusy(false)
    await mutateAll()
  }

  async function post(action: 'transfer' | 'leave' | 'rotate', body?: object) {
    setBusy(true)
    setNotice('')
    const response = await fetch(`/api/vaults/${vaultId}/${action}`, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const result = (await response.json().catch(() => null)) as { error?: { code?: string } } | null
    setNotice(
      response.ok ? 'Action effectuée.' : `Action impossible (${result?.error?.code ?? 'erreur'}).`,
    )
    setBusy(false)
    await mutateAll()
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="members-title">
      <Heading as="h2" id="members-title">
        Membres
      </Heading>
      {members.error && <Text role="alert">Impossible de charger les membres.</Text>}
      {members.data?.members.map((member) => (
        <div className="wasp-security-row" key={member.userId}>
          <div>
            <Text>{member.displayName || `@${member.handle ?? 'utilisateur'}`}</Text>
            <Text size="small">
              {member.role} · ajouté le {new Date(member.createdAt).toLocaleDateString('fr-FR')}
            </Text>
          </div>
          {canManage && member.role !== 'owner' && (
            <select
              aria-label={`Rôle de ${member.handle ?? member.userId}`}
              value={member.role}
              disabled={busy}
              onChange={(event) => void updateRole(member.userId, event.target.value as Role)}
            >
              <option value="viewer">Lecteur</option>
              <option value="user">Utilisateur</option>
              <option value="editor">Éditeur</option>
              <option value="admin">Administrateur</option>
            </select>
          )}
          {canManage && member.role !== 'owner' && (
            <Button variant="invisible" disabled={busy} onClick={() => void remove(member.userId)}>
              Retirer
            </Button>
          )}
        </div>
      ))}
      {canManage && <VaultMemberAddForm vaultId={vaultId} onAdded={mutateAll} />}
      {isOwner && (
        <div className="wasp-inline-action">
          <TextInput
            aria-label="Nouveau propriétaire"
            placeholder="Nouveau propriétaire @pseudo"
            value={transferHandle}
            onChange={(event) => setTransferHandle(event.target.value)}
          />
          <Button
            disabled={busy || !transferHandle.trim()}
            onClick={() => void post('transfer', { newOwnerHandle: transferHandle })}
          >
            Transférer
          </Button>
        </div>
      )}
      {!isOwner && kind === 'shared' && (
        <Button variant="invisible" disabled={busy} onClick={() => void post('leave')}>
          Quitter le coffre
        </Button>
      )}
      {canManage && <VaultRotationRunner vaultId={vaultId} />}
      {rotation.data?.job && (
        <Text size="small">
          Rotation {rotation.data.job.status} · {rotation.data.job.completedCount}/
          {rotation.data.job.totalCount ?? '?'}
        </Text>
      )}
      {notice && (
        <Text role="status" size="small">
          {notice}
        </Text>
      )}
    </section>
  )
}
