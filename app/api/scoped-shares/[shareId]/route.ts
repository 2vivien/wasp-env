import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { hasValidMutationHeaders, jsonNoStore } from '@/lib/api'
import { getCurrentSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLogs, envFiles, environments, projects, scopedShares, vaultItems } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ shareId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  const { shareId } = await params
  if (!z.string().uuid().safeParse(shareId).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const now = new Date()
  const [share] = await db.select({ ownerId: scopedShares.ownerId, recipientId: scopedShares.recipientId, resourceId: scopedShares.resourceId, resourceType: scopedShares.resourceType, vaultId: scopedShares.vaultId, keyVersion: scopedShares.keyVersion, encryptedScopeKey: scopedShares.encryptedScopeKey })
    .from(scopedShares).where(and(eq(scopedShares.id, shareId), eq(scopedShares.status, 'accepted'), eq(scopedShares.recipientId, session.user.id), or(isNull(scopedShares.expiresAt), gt(scopedShares.expiresAt, now)))).limit(1)
  if (!share) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  if (share.resourceType === 'secret') {
    const [item] = await db.select({ encryptedPayload: vaultItems.encryptedPayload })
      .from(vaultItems).where(and(eq(vaultItems.id, share.resourceId), eq(vaultItems.vaultId, share.vaultId), eq(vaultItems.userId, share.ownerId))).limit(1)
    if (!item || (item.encryptedPayload.scopeKeyVersion ?? 1) !== share.keyVersion) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
    const currentPayload = { ...item.encryptedPayload, history: undefined }
    return jsonNoStore({ encryptedScopeKey: share.encryptedScopeKey, encryptedPayload: currentPayload, vaultId: share.vaultId, resourceId: share.resourceId, resourceType: 'secret', keyVersion: share.keyVersion })
  }

  const [project] = await db.select({ id: projects.id, vaultId: projects.vaultId, encryptedMetadata: projects.encryptedMetadata })
    .from(projects).where(and(eq(projects.id, share.resourceId), eq(projects.vaultId, share.vaultId), eq(projects.userId, share.ownerId), isNull(projects.deletedAt))).limit(1)
  if (!project || share.keyVersion !== 1) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const environmentRows = await db.select({ id: environments.id, kind: environments.kind, encryptedMetadata: environments.encryptedMetadata, version: environments.version })
    .from(environments).where(and(eq(environments.projectId, project.id), eq(environments.userId, share.ownerId), isNull(environments.deletedAt))).limit(20)
  const environmentIds = environmentRows.map(({ id }) => id)
  const fileRows = environmentIds.length ? await db.select({ environmentId: envFiles.environmentId, encryptedLayout: envFiles.encryptedLayout, version: envFiles.version })
    .from(envFiles).where(and(inArray(envFiles.environmentId, environmentIds), eq(envFiles.userId, share.ownerId))) : []
  const fileByEnvironment = new Map(fileRows.map((file) => [file.environmentId, file]))
  const projectPayload = {
    id: project.id, vaultId: project.vaultId, encryptedMetadata: project.encryptedMetadata,
    environments: environmentRows.map((environment) => ({ ...environment, envFile: fileByEnvironment.get(environment.id) ?? null })),
  }
  if (new TextEncoder().encode(JSON.stringify(projectPayload)).byteLength > 5 * 1024 * 1024) return jsonNoStore({ error: { code: 'SCOPE_TOO_LARGE' } }, 413)
  return jsonNoStore({ encryptedScopeKey: share.encryptedScopeKey, project: projectPayload, vaultId: share.vaultId, resourceId: share.resourceId, resourceType: 'project', keyVersion: share.keyVersion })
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, true)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { shareId } = await params
  if (!z.string().uuid().safeParse(shareId).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const now = new Date()
  const [accepted] = await db.update(scopedShares).set({ status: 'accepted', acceptedAt: now, updatedAt: now })
    .where(and(eq(scopedShares.id, shareId), eq(scopedShares.recipientId, session.user.id), eq(scopedShares.status, 'pending'), or(isNull(scopedShares.expiresAt), gt(scopedShares.expiresAt, now))))
    .returning({ id: scopedShares.id, ownerId: scopedShares.ownerId, vaultId: scopedShares.vaultId, resourceId: scopedShares.resourceId, resourceType: scopedShares.resourceType })
  if (!accepted) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: accepted.vaultId, event: accepted.resourceType === 'secret' ? 'scoped_secret_share_accepted' : 'scoped_project_share_accepted', targetKind: accepted.resourceType, targetId: accepted.resourceId })
  return jsonNoStore({ accepted: true })
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()
  if (!session?.user) return jsonNoStore({ error: { code: 'AUTH_REQUIRED' } }, 401)
  if (!hasValidMutationHeaders(request, false)) return jsonNoStore({ error: { code: 'INVALID_REQUEST' } }, 400)
  const { shareId } = await params
  if (!z.string().uuid().safeParse(shareId).success) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  const now = new Date()
  const [revoked] = await db.update(scopedShares).set({ status: 'revoked', revokedAt: now, updatedAt: now })
    .where(and(eq(scopedShares.id, shareId), eq(scopedShares.ownerId, session.user.id), isNull(scopedShares.revokedAt))).returning({ id: scopedShares.id, vaultId: scopedShares.vaultId, resourceId: scopedShares.resourceId, resourceType: scopedShares.resourceType })
  if (!revoked) return jsonNoStore({ error: { code: 'NOT_FOUND' } }, 404)
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), actorId: session.user.id, vaultId: revoked.vaultId, event: `scoped_${revoked.resourceType}_share_revoked`, targetKind: revoked.resourceType, targetId: revoked.resourceId })
  return jsonNoStore({ revoked: true, rotationRequired: true })
}
