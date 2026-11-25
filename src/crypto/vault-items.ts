import { decryptBytes, deriveObjectKey, encryptBytes, importRootKey } from './aead'
import { withKey } from './key-store'
import type { EncryptedVaultItem } from './vault-key'

export type VaultItemKind = 'secret' | 'env-file'
export type VaultItemMetadata = { name: string; kind: VaultItemKind }

export async function decryptVaultItemMetadata(vaultId: string, itemId: string, item: EncryptedVaultItem): Promise<VaultItemMetadata> {
  return withKey(vaultId, async (rawRootKey) => {
    const rootKey = await importRootKey(rawRootKey)
    const key = await deriveObjectKey(rootKey, 'metadata', itemId)
    const bytes = await decryptBytes(key, item.metadata, {
      vaultId,
      objectType: 'secret-meta',
      objectId: itemId,
      version: item.version,
    })
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown; kind?: unknown }
      return {
        name: typeof parsed.name === 'string' ? parsed.name : 'Secret sans nom',
        kind: parsed.kind === 'env-file' ? 'env-file' : 'secret',
      }
    } finally {
      bytes.fill(0)
    }
  })
}

export async function decryptVaultItemValue(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
  kind: VaultItemKind = 'secret',
): Promise<string> {
  return withKey(vaultId, async (rawRootKey) => {
    const rootKey = await importRootKey(rawRootKey)
    const key = await deriveObjectKey(rootKey, 'secret', itemId)
    const bytes = await decryptBytes(key, item.value, {
      vaultId,
      objectType: 'secret',
      objectId: itemId,
      version: item.version,
    })
    try {
      const decoded = kind === 'env-file'
        ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
        : new TextDecoder().decode(bytes)
      if (kind === 'env-file') return decoded
      const parsed = JSON.parse(decoded) as { value?: unknown }
      return typeof parsed.value === 'string' ? parsed.value : ''
    } finally {
      bytes.fill(0)
    }
  })
}

export async function encryptVaultItemPayload(
  vaultId: string,
  itemId: string,
  version: number,
  name: string,
  value: string,
  kind: VaultItemKind = 'secret',
): Promise<EncryptedVaultItem> {
  const metadataBytes = new TextEncoder().encode(JSON.stringify({ name: name.trim(), kind }))
  const valueBytes = new TextEncoder().encode(kind === 'env-file' ? value : JSON.stringify({ value }))
  try {
    return await withKey(vaultId, async (rawRootKey) => {
      const rootKey = await importRootKey(rawRootKey)
      const metadataKey = await deriveObjectKey(rootKey, 'metadata', itemId)
      const secretKey = await deriveObjectKey(rootKey, 'secret', itemId)
      const [metadata, encryptedValue] = await Promise.all([
        encryptBytes(metadataKey, metadataBytes, { vaultId, objectType: 'secret-meta', objectId: itemId, version }),
        encryptBytes(secretKey, valueBytes, { vaultId, objectType: 'secret', objectId: itemId, version }),
      ])
      return { version, metadata, value: encryptedValue }
    })
  } finally {
    metadataBytes.fill(0)
    valueBytes.fill(0)
  }
}
