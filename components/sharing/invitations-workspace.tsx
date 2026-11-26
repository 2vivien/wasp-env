'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text } from '@primer/react'

type Invitation = {
  id: string
  kind: string
  targetId: string
  status: string
  expiresAt: string | null
  createdAt: string
  source: 'scoped' | 'vault'
  fromHandle?: string | null
  toHandle?: string | null
}

async function fetcher(url: string): Promise<{ incoming: Invitation[]; outgoing: Invitation[] }> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<{ incoming: Invitation[]; outgoing: Invitation[] }>
}

export function InvitationsWorkspace() {
  const { data, error, isLoading, mutate } = useSWR('/api/invitations', fetcher, { revalidateOnFocus: false })
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')
  const [notice, setNotice] = useState('')

  async function act(invitation: Invitation, action: 'accept' | 'decline' | 'revoke') {
    const response = await fetch(`/api/invitations/${invitation.id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: invitation.source, action }),
    })
    setNotice(response.ok ? 'Action effectuée.' : 'Action impossible.')
    await mutate()
  }

  const rows = data?.[tab] ?? []
  return (
    <section className="wasp-dashboard-content" aria-labelledby="invitations-title">
      <Heading as="h1" id="invitations-title">Invitations</Heading>
      <div className="wasp-inline-action"><Button variant={tab === 'incoming' ? 'primary' : 'default'} onClick={() => setTab('incoming')}>Reçues</Button><Button variant={tab === 'outgoing' ? 'primary' : 'default'} onClick={() => setTab('outgoing')}>Envoyées</Button></div>
      {isLoading && <Text role="status">Chargement des invitations…</Text>}
      {error && <Text role="alert">Impossible de charger les invitations.</Text>}
      {notice && <Text role="status">{notice}</Text>}
      {rows.length === 0 && !isLoading && <Text>Aucune invitation.</Text>}
      {rows.map((invitation) => <article className="wasp-security-row" key={`${invitation.source}-${invitation.id}`}>
        <div><Text>{invitation.kind} · @{tab === 'incoming' ? invitation.fromHandle ?? 'expéditeur' : invitation.toHandle ?? 'destinataire'}</Text><Text size="small">{invitation.status} · créée le {new Date(invitation.createdAt).toLocaleDateString('fr-FR')}{invitation.expiresAt ? ` · expire le ${new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}` : ''}</Text></div>
        {tab === 'incoming' && invitation.status === 'pending' && <div className="wasp-inline-action"><Button variant="primary" onClick={() => void act(invitation, 'accept')}>Accepter</Button><Button variant="invisible" onClick={() => void act(invitation, 'decline')}>Refuser</Button></div>}
        {tab === 'outgoing' && invitation.status === 'pending' && <Button variant="invisible" onClick={() => void act(invitation, 'revoke')}>Révoquer</Button>}
      </article>)}
    </section>
  )
}
