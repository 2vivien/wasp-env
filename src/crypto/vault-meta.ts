import { decryptBytes, deriveObjectKey, encryptBytes, importRootKey } from './aead'
import type { EncryptedBlob } from './aead'
import { withKey } from './key-store'

export type VaultMeta = {
  name: string
  description: string
  icon: string
  color: string
}

const EMPTY_META: VaultMeta = { name: '', description: '', icon: 'vault', color: 'default' }

function normalize(meta: Partial<VaultMeta>): VaultMeta {
  return {
    name: (meta.name ?? EMPTY_META.name).trim(),
    description: (meta.description ?? EMPTY_META.description).trim(),
    icon: meta.icon ?? EMPTY_META.icon,
    color: meta.color ?? EMPTY_META.color,
  }
}

export async function encryptVaultMeta(vaultId: string, meta: Partial<VaultMeta>): Promise<EncryptedBlob> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalize(meta)))
  try {
    return await withKey(vaultId, async (rawKey) => {
      const root = await importRootKey(rawKey)
      const key = await deriveObjectKey(root, 'metadata', vaultId)
      return encryptBytes(key, bytes, { vaultId, objectType: 'vault-meta', objectId: vaultId, version: 1 })
    })
  } finally { bytes.fill(0) }
}

export async function decryptVaultMeta(vaultId: string, blob: EncryptedBlob): Promise<VaultMeta> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'metadata', vaultId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType: 'vault-meta', objectId: vaultId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<VaultMeta>
      return normalize(parsed)
    } finally { bytes.fill(0) }
  })
}
