'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'

type Group = { id: string; name: string; members: Array<{ userId: string; handle: string | null; displayName: string | null }> }

async function fetchGroups(url: string): Promise<{ groups: Group[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Impossible de charger les groupes.')
  return response.json() as Promise<{ groups: Group[] }>
}

export function GroupManager() {
  const { data, error, isLoading, mutate } = useSWR('/api/groups', fetchGroups, { revalidateOnFocus: false })
  const [newName, setNewName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [handles, setHandles] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(url: string, method: string, body?: object) {
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: { code?: string } } | null
      const messages: Record<string, string> = {
        GROUP_LIMIT: 'La limite de 25 groupes est atteinte.',
        MEMBER_LIMIT: 'La limite de 100 membres par groupe est atteinte.',
        USER_NOT_FOUND: 'Aucun compte ne correspond à ce pseudo.',
        INVALID_HANDLE: 'Vérifiez le pseudo saisi.',
      }
      throw new Error(messages[result?.error?.code ?? ''] ?? 'La modification n’a pas abouti.')
    }
  }

  async function renameGroup(groupId: string) {
    setBusy(true); setNotice('')
    try {
      await send(`/api/groups/${groupId}`, 'PATCH', { name: groupNameDraft })
      setEditingGroupId(null); setGroupNameDraft(''); setNotice('Groupe renommé.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function createGroup() {
    setBusy(true); setNotice('')
    try {
      await send('/api/groups', 'POST', { name: newName })
      setNewName(''); setNotice('Groupe créé.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function addMember(groupId: string) {
    setBusy(true); setNotice('')
    try {
      await send(`/api/groups/${groupId}`, 'PATCH', { addHandle: handles[groupId] })
      setHandles((current) => ({ ...current, [groupId]: '' })); setNotice('Membre ajouté au groupe.'); await mutate()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function removeMember(groupId: string, userId: string) {
    if (!window.confirm('Retirer cette personne du groupe ? Ses partages liés au groupe seront révoqués.')) return
    setBusy(true); setNotice('')
    try { await send(`/api/groups/${groupId}`, 'PATCH', { removeUserId: userId }); setNotice('Accès du groupe révoqué.'); await mutate() }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function deleteGroup(group: Group) {
    if (!window.confirm(`Supprimer le groupe « ${group.name} » et révoquer ses partages ?`)) return
    setBusy(true); setNotice('')
    try { await send(`/api/groups/${group.id}`, 'DELETE'); setNotice('Groupe supprimé et partages révoqués.'); await mutate() }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  return (
    <section className="wasp-dashboard-content">
      <Text className="wasp-eyebrow">ACCÈS ET COLLABORATION</Text>
      <Heading as="h1">Groupes</Heading>
      <Text>Organisez les personnes à qui vous accordez des accès. Ajouter quelqu’un à un groupe ne lui donne pas accès à vos coffres tant qu’aucun périmètre n’est partagé.</Text>
      <div className="wasp-inline-action"><TextInput aria-label="Nom du groupe" placeholder="Ex. Équipe sécurité" maxLength={48} value={newName} onChange={(event) => setNewName(event.target.value)} /><Button variant="primary" disabled={busy || !newName.trim()} onClick={() => void createGroup()}>Créer un groupe</Button></div>
      {notice && <Text role="status">{notice}</Text>}{isLoading && <Text role="status">Chargement des groupes…</Text>}{error && <Text role="alert">Impossible de charger les groupes.</Text>}
      {(data?.groups ?? []).map((group) => <article className="wasp-vault-card" key={group.id}>
        <div className="wasp-vault-panel-heading"><div>{editingGroupId === group.id ? <div className="wasp-inline-action"><TextInput aria-label="Nouveau nom du groupe" maxLength={48} value={groupNameDraft} onChange={(event) => setGroupNameDraft(event.target.value)} /><Button disabled={busy || !groupNameDraft.trim()} onClick={() => void renameGroup(group.id)}>Enregistrer</Button><Button variant="invisible" disabled={busy} onClick={() => setEditingGroupId(null)}>Annuler</Button></div> : <><Heading as="h2">{group.name}</Heading><Text size="small">{group.members.length} membre{group.members.length === 1 ? '' : 's'}</Text></>}</div><div className="wasp-inline-action">{editingGroupId !== group.id && <Button variant="invisible" disabled={busy} onClick={() => { setEditingGroupId(group.id); setGroupNameDraft(group.name) }}>Renommer</Button>}<Button variant="invisible" disabled={busy} onClick={() => void deleteGroup(group)}>Supprimer le groupe</Button></div></div>
        <ul className="wasp-environment-list">{group.members.map((member) => <li key={member.userId}><span>{member.displayName || `@${member.handle ?? 'utilisateur'}`}{member.displayName && member.handle ? ` · @${member.handle}` : ''}</span><Button variant="invisible" disabled={busy} onClick={() => void removeMember(group.id, member.userId)}>Retirer</Button></li>)}</ul>
        <div className="wasp-inline-action"><TextInput aria-label={`Pseudo à ajouter à ${group.name}`} placeholder="Pseudo du membre" value={handles[group.id] ?? ''} onChange={(event) => setHandles((current) => ({ ...current, [group.id]: event.target.value }))} /><Button disabled={busy || !handles[group.id]?.trim()} onClick={() => void addMember(group.id)}>Ajouter au groupe</Button></div>
      </article>)}
      {!isLoading && (data?.groups.length ?? 0) === 0 && <Text>Aucun groupe pour le moment.</Text>}
      <Text size="small">Les partages aux groupes restent limités au contenu chiffré explicitement sélectionné.</Text>
    </section>
  )
}
