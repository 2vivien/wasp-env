'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decodeBase64Url, encodeBase64Url } from '@/src/crypto/encoding'
import {
  decryptBytes,
  deriveObjectKey,
  deriveObjectKeyBytes,
  encryptBytes,
  importRootKey,
} from '@/src/crypto/aead'
import { sealDataForMember } from '@/src/crypto/keys'
import { withKey } from '@/src/crypto/key-store'

type Blob = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }
type ProjectRow = { id: string; vaultId: string; encryptedMetadata: Blob; updatedAt: string }
type EnvironmentRow = {
  id: string
  projectId: string
  vaultId: string
  kind: string
  encryptedMetadata: Blob
  version: number
}
type ProjectShareGroup = {
  id: string
  name: string
  members: Array<{ userId: string; handle: string | null }>
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les projets.')
  return response.json() as Promise<T>
}

async function encryptName(
  vaultId: string,
  objectId: string,
  objectType: string,
  name: string,
): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify({ name }))
  try {
    return await withKey(vaultId, async (rawKey) => {
      const root = await importRootKey(rawKey)
      const key = await deriveObjectKey(root, 'metadata', objectId)
      return encryptBytes(key, bytes, { vaultId, objectType, objectId, version: 1 })
    })
  } finally {
    bytes.fill(0)
  }
}

async function decryptName(
  vaultId: string,
  objectId: string,
  objectType: string,
  blob: Blob,
): Promise<string> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'metadata', objectId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType, objectId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : 'Sans nom'
    } finally {
      bytes.fill(0)
    }
  })
}

