import 'server-only'
import pino from 'pino'
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
]

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  formatters: { level: (label) => ({ level: label }) },
})

export { requestId } from '@/lib/request-id'
