import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
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
