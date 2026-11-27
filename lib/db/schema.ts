import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { WrappedVaultKey, KdfParameters, EncryptedVaultItem } from '@/src/crypto/vault-key'

const createdAt = () => timestamp('createdAt', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow()

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
)

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
})

export type OnboardingStep = 'handle' | 'passphrase' | 'recovery' | 'done'

export const profiles = pgTable(
  'profiles',
  {
    userId: text('userId')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    handle: text('handle'),
    handleNormalized: text('handleNormalized'),
    displayName: text('displayName'),
    avatarUrl: text('avatarUrl'),
    bio: text('bio'),
    handleChangedAt: timestamp('handleChangedAt', { withTimezone: true }),
    onboardingStep: text('onboardingStep').$type<OnboardingStep>().notNull().default('handle'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('profiles_handle_unique').on(table.handleNormalized)],
)

export const reservedHandles = pgTable(
  'reserved_handles',
  {
    handleNormalized: text('handleNormalized').primaryKey(),
    userId: text('userId').references(() => user.id, { onDelete: 'set null' }),
    reservedUntil: timestamp('reservedUntil', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('reserved_handles_until_idx').on(table.reservedUntil)],
)

export const vaults = pgTable(
  'vaults',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'personal' | 'shared'>().notNull().default('personal'),
    keySalt: text('keySalt').notNull(),
    wrappedKey: jsonb('wrappedKey').$type<WrappedVaultKey>().notNull(),
    kdfParameters: jsonb('kdfParameters').$type<KdfParameters>().notNull(),
    encMeta: jsonb('encMeta').$type<{ v: 1; alg: 'A256GCM'; nonce: string; ct: string }>(),
    keyVersion: integer('keyVersion').notNull().default(1),
    archivedAt: timestamp('archivedAt', { withTimezone: true }),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('vaults_user_id_idx').on(table.userId),
    uniqueIndex('vaults_personal_user_unique')
      .on(table.userId)
      .where(sql`${table.kind} = 'personal'`),
    index('vaults_active_user_idx')
      .on(table.userId, table.updatedAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('vaults_audit_idx').on(table.id, table.createdAt),
  ],
)

export const vaultMembers = pgTable(
  'vault_members',
  {
    vaultId: text('vaultId')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role')
      .$type<'viewer' | 'user' | 'editor' | 'admin' | 'owner'>()
      .notNull()
      .default('viewer'),
    permissions: jsonb('permissions').notNull().default({}),
    addedBy: text('addedBy').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('vault_members_vault_user_unique').on(table.vaultId, table.userId),
    uniqueIndex('vault_members_owner_unique')
      .on(table.vaultId)
      .where(sql`${table.role} = 'owner'`),
    index('vault_members_user_idx').on(table.userId),
  ],
)

export const vaultKeyEnvelopes = pgTable(
  'vault_key_envelopes',
  {
    vaultId: text('vaultId')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    keyVersion: integer('keyVersion').notNull().default(1),
    sealedKey: jsonb('sealedKey').$type<{ v: 1; alg: 'X25519-SEAL'; ct: string }>().notNull(),
    senderPublicKey: text('senderPublicKey').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('vault_key_envelopes_pk').on(table.vaultId, table.userId, table.keyVersion),
  ],
)

export const vaultItems = pgTable(
  'vault_items',
  {
    id: text('id').primaryKey(),
    vaultId: text('vaultId').notNull(),
    userId: text('userId').notNull(),
    encryptedPayload: jsonb('encryptedPayload').$type<EncryptedVaultItem>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('vault_items_user_vault_idx').on(table.userId, table.vaultId)],
)

export const vaultItemVersions = pgTable(
  'vault_item_versions',
  {
    itemId: text('itemId')
      .notNull()
      .references(() => vaultItems.id, { onDelete: 'cascade' }),
    vaultId: text('vaultId').notNull(),
    userId: text('userId').notNull(),
    version: integer('version').notNull(),
    metadata: jsonb('metadata').notNull(),
    value: jsonb('value').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('vault_item_versions_item_version_unique').on(table.itemId, table.version),
    index('vault_item_versions_item_desc_idx').on(table.itemId, table.version),
  ],
)

export const userKeyMaterial = pgTable('user_key_material', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  publicKeyX25519: text('publicKeyX25519').notNull(),
  publicKeyEd25519: text('publicKeyEd25519').notNull(),
  encryptedPrivateKeys: jsonb('encryptedPrivateKeys').notNull(),
  accountKeyPassphraseEnvelope: jsonb('accountKeyPassphraseEnvelope').notNull(),
  accountKeyRecoveryEnvelope: jsonb('accountKeyRecoveryEnvelope').notNull(),
  kdfParameters: jsonb('kdfParameters').notNull(),
  formatVersion: integer('formatVersion').notNull().default(1),
  rotatedAt: timestamp('rotatedAt', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    vaultId: text('vaultId')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    encryptedMetadata: jsonb('encryptedMetadata').notNull(),
    version: integer('version').notNull().default(1),
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archivedAt', { withTimezone: true }),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('projects_user_vault_idx').on(table.userId, table.vaultId)],
)

export const environments = pgTable(
  'environments',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    vaultId: text('vaultId')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    projectId: text('projectId')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind')
      .$type<'development' | 'staging' | 'production' | 'testing' | 'custom'>()
      .notNull(),
    encryptedMetadata: jsonb('encryptedMetadata').notNull(),
    position: integer('position').notNull().default(0),
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('environments_user_project_idx').on(table.userId, table.projectId)],
)

export const envFiles = pgTable(
  'env_files',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    environmentId: text('environmentId')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    encryptedLayout: jsonb('encryptedLayout').notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('env_files_user_environment_unique').on(table.userId, table.environmentId),
  ],
)

export const envFileVersions = pgTable(
  'env_file_versions',
  {
    id: text('id').primaryKey(),
    environmentId: text('environmentId')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    encryptedLayout: jsonb('encryptedLayout').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('env_file_versions_env_version_unique').on(
      table.environmentId,
      table.userId,
      table.version,
    ),
  ],
)

export const vaultShares = pgTable(
  'vault_shares',
  {
    id: text('id').primaryKey(),
    vaultId: text('vaultId')
      .notNull()
      .references(() => vaults.id, { onDelete: 'cascade' }),
    ownerId: text('ownerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipientId: text('recipientId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    encryptedVaultKey: jsonb('encryptedVaultKey').notNull(),
    permission: text('permission').$type<'read' | 'write'>().notNull(),
    status: text('status').$type<'pending' | 'accepted' | 'revoked'>().notNull().default('pending'),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    acceptedAt: timestamp('acceptedAt', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('vault_shares_vault_recipient_unique').on(table.vaultId, table.recipientId),
    index('vault_shares_recipient_status_idx').on(table.recipientId, table.status),
    index('vault_shares_owner_created_idx').on(table.ownerId, table.createdAt),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actorId').references(() => user.id, { onDelete: 'set null' }),
    vaultId: text('vaultId'),
    event: text('event').notNull(),
    targetKind: text('targetKind').notNull(),
    targetId: text('targetId'),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
    ipHash: text('ipHash'),
    createdAt: createdAt(),
  },
  (table) => [index('audit_logs_actor_created_idx').on(table.actorId, table.createdAt)],
)

export const vaultGroups = pgTable(
  'vault_groups',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('vault_groups_owner_idx').on(table.ownerId, table.createdAt)],
)

export const vaultGroupMembers = pgTable(
  'vault_group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('vault_group_members_group_user_unique').on(table.groupId, table.userId),
    index('vault_group_members_user_idx').on(table.userId, table.groupId),
  ],
)

export const scopedKeyEnvelopes = pgTable(
  'scoped_key_envelopes',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id').notNull(),
    ownerId: text('owner_id').notNull(),
    resourceType: text('resource_type').$type<'project' | 'secret'>().notNull(),
    resourceId: text('resource_id').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    ownerEnvelope: jsonb('owner_envelope').notNull(),
    migratedAt: timestamp('migrated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('scoped_key_envelopes_resource_unique').on(
      table.ownerId,
      table.resourceType,
      table.resourceId,
      table.keyVersion,
    ),
  ],
)

