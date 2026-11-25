import { createIdentityKeyPairs, destroyKeyPair } from './keys'
import { createArgon2Salt, DEFAULT_ARGON2_PARAMETERS, derivePassphraseKey } from './key-derivation'
import { decodeBase64Url, encodeBase64Url, randomBytes, wipeBytes } from './encoding'

type Envelope = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function seal(plaintext: Uint8Array, keyBytes: Uint8Array, purpose: string): Promise<Envelope> {
  const nonce = randomBytes(12)
  const key = await crypto.subtle.importKey('raw', toBuffer(keyBytes), 'AES-GCM', false, ['encrypt'])
  try {
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(new TextEncoder().encode(`wasp:v1:${purpose}`)), tagLength: 128,
    }, key, toBuffer(plaintext)))
    return { v: 1, alg: 'A256GCM', nonce: encodeBase64Url(nonce), ct: encodeBase64Url(ciphertext) }
  } finally { wipeBytes(nonce) }
}

export async function unlockIdentityPrivateKeys(passphrase: string, material: {
  publicKeyX25519: string
  publicKeyEd25519: string
  encryptedPrivateKeys: Envelope
  accountKeyPassphraseEnvelope: Envelope
  kdfParameters: { algorithm: number; opsLimit: number; memLimit: number; salt: string }
}) {
  const salt = decodeBase64Url(material.kdfParameters.salt)
  let passphraseKey: Uint8Array | undefined
  let accountKey: Uint8Array | undefined
  let privateBytes: Uint8Array | undefined
  try {
    passphraseKey = await derivePassphraseKey(passphrase, salt, material.kdfParameters)
    accountKey = await open(material.accountKeyPassphraseEnvelope, passphraseKey, 'account-key-passphrase')
    privateBytes = await open(material.encryptedPrivateKeys, accountKey, 'identity-private-keys')
    if (privateBytes.length !== 96) throw new Error('Invalid identity key material.')
    return {
      publicKeyX25519: decodeBase64Url(material.publicKeyX25519),
      publicKeyEd25519: decodeBase64Url(material.publicKeyEd25519),
      privateKeyX25519: privateBytes.slice(0, 32),
      privateKeyEd25519: privateBytes.slice(32),
    }
  } finally {
    wipeBytes(salt)
    if (passphraseKey) wipeBytes(passphraseKey)
    if (accountKey) wipeBytes(accountKey)
    if (privateBytes) wipeBytes(privateBytes)
  }
}

async function open(envelope: Envelope, keyBytes: Uint8Array, purpose: string): Promise<Uint8Array> {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Invalid encrypted key material.')
  const nonce = decodeBase64Url(envelope.nonce)
  const ciphertext = decodeBase64Url(envelope.ct)
  if (nonce.length !== 12 || ciphertext.length < 16) throw new Error('Invalid encrypted key material.')
  const key = await crypto.subtle.importKey('raw', toBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
  try {
    return new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: toBuffer(nonce), additionalData: toBuffer(new TextEncoder().encode(`wasp:v1:${purpose}`)), tagLength: 128,
    }, key, toBuffer(ciphertext)))
  } finally { wipeBytes(nonce); wipeBytes(ciphertext) }
}

export async function recoverIdentityPrivateKeys(recoveryKeyValue: string, material: {
  publicKeyX25519: string
  publicKeyEd25519: string
  encryptedPrivateKeys: Envelope
  accountKeyRecoveryEnvelope: Envelope
}) {
  const recoveryKey = decodeBase64Url(recoveryKeyValue.trim().replaceAll(' ', ''))
  let accountKey: Uint8Array | undefined
  let privateBytes: Uint8Array | undefined
  try {
    if (recoveryKey.length !== 32) throw new Error('Invalid recovery key.')
    accountKey = await open(material.accountKeyRecoveryEnvelope, recoveryKey, 'account-key-recovery')
    privateBytes = await open(material.encryptedPrivateKeys, accountKey, 'identity-private-keys')
    if (privateBytes.length !== 96) throw new Error('Invalid identity key material.')
    return {
      publicKeyX25519: decodeBase64Url(material.publicKeyX25519),
      publicKeyEd25519: decodeBase64Url(material.publicKeyEd25519),
      privateKeyX25519: privateBytes.slice(0, 32),
      privateKeyEd25519: privateBytes.slice(32),
    }
  } finally {
    wipeBytes(recoveryKey)
    if (accountKey) wipeBytes(accountKey)
    if (privateBytes) wipeBytes(privateBytes)
  }
}

export async function createPendingIdentityMaterial(passphrase: string) {
  const salt = createArgon2Salt()
  const accountKey = randomBytes(32)
  const recoveryKey = randomBytes(32)
  let passphraseKey: Uint8Array | undefined
  let encryptionPair: Awaited<ReturnType<typeof createIdentityKeyPairs>>['encryption'] | undefined
  let signingPair: Awaited<ReturnType<typeof createIdentityKeyPairs>>['signing'] | undefined
  let privateBytes: Uint8Array | undefined
  try {
    passphraseKey = await derivePassphraseKey(passphrase.normalize('NFKC'), salt)
    const pairs = await createIdentityKeyPairs()
    encryptionPair = pairs.encryption
    signingPair = pairs.signing
    privateBytes = new Uint8Array(encryptionPair.privateKey.length + signingPair.privateKey.length)
    privateBytes.set(encryptionPair.privateKey)
    privateBytes.set(signingPair.privateKey, encryptionPair.privateKey.length)
    return {
      record: {
        publicKeyX25519: encodeBase64Url(encryptionPair.publicKey),
        publicKeyEd25519: encodeBase64Url(signingPair.publicKey),
        encryptedPrivateKeys: await seal(privateBytes, accountKey, 'identity-private-keys'),
        accountKeyPassphraseEnvelope: await seal(accountKey, passphraseKey, 'account-key-passphrase'),
        accountKeyRecoveryEnvelope: await seal(accountKey, recoveryKey, 'account-key-recovery'),
        kdfParameters: { ...DEFAULT_ARGON2_PARAMETERS, salt: encodeBase64Url(salt) },
      },
      recoveryKey: encodeBase64Url(recoveryKey),
    }
  } finally {
    wipeBytes(salt)
    wipeBytes(accountKey)
    wipeBytes(recoveryKey)
    if (passphraseKey) wipeBytes(passphraseKey)
    if (privateBytes) wipeBytes(privateBytes)
    if (encryptionPair) destroyKeyPair(encryptionPair)
    if (signingPair) destroyKeyPair(signingPair)
  }
}
