import { listProjects } from '@/features/projects/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { ProjectCatalog } from '@/features/projects/components/ProjectCatalog'

export default async function ProjectPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listProjects()])
  return <ProjectCatalog rows={rows as Parameters<typeof ProjectCatalog>[0]['rows']} canWrite={me ? canApprove(me.role) : false} />
}
