import { describe, expect, it } from 'vitest'
import sodium from 'libsodium-wrappers-sumo'
import {
  createAccountKey,
  createIdentityKeyPairs,
  createRecoveryKey,
  destroyKeyPair,
  openSealedData,
  openSealedKey,
  sealDataForMember,
  sealKeyForMember,
} from './keys'

describe('clés d’identité et enveloppes scellées', () => {
  it('génère des clés aléatoires de 32 octets', () => {
    const first = createAccountKey()
    const second = createAccountKey()
    expect(first).toHaveLength(32)
    expect(second).toHaveLength(32)
    expect(first).not.toEqual(second)
    expect(createRecoveryKey()).toHaveLength(32)
  })

  it('crée des paires X25519 et Ed25519 distinctes', async () => {
    const pairs = await createIdentityKeyPairs()
    expect(pairs.encryption.publicKey).toHaveLength(sodium.crypto_box_PUBLICKEYBYTES)
    expect(pairs.encryption.privateKey).toHaveLength(sodium.crypto_box_SECRETKEYBYTES)
    expect(pairs.signing.publicKey).toHaveLength(sodium.crypto_sign_PUBLICKEYBYTES)
    expect(pairs.signing.privateKey).toHaveLength(sodium.crypto_sign_SECRETKEYBYTES)
    destroyKeyPair(pairs.encryption)
    expect(pairs.encryption.privateKey.every((byte) => byte === 0)).toBe(true)
  })

  it('scelle et ouvre une enveloppe de clé de 32 octets', async () => {
    const pairs = await createIdentityKeyPairs()
    const key = createAccountKey()
    const envelope = await sealKeyForMember(key, pairs.encryption.publicKey)
    const opened = await openSealedKey(
      envelope,
      pairs.encryption.publicKey,
      pairs.encryption.privateKey,
    )
    expect(opened).toEqual(key)
  })

  it('rejette une enveloppe de clé invalide ou falsifiée', async () => {
    const pairs = await createIdentityKeyPairs()
    await expect(sealKeyForMember(new Uint8Array(8), pairs.encryption.publicKey)).rejects.toThrow()
    await expect(sealKeyForMember(createAccountKey(), new Uint8Array(4))).rejects.toThrow()
    await expect(
      openSealedKey(new Uint8Array(8), pairs.encryption.publicKey, pairs.encryption.privateKey),
    ).rejects.toThrow()
    const envelope = await sealKeyForMember(createAccountKey(), pairs.encryption.publicKey)
    const tampered = new Uint8Array(envelope)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    await expect(
      openSealedKey(tampered, pairs.encryption.publicKey, pairs.encryption.privateKey),
    ).rejects.toThrow()
  })

  it('scelle et ouvre des données de partage bornées', async () => {
    const pairs = await createIdentityKeyPairs()
    const payload = new TextEncoder().encode('partage chiffré')
    const envelope = await sealDataForMember(payload, pairs.encryption.publicKey)
    const opened = await openSealedData(
      envelope,
      pairs.encryption.publicKey,
      pairs.encryption.privateKey,
    )
    expect(new TextDecoder().decode(opened)).toBe('partage chiffré')
    await expect(sealDataForMember(new Uint8Array(0), pairs.encryption.publicKey)).rejects.toThrow()
    await expect(
      sealDataForMember(new Uint8Array(4097), pairs.encryption.publicKey),
    ).rejects.toThrow()
    await expect(
      openSealedData(new Uint8Array(4), pairs.encryption.publicKey, pairs.encryption.privateKey),
    ).rejects.toThrow()
  })
})
