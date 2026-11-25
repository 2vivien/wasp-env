import sodium from 'libsodium-wrappers-sumo'
import { randomBytes, wipeBytes } from './encoding'

export type KeyPair = {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export function createAccountKey(): Uint8Array {
  return randomBytes(32)
}

export function createRecoveryKey(): Uint8Array {
  return randomBytes(32)
}

export async function createIdentityKeyPairs(): Promise<{ encryption: KeyPair; signing: KeyPair }> {
  await sodium.ready
  const encryption = sodium.crypto_box_keypair()
  const signing = sodium.crypto_sign_keypair()

  return {
    encryption: { publicKey: encryption.publicKey, privateKey: encryption.privateKey },
    signing: { publicKey: signing.publicKey, privateKey: signing.privateKey },
  }
}

export async function sealDataForMember(data: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  await sodium.ready
  if (data.byteLength < 1 || data.byteLength > 4096 || recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new TypeError('Invalid scoped share input.')
  }
  return sodium.crypto_box_seal(data, recipientPublicKey)
}

export async function openSealedData(
  envelope: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready
  if (recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES || recipientPrivateKey.length !== sodium.crypto_box_SECRETKEYBYTES || envelope.length <= sodium.crypto_box_SEALBYTES) {
    throw new Error('Unable to open this scoped key envelope.')
  }
  try { return sodium.crypto_box_seal_open(envelope, recipientPublicKey, recipientPrivateKey) }
  catch { throw new Error('Unable to open this scoped key envelope.') }
}

export async function sealKeyForMember(key: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  await sodium.ready
  if (key.length !== 32 || recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new TypeError('Invalid key envelope input.')
  }

  return sodium.crypto_box_seal(key, recipientPublicKey)
}

export async function openSealedKey(
  envelope: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready
  if (
    recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES ||
    recipientPrivateKey.length !== sodium.crypto_box_SECRETKEYBYTES ||
    envelope.length !== 32 + sodium.crypto_box_SEALBYTES
  ) {
    throw new Error('Unable to open this key envelope.')
  }

  try {
    return sodium.crypto_box_seal_open(envelope, recipientPublicKey, recipientPrivateKey)
  } catch {
    throw new Error('Unable to open this key envelope.')
  }
}

export function destroyKeyPair(keyPair: KeyPair): void {
  wipeBytes(keyPair.privateKey)
}
