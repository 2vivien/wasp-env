'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import QRCode from 'qrcode'
import Image from 'next/image'
import { Button, Text, TextInput } from '@primer/react'
import { decodeBase64Url, encodeBase64Url, randomBytes, wipeBytes } from '@/src/crypto/encoding'
import { sealDataForMember } from '@/src/crypto/keys'
import { decryptVaultItemMetadata, decryptVaultItemValue, encryptVaultItemPayload, getVaultItemScopeKeys, rotateVaultItemPayload } from '@/src/crypto/vault-items'
import { compareFingerprints } from '@/src/crypto/value-hmac'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'
import type { VaultItemKind, VaultItemMetadata } from '@/src/crypto/vault-items'
import { VaultItemEditor } from './vault-item-editor'

type Item = { id: string; encryptedPayload: EncryptedVaultItem }
type ItemName = { id: string; name: string; kind: VaultItemKind; meta: VaultItemMetadata; item: Item }
type EditingItem = ItemName & { value: string }
type ShareGroup = { id: string; name: string; members: Array<{ userId: string; handle: string | null }> }

async function fetchShareGroups(url: string): Promise<{ groups: ShareGroup[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les groupes.')
  return response.json() as Promise<{ groups: ShareGroup[] }>
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export function VaultItemList({
  vaultId,
  items,
  onDelete,
  onUpdated,
  canWrite = true,
  canShare = true,
}: {
  vaultId: string
  items: Item[]
  onDelete: (id: string) => Promise<void>
  onUpdated: () => Promise<void>
  canWrite?: boolean
  canShare?: boolean
}) {
  const { data: groupsData } = useSWR('/api/groups', fetchShareGroups, { revalidateOnFocus: false })
  const [nameResult, setNameResult] = useState<{ signature: string; items: ItemName[] } | null>(null)
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [hasError, setHasError] = useState(false)
  const [query, setQuery] = useState('')
  const [historyItemId, setHistoryItemId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [diffNotice, setDiffNotice] = useState('')
  const [createdLink, setCreatedLink] = useState<{ id: string; itemId: string; url: string; qr: string; hasAccessCode: boolean } | null>(null)
  const [linkBusy, setLinkBusy] = useState(false)
  const [sharingItemId, setSharingItemId] = useState<string | null>(null)
  const [shareHandle, setShareHandle] = useState('')
  const [shareGroupId, setShareGroupId] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNotice, setShareNotice] = useState('')
  const [rotationBusy, setRotationBusy] = useState(false)
  const [rotationNotice, setRotationNotice] = useState('')
  const timers = useRef(new Map<string, number>())
  const signature = items.map((item) => `${item.id}:${item.encryptedPayload.version}`).join('|')
  const names = nameResult?.signature === signature ? nameResult.items : []

  useEffect(() => {
    let active = true
    const timerMap = timers.current
    void Promise.all(items.map(async (item) => {
      const meta = await decryptVaultItemMetadata(vaultId, item.id, item.encryptedPayload)
      return { id: item.id, name: meta.name, kind: meta.kind, meta, item }
    }))
      .then((decrypted) => { if (active) setNameResult({ signature, items: decrypted }) })
      .catch(() => { if (active) setHasError(true) })

    return () => {
      active = false
      for (const timer of timerMap.values()) window.clearTimeout(timer)
      timerMap.clear()
    }
  }, [items, signature, vaultId])

  async function handleReveal(item: Item) {
    if (revealed[item.id] !== undefined) {
      const timer = timers.current.get(item.id)
      if (timer) window.clearTimeout(timer)
      timers.current.delete(item.id)
      setRevealed((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
      return
    }

    try {
      const value = await decryptVaultItemValue(vaultId, item.id, item.encryptedPayload)
      setRevealed((current) => ({ ...current, [item.id]: value }))
      const previous = timers.current.get(item.id)
      if (previous) window.clearTimeout(previous)
      timers.current.set(item.id, window.setTimeout(() => {
        setRevealed((current) => {
          const next = { ...current }
          delete next[item.id]
          return next
        })
      }, 10_000))
    } catch {
      setHasError(true)
    }
  }

  async function handleEdit(entry: ItemName) {
    try {
      const value = await decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload)
      setEditing({ ...entry, value })
    } catch {
      setHasError(true)
    }
  }

  async function handleUpdated() {
    await onUpdated()
    setEditing(null)
  }

  async function persistMeta(entry: ItemName, patch: Partial<VaultItemMetadata>) {
    const value = await decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload, entry.kind)
    const nextVersion = entry.item.encryptedPayload.version + 1
    const payload = await encryptVaultItemPayload(
      vaultId, entry.id, nextVersion, patch.name ?? entry.name, value, entry.kind,
      entry.item.encryptedPayload.scopeKeyVersion ?? 1, entry.item.encryptedPayload.scopeKeyEnvelope,
      !entry.item.encryptedPayload.scopeKeyEnvelope,
      { ...entry.meta, ...patch },
    )
    const response = await fetch(`/api/vault-items/${entry.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vaultId, expectedVersion: entry.item.encryptedPayload.version, nextVersion,
        metadata: payload.metadata, value: payload.value,
      }),
    })
    if (!response.ok) throw new Error('Meta update failed.')
    await onUpdated()
  }

  async function toggleFavorite(entry: ItemName) {
    try { await persistMeta(entry, { favorite: !entry.meta.favorite }) }
    catch { setHasError(true) }
  }

  async function toggleArchive(entry: ItemName) {
    try { await persistMeta(entry, { archivedAt: entry.meta.archivedAt ? null : new Date().toISOString() }) }
    catch { setHasError(true) }
  }

  async function duplicate(entry: ItemName) {
    try {
      const value = await decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload, entry.kind)
      const id = crypto.randomUUID()
      const payload = await encryptVaultItemPayload(vaultId, id, 1, `${entry.name} (copie)`, value, entry.kind, 1, undefined, false, entry.meta)
      const response = await fetch('/api/vault-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, vaultId, encryptedPayload: payload }),
      })
      if (!response.ok) throw new Error('Duplicate failed.')
      await onUpdated()
    } catch { setHasError(true) }
  }

  async function compareRevision(entry: ItemName, revision: NonNullable<EncryptedVaultItem['history']>[number]) {
    setDiffNotice('Comparaison…')
    try {
      const [currentValue, oldValue] = await Promise.all([
        decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload, entry.kind),
        decryptVaultItemValue(vaultId, entry.id, { version: revision.version, metadata: revision.metadata, value: revision.value }, entry.kind),
      ])
      const same = await compareFingerprints(vaultId, entry.id, currentValue, oldValue)
      setDiffNotice(same ? 'Valeur identique.' : 'Valeur modifiée.')
    } catch { setDiffNotice('Comparaison impossible. Déverrouillez le coffre.') }
  }

  async function handleRestore(entry: ItemName, revision: NonNullable<EncryptedVaultItem['history']>[number]) {
    if (!window.confirm(`Restaurer la version ${revision.version} de « ${entry.name} » ? La version actuelle sera conservée dans l’historique.`)) return
    try {
      const previous = { version: revision.version, metadata: revision.metadata, value: revision.value }
      const [metadata, value] = await Promise.all([
        decryptVaultItemMetadata(vaultId, entry.id, previous),
        decryptVaultItemValue(vaultId, entry.id, previous, entry.kind),
      ])
      const nextVersion = entry.item.encryptedPayload.version + 1
      const payload = await encryptVaultItemPayload(vaultId, entry.id, nextVersion, metadata.name, value, metadata.kind, entry.item.encryptedPayload.scopeKeyVersion ?? 1, entry.item.encryptedPayload.scopeKeyEnvelope, !entry.item.encryptedPayload.scopeKeyEnvelope)
      const response = await fetch(`/api/vault-items/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          expectedVersion: entry.item.encryptedPayload.version,
          nextVersion,
          metadata: payload.metadata,
          value: payload.value,
        }),
      })
      if (!response.ok) throw new Error('Unable to restore revision.')
      await onUpdated()
      setHistoryItemId(null)
    } catch {
      setHasError(true)
    }
  }

  async function handleDelete(itemId: string, name: string) {
    if (!window.confirm(`Supprimer « ${name} » définitivement ?`)) return
    try {
      await onDelete(itemId)
    } catch {
      setHasError(true)
    }
  }

  async function handleCopy(item: Item) {
    try {
      const value = await decryptVaultItemValue(vaultId, item.id, item.encryptedPayload)
      await navigator.clipboard.writeText(value)
      setNotice('Copié. Le presse-papiers sera effacé dans 30 secondes si le navigateur l’autorise.')
      window.setTimeout(() => setNotice(''), 4000)
      window.setTimeout(async () => {
        try {
          if (await navigator.clipboard.readText() === value) await navigator.clipboard.writeText('')
        } catch {
          setNotice('')
        }
      }, 30_000)
    } catch {
      setHasError(true)
    }
  }

  async function handleCreatePrivateLink(entry: ItemName) {
    const promptedCode = window.prompt('Code d’accès facultatif (12 à 128 caractères). Laissez vide pour un lien sans code.')
    if (promptedCode === null) return
    const accessCode = promptedCode.trim()
    if (accessCode && (accessCode.length < 12 || accessCode.length > 128)) {
      setNotice('Le code d’accès doit contenir entre 12 et 128 caractères.')
      return
    }
    setLinkBusy(true)
    setCreatedLink(null)
    setNotice('')
    let keyBytes: Uint8Array | undefined
    let nonce: Uint8Array | undefined
    let plaintext: Uint8Array | undefined
    let ciphertext: Uint8Array | undefined
    let tokenBytes: Uint8Array | undefined
    try {
      const value = await decryptVaultItemValue(vaultId, entry.id, entry.item.encryptedPayload, entry.kind)
      keyBytes = randomBytes(32)
      tokenBytes = randomBytes(32)
      nonce = randomBytes(12)
      plaintext = new TextEncoder().encode(JSON.stringify({ name: entry.name, value, kind: entry.kind }))
      const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['encrypt'])
      ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(new TextEncoder().encode('wasp:private-share:v1')),
      }, key, toArrayBuffer(plaintext)))
      const token = encodeBase64Url(tokenBytes)
      const response = await fetch('/api/private-links', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token, vaultId, resourceId: entry.id,
          encryptedPayload: { v: 1, alg: 'A256GCM', nonce: encodeBase64Url(nonce), ct: encodeBase64Url(ciphertext) },
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), maxUses: 20,
          ...(accessCode ? { accessCode } : {}),
        }),
      })
      if (!response.ok) throw new Error('Impossible de créer ce lien privé.')
      const result = await response.json() as { id: string }
      const url = `${window.location.origin}/share/private/${token}#k=${encodeBase64Url(keyBytes)}`
      const qr = await QRCode.toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' })
      setCreatedLink({ id: result.id, itemId: entry.id, url, qr, hasAccessCode: Boolean(accessCode) })
    } catch (cause) {
      setHasError(true)
      setNotice(cause instanceof Error ? cause.message : 'Impossible de générer le lien privé.')
    } finally {
      if (keyBytes) wipeBytes(keyBytes)
      if (tokenBytes) wipeBytes(tokenBytes)
      if (nonce) wipeBytes(nonce)
      if (plaintext) wipeBytes(plaintext)
      if (ciphertext) wipeBytes(ciphertext)
      setLinkBusy(false)
    }
  }

  async function persistRotation(entry: ItemName, encryptedPayload: EncryptedVaultItem) {
    const expectedScopeKeyVersion = entry.item.encryptedPayload.scopeKeyVersion ?? 1
    const response = await fetch(`/api/vault-items/${entry.id}/rotate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vaultId, expectedVersion: entry.item.encryptedPayload.version, expectedScopeKeyVersion, encryptedPayload }),
    })
    if (!response.ok) throw new Error('La rotation n’a pas abouti. Rechargez les données puis réessayez.')
  }

  async function shareSecret(entry: ItemName) {
    const recipientHandle = shareHandle.trim().replace(/^@/, '').toLowerCase()
    const selectedGroup = groupsData?.groups.find((group) => group.id === shareGroupId)
    const targets = selectedGroup ? selectedGroup.members.flatMap((member) => member.handle ? [member.handle] : []) : recipientHandle ? [recipientHandle] : []
    if (!targets.length || shareBusy) { if (selectedGroup) setShareNotice('Ce groupe ne contient aucun membre avec un pseudo partageable.'); return }
    setShareBusy(true); setShareNotice('')
    let metadataKeyBytes: Uint8Array | undefined
    let secretKeyBytes: Uint8Array | undefined
    let sharePayload: Uint8Array | undefined
    try {
      let itemForShare = entry.item.encryptedPayload
      if (!itemForShare.scopeKeyEnvelope) {
        const nextScopeVersion = (itemForShare.scopeKeyVersion ?? 1) + 1
        itemForShare = await rotateVaultItemPayload(vaultId, entry.id, itemForShare, nextScopeVersion)
        await persistRotation(entry, itemForShare)
        await onUpdated()
      }
      const scopeKeys = await getVaultItemScopeKeys(vaultId, entry.id, itemForShare)
      metadataKeyBytes = scopeKeys.metadataKey
      secretKeyBytes = scopeKeys.secretKey
      sharePayload = new TextEncoder().encode(JSON.stringify({
        version: 1, resourceType: 'secret', resourceId: entry.id,
        scopeKeyVersion: itemForShare.scopeKeyVersion ?? 1,
        metadataKey: encodeBase64Url(metadataKeyBytes), secretKey: encodeBase64Url(secretKeyBytes),
      }))
      let sent = 0
      for (const targetHandle of targets) {
        let sealedPayload: Uint8Array | undefined
        try {
          const keyResponse = await fetch(`/api/users/${encodeURIComponent(targetHandle)}/keys`, { cache: 'no-store' })
          if (!keyResponse.ok) continue
          const recipient = await keyResponse.json() as { publicKeyX25519: string }
          sealedPayload = await sealDataForMember(sharePayload, decodeBase64Url(recipient.publicKeyX25519))
          const response = await fetch('/api/scoped-shares', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              vaultId, resourceId: entry.id, resourceType: 'secret', recipientHandle: targetHandle,
              groupId: selectedGroup?.id, keyVersion: itemForShare.scopeKeyVersion ?? 1,
              encryptedScopeKey: { v: 1, alg: 'X25519-SEAL', ct: encodeBase64Url(sealedPayload) },
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }),
          })
          if (response.ok) sent += 1
        } finally { sealedPayload?.fill(0) }
      }
      if (!sent) throw new Error('Aucune invitation n’a été créée. Vérifiez les clés des destinataires et les adhésions au groupe.')
      const audience = selectedGroup ? `aux membres actuels de « ${selectedGroup.name} »` : `à @${recipientHandle}`
      setShareNotice(`Invitation envoyée ${audience} (${sent}/${targets.length}). Elle expire dans 30 jours et ne donne accès qu’à ce secret.`)
      setShareHandle(''); setShareGroupId(''); setSharingItemId(null)
    } catch (cause) { setShareNotice(cause instanceof Error ? cause.message : 'Impossible de partager ce secret.') }
    finally {
      metadataKeyBytes?.fill(0); secretKeyBytes?.fill(0); sharePayload?.fill(0)
      setShareBusy(false)
    }
  }

  async function revokePrivateLink() {
    if (!createdLink) return
    if (!window.confirm('Révoquer ce lien maintenant ? Les anciennes copies déjà consultées ne peuvent pas être effacées.')) return
    setLinkBusy(true)
    try {
      const response = await fetch(`/api/private-links/${createdLink.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de révoquer ce lien.')
      setCreatedLink(null)
      setNotice('Lien révoqué. Toute consultation future est bloquée.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'La révocation a échoué.') }
    finally { setLinkBusy(false) }
  }

  async function migrateLegacyScopeKeys() {
    const pending = names.filter(({ item }) => !item.encryptedPayload.scopeKeyEnvelope)
    if (!pending.length || rotationBusy) return
    if (!window.confirm(`Migrer ${pending.length} élément(s) vers des clés aléatoires indépendantes, rechiffrer leur historique et invalider leurs anciens partages/liens ? La migration s’exécute dans ce navigateur avec le coffre déverrouillé et peut être reprise si elle est interrompue.`)) return
    setRotationBusy(true); setRotationNotice('')
    let completed = 0
    try {
      for (const entry of pending) {
        const currentKeyVersion = entry.item.encryptedPayload.scopeKeyVersion ?? 1
        const encryptedPayload = await rotateVaultItemPayload(vaultId, entry.id, entry.item.encryptedPayload, currentKeyVersion + 1)
        await persistRotation(entry, encryptedPayload)
        completed += 1
        setRotationNotice(`Migration en cours : ${completed}/${pending.length}.`)
      }
      setRotationNotice(`${completed} élément(s) migré(s). Les clés sont aléatoires, scellées au coffre et distinctes par objet.`)
    } catch (cause) {
      setRotationNotice(`${completed} élément(s) migré(s). La migration peut reprendre après actualisation. ${cause instanceof Error ? cause.message : ''}`)
    } finally { await onUpdated(); setRotationBusy(false) }
  }

  async function rotateSecretScope(entry: ItemName) {
    if (rotationBusy) return
    const currentKeyVersion = entry.item.encryptedPayload.scopeKeyVersion ?? 1
    const confirmed = window.confirm('Renouveler la clé de ce secret et rechiffrer tout son historique ? Tous les partages limités et liens privés actifs de ce secret seront révoqués. Les copies déjà consultées ou téléchargées ne peuvent pas être effacées. Remplacez aussi l’identifiant chez son fournisseur si nécessaire.')
    if (!confirmed) return
    setRotationBusy(true); setRotationNotice('')
    try {
      const encryptedPayload = await rotateVaultItemPayload(vaultId, entry.id, entry.item.encryptedPayload, currentKeyVersion + 1)
      await persistRotation(entry, encryptedPayload)
      await onUpdated()
      setRotationNotice('Clé renouvelée, historique rechiffré et anciens partages/liens révoqués.')
    } catch (cause) { setRotationNotice(cause instanceof Error ? cause.message : 'Impossible de renouveler cette clé.') }
    finally { setRotationBusy(false) }
  }

  async function handleExport(item: ItemName) {
    if (!window.confirm('Le fichier téléchargé contiendra vos valeurs en clair. Continuer ?')) return
    try {
      const source = await decryptVaultItemValue(vaultId, item.id, item.item.encryptedPayload, 'env-file')
      const filename = /^\.env(?:\.[A-Za-z0-9._-]+)?$/.test(item.name) ? item.name : '.env.local'
      const file = new Blob([source], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setHasError(true)
    }
  }

  const filteredNames = names.filter(({ name, meta }) =>
    (!meta.archivedAt || showArchived) && name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const legacyItemCount = names.filter(({ item }) => !item.encryptedPayload.scopeKeyEnvelope).length

  if (items.length === 0) return <Text className="wasp-empty-note">Aucun secret pour le moment. Les noms et les valeurs ne quittent jamais votre navigateur en clair.</Text>

  return (
    <div className="wasp-secret-list" aria-live="polite">
      {canWrite && canShare && legacyItemCount > 0 && <div className="wasp-vault-card"><Text>Des éléments utilisent encore le format historique. Migrez-les dans ce navigateur pour créer une clé aléatoire enveloppée séparément par élément, et rechiffrer aussi l’historique.</Text><Button variant="primary" disabled={rotationBusy} onClick={() => void migrateLegacyScopeKeys()}>{rotationBusy ? 'Migration…' : `Isoler les clés restantes (${legacyItemCount})`}</Button></div>}
      <label className="wasp-field">
        <span>Rechercher dans les noms des secrets</span>
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du secret…" aria-label="Rechercher dans les noms des secrets" autoComplete="off" />
      </label>
      <label className="wasp-field"><span>Afficher les secrets archivés</span><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /></label>
      {hasError && <Text role="alert" className="wasp-auth-error">Un élément ne peut pas être déchiffré ou restauré. Vérifiez que le coffre est déverrouillé et réessayez.</Text>}
      {notice && <Text role="status" className="wasp-copy-notice">{notice}</Text>}
      {rotationNotice && <Text role="status" className="wasp-copy-notice">{rotationNotice}</Text>}
      {diffNotice && <Text role="status" className="wasp-copy-notice">{diffNotice}</Text>}
      {filteredNames.length === 0 && <Text className="wasp-empty-note">Aucun secret ne correspond à cette recherche.</Text>}
      {filteredNames.map(({ id, name, kind, meta, item }) => (
        <article className="wasp-secret-row" key={id}>
          {editing?.id === id ? (
            <VaultItemEditor
              vaultId={vaultId}
              item={item}
              initialName={editing.name}
              initialValue={editing.value}
              initialMeta={editing.meta}
              onCancel={() => setEditing(null)}
              onSaved={handleUpdated}
            />
          ) : (
            <>
              <div className="wasp-secret-row-copy">
                <strong>{meta.favorite ? '★ ' : ''}{name}</strong>
                <Text size="small">{meta.category} · {kind === 'env-file' ? 'Fichier chiffré' : `Version ${item.encryptedPayload.version}`}{meta.tags.length ? ` · ${meta.tags.join(', ')}` : ''}{meta.archivedAt ? ' · Archivé' : ''}</Text>
                {meta.description && <Text size="small">{meta.description}</Text>}
                {kind === 'secret' && <code>{revealed[id] ?? '••••••••'}</code>}
              </div>
              <div className="wasp-secret-actions">
                {kind === 'env-file' ? (
                  <Button variant="invisible" onClick={() => void handleExport({ id, name, kind, meta, item })} aria-label={`Exporter ${name}`}>
                    Exporter .env
                  </Button>
                ) : (
                  <>
                    {canWrite && <Button variant="invisible" onClick={() => void toggleFavorite({ id, name, kind, meta, item })} aria-label={meta.favorite ? `Retirer ${name} des favoris` : `Ajouter ${name} aux favoris`}>{meta.favorite ? '★' : '☆'}</Button>}
                    {canWrite && <Button variant="invisible" onClick={() => void duplicate({ id, name, kind, meta, item })} aria-label={`Dupliquer ${name}`}>Dupliquer</Button>}
                    {canWrite && <Button variant="invisible" onClick={() => void toggleArchive({ id, name, kind, meta, item })} aria-label={meta.archivedAt ? `Restaurer ${name}` : `Archiver ${name}`}>{meta.archivedAt ? 'Restaurer' : 'Archiver'}</Button>}
                    {canWrite && <Button variant="invisible" onClick={() => void handleEdit({ id, name, kind, meta, item })} aria-label={`Modifier ${name}`}>Modifier</Button>}
                    <Button variant="invisible" onClick={() => void handleReveal(item)} aria-label={`Révéler ${name}`}>
                      {revealed[id] === undefined ? 'Révéler 10 s' : 'Masquer'}
                    </Button>
                    <Button variant="invisible" onClick={() => void handleCopy(item)} aria-label={`Copier ${name}`}>Copier</Button>
                    {canWrite && canShare && kind === 'secret' && <Button variant="invisible" disabled={shareBusy} onClick={() => { setSharingItemId(sharingItemId === id ? null : id); setShareNotice('') }}>Partager ce secret</Button>}
                    {canWrite && canShare && kind === 'secret' && <Button variant="invisible" disabled={rotationBusy} onClick={() => void rotateSecretScope({ id, name, kind, meta, item })}>Renouveler la clé</Button>}
                    <Button variant="invisible" disabled={linkBusy} onClick={() => void handleCreatePrivateLink({ id, name, kind, meta, item })}>Lien privé + QR</Button>
                  </>
                )}
                {canWrite && <Button variant="invisible" onClick={() => void handleDelete(id, name)} aria-label={`Supprimer ${name}`}>Supprimer</Button>}
              </div>
              {sharingItemId === id && canShare && (
                <div className="wasp-version-history">
                  <Text size="small">Partage en lecture seule, chiffré pour chaque destinataire, sans transmettre la clé du coffre. L’invitation expire dans 30 jours. Un groupe inclut ses membres actuels; partagez à nouveau après tout changement de membres.</Text>
                  <label className="wasp-field"><span>Destinataire</span><select value={shareGroupId} onChange={(event) => setShareGroupId(event.target.value)} aria-label="Destinataire du secret"><option value="">Une personne</option>{groupsData?.groups.map((group) => <option key={group.id} value={group.id}>Groupe : {group.name} ({group.members.length})</option>)}</select></label>
                  {!shareGroupId && <label className="wasp-field"><span>Pseudo de la personne</span><TextInput value={shareHandle} onChange={(event) => setShareHandle(event.target.value)} placeholder="ex. alice" autoComplete="off" maxLength={33} /></label>}
                  <div className="wasp-inline-action"><Button variant="primary" disabled={shareBusy || (!shareGroupId && !shareHandle.trim())} onClick={() => void shareSecret({ id, name, kind, meta, item })}>{shareBusy ? 'Envoi…' : 'Envoyer l’invitation'}</Button><Button variant="invisible" disabled={shareBusy} onClick={() => setSharingItemId(null)}>Annuler</Button></div>
                  {shareNotice && <Text role="status">{shareNotice}</Text>}
                </div>
              )}
              {createdLink?.itemId === id && (
                <div className="wasp-version-history" aria-live="polite">
                  <Text size="small">Lien en lecture seule · expire dans 7 jours · maximum 20 ouvertures · {createdLink.hasAccessCode ? 'code d’accès activé (partagez-le séparément du lien)' : 'sans code d’accès'}. La clé privée se trouve uniquement dans le fragment de l’URL.</Text>
                  <Image src={createdLink.qr} alt={`Code QR du lien privé pour ${name}`} width={220} height={220} unoptimized />
                  <label className="wasp-field"><span>Lien privé (à transmettre uniquement à la personne concernée)</span><TextInput value={createdLink.url} readOnly aria-label={`Lien privé pour ${name}`} /></label>
                  <div className="wasp-inline-action"><Button onClick={async () => { await navigator.clipboard.writeText(createdLink.url); setNotice('Lien privé copié.') }}>Copier le lien</Button><Button variant="danger" disabled={linkBusy} onClick={() => void revokePrivateLink()}>Révoquer le lien</Button></div>
                </div>
              )}
              {canWrite && (item.encryptedPayload.history?.length ?? 0) > 0 && (
                <div className="wasp-version-history">
                  <Button
                    variant="invisible"
                    aria-expanded={historyItemId === id}
                    onClick={() => setHistoryItemId(historyItemId === id ? null : id)}
                  >
                    Versions précédentes ({item.encryptedPayload.history?.length})
                  </Button>
                  {historyItemId === id && (
                    <ul aria-label={`Versions précédentes de ${name}`}>
                      {[...(item.encryptedPayload.history ?? [])].reverse().map((revision) => (
                        <li key={`${id}-${revision.version}`}>
                          <Text size="small">Version {revision.version} · {new Date(revision.createdAt).toLocaleString('fr-FR')}</Text>
                          <Button variant="invisible" onClick={() => void compareRevision({ id, name, kind, meta, item }, revision)}>Comparer</Button>
                          <Button variant="default" onClick={() => void handleRestore({ id, name, kind, meta, item }, revision)}>
                            Restaurer
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </div>
  )
}
