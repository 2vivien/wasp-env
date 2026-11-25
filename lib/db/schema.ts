import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
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

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_id_idx').on(table.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
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

export const profiles = pgTable('profiles', {
  userId: text('userId').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  handle: text('handle'),
  handleNormalized: text('handleNormalized'),
  displayName: text('displayName'),
  avatarUrl: text('avatarUrl'),
  bio: text('bio'),
  handleChangedAt: timestamp('handleChangedAt', { withTimezone: true }),
  onboardingStep: text('onboardingStep').$type<OnboardingStep>().notNull().default('handle'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('profiles_handle_unique').on(table.handleNormalized)])

export const vaults = pgTable('vaults', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  keySalt: text('keySalt').notNull(),
  wrappedKey: jsonb('wrappedKey').$type<WrappedVaultKey>().notNull(),
  kdfParameters: jsonb('kdfParameters').$type<KdfParameters>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('vaults_user_id_idx').on(table.userId)])

export const vaultItems = pgTable('vault_items', {
  id: text('id').primaryKey(),
  vaultId: text('vaultId').notNull(),
  userId: text('userId').notNull(),
  encryptedPayload: jsonb('encryptedPayload').$type<EncryptedVaultItem>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('vault_items_user_vault_idx').on(table.userId, table.vaultId)])

export const userKeyMaterial = pgTable('user_key_material', {
  userId: text('userId').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
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

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  vaultId: text('vaultId').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  encryptedMetadata: jsonb('encryptedMetadata').notNull(),
  position: integer('position').notNull().default(0),
  archivedAt: timestamp('archivedAt', { withTimezone: true }),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('projects_user_vault_idx').on(table.userId, table.vaultId)])

export const environments = pgTable('environments', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  vaultId: text('vaultId').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  projectId: text('projectId').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'development' | 'staging' | 'production' | 'testing' | 'custom'>().notNull(),
  encryptedMetadata: jsonb('encryptedMetadata').notNull(),
  position: integer('position').notNull().default(0),
  version: integer('version').notNull().default(1),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('environments_user_project_idx').on(table.userId, table.projectId)])

export const envFiles = pgTable('env_files', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  environmentId: text('environmentId').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  encryptedLayout: jsonb('encryptedLayout').notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('env_files_user_environment_unique').on(table.userId, table.environmentId)])

export const vaultShares = pgTable('vault_shares', {
  id: text('id').primaryKey(),
  vaultId: text('vaultId').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  ownerId: text('ownerId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  recipientId: text('recipientId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  encryptedVaultKey: jsonb('encryptedVaultKey').notNull(),
  permission: text('permission').$type<'read' | 'write'>().notNull(),
  status: text('status').$type<'pending' | 'accepted' | 'revoked'>().notNull().default('pending'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  acceptedAt: timestamp('acceptedAt', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('vault_shares_vault_recipient_unique').on(table.vaultId, table.recipientId),
  index('vault_shares_recipient_status_idx').on(table.recipientId, table.status),
  index('vault_shares_owner_created_idx').on(table.ownerId, table.createdAt),
])

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actorId').references(() => user.id, { onDelete: 'set null' }),
  vaultId: text('vaultId'),
  event: text('event').notNull(),
  targetKind: text('targetKind').notNull(),
  targetId: text('targetId'),
  metadata: jsonb('metadata').$type<Record<string, string | number | boolean>>().notNull().default({}),
  ipHash: text('ipHash'),
  createdAt: createdAt(),
}, (table) => [index('audit_logs_actor_created_idx').on(table.actorId, table.createdAt)])

export const sessionMetadata = pgTable('session_metadata', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sessionId: text('sessionId').notNull().references(() => session.id, { onDelete: 'cascade' }),
  deviceName: text('deviceName'),
  lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('session_metadata_user_session_unique').on(table.userId, table.sessionId), index('session_metadata_user_idx').on(table.userId, table.lastUsedAt)])
