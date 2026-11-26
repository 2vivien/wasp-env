import { desc, eq } from 'drizzle-orm'
import { Heading, Text } from '@primer/react'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function ActivityPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Factivity')
  const rows = await db.select({ id: auditLogs.id, event: auditLogs.event, targetKind: auditLogs.targetKind, createdAt: auditLogs.createdAt })
    .from(auditLogs).where(eq(auditLogs.actorId, session.user.id)).orderBy(desc(auditLogs.createdAt)).limit(50)

  return (
    <section>
      <Heading as="h1">Activité</Heading>
      <Text>Aucune valeur secrète n’est inscrite dans ce journal.</Text>
      {rows.length === 0 && <Text>Aucune activité.</Text>}
      <ul className="wasp-environment-list">
        {rows.map((event) => (
          <li key={event.id}>
            <span>{event.event.replaceAll('_', ' ')} · {event.targetKind}</span>
            <time dateTime={event.createdAt.toISOString()}>{new Date(event.createdAt).toLocaleString('fr-FR')}</time>
          </li>
        ))}
      </ul>
    </section>
  )
}
