import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPrivateLinkAccessCode, isPrivateLinkRateLimited, privateLinkClientKey, verifyPrivateLinkAccessCode } from './private-link-security'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('private-link access codes', () => {
  it('hashes codes with a unique salt and verifies the right code', async () => {
    const [first, second] = await Promise.all([
      hashPrivateLinkAccessCode('my-strong-access-code'),
      hashPrivateLinkAccessCode('my-strong-access-code'),
    ])

    expect(first).not.toBe(second)
    await expect(verifyPrivateLinkAccessCode('my-strong-access-code', first)).resolves.toBe(true)
    await expect(verifyPrivateLinkAccessCode('wrong-code', first)).resolves.toBe(false)
  })

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPrivateLinkAccessCode('some-code', 'invalid')).resolves.toBe(false)
  })

  it('atomically limits both an IP and a link through the Redis REST API', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://redis.example.test')
    vi.stubEnv('KV_REST_API_TOKEN', 'test-token')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: [6, 31] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(isPrivateLinkRateLimited('token-hash', 'client-hash')).resolves.toBe(true)
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://redis.example.test/')
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    const command = JSON.parse(String(request.body)) as unknown[]
    expect(command[0]).toBe('EVAL')
    expect(command[2]).toBe('2')
    expect(command[1]).toContain('INCR')
  })

  it('uses the IP rather than a client-controlled user agent for the rate-limit identity', () => {
    const first = privateLinkClientKey(new Request('https://wasp.example.test', { headers: { 'x-real-ip': '192.0.2.1', 'user-agent': 'browser-a' } }))
    const second = privateLinkClientKey(new Request('https://wasp.example.test', { headers: { 'x-real-ip': '192.0.2.1', 'user-agent': 'browser-b' } }))
    expect(first).toBe(second)
  })
})
