import { deriveObjectKeyBytes } from './aead'
import { encodeBase64Url } from './encoding'
import { withKey } from './key-store'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

export async function valueFingerprint(vaultId: string, objectId: string, value: string): Promise<string> {
  return withKey(vaultId, async (rootKey) => {
    const keyBytes = await deriveObjectKeyBytes(rootKey, 'secret', objectId)
    const bytes = new TextEncoder().encode(value)
    try {
      const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, toArrayBuffer(bytes)))
      return encodeBase64Url(signature.slice(0, 16))
    } finally {
      keyBytes.fill(0)
      bytes.fill(0)
    }
  })
}

export async function compareFingerprints(vaultId: string, objectId: string, left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    valueFingerprint(vaultId, objectId, left),
    valueFingerprint(vaultId, objectId, right),
  ])
  return a === b
}
