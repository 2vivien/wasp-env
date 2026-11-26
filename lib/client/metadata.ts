import { decryptBytes, deriveObjectKey, importRootKey } from '@/src/crypto/aead'
import type { EncryptedBlob } from '@/src/crypto/aead'
import { withKey } from '@/src/crypto/key-store'

export async function decryptObjectName(
  vaultId: string,
  objectId: string,
  objectType: string,
  blob: EncryptedBlob,
): Promise<string> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'metadata', objectId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType, objectId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as {
        name?: unknown
      }
      return typeof parsed.name === 'string' ? parsed.name : 'Sans nom'
    } finally {
      bytes.fill(0)
    }
  })
}
