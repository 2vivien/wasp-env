import type { auditLogs } from '@/lib/db/schema'

type NewAuditLog = typeof auditLogs.$inferInsert

/**
 * Événement de progression d'une rotation, écrit dans la même transaction que le lot.
 * Les métadonnées restent dans la liste blanche (count, keyVersion).
 */
export function rotationProgressEvent(input: {
  actorId: string
  vaultId: string
  jobId: string
  completedCount: number
  keyVersion: number
  at?: Date
}): NewAuditLog {
  return {
    id: crypto.randomUUID(),
    actorId: input.actorId,
    vaultId: input.vaultId,
    event: 'vault_rotation_progress',
    targetKind: 'rotation_job',
    targetId: input.jobId,
    metadata: { count: input.completedCount, keyVersion: input.keyVersion },
    createdAt: input.at ?? new Date(),
  }
}
