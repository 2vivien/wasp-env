import { describe, expect, it } from 'vitest'
import { hasVerifiedEmail } from './verification'

describe('vérification de l’e-mail Google', () => {
  it('accepte uniquement un e-mail explicitement vérifié', () => {
    expect(hasVerifiedEmail({ emailVerified: true })).toBe(true)
  })

  it('refuse un e-mail non vérifié', () => {
    expect(hasVerifiedEmail({ emailVerified: false })).toBe(false)
  })

  it('refuse un e-mail dont le statut est inconnu', () => {
    expect(hasVerifiedEmail({})).toBe(false)
    expect(hasVerifiedEmail(null)).toBe(false)
    expect(hasVerifiedEmail(undefined)).toBe(false)
  })
})
