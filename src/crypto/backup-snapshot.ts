import { z } from 'zod'

const encryptedRecord = z.record(z.string(), z.unknown())
const timestamp = z.union([z.string().datetime({ offset: true }), z.date()])

const vaultRow = z.object({ id: z.string().uuid(), userId: z.string().uuid(), keySalt: z.string().min(16).max(128), wrappedKey: encryptedRecord, kdfParameters: encryptedRecord, createdAt: timestamp.optional(), updatedAt: timestamp.optional() }).passthrough()
const itemRow = z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), userId: z.string().uuid(), encryptedPayload: encryptedRecord, createdAt: timestamp.optional(), updatedAt: timestamp.optional() }).passthrough()
const projectRow = z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), userId: z.string().uuid(), encryptedMetadata: encryptedRecord, createdAt: timestamp.optional(), updatedAt: timestamp.optional() }).passthrough()
const environmentRow = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), vaultId: z.string().uuid(), userId: z.string().uuid(), encryptedMetadata: encryptedRecord, createdAt: timestamp.optional(), updatedAt: timestamp.optional() }).passthrough()
const envFileRow = z.object({ id: z.string().uuid(), environmentId: z.string().uuid(), userId: z.string().uuid(), encryptedLayout: encryptedRecord, updatedAt: timestamp.optional() }).passthrough()
const shareRow = z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), ownerId: z.string().uuid(), recipientId: z.string().uuid(), encryptedVaultKey: encryptedRecord, permission: z.enum(['read', 'write']), status: z.enum(['pending', 'accepted', 'revoked']) }).passthrough()
const keyMaterialRow = z.object({ userId: z.string().uuid(), publicKeyX25519: z.string().min(40).max(64), publicKeyEd25519: z.string().min(40).max(64), encryptedPrivateKeys: encryptedRecord, accountKeyPassphraseEnvelope: encryptedRecord, accountKeyRecoveryEnvelope: encryptedRecord, kdfParameters: encryptedRecord }).passthrough()

