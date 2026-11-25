import { createAccountKey, createRecoveryKey } from './keys'
import { createArgon2Salt, DEFAULT_ARGON2_PARAMETERS, derivePassphraseKey } from './key-derivation'
import { decodeBase64Url, encodeBase64Url, wipeBytes } from './encoding'
import type { Argon2Parameters } from './key-derivation'

export type KeyEnvelope = {
  v: 1
  alg: 'A256GCM'
  nonce: string
  ct: string
}

export type WrappedVaultKey = {
  v: 1
  passphrase: KeyEnvelope
  recovery: KeyEnvelope
}

export type KdfParameters = Argon2Parameters

export type EncryptedVaultItem = {
  version: number
  metadata: KeyEnvelope
  value: KeyEnvelope
  history?: Array<{
    version: number
    metadata: KeyEnvelope
    value: KeyEnvelope
    createdAt: string
  }>
}

export type PendingVaultKey = {
  vaultId: string
  keySalt: string
  wrappedKey: WrappedVaultKey
  kdfParameters: KdfParameters
  recoveryKey: string
  confirmationGroups: number[]
  rootKey: Uint8Array
}

const NONCE_BYTES = 12
const AAD_PREFIX = 'wasp:v1:vault-key:'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(result).set(bytes)
  return result
}

function asAesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, usage)
}

async function sealRootKey(rootKey: Uint8Array, wrappingKey: Uint8Array, vaultId: string): Promise<KeyEnvelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const key = await asAesKey(wrappingKey, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(new TextEncoder().encode(`${AAD_PREFIX}${vaultId}`)) },
    key,
    toArrayBuffer(rootKey),
  ))

  return { v: 1, alg: 'A256GCM', nonce: encodeBase64Url(nonce), ct: encodeBase64Url(ciphertext) }
}

async function openRootKey(envelope: KeyEnvelope, wrappingKey: Uint8Array, vaultId: string): Promise<Uint8Array> {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Invalid key envelope.')
  const nonce = decodeBase64Url(envelope.nonce)
  const ciphertext = decodeBase64Url(envelope.ct)
  if (nonce.length !== NONCE_BYTES || ciphertext.length !== 48) throw new Error('Invalid key envelope.')
  const key = await asAesKey(wrappingKey, ['decrypt'])
  const rootKey = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(new TextEncoder().encode(`${AAD_PREFIX}${vaultId}`)) },
    key,
    toArrayBuffer(ciphertext),
  ))
  if (rootKey.length !== 32) {
    wipeBytes(rootKey)
    throw new Error('Invalid key envelope.')
  }
  return rootKey
}

function getConfirmationGroups(groupCount: number): number[] {
  const selected = new Set<number>()
  while (selected.size < Math.min(3, groupCount)) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    selected.add(random % groupCount)
  }
  return [...selected].sort((left, right) => left - right)
}

export async function createPendingVaultKey(passphrase: string): Promise<PendingVaultKey> {
  const vaultId = crypto.randomUUID()
  const salt = createArgon2Salt()
  const rootKey = createAccountKey()
  const recoveryBytes = createRecoveryKey()
  let passphraseKey: Uint8Array | undefined

  try {
    passphraseKey = await derivePassphraseKey(passphrase.normalize('NFKC'), salt)
    const recoveryKey = encodeBase64Url(recoveryBytes)
    const groups = recoveryKey.match(/.{1,4}/g) ?? []
    const wrappedKey: WrappedVaultKey = {
      v: 1,
      passphrase: await sealRootKey(rootKey, passphraseKey, vaultId),
      recovery: await sealRootKey(rootKey, recoveryBytes, vaultId),
    }

    return {
      vaultId,
      keySalt: encodeBase64Url(salt),
      wrappedKey,
      kdfParameters: { ...DEFAULT_ARGON2_PARAMETERS },
      recoveryKey,
      confirmationGroups: getConfirmationGroups(groups.length),
      rootKey,
    }
  } catch (error) {
    wipeBytes(rootKey)
    throw error
  } finally {
    wipeBytes(salt)
    wipeBytes(recoveryBytes)
    if (passphraseKey) wipeBytes(passphraseKey)
  }
}

export async function rewrapVaultPassphrase(
  rootKey: Uint8Array,
  passphrase: string,
  vaultId: string,
  currentWrappedKey: WrappedVaultKey,
): Promise<{ keySalt: string; wrappedKey: WrappedVaultKey; kdfParameters: KdfParameters }> {
  if (rootKey.length !== 32) throw new TypeError('A 256-bit vault key is required.')
  const salt = createArgon2Salt()
  let passphraseKey: Uint8Array | undefined
  try {
    passphraseKey = await derivePassphraseKey(passphrase.normalize('NFKC'), salt)
    return {
      keySalt: encodeBase64Url(salt),
      wrappedKey: {
        v: 1,
        passphrase: await sealRootKey(rootKey, passphraseKey, vaultId),
        recovery: currentWrappedKey.recovery,
      },
      kdfParameters: { ...DEFAULT_ARGON2_PARAMETERS },
    }
  } finally {
    wipeBytes(salt)
    if (passphraseKey) wipeBytes(passphraseKey)
  }
}

export async function unlockVaultKey(
  vaultId: string,
  keySalt: string,
  wrappedKey: WrappedVaultKey,
  kdfParameters: KdfParameters,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = decodeBase64Url(keySalt)
  let derivedKey: Uint8Array | undefined
  try {
    derivedKey = await derivePassphraseKey(passphrase.normalize('NFKC'), salt, kdfParameters)
    return await openRootKey(wrappedKey.passphrase, derivedKey, vaultId)
  } finally {
    wipeBytes(salt)
    if (derivedKey) wipeBytes(derivedKey)
  }
}

export async function recoverVaultKey(
  vaultId: string,
  wrappedKey: WrappedVaultKey,
  recoveryKey: string,
): Promise<Uint8Array> {
  const rawKey = decodeBase64Url(recoveryKey.replaceAll(' ', ''))
  try {
    return await openRootKey(wrappedKey.recovery, rawKey, vaultId)
  } finally {
    wipeBytes(rawKey)
  }
}

export function recoveryGroups(recoveryKey: string): string[] {
  return recoveryKey.match(/.{1,4}/g) ?? []
}
