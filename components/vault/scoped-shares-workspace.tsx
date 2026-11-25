'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decodeBase64Url, wipeBytes } from '@/src/crypto/encoding'
import { decryptBytes, importAesKey } from '@/src/crypto/aead'
import { openSealedData } from '@/src/crypto/keys'
import { recoverIdentityPrivateKeys, unlockIdentityPrivateKeys } from '@/src/crypto/identity-material'
import { decryptVaultItemMetadataWithScopeKey, decryptVaultItemValueWithScopeKey } from '@/src/crypto/vault-items'
import type { EncryptedVaultItem } from '@/src/crypto/vault-key'

type Share = { id: string; vaultId: string; resourceId: string; keyVersion: number; resourceType: 'secret' | 'project'; encryptedScopeKey?: { v: 1; alg: 'X25519-SEAL'; ct: string }; status: 'pending' | 'accepted' | 'revoked'; expiresAt: string | null; ownerHandle?: string | null; recipientHandle?: string | null }
type SecretScopeKeys = { type: 'secret'; metadataKey: Uint8Array; secretKey: Uint8Array }
type ProjectScopeKeys = { type: 'project'; projectMetadataKey: Uint8Array; environments: Record<string, { metadataKey: Uint8Array; fileKey: Uint8Array }> }
type ScopeKeys = SecretScopeKeys | ProjectScopeKeys
type SharedItem = { encryptedPayload: EncryptedVaultItem; vaultId: string; resourceId: string; keyVersion: number; resourceType: 'secret' }
type SharedProject = {
  project: { id: string; vaultId: string; encryptedMetadata: { v: 1; alg: 'A256GCM'; nonce: string; ct: string }; environments: Array<{
    id: string; kind: string; encryptedMetadata: { v: 1; alg: 'A256GCM'; nonce: string; ct: string }; envFile: null | { encryptedLayout: { v: 1; alg: 'A256GCM'; nonce: string; ct: string }; version: number }
  }> }
  vaultId: string; resourceId: string; keyVersion: number; resourceType: 'project'
}

