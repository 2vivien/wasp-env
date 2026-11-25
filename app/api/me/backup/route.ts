import { eq, inArray, or } from 'drizzle-orm'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, environments, envFiles, keyRotationJobs, privateShareLinks, projects, scopedKeyEnvelopes, scopedShares, userKeyMaterial, vaultGroupMembers, vaultGroups, vaultItems, vaultShares, vaults } from '@/lib/db/schema'

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)

  const userId = session.user.id
  const ownedVaults = await db.select().from(vaults).where(eq(vaults.userId, userId))
  const vaultIds = ownedVaults.map(({ id }) => id)
  const [items, ownedProjects, shares, keyMaterial, groups, ownedScopedShares, privateLinks, keyEnvelopes, rotationJobs] = await Promise.all([
    vaultIds.length ? db.select().from(vaultItems).where(eq(vaultItems.userId, userId)) : Promise.resolve([]),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(vaultShares).where(or(eq(vaultShares.ownerId, userId), eq(vaultShares.recipientId, userId))),
    db.select().from(userKeyMaterial).where(eq(userKeyMaterial.userId, userId)).limit(1),
    db.select().from(vaultGroups).where(eq(vaultGroups.ownerId, userId)),
    db.select().from(scopedShares).where(eq(scopedShares.ownerId, userId)),
    db.select().from(privateShareLinks).where(eq(privateShareLinks.ownerId, userId)),
    db.select().from(scopedKeyEnvelopes).where(eq(scopedKeyEnvelopes.ownerId, userId)),
    db.select().from(keyRotationJobs).where(eq(keyRotationJobs.ownerId, userId)),
  ])
  const groupIds = groups.map(({ id }) => id)
  const groupMembers = groupIds.length ? await db.select().from(vaultGroupMembers).where(inArray(vaultGroupMembers.groupId, groupIds)) : []
  const projectIds = ownedProjects.map(({ id }) => id)
  const environmentRows = projectIds.length
    ? await db.select().from(environments).where(eq(environments.userId, userId))
    : []
  const environmentIds = environmentRows.map(({ id }) => id)
  const files = environmentIds.length
    ? await db.select().from(envFiles).where(eq(envFiles.userId, userId))
    : []

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: userId,
    event: 'encrypted_backup_exported',
    targetKind: 'account_backup',
    metadata: { vaultCount: ownedVaults.length, itemCount: items.length },
  })

  return jsonNoStore({
    format: 'wasp-encrypted-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    vaults: ownedVaults,
    vaultItems: items,
    projects: ownedProjects,
    environments: environmentRows,
    envFiles: files,
    shares,
    keyMaterial: keyMaterial[0] ?? null,
    groups,
    groupMembers,
    scopedKeyEnvelopes: keyEnvelopes,
    scopedShares: ownedScopedShares,
    privateLinks,
    keyRotationJobs: rotationJobs,
  })
}
