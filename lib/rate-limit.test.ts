import { describe, expect, it } from 'vitest'
import { clientKey, rateLimit } from './rate-limit'

describe('rate limiting', () => {
  it('derives a stable hashed client key from trusted headers', () => {
    const first = clientKey(new Request('https://wasp.test', { headers: { 'x-real-ip': '192.0.2.10' } }))
    const second = clientKey(new Request('https://wasp.test', { headers: { 'x-real-ip': '192.0.2.10' } }))
    const other = clientKey(new Request('https://wasp.test', { headers: { 'x-real-ip': '192.0.2.11' } }))
    expect(first).toBe(second)
    expect(first).not.toBe(other)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })

  it('fails open when no Redis configuration is present', async () => {
    await expect(rateLimit('test', 'subject', 10, 60)).resolves.toEqual({ allowed: true, remaining: 10 })
  })
})
