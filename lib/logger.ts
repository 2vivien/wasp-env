import 'server-only'
import pino, { type DestinationStream } from 'pino'
import { env } from '@/lib/env'

const REDACTED_PATHS = [
  'password',
  'passphrase',
  'secret',
  'value',
  'ciphertext',
  'key',
  'token',
  'authorization',
  'cookie',
  'fragment',
  'recoveryKey',
  'email',
  'accessCode',
  'encryptedPayload',
  'encryptedValue',
  'encryptedMetadata',
  '*.value',
  '*.secret',
  '*.password',
  '*.passphrase',
  '*.token',
  '*.key',
  '*.ciphertext',
  '*.recoveryKey',
  '*.accessCode',
  '*.email',
  '*.authorization',
  '*.cookie',
  '*.fragment',
  '*.encryptedPayload',
  '*.encryptedValue',
  '*.encryptedMetadata',
]

export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  )
}

export const logger = createLogger()

export { requestId } from '@/lib/request-id'
