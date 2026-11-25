'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decryptBytes, deriveObjectKey, encryptBytes, importRootKey } from '@/src/crypto/aead'
import { withKey } from '@/src/crypto/key-store'

type Blob = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }
type ProjectRow = { id: string; vaultId: string; encryptedMetadata: Blob; updatedAt: string }
type EnvironmentRow = { id: string; projectId: string; vaultId: string; kind: string; encryptedMetadata: Blob; version: number }

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les projets.')
  return response.json() as Promise<T>
}

async function encryptName(vaultId: string, objectId: string, objectType: string, name: string): Promise<Blob> {
  const bytes = new TextEncoder().encode(JSON.stringify({ name }))
  try {
    return await withKey(vaultId, async (rawKey) => {
      const root = await importRootKey(rawKey)
      const key = await deriveObjectKey(root, 'metadata', objectId)
      return encryptBytes(key, bytes, { vaultId, objectType, objectId, version: 1 })
    })
  } finally { bytes.fill(0) }
}

async function decryptName(vaultId: string, objectId: string, objectType: string, blob: Blob): Promise<string> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'metadata', objectId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType, objectId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : 'Sans nom'
    } finally { bytes.fill(0) }
  })
}

export function ProjectsWorkspace({ vaults }: { vaults: Array<{ id: string }> }) {
  const { data, error, isLoading, mutate } = useSWR<{ projects: ProjectRow[] }>('/api/projects', requestJson, { revalidateOnFocus: false })
  const [names, setNames] = useState<Record<string, string>>({})
  const [projectName, setProjectName] = useState('')
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [projectNameDraft, setProjectNameDraft] = useState('')
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null)
  const [environmentNameDraft, setEnvironmentNameDraft] = useState('')
  const [environmentNames, setEnvironmentNames] = useState<Record<string, string>>({})
  const [decryptedEnvironments, setDecryptedEnvironments] = useState<Record<string, Array<{ id: string; name: string }>>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadEnvironmentNames(project: ProjectRow) {
    const response = await requestJson<{ environments: EnvironmentRow[] }>(`/api/projects/${project.id}/environments`)
    const mapped = await Promise.all(response.environments.map(async (environment) => ({
      ...environment,
      name: await decryptName(environment.vaultId, environment.id, 'environment-meta', environment.encryptedMetadata),
    })))
    return mapped
  }

  const projects = data?.projects ?? []
  async function decryptProjectName(project: ProjectRow) {
    try {
      const name = await decryptName(project.vaultId, project.id, 'project-meta', project.encryptedMetadata)
      setNames((current) => ({ ...current, [project.id]: name }))
    } catch { setNotice('Déverrouillez le coffre pour afficher le nom du projet.') }
  }

  async function createProject() {
    const name = projectName.trim()
    const vaultId = vaults[0]?.id
    if (!name || !vaultId) return
    setBusy(true); setNotice('')
    try {
      const id = crypto.randomUUID()
      const encryptedMetadata = await encryptName(vaultId, id, 'project-meta', name)
      const response = await fetch('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, vaultId, encryptedMetadata }) })
      if (!response.ok) throw new Error('Impossible de créer le projet. Assurez-vous que le coffre est déverrouillé.')
      setProjectName(''); setNotice('Projet créé.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function saveProjectName(project: ProjectRow) {
    const nextName = projectNameDraft.trim()
    if (!nextName) return
    setBusy(true); setNotice('')
    try {
      const encryptedMetadata = await encryptName(project.vaultId, project.id, 'project-meta', nextName)
      const response = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ encryptedMetadata }) })
      if (!response.ok) throw new Error('Impossible de renommer le projet.')
      setNames((current) => ({ ...current, [project.id]: nextName }))
      setEditingProjectId(null); setProjectNameDraft(''); setNotice('Projet renommé.')
      await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function deleteProject(project: ProjectRow) {
    const name = names[project.id] ?? 'ce projet'
    if (!window.confirm(`Supprimer « ${name} » et ses environnements ?`)) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de supprimer le projet.')
      setNames((current) => { const next = { ...current }; delete next[project.id]; return next })
      setDecryptedEnvironments((current) => { const next = { ...current }; delete next[project.id]; return next })
      setNotice('Projet supprimé.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function saveEnvironmentName(project: ProjectRow, environmentId: string) {
    const nextName = environmentNameDraft.trim()
    if (!nextName) return
    setBusy(true); setNotice('')
    try {
      const encryptedMetadata = await encryptName(project.vaultId, environmentId, 'environment-meta', nextName)
      const response = await fetch(`/api/environments/${environmentId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ encryptedMetadata }) })
      if (!response.ok) throw new Error('Impossible de renommer l’environnement.')
      setDecryptedEnvironments((current) => ({ ...current, [project.id]: (current[project.id] ?? []).map((item) => item.id === environmentId ? { ...item, name: nextName } : item) }))
      setEditingEnvironmentId(null); setEnvironmentNameDraft(''); setNotice('Environnement renommé.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function deleteEnvironment(project: ProjectRow, environmentId: string, name: string) {
    if (!window.confirm(`Supprimer l’environnement « ${name} » ?`)) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch(`/api/environments/${environmentId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Impossible de supprimer l’environnement.')
      setDecryptedEnvironments((current) => ({ ...current, [project.id]: (current[project.id] ?? []).filter((item) => item.id !== environmentId) }))
      setNotice('Environnement supprimé.')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function createEnvironment(project: ProjectRow) {
    const name = environmentNames[project.id]?.trim()
    if (!name) return
    setBusy(true); setNotice('')
    try {
      const id = crypto.randomUUID()
      const encryptedMetadata = await encryptName(project.vaultId, id, 'environment-meta', name)
      const response = await fetch(`/api/projects/${project.id}/environments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, kind: 'custom', encryptedMetadata }) })
      if (!response.ok) throw new Error('Impossible de créer cet environnement.')
      setEnvironmentNames((current) => ({ ...current, [project.id]: '' })); setNotice('Environnement créé.')
      const environments = await loadEnvironmentNames(project)
      setDecryptedEnvironments((current) => ({ ...current, [project.id]: environments.map(({ id: environmentId, name: environmentName }) => ({ id: environmentId, name: environmentName })) }))
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><a className="wasp-wordmark" href="/dashboard">Wasp</a><Text>Projets &amp; environnements</Text></header><section className="wasp-dashboard-content"><Text className="wasp-eyebrow">ORGANISATION CHIFFRÉE</Text><Heading as="h1">Projets et environnements</Heading><Text>Les noms sont chiffrés dans votre navigateur. Le serveur ne reçoit que des blocs chiffrés.</Text>
    {vaults.length === 0 && <Text role="status">Créez d’abord un coffre pour commencer.</Text>}
    {vaults.length > 0 && <div className="wasp-inline-action"><TextInput aria-label="Nom du projet" placeholder="Nom du projet" value={projectName} onChange={(event) => setProjectName(event.target.value)} /><Button variant="primary" disabled={busy || !projectName.trim()} onClick={() => void createProject()}>Nouveau projet</Button></div>}
    {notice && <Text role="status">{notice}</Text>}{isLoading && <Text role="status">Chargement…</Text>}{error && <Text role="alert">Impossible de charger vos projets.</Text>}
    {projects.map((project) => <article className="wasp-vault-card" key={project.id}><div className="wasp-vault-panel-heading"><div><Heading as="h2">{names[project.id] ?? 'Projet chiffré'}</Heading><Text size="small">Nom visible uniquement après déverrouillage</Text></div><div className="wasp-inline-action">{editingProjectId === project.id ? <><TextInput aria-label="Nouveau nom du projet" value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} maxLength={60} /><Button disabled={busy || !projectNameDraft.trim()} onClick={() => void saveProjectName(project)}>Enregistrer</Button><Button variant="invisible" disabled={busy} onClick={() => setEditingProjectId(null)}>Annuler</Button></> : <><Button variant="invisible" disabled={busy} onClick={() => { setProjectNameDraft(names[project.id] ?? ''); setEditingProjectId(project.id) }}>Renommer</Button><Button variant="invisible" disabled={busy} onClick={() => void deleteProject(project)}>Supprimer</Button><Button variant="invisible" onClick={() => void decryptProjectName(project)}>Déchiffrer</Button></>}</div></div><div className="wasp-inline-action"><TextInput aria-label={`Nom du nouvel environnement pour ${names[project.id] ?? 'ce projet'}`} placeholder="Nom du nouvel environnement" value={environmentNames[project.id] ?? ''} onChange={(event) => setEnvironmentNames((current) => ({ ...current, [project.id]: event.target.value }))} /><Button disabled={busy || !environmentNames[project.id]?.trim()} onClick={() => void createEnvironment(project)}>Ajouter un environnement</Button><Button variant="invisible" onClick={async () => { try { const envs = await loadEnvironmentNames(project); setDecryptedEnvironments((current) => ({ ...current, [project.id]: envs.map(({ id, name }) => ({ id, name })) })) } catch { setNotice('Déverrouillez le coffre pour consulter les noms.') } }}>Afficher les environnements</Button></div>{decryptedEnvironments[project.id]?.length ? <ul className="wasp-environment-list">{decryptedEnvironments[project.id]?.map((environment) => <li key={environment.id}>{editingEnvironmentId === environment.id ? <><TextInput aria-label="Nouveau nom de l’environnement" value={environmentNameDraft} onChange={(event) => setEnvironmentNameDraft(event.target.value)} maxLength={60} /><Button variant="invisible" disabled={busy || !environmentNameDraft.trim()} onClick={() => void saveEnvironmentName(project, environment.id)}>Enregistrer</Button><Button variant="invisible" disabled={busy} onClick={() => setEditingEnvironmentId(null)}>Annuler</Button></> : <><Link href={`/environments/${environment.id}`}>{environment.name}</Link><Button variant="invisible" disabled={busy} onClick={() => { setEditingEnvironmentId(environment.id); setEnvironmentNameDraft(environment.name) }}>Renommer</Button><Button variant="invisible" disabled={busy} onClick={() => void deleteEnvironment(project, environment.id, environment.name)}>Supprimer</Button></>}</li>)}</ul> : decryptedEnvironments[project.id] ? <Text>Aucun environnement.</Text> : null}</article>)}
    {!isLoading && projects.length === 0 && <Text>Aucun projet pour le moment.</Text>}
  </section></main>
}
