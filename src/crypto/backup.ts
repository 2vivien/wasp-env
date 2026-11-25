import { createArgon2Salt, DEFAULT_ARGON2_PARAMETERS, derivePassphraseKey } from './key-derivation'
import { decodeBase64Url, encodeBase64Url, randomBytes, wipeBytes } from './encoding'

const BACKUP_CONTEXT = 'wasp:encrypted-backup:v1'
const MAX_BACKUP_BYTES = 20 * 1024 * 1024

export type EncryptedBackup = {
  format: 'wasp-encrypted-backup'
  version: 1
  cipher: 'A256GCM'
  kdf: { algorithm: number; opsLimit: number; memLimit: number; salt: string }
  nonce: string
  ciphertext: string
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(result).set(bytes)
  return result
}

function validateBackup(value: unknown): asserts value is EncryptedBackup {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid backup file.')
  const backup = value as Partial<EncryptedBackup>
  if (
    backup.format !== 'wasp-encrypted-backup' || backup.version !== 1 || backup.cipher !== 'A256GCM' ||
    !backup.kdf || backup.kdf.algorithm !== DEFAULT_ARGON2_PARAMETERS.algorithm ||
    !Number.isInteger(backup.kdf.opsLimit) || backup.kdf.opsLimit < 2 || backup.kdf.opsLimit > 10 ||
    !Number.isInteger(backup.kdf.memLimit) || backup.kdf.memLimit < 19 * 1024 * 1024 || backup.kdf.memLimit > 256 * 1024 * 1024 ||
    typeof backup.kdf.salt !== 'string' || typeof backup.nonce !== 'string' || typeof backup.ciphertext !== 'string'
  ) throw new TypeError('Invalid backup file.')
}

export async function encryptBackup(snapshot: unknown, passphrase: string): Promise<EncryptedBackup> {
  const salt = createArgon2Salt()
  const nonce = randomBytes(12)
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot))
  let keyBytes: Uint8Array | undefined
  try {
    if (plaintext.byteLength > MAX_BACKUP_BYTES) throw new RangeError('Backup exceeds the supported size.')
    keyBytes = await derivePassphraseKey(passphrase, salt, DEFAULT_ARGON2_PARAMETERS)
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['encrypt'])
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(new TextEncoder().encode(BACKUP_CONTEXT)),
    }, key, toArrayBuffer(plaintext)))
    try {
      return {
        format: 'wasp-encrypted-backup',
        version: 1,
        cipher: 'A256GCM',
        kdf: { ...DEFAULT_ARGON2_PARAMETERS, salt: encodeBase64Url(salt) },
        nonce: encodeBase64Url(nonce),
        ciphertext: encodeBase64Url(ciphertext),
      }
    } finally {
      wipeBytes(ciphertext)
    }
  } finally {
    wipeBytes(salt)
    wipeBytes(nonce)
    wipeBytes(plaintext)
    if (keyBytes) wipeBytes(keyBytes)
  }
}

export async function decryptBackup(value: unknown, passphrase: string): Promise<unknown> {
  validateBackup(value)
  const salt = decodeBase64Url(value.kdf.salt)
  const nonce = decodeBase64Url(value.nonce)
  const ciphertext = decodeBase64Url(value.ciphertext)
  let keyBytes: Uint8Array | undefined
  let plaintext: Uint8Array | undefined
  try {
    if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 16 || ciphertext.length > MAX_BACKUP_BYTES + 16) {
      throw new TypeError('Invalid backup file.')
    }
    keyBytes = await derivePassphraseKey(passphrase, salt, value.kdf)
    const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
    plaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(new TextEncoder().encode(BACKUP_CONTEXT)),
    }, key, toArrayBuffer(ciphertext)))
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as unknown
  } finally {
    wipeBytes(salt)
    wipeBytes(nonce)
    wipeBytes(ciphertext)
    if (plaintext) wipeBytes(plaintext)
    if (keyBytes) wipeBytes(keyBytes)
  }
}
