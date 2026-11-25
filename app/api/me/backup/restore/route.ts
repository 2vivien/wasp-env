import { eq } from 'drizzle-orm'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments, envFiles, keyRotationJobs, privateShareLinks, projects, scopedKeyEnvelopes, scopedShares, userKeyMaterial, vaultGroupMembers, vaultGroups, vaultItems, vaultShares, vaults } from '@/lib/db/schema'
import { backupSnapshotSchema } from '@/src/crypto/backup-snapshot'

const MAX_REQUEST_BYTES = 24 * 1024 * 1024
const DATE_FIELDS = ['createdAt', 'updatedAt', 'archivedAt', 'deletedAt', 'acceptedAt', 'expiresAt', 'rotatedAt', 'handleChangedAt']

function normalizeDates<T extends Record<string, unknown>>(row: T): T {
  const normalized: Record<string, unknown> = { ...row }
  for (const field of DATE_FIELDS) {
    const value = normalized[field]
    if (typeof value === 'string') normalized[field] = new Date(value)
  }
  return normalized as T
}

async function insertInBatches<T, R>(rows: T[], insert: (batch: T[]) => Promise<R[]>): Promise<number> {
  let inserted = 0
  for (let offset = 0; offset < rows.length; offset += 100) inserted += (await insert(rows.slice(offset, offset + 100))).length
  return inserted
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_REQUEST_BYTES) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)

  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) return jsonNoStore({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
    body = JSON.parse(rawBody)
  } catch { return jsonNoStore({ error: { code: 'VALIDATION' } }, 422) }
  const parsed = backupSnapshotSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: { code: 'VALIDATION' } }, 422)
  const snapshot = parsed.data
  const userId = session.user.id
  const snapshotOwner = snapshot.vaults[0]?.userId ?? snapshot.projects[0]?.userId ?? snapshot.vaultItems[0]?.userId ?? snapshot.keyMaterial?.userId
  if (snapshotOwner !== userId) return jsonNoStore({ error: { code: 'BACKUP_ACCOUNT_MISMATCH' } }, 403)

  const imported = await db.transaction(async (tx) => {
    const vaultRows = snapshot.vaults.map((row) => normalizeDates({ ...row, userId })) as (typeof vaults.$inferInsert)[]
    const projectRows = snapshot.projects.map((row) => normalizeDates({ ...row, userId })) as (typeof projects.$inferInsert)[]
    const environmentRows = snapshot.environments.map((row) => normalizeDates({ ...row, userId })) as (typeof environments.$inferInsert)[]
    const itemRows = snapshot.vaultItems.map((row) => normalizeDates({ ...row, userId })) as (typeof vaultItems.$inferInsert)[]
    const fileRows = snapshot.envFiles.map((row) => normalizeDates({ ...row, userId })) as (typeof envFiles.$inferInsert)[]
    const shareRows = snapshot.shares.filter((row) => row.ownerId === userId).map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof vaultShares.$inferInsert)[]
    const groupRows = snapshot.groups.map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof vaultGroups.$inferInsert)[]
    const groupIds = new Set(groupRows.map((row) => row.id))
    const memberRows = snapshot.groupMembers.filter((row) => groupIds.has(row.groupId)) as (typeof vaultGroupMembers.$inferInsert)[]
    const envelopeRows = snapshot.scopedKeyEnvelopes.map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof scopedKeyEnvelopes.$inferInsert)[]
    const scopedShareRows = snapshot.scopedShares.filter((row) => row.ownerId === userId).map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof scopedShares.$inferInsert)[]
    const privateLinkRows = snapshot.privateLinks.map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof privateShareLinks.$inferInsert)[]
    const rotationRows = snapshot.keyRotationJobs.map((row) => normalizeDates({ ...row, ownerId: userId })) as (typeof keyRotationJobs.$inferInsert)[]

    const vaultsAdded = await insertInBatches(vaultRows, (batch) => tx.insert(vaults).values(batch).onConflictDoNothing().returning({ id: vaults.id }))
    const projectsAdded = await insertInBatches(projectRows, (batch) => tx.insert(projects).values(batch).onConflictDoNothing().returning({ id: projects.id }))
    const environmentsAdded = await insertInBatches(environmentRows, (batch) => tx.insert(environments).values(batch).onConflictDoNothing().returning({ id: environments.id }))
    const itemsAdded = await insertInBatches(itemRows, (batch) => tx.insert(vaultItems).values(batch).onConflictDoNothing().returning({ id: vaultItems.id }))
    const filesAdded = await insertInBatches(fileRows, (batch) => tx.insert(envFiles).values(batch).onConflictDoNothing().returning({ id: envFiles.id }))
    const sharesAdded = await insertInBatches(shareRows, (batch) => tx.insert(vaultShares).values(batch).onConflictDoNothing().returning({ id: vaultShares.id }))
    const groupsAdded = await insertInBatches(groupRows, (batch) => tx.insert(vaultGroups).values(batch).onConflictDoNothing().returning({ id: vaultGroups.id }))
    const groupMembersAdded = await insertInBatches(memberRows, (batch) => tx.insert(vaultGroupMembers).values(batch).onConflictDoNothing().returning({ id: vaultGroupMembers.id }))
    const envelopesAdded = await insertInBatches(envelopeRows, (batch) => tx.insert(scopedKeyEnvelopes).values(batch).onConflictDoNothing().returning({ id: scopedKeyEnvelopes.id }))
    const scopedSharesAdded = await insertInBatches(scopedShareRows, (batch) => tx.insert(scopedShares).values(batch).onConflictDoNothing().returning({ id: scopedShares.id }))
    const privateLinksAdded = await insertInBatches(privateLinkRows, (batch) => tx.insert(privateShareLinks).values(batch).onConflictDoNothing().returning({ id: privateShareLinks.id }))
    const rotationsAdded = await insertInBatches(rotationRows, (batch) => tx.insert(keyRotationJobs).values(batch).onConflictDoNothing().returning({ id: keyRotationJobs.id }))
    const [existingKeys] = await tx.select({ userId: userKeyMaterial.userId }).from(userKeyMaterial).where(eq(userKeyMaterial.userId, userId)).limit(1)
    const keyMaterialAdded = snapshot.keyMaterial && !existingKeys
      ? (await tx.insert(userKeyMaterial).values(normalizeDates({ ...snapshot.keyMaterial, userId }) as typeof userKeyMaterial.$inferInsert).onConflictDoNothing().returning({ userId: userKeyMaterial.userId })).length
      : 0
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorId: userId, event: 'encrypted_backup_restored', targetKind: 'account_backup',
      metadata: { vaultsAdded, projectsAdded, environmentsAdded, itemsAdded, filesAdded, sharesAdded, groupsAdded, groupMembersAdded, envelopesAdded, scopedSharesAdded, privateLinksAdded, rotationsAdded, keyMaterialAdded },
    })
    return { vaultsAdded, projectsAdded, environmentsAdded, itemsAdded, filesAdded, sharesAdded, groupsAdded, groupMembersAdded, envelopesAdded, scopedSharesAdded, privateLinksAdded, rotationsAdded, keyMaterialAdded }
  })
  return jsonNoStore({ restored: imported })
}
