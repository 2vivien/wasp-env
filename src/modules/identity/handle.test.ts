import { describe, expect, it } from 'vitest'
import { isValidHandle, normalizeHandle } from './handle'

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
})
