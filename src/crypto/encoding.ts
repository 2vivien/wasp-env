const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/
const MAX_RANDOM_BYTES = 1_048_576
const GET_RANDOM_VALUES_CHUNK_BYTES = 65_536

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeBase64Url(value: string): Uint8Array {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid encoded data.')
  }

  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_RANDOM_BYTES) {
    throw new RangeError('Requested random byte length is outside the supported range.')
  }

  const bytes = new Uint8Array(length)
  for (let offset = 0; offset < length; offset += GET_RANDOM_VALUES_CHUNK_BYTES) {
    crypto.getRandomValues(bytes.subarray(offset, offset + GET_RANDOM_VALUES_CHUNK_BYTES))
  }
  return bytes
}

export function wipeBytes(bytes: Uint8Array): void {
  bytes.fill(0)
}
