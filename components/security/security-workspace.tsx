'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { IdentityKeySetup } from './identity-key-setup'
import { SecurityBackup } from './security-backup'
import { PrivateLinksManager } from './private-links-manager'

type SessionItem = { id: string; createdAt: string; updatedAt: string; expiresAt: string; userAgent: string | null; ipAddress: string | null; isCurrent: boolean }
type AuditEvent = { id: string; event: string; targetKind: string; targetId: string | null; metadata: Record<string, string | number | boolean>; createdAt: string }

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

export function SecurityWorkspace({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const sessions = useSWR<{ sessions: SessionItem[] }>('/api/me/sessions', fetcher, { revalidateOnFocus: false })
  const activity = useSWR<{ events: AuditEvent[] }>('/api/activity', fetcher, { revalidateOnFocus: false })
  const revoke = async (body: { sessionId?: string; allOthers?: boolean }) => {
    const response = await fetch('/api/me/sessions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error('Impossible de révoquer cette session.')
    await sessions.mutate()
  }
  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (deletingAccount || confirmation.trim().toLowerCase() !== userEmail.toLowerCase()) return
    setDeletingAccount(true)
    setDeleteError('')
    try {
      const response = await fetch('/api/me/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      })
      if (!response.ok) throw new Error('Account deletion failed.')
      router.replace('/')
      router.refresh()
    } catch {
      setDeleteError('La suppression du compte a échoué. Réessayez ou contactez le support.')
      setDeletingAccount(false)
    }
  }
  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><a className="wasp-wordmark" href="/dashboard">Wasp</a><nav className="wasp-dashboard-nav" aria-label="Navigation principale"><a href="/dashboard">Coffre</a><a href="/projects">Projets</a><a href="/groups">Groupes</a><a href="/shared">Partagés</a></nav><Text>Sécurité</Text></header><section className="wasp-dashboard-content"><Text className="wasp-eyebrow">CONTRÔLE DU COMPTE</Text><Heading as="h1">Sécurité et activité</Heading><Text>Gérez les appareils connectés et consultez les événements récents de votre compte.</Text>
    <IdentityKeySetup />
    <SecurityBackup />
    <PrivateLinksManager />
    <section className="wasp-vault-card" aria-labelledby="delete-account-title">
      <Heading as="h2" id="delete-account-title">Supprimer le compte</Heading>
      <Text>Cette action supprime vos coffres, projets, secrets chiffrés, partages, clés et sessions. Elle est définitive et ne peut pas être annulée.</Text>
      <form className="wasp-edit-secret-form" onSubmit={deleteAccount}>
        <label className="wasp-field">
          <span>Saisissez votre adresse e-mail pour confirmer</span>
          <TextInput type="email" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="email" required />
        </label>
        {deleteError && <Text role="alert" className="wasp-auth-error">{deleteError}</Text>}
        <Button type="submit" variant="danger" disabled={deletingAccount || confirmation.trim().toLowerCase() !== userEmail.toLowerCase()}>
          {deletingAccount ? 'Suppression…' : 'Supprimer définitivement mon compte'}
        </Button>
      </form>
    </section>
    <section className="wasp-vault-card" aria-labelledby="sessions-title"><div className="wasp-vault-panel-heading"><div><Heading as="h2" id="sessions-title">Sessions actives</Heading><Text size="small">La session utilisée ici ne peut pas être révoquée depuis cet écran.</Text></div><Button disabled={!sessions.data?.sessions.some((item) => !item.isCurrent)} onClick={() => void revoke({ allOthers: true })}>Révoquer les autres</Button></div>
      {sessions.isLoading && <Text role="status">Chargement des sessions…</Text>}{sessions.error && <Text role="alert">Impossible de charger les sessions.</Text>}
      {sessions.data?.sessions.map((item) => <div className="wasp-security-row" key={item.id}><div><Text>{item.isCurrent ? 'Cet appareil · session actuelle' : item.userAgent || 'Appareil inconnu'}</Text><Text size="small">Dernière activité : {new Date(item.updatedAt).toLocaleString('fr-FR')} · expire {new Date(item.expiresAt).toLocaleDateString('fr-FR')}{item.ipAddress ? ` · ${item.ipAddress}` : ''}</Text></div>{!item.isCurrent && <Button variant="default" onClick={() => void revoke({ sessionId: item.id })}>Révoquer</Button>}</div>)}
    </section>
    <section className="wasp-vault-card" aria-labelledby="activity-title"><div><Heading as="h2" id="activity-title">Journal d’activité</Heading><Text size="small">Les noms et valeurs des secrets ne sont jamais inscrits dans ce journal.</Text></div>{activity.isLoading && <Text role="status">Chargement de l’activité…</Text>}{activity.error && <Text role="alert">Impossible de charger le journal.</Text>}{activity.data?.events.length === 0 && <Text>Aucun événement récent.</Text>}{activity.data?.events.map((event) => <div className="wasp-security-row" key={event.id}><div><Text>{event.event.replaceAll('_', ' ')}</Text><Text size="small">{event.targetKind}{event.targetId ? ` · ${event.targetId.slice(0, 8)}` : ''} · {new Date(event.createdAt).toLocaleString('fr-FR')}</Text></div></div>)}</section>
  </section></main>
}
