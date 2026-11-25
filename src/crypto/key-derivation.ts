import sodium from 'libsodium-wrappers-sumo'
import { randomBytes } from './encoding'

export type Argon2Parameters = {
  algorithm: number
  opsLimit: number
  memLimit: number
}

export const DEFAULT_ARGON2_PARAMETERS: Argon2Parameters = {
  algorithm: 2,
  opsLimit: 3,
  memLimit: 64 * 1024 * 1024,
}

const MIN_OPS_LIMIT = 2
const MIN_MEM_LIMIT = 19 * 1024 * 1024
const PASSPHRASE_MAX_BYTES = 1024
const ROOT_KEY_BYTES = 32

function validateParameters(parameters: Argon2Parameters): void {
  if (
    parameters.algorithm !== sodium.crypto_pwhash_ALG_ARGON2ID13 ||
    !Number.isSafeInteger(parameters.opsLimit) ||
    parameters.opsLimit < MIN_OPS_LIMIT ||
    !Number.isSafeInteger(parameters.memLimit) ||
    parameters.memLimit < MIN_MEM_LIMIT
  ) {
    throw new RangeError('Argon2id parameters are below the supported security minimum.')
  }
}

export async function derivePassphraseKey(
  passphrase: string,
  salt: Uint8Array,
  parameters: Argon2Parameters = DEFAULT_ARGON2_PARAMETERS,
): Promise<Uint8Array> {
  await sodium.ready
  const passwordBytes = new TextEncoder().encode(passphrase.normalize('NFKC'))
  if (passwordBytes.length < 1 || passwordBytes.length > PASSPHRASE_MAX_BYTES) {
    passwordBytes.fill(0)
    throw new RangeError('Passphrase length is outside the supported range.')
  }
  if (salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    passwordBytes.fill(0)
    throw new TypeError('An Argon2id salt must be 16 bytes.')
  }

  validateParameters(parameters)
  try {
    return sodium.crypto_pwhash(
      ROOT_KEY_BYTES,
      passwordBytes,
      salt,
      parameters.opsLimit,
      parameters.memLimit,
      parameters.algorithm,
    )
  } finally {
    passwordBytes.fill(0)
  }
}

export function createArgon2Salt(): Uint8Array {
  return randomBytes(16)
}
