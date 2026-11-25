import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

const ACCESS_CODE_BYTES = 32
const ACCESS_CODE_SALT_BYTES = 16
const ACCESS_CODE_COST = 32 * 1024
const ACCESS_CODE_BLOCK_SIZE = 8
const ACCESS_CODE_PARALLELIZATION = 1
const ACCESS_CODE_MAX_MEMORY = 80 * 1024 * 1024
const ATTEMPT_WINDOW_SECONDS = 60
const MAX_ATTEMPTS_PER_WINDOW = 5
const MAX_LINK_ATTEMPTS_PER_WINDOW = 30

function deriveAccessCode(accessCode: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(accessCode, salt, ACCESS_CODE_BYTES, {
      N: ACCESS_CODE_COST,
      r: ACCESS_CODE_BLOCK_SIZE,
      p: ACCESS_CODE_PARALLELIZATION,
      maxmem: ACCESS_CODE_MAX_MEMORY,
    }, (error, derived) => error ? reject(error) : resolve(derived))
  })
}

export async function hashPrivateLinkAccessCode(accessCode: string): Promise<string> {
  const salt = randomBytes(ACCESS_CODE_SALT_BYTES)
  const derived = await deriveAccessCode(accessCode, salt)
  return `scrypt-v1:${salt.toString('base64url')}:${derived.toString('base64url')}`
}

export async function verifyPrivateLinkAccessCode(accessCode: string, encodedHash: string): Promise<boolean> {
  const [version, encodedSalt, encodedDerived, extra] = encodedHash.split(':')
  if (version !== 'scrypt-v1' || !encodedSalt || !encodedDerived || extra !== undefined) return false
  const salt = Buffer.from(encodedSalt, 'base64url')
  const expected = Buffer.from(encodedDerived, 'base64url')
  if (salt.length !== ACCESS_CODE_SALT_BYTES || expected.length !== ACCESS_CODE_BYTES) return false
  const actual = await deriveAccessCode(accessCode, salt)
  return timingSafeEqual(actual, expected)
}

export function privateLinkClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const clientIp = realIp || forwarded?.split(',').at(-1)?.trim() || 'unknown'
  return createHash('sha256').update(clientIp).digest('hex')
}

export async function isPrivateLinkRateLimited(linkHash: string, clientKey: string): Promise<boolean> {
  const endpoint = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!endpoint || !token) throw new Error('Private-link rate limiting is not configured.')

  const script = "local ip = redis.call('INCR', KEYS[1]); if ip == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; local link = redis.call('INCR', KEYS[2]); if link == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]); end; return {ip, link}"
  const response = await fetch(`${endpoint.replace(/\/+$/, '')}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, '2', `private-link:attempts:ip:${linkHash}:${clientKey}`, `private-link:attempts:link:${linkHash}`, String(ATTEMPT_WINDOW_SECONDS)]),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Private-link rate limiting is unavailable.')
  const result = await response.json() as { result?: unknown; error?: unknown }
  if (result.error || !Array.isArray(result.result) || result.result.length !== 2 || result.result.some((count) => typeof count !== 'number')) {
    throw new Error('Private-link rate limiting is unavailable.')
  }
  const [ipAttempts, linkAttempts] = result.result as [number, number]
  return ipAttempts > MAX_ATTEMPTS_PER_WINDOW || linkAttempts > MAX_LINK_ATTEMPTS_PER_WINDOW
}
