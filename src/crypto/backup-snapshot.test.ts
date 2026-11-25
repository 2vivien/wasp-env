import { describe, expect, it } from 'vitest'
import { backupSnapshotSchema } from './backup-snapshot'

function makeSnapshot() {
  const userId = crypto.randomUUID()
  const vaultId = crypto.randomUUID()
  return {
    format: 'wasp-encrypted-backup', version: 1, exportedAt: new Date().toISOString(),
    vaults: [{ id: vaultId, userId, keySalt: '0123456789abcdef', wrappedKey: {}, kdfParameters: {} }],
    vaultItems: [], projects: [], environments: [], envFiles: [], shares: [], keyMaterial: null,
    groups: [{ id: crypto.randomUUID(), ownerId: userId, name: 'Equipe' }], groupMembers: [],
    scopedKeyEnvelopes: [], scopedShares: [], privateLinks: [], keyRotationJobs: [],
  }
}

describe('restorable backup snapshot validation', () => {
  it('accepts an owned encrypted snapshot and applies defaults to old version 1 backups', () => {
    const snapshot = makeSnapshot()
    expect(backupSnapshotSchema.safeParse(snapshot).success).toBe(true)
    const legacy = { ...snapshot, groups: undefined, groupMembers: undefined, scopedKeyEnvelopes: undefined, scopedShares: undefined, privateLinks: undefined, keyRotationJobs: undefined }
    expect(backupSnapshotSchema.safeParse(legacy).success).toBe(true)
  })

  it('rejects cross-account vault rows before a restore is attempted', () => {
    const snapshot = makeSnapshot()
    const invalidSnapshot = { ...snapshot, vaultItems: [{ id: crypto.randomUUID(), vaultId: snapshot.vaults[0]!.id, userId: crypto.randomUUID(), encryptedPayload: {} }] }
    expect(backupSnapshotSchema.safeParse(invalidSnapshot).success).toBe(false)
  })
})