export const backupSnapshotSchema = z.object({
  format: z.literal('wasp-encrypted-backup'),
  version: z.literal(1),
  exportedAt: z.string().datetime({ offset: true }),
  vaults: z.array(vaultRow).max(100),
  vaultItems: z.array(itemRow).max(50_000),
  projects: z.array(projectRow).max(10_000),
  environments: z.array(environmentRow).max(50_000),
  envFiles: z.array(envFileRow).max(50_000),
  shares: z.array(shareRow).max(10_000),
  keyMaterial: keyMaterialRow.nullable(),
  groups: z.array(z.object({ id: z.string().uuid(), ownerId: z.string().uuid(), name: z.string().min(1).max(48) }).passthrough()).max(25).default([]),
  groupMembers: z.array(z.object({ id: z.string().uuid(), groupId: z.string().uuid(), userId: z.string().uuid() }).passthrough()).max(2500).default([]),
  scopedKeyEnvelopes: z.array(z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), ownerId: z.string().uuid(), resourceType: z.enum(['project','secret']), resourceId: z.string().uuid(), keyVersion: z.number().int().min(1), ownerEnvelope: encryptedRecord }).passthrough()).max(50_000).default([]),
  scopedShares: z.array(z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), ownerId: z.string().uuid(), recipientId: z.string().uuid().nullable(), groupId: z.string().uuid().nullable(), resourceType: z.enum(['project','secret']), resourceId: z.string().uuid(), keyVersion: z.number().int().min(1), encryptedScopeKey: encryptedRecord, status: z.enum(['pending','accepted','revoked']) }).passthrough()).max(50_000).default([]),
  privateLinks: z.array(z.object({ id: z.string().uuid(), tokenHash: z.string().regex(/^[a-f0-9]{64}$/), ownerId: z.string().uuid(), vaultId: z.string().uuid(), resourceType: z.enum(['project','secret']), resourceId: z.string().uuid(), encryptedPayload: encryptedRecord, permissions: encryptedRecord, useCount: z.number().int().min(0), maxUses: z.number().int().nullable(), expiresAt: timestamp.nullable(), revokedAt: timestamp.nullable() }).passthrough()).max(10_000).default([]),
  keyRotationJobs: z.array(z.object({ id: z.string().uuid(), vaultId: z.string().uuid(), ownerId: z.string().uuid(), resourceType: z.enum(['vault','project','secret']), resourceId: z.string().uuid(), fromVersion: z.number().int().min(1), toVersion: z.number().int().min(2), status: z.enum(['pending','running','completed','failed']) }).passthrough()).max(10_000).default([]),
}).strict().superRefine((snapshot, context) => {
  const vaultIds = new Set(snapshot.vaults.map((row) => row.id))
  const projectIds = new Set(snapshot.projects.map((row) => row.id))
  const environmentIds = new Set(snapshot.environments.map((row) => row.id))
  const check = (condition: boolean, path: (string | number)[], message: string) => {
    if (!condition) context.addIssue({ code: 'custom', path, message })
  }
  for (const [index, row] of snapshot.vaults.entries()) check(row.userId === snapshot.vaults[0]?.userId, ['vaults', index, 'userId'], 'Backup rows must have one owner.')
  const ownerId = snapshot.vaults[0]?.userId ?? snapshot.projects[0]?.userId ?? snapshot.vaultItems[0]?.userId ?? snapshot.keyMaterial?.userId
  for (const [index, row] of snapshot.vaultItems.entries()) {
    check(!ownerId || row.userId === ownerId, ['vaultItems', index, 'userId'], 'Backup rows must have one owner.')
    check(vaultIds.has(row.vaultId), ['vaultItems', index, 'vaultId'], 'Unknown vault reference.')
  }
  for (const [index, row] of snapshot.projects.entries()) {
    check(!ownerId || row.userId === ownerId, ['projects', index, 'userId'], 'Backup rows must have one owner.')
    check(vaultIds.has(row.vaultId), ['projects', index, 'vaultId'], 'Unknown vault reference.')
  }
  for (const [index, row] of snapshot.environments.entries()) {
    check(!ownerId || row.userId === ownerId, ['environments', index, 'userId'], 'Backup rows must have one owner.')
    check(projectIds.has(row.projectId) && vaultIds.has(row.vaultId), ['environments', index], 'Unknown project or vault reference.')
  }
  for (const [index, row] of snapshot.envFiles.entries()) {
    check(!ownerId || row.userId === ownerId, ['envFiles', index, 'userId'], 'Backup rows must have one owner.')
    check(environmentIds.has(row.environmentId), ['envFiles', index, 'environmentId'], 'Unknown environment reference.')
  }
  for (const [index, row] of snapshot.shares.entries()) {
    check(row.ownerId === ownerId || row.recipientId === ownerId, ['shares', index], 'Share does not belong to this account.')
    check(vaultIds.has(row.vaultId) || row.recipientId === ownerId, ['shares', index, 'vaultId'], 'Unknown vault reference.')
  }
  check(snapshot.keyMaterial === null || snapshot.keyMaterial.userId === ownerId, ['keyMaterial', 'userId'], 'Key material does not belong to this account.')
  const groupIds = new Set(snapshot.groups.filter((group) => group.ownerId === ownerId).map((group) => group.id))
  for (const [index, group] of snapshot.groups.entries()) check(group.ownerId === ownerId, ['groups', index, 'ownerId'], 'Group does not belong to this account.')
  for (const [index, member] of snapshot.groupMembers.entries()) check(groupIds.has(member.groupId), ['groupMembers', index, 'groupId'], 'Unknown group reference.')
  for (const [index, row] of snapshot.scopedKeyEnvelopes.entries()) check(row.ownerId === ownerId && vaultIds.has(row.vaultId), ['scopedKeyEnvelopes', index], 'Envelope does not belong to this account.')
  for (const [index, row] of snapshot.scopedShares.entries()) check(row.ownerId === ownerId, ['scopedShares', index, 'ownerId'], 'Share does not belong to this account.')
  for (const [index, row] of snapshot.privateLinks.entries()) check(row.ownerId === ownerId && vaultIds.has(row.vaultId), ['privateLinks', index], 'Private link does not belong to this account.')
  for (const [index, row] of snapshot.keyRotationJobs.entries()) check(row.ownerId === ownerId && vaultIds.has(row.vaultId), ['keyRotationJobs', index], 'Rotation job does not belong to this account.')
})

export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>
