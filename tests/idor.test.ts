import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: sessionMock }))

import { DELETE, PUT } from '../app/api/vault-items/[itemId]/route'
import { db } from '@/lib/db'
import { user, vaultItems, vaultMembers, vaultItemVersions, vaults } from '@/lib/db/schema'

const blob = {
  v: 1 as const,
  alg: 'A256GCM' as const,
  nonce: 'bm9uY2VfMTIzNDU2Nzg',
  ct: 'Y2lwaGVydGV4dF9sb25nX2Vub3VnaF9wYWRkaW5n',
}

const ownerId = crypto.randomUUID()
const attackerId = crypto.randomUUID()
const viewerId = crypto.randomUUID()
const vaultId = crypto.randomUUID()
const itemId = crypto.randomUUID()
const baseUrl = 'http://localhost:3100/api/vault-items'

function mutation(method: 'PUT' | 'DELETE', body?: unknown): Request {
  return new Request(`${baseUrl}/${itemId}`, {
    method,
    headers: {
      origin: 'http://localhost:3100',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const updateBody = {
  vaultId,
  expectedVersion: 1,
  nextVersion: 2,
  metadata: blob,
  value: blob,
}

const databaseUrl = process.env.DATABASE_URL ?? ''
const hasLiveDatabase = databaseUrl.length > 0 && !databaseUrl.includes('user:password@127.0.0.1')

describe.skipIf(!hasLiveDatabase)('isolation des objets d’autrui (IDOR)', () => {
  beforeAll(async () => {
    await db.insert(user).values([
      { id: ownerId, name: 'Owner', email: `${ownerId}@test.invalid`, emailVerified: true },
      {
        id: attackerId,
        name: 'Attacker',
        email: `${attackerId}@test.invalid`,
        emailVerified: true,
      },
      { id: viewerId, name: 'Viewer', email: `${viewerId}@test.invalid`, emailVerified: true },
    ])
    await db.insert(vaults).values({
      id: vaultId,
      userId: ownerId,
      kind: 'personal',
      keySalt: 'c2FsdA',
      wrappedKey: { v: 1, passphrase: blob, recovery: blob },
      kdfParameters: { algorithm: 2, opsLimit: 3, memLimit: 67108864 },
    })
    await db.insert(vaultItems).values({
      id: itemId,
      vaultId,
      userId: ownerId,
      encryptedPayload: { version: 1, metadata: blob, value: blob },
    })
    await db.insert(vaultMembers).values({
      vaultId,
      userId: viewerId,
      role: 'viewer',
      permissions: {},
      addedBy: ownerId,
    })
  })

  beforeEach(() => {
    sessionMock.mockReset()
  })

  afterAll(async () => {
    await db.delete(vaultItemVersions).where(eq(vaultItemVersions.itemId, itemId))
    await db.delete(vaultMembers).where(eq(vaultMembers.vaultId, vaultId))
    await db.delete(vaultItems).where(eq(vaultItems.id, itemId))
    await db.delete(vaults).where(eq(vaults.id, vaultId))
    await db.delete(user).where(inArray(user.id, [ownerId, attackerId, viewerId]))
  })

  it('refuse une modification sans session', async () => {
    sessionMock.mockResolvedValue(null)
    const response = await PUT(mutation('PUT', updateBody), { params: Promise.resolve({ itemId }) })
    expect(response.status).toBe(401)
  })

  it('refuse une modification d’un secret appartenant à un autre compte', async () => {
    sessionMock.mockResolvedValue({ user: { id: attackerId } })
    const response = await PUT(mutation('PUT', updateBody), { params: Promise.resolve({ itemId }) })
    expect(response.status).toBe(404)
  })

  it('refuse une suppression d’un secret appartenant à un autre compte', async () => {
    sessionMock.mockResolvedValue({ user: { id: attackerId } })
    const response = await DELETE(mutation('DELETE'), { params: Promise.resolve({ itemId }) })
    expect(response.status).toBe(404)
  })

  it('refuse une modification à un membre sans permission update', async () => {
    sessionMock.mockResolvedValue({ user: { id: viewerId } })
    const response = await PUT(mutation('PUT', updateBody), { params: Promise.resolve({ itemId }) })
    expect(response.status).toBe(403)
  })

  it('conserve la version sortante en table immuable lors d’une modification autorisée', async () => {
    sessionMock.mockResolvedValue({ user: { id: ownerId } })
    const response = await PUT(mutation('PUT', updateBody), { params: Promise.resolve({ itemId }) })
    expect(response.status).toBe(200)
    const rows = await db
      .select({ version: vaultItemVersions.version })
      .from(vaultItemVersions)
      .where(and(eq(vaultItemVersions.itemId, itemId), eq(vaultItemVersions.version, 1)))
    expect(rows).toHaveLength(1)
  })
})