export function ProjectsWorkspace({ vaults }: { vaults: Array<{ id: string }> }) {
  const { data, error, isLoading, mutate } = useSWR<{ projects: ProjectRow[] }>(
    '/api/projects',
    requestJson,
    { revalidateOnFocus: false },
  )
  const { data: groupsData } = useSWR<{ groups: ProjectShareGroup[] }>('/api/groups', requestJson, {
    revalidateOnFocus: false,
  })
  const [names, setNames] = useState<Record<string, string>>({})
  const [projectName, setProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null)
  const [environmentNameDraft, setEnvironmentNameDraft] = useState('')
  const [environmentNames, setEnvironmentNames] = useState<Record<string, string>>({})
  const [decryptedEnvironments, setDecryptedEnvironments] = useState<
    Record<string, Array<{ id: string; name: string }>>
  >({})
  const [sharingProjectId, setSharingProjectId] = useState<string | null>(null)
  const [shareHandle, setShareHandle] = useState('')
  const [shareGroupId, setShareGroupId] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadEnvironmentNames(project: ProjectRow) {
    const response = await requestJson<{ environments: EnvironmentRow[] }>(
      `/api/projects/${project.id}/environments`,
    )
    const mapped = await Promise.all(
      response.environments.map(async (environment) => ({
        ...environment,
        name: await decryptName(
          environment.vaultId,
          environment.id,
          'environment-meta',
          environment.encryptedMetadata,
        ),
      })),
    )
    return mapped
  }

  async function shareProject(project: ProjectRow) {
    const recipientHandle = shareHandle.trim().replace(/^@/, '').toLowerCase()
    const selectedGroup = groupsData?.groups.find((group) => group.id === shareGroupId)
    const targets = selectedGroup
      ? selectedGroup.members.flatMap((member) => (member.handle ? [member.handle] : []))
      : recipientHandle
        ? [recipientHandle]
        : []
    if (!targets.length || shareBusy) {
      if (selectedGroup)
        setShareNotice('Ce groupe ne contient aucun membre avec un pseudo partageable.')
      return
    }
    setShareBusy(true)
    setShareNotice('')
    let projectMetadataKey: Uint8Array | undefined
    let environmentKeys: Array<{
      environmentId: string
      metadataKey: Uint8Array
      fileKey: Uint8Array
    }> = []
    let plaintext: Uint8Array | undefined
    try {
      const environments = await requestJson<{ environments: EnvironmentRow[] }>(
        `/api/projects/${project.id}/environments`,
      )
      if (environments.environments.length > 20)
        throw new Error(
          'Un partage de projet est limité à 20 environnements; réduisez leur nombre avant de partager.',
        )
      const keyBundle = await withKey(project.vaultId, async (rootKey) => {
        const projectMetadataKey = await deriveObjectKeyBytes(rootKey, 'metadata', project.id)
        const environmentKeys = await Promise.all(
          environments.environments.map(async (environment) => ({
            environmentId: environment.id,
            metadataKey: await deriveObjectKeyBytes(rootKey, 'metadata', environment.id),
            fileKey: await deriveObjectKeyBytes(rootKey, 'secret', environment.id),
          })),
        )
        return { projectMetadataKey, environmentKeys }
      })
      projectMetadataKey = keyBundle.projectMetadataKey
      environmentKeys = keyBundle.environmentKeys
      plaintext = new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          resourceType: 'project',
          resourceId: project.id,
          projectMetadataKey: encodeBase64Url(projectMetadataKey),
          environments: environmentKeys.map((environment) => ({
            environmentId: environment.environmentId,
            metadataKey: encodeBase64Url(environment.metadataKey),
            fileKey: encodeBase64Url(environment.fileKey),
          })),
        }),
      )
      let sent = 0
      for (const targetHandle of targets) {
        let sealed: Uint8Array | undefined
        try {
          const keyResponse = await fetch(`/api/users/${encodeURIComponent(targetHandle)}/keys`, {
            cache: 'no-store',
          })
          if (!keyResponse.ok) continue
          const recipient = (await keyResponse.json()) as { publicKeyX25519: string }
          sealed = await sealDataForMember(plaintext, decodeBase64Url(recipient.publicKeyX25519))
          const response = await fetch('/api/scoped-shares', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              vaultId: project.vaultId,
              resourceId: project.id,
              resourceType: 'project',
              recipientHandle: targetHandle,
              groupId: selectedGroup?.id,
              keyVersion: 1,
              encryptedScopeKey: { v: 1, alg: 'X25519-SEAL', ct: encodeBase64Url(sealed) },
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }),
          })
          if (response.ok) sent += 1
        } finally {
          sealed?.fill(0)
        }
      }
      if (!sent)
        throw new Error(
          'Aucune invitation n’a été créée. Vérifiez les clés des destinataires et les adhésions au groupe.',
        )
      const audience = selectedGroup
        ? `aux membres actuels de « ${selectedGroup.name} »`
        : `à @${recipientHandle}`
      setShareNotice(
        `Invitation envoyée ${audience} (${sent}/${targets.length}). Elle expire dans 30 jours.`,
      )
      setShareHandle('')
      setShareGroupId('')
      setSharingProjectId(null)
    } catch (cause) {
      setShareNotice(cause instanceof Error ? cause.message : 'Impossible de partager ce projet.')
    } finally {
      projectMetadataKey?.fill(0)
      for (const keys of environmentKeys) {
        keys.metadataKey.fill(0)
        keys.fileKey.fill(0)
      }
      plaintext?.fill(0)
      setShareBusy(false)
    }
  }

  const projects = data?.projects ?? []
  async function decryptProjectName(project: ProjectRow) {
    try {
      const name = await decryptName(
        project.vaultId,
        project.id,
        'project-meta',
        project.encryptedMetadata,
      )
      setNames((current) => ({ ...current, [project.id]: name }))
    } catch {
      setNotice('Déverrouillez le coffre pour afficher le nom du projet.')
    }
  }

  async function createProject() {
    const name = projectName.trim()
    const vaultId = vaults[0]?.id
    if (!name || !vaultId) return
    setBusy(true)
    setNotice('')
    try {
      const id = crypto.randomUUID()
      const encryptedMetadata = await encryptName(vaultId, id, 'project-meta', name)
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, vaultId, encryptedMetadata }),
      })
      if (!response.ok)
        throw new Error(
          'Impossible de créer le projet. Assurez-vous que le coffre est déverrouillé.',
        )
      setProjectName('')
      setNotice('Projet créé.')
      await mutate()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  async function saveProjectName(project: ProjectRow) {
    const nextName = projectNameDraft.trim()
    if (!nextName) return
    setBusy(true)
    setNotice('')
    try {
      const encryptedMetadata = await encryptName(
        project.vaultId,
        project.id,
        'project-meta',
        nextName,
      )
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedMetadata }),
      })
      if (!response.ok) throw new Error('Impossible de renommer le projet.')
      setNames((current) => ({ ...current, [project.id]: nextName }))
      setEditingProjectId(null)
      setProjectNameDraft('')
      setNotice('Projet renommé.')
      await mutate()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProject(project: ProjectRow) {
    const name = names[project.id] ?? 'ce projet'
    if (!window.confirm(`Supprimer « ${name} » et ses environnements ?`)) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de supprimer le projet.')
      setNames((current) => {
        const next = { ...current }
        delete next[project.id]
        return next
      })
      setDecryptedEnvironments((current) => {
        const next = { ...current }
        delete next[project.id]
        return next
      })
      setNotice('Projet supprimé.')
      await mutate()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  async function saveEnvironmentName(project: ProjectRow, environmentId: string) {
    const nextName = environmentNameDraft.trim()
    if (!nextName) return
    setBusy(true)
    setNotice('')
    try {
      const encryptedMetadata = await encryptName(
        project.vaultId,
        environmentId,
        'environment-meta',
        nextName,
      )
      const response = await fetch(`/api/environments/${environmentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedMetadata }),
      })
      if (!response.ok) throw new Error('Impossible de renommer l’environnement.')
      setDecryptedEnvironments((current) => ({
        ...current,
        [project.id]: (current[project.id] ?? []).map((item) =>
          item.id === environmentId ? { ...item, name: nextName } : item,
        ),
      }))
      setEditingEnvironmentId(null)
      setEnvironmentNameDraft('')
      setNotice('Environnement renommé.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteEnvironment(project: ProjectRow, environmentId: string, name: string) {
    if (!window.confirm(`Supprimer l’environnement « ${name} » ?`)) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`/api/environments/${environmentId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de supprimer l’environnement.')
      setDecryptedEnvironments((current) => ({
        ...current,
        [project.id]: (current[project.id] ?? []).filter((item) => item.id !== environmentId),
      }))
      setNotice('Environnement supprimé.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  async function createEnvironment(project: ProjectRow) {
    const name = environmentNames[project.id]?.trim()
    if (!name) return
    setBusy(true)
    setNotice('')
    try {
      const id = crypto.randomUUID()
      const encryptedMetadata = await encryptName(project.vaultId, id, 'environment-meta', name)
      const response = await fetch(`/api/projects/${project.id}/environments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, kind: 'custom', encryptedMetadata }),
      })
      if (!response.ok) throw new Error('Impossible de créer cet environnement.')
      setEnvironmentNames((current) => ({ ...current, [project.id]: '' }))
      setNotice('Environnement créé.')
      const environments = await loadEnvironmentNames(project)
      setDecryptedEnvironments((current) => ({
        ...current,
        [project.id]: environments.map(({ id: environmentId, name: environmentName }) => ({
          id: environmentId,
          name: environmentName,
        })),
      }))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wasp-dashboard-content">
      <Text className="wasp-eyebrow">ORGANISATION CHIFFRÉE</Text>
      <Heading as="h1">Projets et environnements</Heading>
      <Text>
        Les noms sont chiffrés dans votre navigateur. Le serveur ne reçoit que des blocs chiffrés.
      </Text>
      {vaults.length === 0 && <Text role="status">Créez d’abord un coffre pour commencer.</Text>}
      {vaults.length > 0 && (
        <div className="wasp-inline-action">
          <TextInput
            aria-label="Nom du projet"
            placeholder="Nom du projet"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <Button
            variant="primary"
            disabled={busy || !projectName.trim()}
            onClick={() => void createProject()}
          >
            Nouveau projet
          </Button>
        </div>
      )}
      {notice && <Text role="status">{notice}</Text>}
      {shareNotice && <Text role="status">{shareNotice}</Text>}
      {isLoading && <Text role="status">Chargement…</Text>}
      {error && <Text role="alert">Impossible de charger vos projets.</Text>}
      {projects.map((project) => (
        <article className="wasp-vault-card" key={project.id}>
          <div className="wasp-vault-panel-heading">
            <div>
              <Heading as="h2">
                {
                  <Link href={`/projects/${project.id}`}>
                    {names[project.id] ?? 'Projet chiffré'}
                  </Link>
                }
              </Heading>
              <Text size="small">Nom visible uniquement après déverrouillage</Text>
            </div>
            <div className="wasp-inline-action">
              {editingProjectId === project.id ? (
                <>
                  <TextInput
                    aria-label="Nouveau nom du projet"
                    value={projectNameDraft}
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                    maxLength={60}
                  />
                  <Button
                    disabled={busy || !projectNameDraft.trim()}
                    onClick={() => void saveProjectName(project)}
                  >
                    Enregistrer
                  </Button>
                  <Button
                    variant="invisible"
                    disabled={busy}
                    onClick={() => setEditingProjectId(null)}
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="invisible"
                    disabled={busy}
                    onClick={() => {
                      setProjectNameDraft(names[project.id] ?? '')
                      setEditingProjectId(project.id)
                    }}
                  >
                    Renommer
                  </Button>
                  <Button
                    variant="invisible"
                    disabled={busy}
                    onClick={() => void deleteProject(project)}
                  >
                    Supprimer
                  </Button>
                  <Button variant="invisible" onClick={() => void decryptProjectName(project)}>
                    Déchiffrer
                  </Button>
                  <Button
                    variant="invisible"
                    onClick={() => {
                      setSharingProjectId(sharingProjectId === project.id ? null : project.id)
                      setShareNotice('')
                    }}
                  >
                    Partager le projet
                  </Button>
                </>
              )}
            </div>
          </div>
          {sharingProjectId === project.id && (
            <div className="wasp-version-history">
              <Text size="small">
                Lecture seule : les clés de ce projet sont scellées pour chaque destinataire, sans
                transmettre la clé du coffre. Limite de 20 environnements; expiration après 30
                jours. Un groupe inclut ses membres actuels uniquement.
              </Text>
              <label className="wasp-field">
                <span>Destinataire</span>
                <select
                  value={shareGroupId}
                  onChange={(event) => setShareGroupId(event.target.value)}
                  aria-label="Destinataire du projet"
                >
                  <option value="">Une personne</option>
                  {groupsData?.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      Groupe : {group.name} ({group.members.length})
                    </option>
                  ))}
                </select>
              </label>
              {!shareGroupId && (
                <label className="wasp-field">
                  <span>Pseudo de la personne</span>
                  <TextInput
                    value={shareHandle}
                    onChange={(event) => setShareHandle(event.target.value)}
                    placeholder="ex. alice"
                    maxLength={33}
                    autoComplete="off"
                  />
                </label>
              )}
              <div className="wasp-inline-action">
                <Button
                  variant="primary"
                  disabled={shareBusy || (!shareGroupId && !shareHandle.trim())}
                  onClick={() => void shareProject(project)}
                >
                  {shareBusy ? 'Envoi…' : 'Envoyer l’invitation'}
                </Button>
                <Button
                  variant="invisible"
                  disabled={shareBusy}
                  onClick={() => setSharingProjectId(null)}
                >
                  Annuler
                </Button>
              </div>
              {shareNotice && <Text role="status">{shareNotice}</Text>}
            </div>
          )}
          <div className="wasp-inline-action">
            <TextInput
              aria-label={`Nom du nouvel environnement pour ${names[project.id] ?? 'ce projet'}`}
              placeholder="Nom du nouvel environnement"
              value={environmentNames[project.id] ?? ''}
              onChange={(event) =>
                setEnvironmentNames((current) => ({ ...current, [project.id]: event.target.value }))
              }
            />
            <Button
              disabled={busy || !environmentNames[project.id]?.trim()}
              onClick={() => void createEnvironment(project)}
            >
              Ajouter un environnement
            </Button>
            <Button
              variant="invisible"
              onClick={async () => {
                try {
                  const envs = await loadEnvironmentNames(project)
                  setDecryptedEnvironments((current) => ({
                    ...current,
                    [project.id]: envs.map(({ id, name }) => ({ id, name })),
                  }))
                } catch {
                  setNotice('Déverrouillez le coffre pour consulter les noms.')
                }
              }}
            >
              Afficher les environnements
            </Button>
          </div>
          {decryptedEnvironments[project.id]?.length ? (
            <ul className="wasp-environment-list">
              {decryptedEnvironments[project.id]?.map((environment) => (
                <li key={environment.id}>
                  {editingEnvironmentId === environment.id ? (
                    <>
                      <TextInput
                        aria-label="Nouveau nom de l’environnement"
                        value={environmentNameDraft}
                        onChange={(event) => setEnvironmentNameDraft(event.target.value)}
                        maxLength={60}
                      />
                      <Button
                        variant="invisible"
                        disabled={busy || !environmentNameDraft.trim()}
                        onClick={() => void saveEnvironmentName(project, environment.id)}
                      >
                        Enregistrer
                      </Button>
                      <Button
                        variant="invisible"
                        disabled={busy}
                        onClick={() => setEditingEnvironmentId(null)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link href={`/environments/${environment.id}`}>{environment.name}</Link>
                      <Button
                        variant="invisible"
                        disabled={busy}
                        onClick={() => {
                          setEditingEnvironmentId(environment.id)
                          setEnvironmentNameDraft(environment.name)
                        }}
                      >
                        Renommer
                      </Button>
                      <Button
                        variant="invisible"
                        disabled={busy}
                        onClick={() =>
                          void deleteEnvironment(project, environment.id, environment.name)
                        }
                      >
                        Supprimer
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : decryptedEnvironments[project.id] ? (
            <Text>Aucun environnement.</Text>
          ) : null}
        </article>
      ))}
      {!isLoading && projects.length === 0 && <Text>Aucun projet pour le moment.</Text>}
    </section>
  )
}
