import { describe, expect, it } from 'vitest'
import { jsonNoStore } from './api'

describe('jsonNoStore', () => {
  it('normalizes every error to the shared public shape', async () => {
    const response = jsonNoStore({ error: { code: 'FORBIDDEN', secret: 'must-not-leak' } }, 403)
    const body = await response.json() as { error: { code: string; message: string; requestId: string; secret?: string } }

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toBe('Accès refusé.')
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(body)).not.toContain('must-not-leak')
  })

  it('keeps successful payloads untouched', async () => {
    const response = jsonNoStore({ ok: true })
    expect(await response.json()).toEqual({ ok: true })
  })
})
