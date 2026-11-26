import 'server-only'
import { createHash } from 'node:crypto'
import { env } from '@/lib/env'

export type RateLimitResult = { allowed: boolean; remaining: number }

export function clientKey(request: Request): string {
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown'
  return createHash('sha256').update(ip).digest('hex')
}

export async function rateLimit(scope: string, subject: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN) return { allowed: true, remaining: max }
  const key = `wasp:rate:${scope}:${subject}`
  const script = "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n"
  const response = await fetch(`${env.KV_REST_API_URL.replace(/\/+$/, '')}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EVAL', script, '1', key, String(windowSeconds)]),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Rate limiter unavailable.')
  const result = await response.json() as { result?: unknown; error?: unknown }
  if (result.error || typeof result.result !== 'number') throw new Error('Invalid rate limiter response.')
  return { allowed: result.result <= max, remaining: Math.max(0, max - result.result) }
}

export async function limitRequest(request: Request, scope: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  return rateLimit(scope, clientKey(request), max, windowSeconds)
}
