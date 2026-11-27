import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: sessionMock }))

import { DELETE } from '../app/api/scoped-shares/[shareId]/route'
import { POST } from '../app/api/projects/[projectId]/rotate/route'
import { db } from '@/lib/db'
import {
  keyRotationJobs,
  projects,
  scopedKeyEnvelopes,
  scopedShares,
  user,
  vaults,
} from '@/lib/db/schema'

const blob = {
  v: 1 as const,
  alg: 'A256GCM' as const,
  nonce: 'bm9uY2VfMTIzNDU2Nzg',
  ct: 'Y2lwaGVydGV4dF9sb25nX2Vub3VnaF9wYWRkaW5n',
}
const ownerId = crypto.randomUUID()
const recipientId = crypto.randomUUID()
const vaultId = crypto.randomUUID()
const projectId = crypto.randomUUID()
const shareId = crypto.randomUUID()
const origin = 'http://localhost:3100'

function mutation(method: 'DELETE' | 'POST', body?: unknown): Request {
  return new Request(`${origin}/api/test`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const databaseUrl = process.env.DATABASE_URL ?? ''
const hasLiveDatabase = databaseUrl.length > 0 && !databaseUrl.includes('127.0.0.1')

describe.skipIf(!hasLiveDatabase)('rotation de projet après révocation', () => {
  beforeAll(async () => {
    await db.insert(user).values([
      { id: ownerId, name: 'Owner', email: `${ownerId}@test.invalid`, emailVerified: true },
      {
        id: recipientId,
        name: 'Recipient',
        email: `${recipientId}@test.invalid`,
        emailVerified: true,
      },
    ])
    await db.insert(vaults).values({
      id: vaultId,
      userId: ownerId,
      kind: 'personal',
      keySalt: 'c2FsdA',
      wrappedKey: { v: 1, passphrase: blob, recovery: blob },
      kdfParameters: { algorithm: 2, opsLimit: 3, memLimit: 67108864 },
    })
    await db.insert(projects).values({
      id: projectId,
      userId: ownerId,
      vaultId,
      encryptedMetadata: blob,
      version: 1,
    })
    await db.insert(scopedShares).values({
      id: shareId,
      vaultId,
      ownerId,
      recipientId,
      resourceType: 'project',
      resourceId: projectId,
      encryptedScopeKey: blob,
      keyVersion: 1,
      permissions: {},
      status: 'accepted',
    })
  })

  beforeEach(() => sessionMock.mockReset())

  afterAll(async () => {
    await db.delete(scopedKeyEnvelopes).where(eq(scopedKeyEnvelopes.resourceId, projectId))
    await db.delete(keyRotationJobs).where(eq(keyRotationJobs.resourceId, projectId))
    await db.delete(scopedShares).where(eq(scopedShares.id, shareId))
    await db.delete(projects).where(eq(projects.id, projectId))
    await db.delete(vaults).where(eq(vaults.id, vaultId))
    await db.delete(user).where(inArray(user.id, [ownerId, recipientId]))
  })

  it('crée un job de rotation lors de la révocation puis le finalise', async () => {
    sessionMock.mockResolvedValue({ user: { id: ownerId } })
    const revoked = await DELETE(mutation('DELETE'), { params: Promise.resolve({ shareId }) })
    expect(revoked.status).toBe(200)
    const revocation = (await revoked.json()) as {
      rotationRequired: boolean
      rotationJobId: string
    }
    expect(revocation.rotationRequired).toBe(true)
    expect(revocation.rotationJobId).toBeTruthy()

    const [job] = await db
      .select({ status: keyRotationJobs.status })
      .from(keyRotationJobs)
      .where(eq(keyRotationJobs.id, revocation.rotationJobId))
    expect(job?.status).toBe('pending')

    const completed = await POST(
      mutation('POST', {
        vaultId,
        expectedScopeKeyVersion: 1,
        nextScopeKeyVersion: 2,
        project: { expectedVersion: 1, version: 2, encryptedMetadata: blob },
        nextOwnerEnvelope: blob,
        environments: [],
        envFiles: [],
      }),
      { params: Promise.resolve({ projectId }) },
    )
    expect(completed.status).toBe(200)

    const [finished] = await db
      .select({ status: keyRotationJobs.status })
      .from(keyRotationJobs)
      .where(
        and(
          eq(keyRotationJobs.id, revocation.rotationJobId),
          eq(keyRotationJobs.status, 'completed'),
        ),
      )
    expect(finished?.status).toBe('completed')
    const [envelope] = await db
      .select({ keyVersion: scopedKeyEnvelopes.keyVersion })
      .from(scopedKeyEnvelopes)
      .where(
        and(eq(scopedKeyEnvelopes.resourceId, projectId), eq(scopedKeyEnvelopes.keyVersion, 2)),
      )
    expect(envelope?.keyVersion).toBe(2)
  })
})
