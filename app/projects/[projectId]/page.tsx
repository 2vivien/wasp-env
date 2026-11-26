import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/session'
import { ProjectBoard } from '@/components/projects/project-board'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getCurrentSession()
  if (!session?.user) redirect('/login?callbackURL=%2Fprojects')
  const { projectId } = await params
  return <ProjectBoard projectId={projectId} />
}
