import { decodeBase64Url, encodeBase64Url, randomBytes, wipeBytes } from './encoding'

export type CipherContext = {
  vaultId: string
  objectType: string
  objectId: string
  version: number
}

export type EncryptedBlob = {
  v: 1
  alg: 'A256GCM'
  nonce: string
  ct: string
}

const NONCE_BYTES = 12
const TAG_BYTES = 16
const PADDING_BLOCK_BYTES = 64
const MAX_PLAINTEXT_BYTES = 65_536
const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + PADDING_BLOCK_BYTES + 4 + TAG_BYTES
const OBJECT_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function contextBytes(context: CipherContext): Uint8Array {
  if (
    !SAFE_ID_PATTERN.test(context.vaultId) ||
    !SAFE_ID_PATTERN.test(context.objectId) ||
    !OBJECT_TYPE_PATTERN.test(context.objectType) ||
    !Number.isSafeInteger(context.version) ||
    context.version < 1
  ) {
    throw new TypeError('Invalid encryption context.')
  }

  return new TextEncoder().encode(
    `wasp|${context.vaultId}|${context.objectType}|${context.objectId}|${context.version}`,
  )
}

function padPlaintext(plaintext: Uint8Array): Uint8Array {
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new RangeError('Plaintext exceeds the supported size.')
  }

  const unpaddedLength = plaintext.length + 4
  const paddedLength = Math.ceil(unpaddedLength / PADDING_BLOCK_BYTES) * PADDING_BLOCK_BYTES
  const padded = randomBytes(paddedLength)
  new DataView(padded.buffer).setUint32(0, plaintext.length, false)
  padded.set(plaintext, 4)
  return padded
}

function unpadPlaintext(padded: Uint8Array): Uint8Array {
  if (padded.length < PADDING_BLOCK_BYTES || padded.length % PADDING_BLOCK_BYTES !== 0) {
    throw new Error('Invalid padded payload.')
  }

  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0, false)
  if (length > MAX_PLAINTEXT_BYTES || length > padded.length - 4) {
    throw new Error('Invalid padded payload.')
  }

  return padded.slice(4, 4 + length)
}

export async function importRootKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) {
    throw new TypeError('A 256-bit root key is required.')
  }

  return crypto.subtle.importKey('raw', toArrayBuffer(rawKey), 'HKDF', false, ['deriveKey'])
}

export async function deriveObjectKey(
  rootKey: CryptoKey,
  purpose: 'secret' | 'metadata',
  objectId: string,
): Promise<CryptoKey> {
  if (!SAFE_ID_PATTERN.test(objectId)) {
    throw new TypeError('Invalid object identifier.')
  }

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(new Uint8Array(32)),
      info: toArrayBuffer(new TextEncoder().encode(`wasp:v1:${purpose}:${objectId}`)),
    },
    rootKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  context: CipherContext,
): Promise<EncryptedBlob> {
  const nonce = randomBytes(NONCE_BYTES)
  const padded = padPlaintext(plaintext)

  try {
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(contextBytes(context)),
          tagLength: 128,
        },
        key,
        toArrayBuffer(padded),
      ),
    )

    if (ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      throw new RangeError('Ciphertext exceeds the supported size.')
    }

    return { v: 1, alg: 'A256GCM', nonce: encodeBase64Url(nonce), ct: encodeBase64Url(ciphertext) }
  } finally {
    wipeBytes(padded)
  }
}

function validateBlob(blob: EncryptedBlob): { nonce: Uint8Array; ciphertext: Uint8Array } {
  if (blob.v !== 1 || blob.alg !== 'A256GCM') {
    throw new Error('Unsupported encrypted blob version or algorithm.')
  }

  const nonce = decodeBase64Url(blob.nonce)
  const ciphertext = decodeBase64Url(blob.ct)
  if (nonce.length !== NONCE_BYTES || ciphertext.length < TAG_BYTES || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
    throw new Error('Invalid encrypted blob.')
  }

  return { nonce, ciphertext }
}

export async function decryptBytes(
  key: CryptoKey,
  blob: EncryptedBlob,
  context: CipherContext,
): Promise<Uint8Array> {
  let padded: Uint8Array | undefined

  try {
    const { nonce, ciphertext } = validateBlob(blob)
    padded = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(nonce),
          additionalData: toArrayBuffer(contextBytes(context)),
          tagLength: 128,
        },
        key,
        toArrayBuffer(ciphertext),
      ),
    )

    return unpadPlaintext(padded)
  } catch {
    throw new Error('Unable to decrypt this item. Verify that the vault is unlocked.')
  } finally {
    if (padded) wipeBytes(padded)
  }
}
