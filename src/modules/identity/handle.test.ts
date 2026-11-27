import { describe, expect, it } from 'vitest'
import { canChangeHandle, handleChangeRetryAt, isValidHandle, normalizeHandle } from './handle'

describe('identity handle rules', () => {
  it('accepts lowercase public handles from 3 to 20 characters', () => {
    expect(isValidHandle('vivien_7')).toBe(true)
    expect(isValidHandle('a'.repeat(20))).toBe(true)
  })

  it('rejects invalid formats and reserved names', () => {
    for (const handle of ['ab', '7vivien', 'Upper', 'two-words', 'admin', 'support']) {
      expect(isValidHandle(handle)).toBe(false)
    }
  })

  it('normalizes case and surrounding whitespace for uniqueness', () => {
    expect(normalizeHandle('  Vivien_7 ')).toBe('vivien_7')
  })

  it('allows the first handle but enforces a 30-day cooldown on changes', () => {
    const now = new Date('2026-11-27T12:00:00Z')
    const changed = new Date('2026-11-01T12:00:00Z')
    expect(canChangeHandle(null, now)).toBe(true)
    expect(canChangeHandle(changed, now)).toBe(false)
    expect(canChangeHandle(new Date('2026-10-28T12:00:00Z'), now)).toBe(true)
    expect(handleChangeRetryAt(changed, now).toISOString()).toBe('2026-12-01T12:00:00.000Z')
  })
})
