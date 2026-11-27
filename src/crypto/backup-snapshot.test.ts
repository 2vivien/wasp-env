import { describe, expect, it } from 'vitest'
import { backupSnapshotSchema } from './backup-snapshot'

function makeSnapshot() {
  const userId = crypto.randomUUID()
  const vaultId = crypto.randomUUID()
  return {
    format: 'wasp-encrypted-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    vaults: [
      { id: vaultId, userId, keySalt: '0123456789abcdef', wrappedKey: {}, kdfParameters: {} },
    ],
    vaultItems: [],
    projects: [],
    environments: [],
    envFiles: [],
    shares: [],
    keyMaterial: null,
    groups: [{ id: crypto.randomUUID(), ownerId: userId, name: 'Equipe' }],
    groupMembers: [],
    scopedKeyEnvelopes: [],
    scopedShares: [],
    privateLinks: [],
    keyRotationJobs: [],
  }
}

describe('restorable backup snapshot validation', () => {
  it('accepts an owned encrypted snapshot and applies defaults to old version 1 backups', () => {
    const snapshot = makeSnapshot()
    expect(backupSnapshotSchema.safeParse(snapshot).success).toBe(true)
    const legacy = {
      ...snapshot,
      groups: undefined,
      groupMembers: undefined,
      scopedKeyEnvelopes: undefined,
      scopedShares: undefined,
      privateLinks: undefined,
      keyRotationJobs: undefined,
    }
    expect(backupSnapshotSchema.safeParse(legacy).success).toBe(true)
  })

  it('rejects cross-account vault rows before a restore is attempted', () => {
    const snapshot = makeSnapshot()
    const invalidSnapshot = {
      ...snapshot,
      vaultItems: [
        {
          id: crypto.randomUUID(),
          vaultId: snapshot.vaults[0]!.id,
          userId: crypto.randomUUID(),
          encryptedPayload: {},
        },
      ],
    }
    expect(backupSnapshotSchema.safeParse(invalidSnapshot).success).toBe(false)
  })

  it('rejects every cross-account and unknown-reference rule', () => {
    const base = makeSnapshot()
    const owner = base.vaults[0]!.userId
    const vaultId = base.vaults[0]!.id
    const other = crypto.randomUUID()
    const projectId = crypto.randomUUID()
    const environmentId = crypto.randomUUID()
    const groupId = base.groups[0]!.id

    const cases: unknown[] = [
      {
        ...base,
        vaults: [...base.vaults, { ...base.vaults[0]!, id: crypto.randomUUID(), userId: other }],
      },
      {
        ...base,
        vaultItems: [
          { id: crypto.randomUUID(), vaultId: other, userId: owner, encryptedPayload: {} },
        ],
      },
      { ...base, projects: [{ id: projectId, vaultId, userId: other, encryptedMetadata: {} }] },
      {
        ...base,
        projects: [{ id: projectId, vaultId: other, userId: owner, encryptedMetadata: {} }],
      },
      {
        ...base,
        environments: [
          { id: environmentId, projectId, vaultId, userId: other, encryptedMetadata: {} },
        ],
      },
      {
        ...base,
        environments: [
          {
            id: environmentId,
            projectId: other,
            vaultId: other,
            userId: owner,
            encryptedMetadata: {},
          },
        ],
      },
      {
        ...base,
        envFiles: [{ id: crypto.randomUUID(), environmentId, userId: other, encryptedLayout: {} }],
      },
      {
        ...base,
        envFiles: [
          { id: crypto.randomUUID(), environmentId: other, userId: owner, encryptedLayout: {} },
        ],
      },
      {
        ...base,
        shares: [
          {
            id: crypto.randomUUID(),
            vaultId,
            ownerId: other,
            recipientId: other,
            encryptedVaultKey: {},
            permission: 'read',
            status: 'accepted',
          },
        ],
      },
      {
        ...base,
        shares: [
          {
            id: crypto.randomUUID(),
            vaultId: other,
            ownerId: owner,
            recipientId: other,
            encryptedVaultKey: {},
            permission: 'read',
            status: 'accepted',
          },
        ],
      },
      {
        ...base,
        keyMaterial: {
          userId: other,
          publicKeyX25519: 'a'.repeat(44),
          publicKeyEd25519: 'b'.repeat(44),
          encryptedPrivateKeys: {},
          accountKeyPassphraseEnvelope: {},
          accountKeyRecoveryEnvelope: {},
          kdfParameters: {},
        },
      },
      { ...base, groups: [{ id: groupId, ownerId: other, name: 'Equipe' }] },
      { ...base, groupMembers: [{ id: crypto.randomUUID(), groupId: other, userId: owner }] },
      {
        ...base,
        scopedKeyEnvelopes: [
          {
            id: crypto.randomUUID(),
            vaultId,
            ownerId: other,
            resourceType: 'project',
            resourceId: projectId,
            keyVersion: 1,
            ownerEnvelope: {},
          },
        ],
      },
      {
        ...base,
        scopedShares: [
          {
            id: crypto.randomUUID(),
            vaultId,
            ownerId: other,
            recipientId: owner,
            groupId: null,
            resourceType: 'secret',
            resourceId: projectId,
            keyVersion: 1,
            encryptedScopeKey: {},
            status: 'pending',
          },
        ],
      },
      {
        ...base,
        privateLinks: [
          {
            id: crypto.randomUUID(),
            tokenHash: 'a'.repeat(64),
            ownerId: other,
            vaultId,
            resourceType: 'secret',
            resourceId: projectId,
            encryptedPayload: {},
            permissions: {},
            useCount: 0,
            maxUses: null,
            expiresAt: null,
            revokedAt: null,
          },
        ],
      },
      {
        ...base,
        keyRotationJobs: [
          {
            id: crypto.randomUUID(),
            vaultId,
            ownerId: other,
            resourceType: 'project',
            resourceId: projectId,
            fromVersion: 1,
            toVersion: 2,
            status: 'pending',
          },
        ],
      },
    ]
    for (const snapshot of cases) {
      expect(backupSnapshotSchema.safeParse(snapshot).success).toBe(false)
    }
  })
})
