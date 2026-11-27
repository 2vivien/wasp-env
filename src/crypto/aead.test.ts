import { describe, expect, it } from 'vitest'
import { decryptBytes, encryptBytes, importAesKey, importRootKey } from './aead'

const context = { vaultId: 'vault-1', objectType: 'secret', objectId: 'item-1', version: 1 }

describe('chiffrement AES-GCM', () => {
  it('exige une clé racine de 32 octets', async () => {
    await expect(importRootKey(new Uint8Array(16))).rejects.toThrow(TypeError)
    await expect(importRootKey(new Uint8Array(32))).resolves.toBeDefined()
  })

  it('refuse un blob dont la version, le nonce ou le ciphertext est invalide', async () => {
    const key = await importAesKey(new Uint8Array(32))
    const blob = await encryptBytes(key, new TextEncoder().encode('valeur'), context)
    await expect(
      decryptBytes(key, { ...blob, v: 2 } as unknown as typeof blob, context),
    ).rejects.toThrow()
    await expect(
      decryptBytes(key, { ...blob, alg: 'AES-CBC' } as unknown as typeof blob, context),
    ).rejects.toThrow()
    await expect(decryptBytes(key, { ...blob, nonce: 'YQ' }, context)).rejects.toThrow()
    await expect(decryptBytes(key, { ...blob, ct: 'YQ' }, context)).rejects.toThrow()
  })

  it('refuse un contexte AAD différent', async () => {
    const key = await importAesKey(new Uint8Array(32))
    const blob = await encryptBytes(key, new TextEncoder().encode('valeur'), context)
    await expect(decryptBytes(key, blob, { ...context, objectId: 'item-2' })).rejects.toThrow()
  })
})