async function fetchScopes(url: string): Promise<{ incoming: Share[]; outgoing: Share[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les partages limités.')
  return response.json() as Promise<{ incoming: Share[]; outgoing: Share[] }>
}

async function fetchSharedItem(shareId: string): Promise<SharedItem> {
  const response = await fetch(`/api/scoped-shares/${shareId}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Ce partage a expiré ou a été révoqué.')
  return response.json() as Promise<SharedItem>
}

async function fetchSharedProject(shareId: string): Promise<SharedProject> {
  const response = await fetch(`/api/scoped-shares/${shareId}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Ce partage a expiré ou a été révoqué.')
  return response.json() as Promise<SharedProject>
}

function SharedSecretCard({ share, keys }: { share: Share; keys: SecretScopeKeys }) {
  const [item, setItem] = useState<SharedItem | null>(null)
  const [name, setName] = useState('')
  const [value, setValue] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function openSecret() {
    setBusy(true); setNotice('')
    try {
      const result = await fetchSharedItem(share.id)
      if (result.keyVersion !== share.keyVersion || (result.encryptedPayload.scopeKeyVersion ?? 1) !== share.keyVersion) throw new Error('Cette enveloppe de partage ne correspond plus à la version actuelle du secret.')
      const metadata = await decryptVaultItemMetadataWithScopeKey(result.vaultId, result.resourceId, result.encryptedPayload, keys.metadataKey)
      const secretValue = await decryptVaultItemValueWithScopeKey(result.vaultId, result.resourceId, result.encryptedPayload, keys.secretKey, metadata.kind)
      setItem(result); setName(metadata.name); setValue(secretValue)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible de déchiffrer ce secret.') }
    finally { setBusy(false) }
  }

  return <article className="wasp-vault-card">
    <div className="wasp-vault-panel-heading"><div><Heading as="h3">{name || 'Secret partagé'}</Heading><Text size="small">Lecture seule · accès limité à un secret</Text></div><Button disabled={busy} onClick={() => void openSecret()}>{busy ? 'Déchiffrement…' : value === null ? 'Ouvrir dans ce navigateur' : 'Recharger'}</Button></div>
    {value !== null && item && <div className="wasp-secret-row-copy"><Text>{name}</Text><code>{value}</code><Button onClick={async () => { await navigator.clipboard.writeText(value); setNotice('Copié dans le presse-papiers.') }}>Copier</Button></div>}
    {notice && <Text role="status">{notice}</Text>}
  </article>
}

function SharedProjectCard({ share, keys }: { share: Share; keys: ProjectScopeKeys }) {
  const [project, setProject] = useState<SharedProject | null>(null)
  const [projectName, setProjectName] = useState('')
  const [environmentNames, setEnvironmentNames] = useState<Record<string, string>>({})
  const [envValues, setEnvValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function decryptName(vaultId: string, objectId: string, objectType: string, blob: SharedProject['project']['encryptedMetadata'], keyBytes: Uint8Array) {
    const key = await importAesKey(keyBytes, ['decrypt'])
    const bytes = await decryptBytes(key, blob, { vaultId, objectType, objectId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : 'Sans nom'
    } finally { wipeBytes(bytes) }
  }

  async function openProject() {
    setBusy(true); setNotice('')
    try {
      const result = await fetchSharedProject(share.id)
      if (result.resourceType !== 'project' || result.keyVersion !== share.keyVersion || result.resourceId !== share.resourceId || result.keyVersion !== 1) throw new Error('Cette enveloppe ne correspond plus au projet partagé.')
      const name = await decryptName(result.vaultId, result.project.id, 'project-meta', result.project.encryptedMetadata, keys.projectMetadataKey)
      const names = await Promise.all(result.project.environments.map(async (environment) => {
        const scope = keys.environments[environment.id]
        if (!scope) return null
        return [environment.id, await decryptName(result.vaultId, environment.id, 'environment-meta', environment.encryptedMetadata, scope.metadataKey)] as const
      }))
      setProject(result); setProjectName(name); setEnvironmentNames(Object.fromEntries(names.filter((entry): entry is readonly [string, string] => entry !== null)))
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible de déchiffrer ce projet.') }
    finally { setBusy(false) }
  }

  async function toggleEnvFile(environment: SharedProject['project']['environments'][number]) {
    if (envValues[environment.id] !== undefined) {
      setEnvValues((current) => { const next = { ...current }; delete next[environment.id]; return next })
      return
    }
    const scope = keys.environments[environment.id]
    if (!scope || !environment.envFile) return
    setBusy(true); setNotice('')
    try {
      const key = await importAesKey(scope.fileKey, ['decrypt'])
      const bytes = await decryptBytes(key, environment.envFile.encryptedLayout, { vaultId: share.vaultId, objectType: 'env-file', objectId: environment.id, version: environment.envFile.version })
      try { setEnvValues((current) => ({ ...current, [environment.id]: new TextDecoder('utf-8', { fatal: true }).decode(bytes) })) }
      finally { wipeBytes(bytes) }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible de déchiffrer ce fichier .env.') }
    finally { setBusy(false) }
  }

  return <article className="wasp-vault-card">
    <div className="wasp-vault-panel-heading"><div><Heading as="h3">{projectName || 'Projet partagé'}</Heading><Text size="small">Lecture seule · projet et environnements</Text></div><Button disabled={busy} onClick={() => void openProject()}>{busy ? 'Déchiffrement…' : project ? 'Actualiser' : 'Ouvrir le projet'}</Button></div>
    {project && <ul className="wasp-environment-list">{project.project.environments.filter((environment) => keys.environments[environment.id]).map((environment) => <li key={environment.id}><div><Text>{environmentNames[environment.id] ?? 'Environnement'}</Text><Text size="small">{environment.kind}{environment.envFile ? ' · fichier .env chiffré' : ' · aucun fichier .env'}</Text></div>{environment.envFile && <Button disabled={busy} onClick={() => void toggleEnvFile(environment)}>{envValues[environment.id] !== undefined ? 'Masquer' : 'Ouvrir le fichier .env'}</Button>}{envValues[environment.id] !== undefined && <pre className="wasp-shared-env-file">{envValues[environment.id]}</pre>}</li>)}</ul>}
    {notice && <Text role="status">{notice}</Text>}
  </article>
}

function wipeOpenedKeys(keys: ScopeKeys) {
  if (keys.type === 'secret') { wipeBytes(keys.metadataKey); wipeBytes(keys.secretKey); return }
  wipeBytes(keys.projectMetadataKey)
  for (const environment of Object.values(keys.environments)) { wipeBytes(environment.metadataKey); wipeBytes(environment.fileKey) }
}

export function ScopedSharesWorkspace() {
  const { data, error, isLoading, mutate } = useSWR('/api/scoped-shares', fetchScopes, { revalidateOnFocus: false })
  const [unlockPassphrase, setUnlockPassphrase] = useState('')
  const [unlockMode, setUnlockMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [scopeKeys, setScopeKeys] = useState<Record<string, ScopeKeys>>({})
  const scopeKeysRef = useRef(scopeKeys)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => { scopeKeysRef.current = scopeKeys }, [scopeKeys])
  useEffect(() => () => { for (const keys of Object.values(scopeKeysRef.current)) wipeOpenedKeys(keys) }, [])

  async function accept(shareId: string) {
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/scoped-shares/${shareId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!response.ok) throw new Error('Invitation expirée ou inaccessible.')
      await mutate(); setNotice('Invitation acceptée. Déverrouillez votre identité pour consulter les données partagées.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible d’accepter le partage.') }
    finally { setBusy(false) }
  }

  async function unlockShares() {
    const accepted = data?.incoming.filter((share) => share.status === 'accepted' && !scopeKeys[share.id]) ?? []
    if (!accepted.length) return
    setBusy(true); setNotice('')
    let identity: Awaited<ReturnType<typeof unlockIdentityPrivateKeys>> | undefined
    const opened: Record<string, ScopeKeys> = {}
    try {
      const response = await fetch('/api/me/keys?includeEncrypted=1', { cache: 'no-store' })
      if (!response.ok) throw new Error('Configurez vos clés de partage avant de déverrouiller ces données.')
      const material = await response.json()
      identity = unlockMode === 'recovery' ? await recoverIdentityPrivateKeys(unlockPassphrase, material) : await unlockIdentityPrivateKeys(unlockPassphrase, material)
      for (const share of accepted) {
        if (!share.encryptedScopeKey) continue
        const payload = await openSealedData(decodeBase64Url(share.encryptedScopeKey.ct), identity.publicKeyX25519, identity.privateKeyX25519)
        try {
          const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)) as Record<string, unknown>
          if (parsed.version !== 1 || parsed.resourceType !== share.resourceType || parsed.resourceId !== share.resourceId) continue
          if (share.resourceType === 'secret') {
            if (parsed.scopeKeyVersion !== share.keyVersion || typeof parsed.metadataKey !== 'string' || typeof parsed.secretKey !== 'string') continue
            const metadataKey = decodeBase64Url(parsed.metadataKey)
            const secretKey = decodeBase64Url(parsed.secretKey)
            if (metadataKey.length !== 32 || secretKey.length !== 32) { wipeBytes(metadataKey); wipeBytes(secretKey); continue }
            opened[share.id] = { type: 'secret', metadataKey, secretKey }
            continue
          }
          if (share.keyVersion !== 1 || typeof parsed.projectMetadataKey !== 'string' || !Array.isArray(parsed.environments) || parsed.environments.length > 20) continue
          const projectMetadataKey = decodeBase64Url(parsed.projectMetadataKey)
          const environments: ProjectScopeKeys['environments'] = {}
          let valid = projectMetadataKey.length === 32
          for (const entry of parsed.environments) {
            if (!entry || typeof entry !== 'object') { valid = false; break }
            const environment = entry as Record<string, unknown>
            if (typeof environment.environmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(environment.environmentId) || typeof environment.metadataKey !== 'string' || typeof environment.fileKey !== 'string' || environments[environment.environmentId]) { valid = false; break }
            const metadataKey = decodeBase64Url(environment.metadataKey)
            const fileKey = decodeBase64Url(environment.fileKey)
            if (metadataKey.length !== 32 || fileKey.length !== 32) { wipeBytes(metadataKey); wipeBytes(fileKey); valid = false; break }
            environments[environment.environmentId] = { metadataKey, fileKey }
          }
          if (!valid) { wipeBytes(projectMetadataKey); for (const keys of Object.values(environments)) { wipeBytes(keys.metadataKey); wipeBytes(keys.fileKey) }; continue }
          opened[share.id] = { type: 'project', projectMetadataKey, environments }
        } finally { wipeBytes(payload) }
      }
      setScopeKeys((current) => ({ ...current, ...opened }))
      setUnlockPassphrase('')
      setNotice(Object.keys(opened).length ? `${Object.keys(opened).length} partage(s) déverrouillé(s) dans cet onglet.` : 'Aucun partage n’a pu être déverrouillé avec ces clés.')
    } catch (cause) {
      for (const keys of Object.values(opened)) wipeOpenedKeys(keys)
      setNotice(cause instanceof Error ? cause.message : 'Impossible de déverrouiller ces partages.')
    } finally {
      identity?.privateKeyX25519.fill(0); identity?.privateKeyEd25519.fill(0); identity?.publicKeyX25519.fill(0); identity?.publicKeyEd25519.fill(0)
      setBusy(false)
    }
  }

  async function revoke(shareId: string) {
    if (!window.confirm('Révoquer ce partage ? Le destinataire ne pourra plus télécharger le secret, mais aucune copie déjà lue ne peut être récupérée.')) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/scoped-shares/${shareId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de révoquer ce partage.')
      await mutate(); setNotice('Partage révoqué pour les prochaines consultations. Envisagez de remplacer le secret chez le fournisseur : la valeur déjà vue ne peut pas être effacée.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'La révocation a échoué.') }
    finally { setBusy(false) }
  }

  const acceptedCount = data?.incoming.filter((share) => share.status === 'accepted').length ?? 0
  return <section className="wasp-vault-card" aria-labelledby="scoped-shares-title">
    <Text className="wasp-eyebrow">PARTAGES À PORTÉE LIMITÉE</Text><Heading as="h2" id="scoped-shares-title">Partagés avec vous</Heading>
    <Text>Chaque invitation scelle uniquement les clés dérivées du projet ou du secret choisi; la clé maîtresse du coffre n’est jamais transmise.</Text>
    {acceptedCount > 0 && <div className="wasp-inline-action"><label className="wasp-field"><span>Déverrouiller avec</span><select value={unlockMode} onChange={(event) => setUnlockMode(event.target.value as 'passphrase' | 'recovery')} aria-label="Mode de déverrouillage des partages ciblés"><option value="passphrase">Phrase de clés de partage</option><option value="recovery">Clé de récupération</option></select></label><label className="wasp-field"><span>{unlockMode === 'passphrase' ? 'Phrase secrète de vos clés de partage' : 'Clé de récupération'}</span><TextInput type={unlockMode === 'passphrase' ? 'password' : 'text'} value={unlockPassphrase} onChange={(event) => setUnlockPassphrase(event.target.value)} autoComplete="off" /></label><Button variant="primary" disabled={busy || unlockPassphrase.length < (unlockMode === 'passphrase' ? 12 : 43)} onClick={() => void unlockShares()}>{busy ? 'Déverrouillage…' : 'Déverrouiller les partages'}</Button></div>}
    {notice && <Text role="status">{notice}</Text>}{isLoading && <Text role="status">Chargement des invitations…</Text>}{error && <Text role="alert">Impossible de charger les invitations ciblées.</Text>}
    {data?.incoming.map((share) => <article className="wasp-vault-card" key={share.id}><div className="wasp-vault-panel-heading"><div><Heading as="h3">{share.resourceType === 'project' ? 'Projet' : 'Secret'} de @{share.ownerHandle ?? 'membre'}</Heading><Text size="small">{share.status === 'pending' ? 'Invitation en attente' : share.status === 'revoked' ? 'Révoquée' : 'Acceptée'} · {share.expiresAt ? `expire ${new Date(share.expiresAt).toLocaleDateString('fr-FR')}` : 'sans expiration'}</Text></div>{share.status === 'pending' && <Button variant="primary" disabled={busy} onClick={() => void accept(share.id)}>Accepter</Button>}</div>{share.status === 'accepted' && share.resourceType === 'secret' && scopeKeys[share.id]?.type === 'secret' && <SharedSecretCard share={share} keys={scopeKeys[share.id] as SecretScopeKeys} />}{share.status === 'accepted' && share.resourceType === 'project' && scopeKeys[share.id]?.type === 'project' && <SharedProjectCard share={share} keys={scopeKeys[share.id] as ProjectScopeKeys} />}</article>)}
    {data?.outgoing.map((share) => <div className="wasp-security-row" key={share.id}><div><Text>{share.resourceType === 'project' ? 'Projet' : 'Secret'} partagé avec @{share.recipientHandle ?? 'utilisateur'}</Text><Text size="small">{share.status === 'accepted' ? 'Accepté' : share.status === 'revoked' ? 'Révoqué' : 'En attente'} · {share.expiresAt ? `expire ${new Date(share.expiresAt).toLocaleDateString('fr-FR')}` : 'sans expiration'}</Text></div>{share.status !== 'revoked' && <Button variant="danger" disabled={busy} onClick={() => void revoke(share.id)}>Révoquer</Button>}</div>)}
    {data && data.incoming.length === 0 && data.outgoing.length === 0 && <Text>Aucun partage limité pour le moment.</Text>}
  </section>
}
