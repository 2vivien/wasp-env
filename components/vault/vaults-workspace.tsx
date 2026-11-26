'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import Link from 'next/link'
import { decryptVaultMeta, encryptVaultMeta, type VaultMeta } from '@/src/crypto/vault-meta'
import { VaultMembersPanel } from './vault-members-panel'
import type { EncryptedBlob } from '@/src/crypto/aead'

type VaultRow = {
  id: string
  kind: 'personal' | 'shared'
  encMeta: EncryptedBlob | null
  keyVersion: number
  archivedAt: string | null
  deletedAt: string | null
  updatedAt: string
}

type DecoratedVault = VaultRow & { meta: VaultMeta | null }

async function fetchVaults(url: string): Promise<{ vaults: VaultRow[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les coffres.')
  return response.json() as Promise<{ vaults: VaultRow[] }>
}

export function VaultsWorkspace() {
  const { data, error, isLoading, mutate } = useSWR('/api/vaults', fetchVaults, { revalidateOnFocus: false })
  const [vaults, setVaults] = useState<DecoratedVault[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: '', description: '', icon: '', color: '' })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all((data?.vaults ?? []).map(async (vault) => {
      if (!vault.encMeta) return { ...vault, meta: null }
      try { return { ...vault, meta: await decryptVaultMeta(vault.id, vault.encMeta) } }
      catch { return { ...vault, meta: null } }
    })).then((rows) => { if (active) setVaults(rows) })
    return () => { active = false }
  }, [data])

  async function post(id: string, action: 'archive' | 'restore' | 'trash') {
    setNotice('')
    const response = await fetch(`/api/vaults/${id}/${action}`, { method: 'POST', headers: { origin: window.location.origin } })
    if (!response.ok) { setNotice('Action impossible. Vérifiez que le coffre est déverrouillé et réessayez.'); return }
    setConfirmId(null)
    setConfirmName('')
    await mutate()
  }

  async function saveMeta(vault: DecoratedVault) {
    if (!vault.encMeta) { setNotice('Ce coffre n’a pas de métadonnées chiffrées.'); return }
    try {
      const encMeta = await encryptVaultMeta(vault.id, {
        name: draft.name,
        description: draft.description,
        icon: draft.icon || 'vault',
        color: draft.color || 'default',
      })
      const response = await fetch(`/api/vaults/${vault.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', origin: window.location.origin },
        body: JSON.stringify({ encMeta }),
      })
      if (!response.ok) throw new Error()
      setEditingId(null)
      await mutate()
    } catch { setNotice('Enregistrement impossible. Déverrouillez le coffre puis réessayez.') }
  }

  return (
    <section className="wasp-dashboard-content" aria-labelledby="vaults-title">
      <Heading as="h1" id="vaults-title">Coffres</Heading>
      <Text>Les noms et descriptions sont déchiffrés uniquement dans ce navigateur.</Text>
      {isLoading && <Text role="status">Chargement des coffres…</Text>}
      {error && <Text role="alert">Impossible de charger les coffres.</Text>}
      {notice && <Text role="status">{notice}</Text>}
      {vaults.length === 0 && !isLoading && <Text>Aucun coffre. Créez-en un depuis la vue générale.</Text>}
      {vaults.map((vault) => (
        <article className="wasp-vault-card" key={vault.id}>
          <div className="wasp-vault-panel-heading">
            <div>
              <Heading as="h2">{vault.meta?.name || 'Coffre verrouillé'}</Heading>
              <Text size="small">{vault.meta?.description || 'Déverrouillez le coffre pour afficher les métadonnées.'}</Text>
            </div>
            <div className="wasp-inline-action">
              <Link href="/dashboard">Ouvrir</Link>
              {!vault.archivedAt && <Button variant="invisible" onClick={() => void post(vault.id, 'archive')}>Archiver</Button>}
              {vault.archivedAt && <Button variant="invisible" onClick={() => void post(vault.id, 'restore')}>Restaurer</Button>}
              {vault.kind === 'shared' && <Button variant="invisible" onClick={() => setConfirmId(vault.id)}>Supprimer</Button>}
            </div>
          </div>
          <Text size="small">{vault.kind === 'personal' ? 'Personnel' : 'Partagé'} · clé v{vault.keyVersion} · modifié le {new Date(vault.updatedAt).toLocaleDateString('fr-FR')}</Text>
          {editingId === vault.id && <div className="wasp-inline-action">
            <TextInput aria-label="Nom du coffre" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={60} />
            <TextInput aria-label="Description du coffre" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={200} />
            <Button variant="primary" onClick={() => void saveMeta(vault)}>Enregistrer</Button>
            <Button variant="invisible" onClick={() => setEditingId(null)}>Annuler</Button>
          </div>}
          {editingId !== vault.id && <Button variant="invisible" onClick={() => {
            setDraft({ name: vault.meta?.name ?? '', description: vault.meta?.description ?? '', icon: vault.meta?.icon ?? '', color: vault.meta?.color ?? '' })
            setEditingId(vault.id)
          }}>Renommer</Button>}
          {confirmId === vault.id && <div className="wasp-inline-action">
            <label className="wasp-field"><span>Saisissez le nom du coffre pour confirmer</span><TextInput value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" /></label>
            <Button variant="danger" disabled={confirmName !== vault.meta?.name} onClick={() => void post(vault.id, 'trash')}>Supprimer définitivement</Button>
            <Button variant="invisible" onClick={() => setConfirmId(null)}>Annuler</Button>
          </div>}
          {vault.archivedAt === null && <VaultMembersPanel vaultId={vault.id} kind={vault.kind} />}
        </article>
      ))}
    </section>
  )
}
