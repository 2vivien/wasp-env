import type { vaultItemVersions } from '@/lib/db/schema'
import type { KeyEnvelope } from '@/src/crypto/vault-key'

type NewVersion = typeof vaultItemVersions.$inferInsert

/** Construit la version sortante en vue d'un append-only dans vault_item_versions. */
export function previousVersionRow(input: {
  itemId: string
  vaultId: string
  userId: string
  version: number
  metadata: KeyEnvelope
  value: KeyEnvelope
  updatedAt: Date
}): NewVersion {
  return {
    itemId: input.itemId,
    vaultId: input.vaultId,
    userId: input.userId,
    version: input.version,
    metadata: input.metadata,
    value: input.value,
    createdAt: input.updatedAt,
  }
}
