import { decryptBytes, deriveObjectKey, encryptBytes, importRootKey } from '@/src/crypto/aead'
import type { EncryptedBlob } from '@/src/crypto/aead'
import { withKey } from '@/src/crypto/key-store'

export async function decryptEnvFile(
  vaultId: string,
  environmentId: string,
  blob: EncryptedBlob,
  version: number,
): Promise<string> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'secret', environmentId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType: 'env-file', objectId: environmentId, version })
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    finally { bytes.fill(0) }
  })
}

export async function encryptEnvFile(
  vaultId: string,
  environmentId: string,
  source: string,
  version: number,
): Promise<EncryptedBlob> {
  const bytes = new TextEncoder().encode(source)
  try {
    return await withKey(vaultId, async (rawKey) => {
      const root = await importRootKey(rawKey)
      const key = await deriveObjectKey(root, 'secret', environmentId)
      return encryptBytes(key, bytes, { vaultId, objectType: 'env-file', objectId: environmentId, version })
    })
  } finally { bytes.fill(0) }
}