export const scopedShares = pgTable(
  'scoped_shares',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id').notNull(),
    ownerId: text('owner_id').notNull(),
    recipientId: text('recipient_id'),
    groupId: text('group_id'),
    resourceType: text('resource_type').$type<'project' | 'secret'>().notNull(),
    resourceId: text('resource_id').notNull(),
    encryptedScopeKey: jsonb('encrypted_scope_key').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    permissions: jsonb('permissions').notNull(),
    status: text('status').$type<'pending' | 'accepted' | 'revoked'>().notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('scoped_shares_recipient_idx').on(table.recipientId, table.status, table.expiresAt),
    index('scoped_shares_group_idx').on(table.groupId, table.status),
  ],
)

export const privateShareLinks = pgTable(
  'private_share_links',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    ownerId: text('owner_id').notNull(),
    vaultId: text('vault_id').notNull(),
    resourceType: text('resource_type').$type<'project' | 'secret'>().notNull(),
    resourceId: text('resource_id').notNull(),
    encryptedPayload: jsonb('encrypted_payload').notNull(),
    permissions: jsonb('permissions').notNull(),
    accessCodeHash: text('access_code_hash'),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('private_share_links_owner_idx').on(table.ownerId, table.createdAt)],
)

export const privateShareLinkUses = pgTable('private_share_link_uses', {
  id: text('id').primaryKey(),
  linkId: text('link_id').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
  clientFingerprintHash: text('client_fingerprint_hash'),
})

export const keyRotationJobs = pgTable(
  'key_rotation_jobs',
  {
    id: text('id').primaryKey(),
    vaultId: text('vault_id').notNull(),
    ownerId: text('owner_id').notNull(),
    resourceType: text('resource_type').$type<'vault' | 'project' | 'secret'>().notNull(),
    resourceId: text('resource_id').notNull(),
    fromVersion: integer('from_version').notNull(),
    toVersion: integer('to_version').notNull(),
    status: text('status')
      .$type<'pending' | 'running' | 'completed' | 'failed'>()
      .notNull()
      .default('pending'),
    cursor: text('cursor'),
    completedCount: integer('completed_count').notNull().default(0),
    totalCount: integer('total_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('key_rotation_jobs_owner_status_idx').on(table.ownerId, table.status, table.updatedAt),
  ],
)

export const sessionMetadata = pgTable(
  'session_metadata',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('sessionId')
      .notNull()
      .references(() => session.id, { onDelete: 'cascade' }),
    deviceName: text('deviceName'),
    lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('session_metadata_user_session_unique').on(table.userId, table.sessionId),
    index('session_metadata_user_idx').on(table.userId, table.lastUsedAt),
  ],
)
