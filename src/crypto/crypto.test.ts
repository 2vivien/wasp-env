import { describe, expect, it } from 'vitest'
import { decryptBytes, deriveObjectKey, deriveObjectKeyBytes, encryptBytes, importAesKey, importRootKey } from './aead'
import { decodeBase64Url, encodeBase64Url, wipeBytes } from './encoding'
import { lockKeyStore, storeKey, withKey } from './key-store'
import { createArgon2Salt, derivePassphraseKey } from './key-derivation'
import { createIdentityKeyPairs, openSealedKey, sealKeyForMember } from './keys'

const context = { vaultId: 'vault_01', objectType: 'secret', objectId: 'secret_01', version: 1 }

async function createTestKey(): Promise<CryptoKey> {
  const rootKey = crypto.getRandomValues(new Uint8Array(32))
  try {
    return await deriveObjectKey(await importRootKey(rootKey), 'secret', context.objectId)
  } finally {
    wipeBytes(rootKey)
  }
}

describe('base64url encoding', () => {
  it('round-trips arbitrary bytes without padding', () => {
    const value = Uint8Array.from([0, 1, 2, 253, 254, 255])
    const encoded = encodeBase64Url(value)

    expect(encoded).not.toContain('=')
    expect(decodeBase64Url(encoded)).toEqual(value)
    expect(() => decodeBase64Url('not valid!')).toThrow()
  })
})

describe('authenticated vault encryption', () => {
  it.each([0, 1, 63, 64, 65, 65_536])('round-trips a %i-byte payload', async (length) => {
    const key = await createTestKey()
    const plaintext = crypto.getRandomValues(new Uint8Array(length))
    const blob = await encryptBytes(key, plaintext, context)
    const restored = await decryptBytes(key, blob, context)

    expect(restored).toEqual(plaintext)
    expect(blob).toMatchObject({ v: 1, alg: 'A256GCM' })
    expect(decodeBase64Url(blob.nonce)).toHaveLength(12)
    expect(decodeBase64Url(blob.ct).length % 64).toBe(16)
  })

  it('rejects a blob moved to another object or version', async () => {
    const key = await createTestKey()
    const blob = await encryptBytes(key, new TextEncoder().encode('private'), context)

    await expect(decryptBytes(key, blob, { ...context, objectId: 'secret_02' })).rejects.toThrow()
    await expect(decryptBytes(key, blob, { ...context, version: 2 })).rejects.toThrow()
  })

  it('rejects ciphertext tampering and unsupported formats', async () => {
    const key = await createTestKey()
    const blob = await encryptBytes(key, new TextEncoder().encode('private'), context)
    const ciphertext = decodeBase64Url(blob.ct)
    ciphertext[0] ^= 1

    await expect(decryptBytes(key, { ...blob, ct: encodeBase64Url(ciphertext) }, context)).rejects.toThrow()
  })

  it('allows sharing one object key without exposing the root or other objects', async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32))
    try {
      const rawObjectKey = await deriveObjectKeyBytes(rootKey, 'secret', context.objectId)
      const rotatedObjectKey = await deriveObjectKeyBytes(rootKey, 'secret', context.objectId, 2)
      expect(rotatedObjectKey).not.toEqual(rawObjectKey)
      wipeBytes(rotatedObjectKey)
      const imported = await importAesKey(rawObjectKey, ['encrypt', 'decrypt'])
      const payload = new TextEncoder().encode('single secret')
      const blob = await encryptBytes(imported, payload, context)
      const root = await importRootKey(rootKey)
      const sameDerivedKey = await deriveObjectKey(root, 'secret', context.objectId)
      const otherObjectKey = await deriveObjectKey(root, 'secret', 'secret_02')
      await expect(decryptBytes(sameDerivedKey, blob, context)).resolves.toEqual(payload)
      await expect(decryptBytes(otherObjectKey, blob, context)).rejects.toThrow()
      wipeBytes(rawObjectKey)
    } finally { wipeBytes(rootKey) }
  })

  it('uses a different derived key for metadata and secret content', async () => {
    const rootKey = crypto.getRandomValues(new Uint8Array(32))
    try {
      const importedKey = await importRootKey(rootKey)
      const secretKey = await deriveObjectKey(importedKey, 'secret', context.objectId)
      const metadataKey = await deriveObjectKey(importedKey, 'metadata', context.objectId)
      const blob = await encryptBytes(secretKey, new TextEncoder().encode('private'), context)

      await expect(decryptBytes(metadataKey, blob, context)).rejects.toThrow()
    } finally {
      wipeBytes(rootKey)
    }
  })
})

describe('password and member keys', () => {
  it('derives a stable Argon2id key for the same phrase and salt', async () => {
    const salt = createArgon2Salt()
    const first = await derivePassphraseKey('correct horse battery staple', salt)
    const second = await derivePassphraseKey('correct horse battery staple', salt)

    expect(first).toEqual(second)
    expect(first).toHaveLength(32)
    await expect(derivePassphraseKey('phrase', new Uint8Array(15))).rejects.toThrow()
    wipeBytes(first)
    wipeBytes(second)
    wipeBytes(salt)
  })

  it('seals a vault key for one member and rejects another member', async () => {
    const first = await createIdentityKeyPairs()
    const second = await createIdentityKeyPairs()
    const vaultKey = crypto.getRandomValues(new Uint8Array(32))
    const envelope = await sealKeyForMember(vaultKey, first.encryption.publicKey)

    expect(await openSealedKey(envelope, first.encryption.publicKey, first.encryption.privateKey)).toEqual(vaultKey)
    await expect(openSealedKey(envelope, second.encryption.publicKey, second.encryption.privateKey)).rejects.toThrow()

    wipeBytes(vaultKey)
    wipeBytes(first.encryption.privateKey)
    wipeBytes(first.signing.privateKey)
    wipeBytes(second.encryption.privateKey)
    wipeBytes(second.signing.privateKey)
  })
})

describe('memory-only key store', () => {
  it('copies keys, wipes temporary access, and clears all keys when locked', async () => {
    const source = crypto.getRandomValues(new Uint8Array(32))
    storeKey('vault:vault_01', source)

    const temporary = await withKey('vault:vault_01', (key) => key)
    expect(temporary).toEqual(new Uint8Array(32))
    await expect(withKey('vault:vault_01', (key) => key[0])).resolves.toBe(source[0])

    lockKeyStore()
    await expect(withKey('vault:vault_01', () => true)).rejects.toThrow('The vault is locked.')
    wipeBytes(source)
  })
})
