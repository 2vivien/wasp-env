import { describe, expect, it } from 'vitest'
import { createArgon2Salt, DEFAULT_ARGON2_PARAMETERS, derivePassphraseKey } from './key-derivation'

const fast = { ...DEFAULT_ARGON2_PARAMETERS, memLimit: 19 * 1024 * 1024, opsLimit: 2 }

describe('dérivation Argon2id', () => {
  it('crée un sel de 16 octets et une clé de 32 octets reproductible', async () => {
    const salt = createArgon2Salt()
    expect(salt).toHaveLength(16)
    const first = await derivePassphraseKey('phrase secrète longue', salt, fast)
    const second = await derivePassphraseKey('phrase secrète longue', salt, fast)
    expect(first).toHaveLength(32)
    expect(first).toEqual(second)
  })

  it('refuse une phrase vide, trop longue, un sel invalide et des paramètres faibles', async () => {
    const salt = createArgon2Salt()
    await expect(derivePassphraseKey('', salt, fast)).rejects.toThrow(RangeError)
    await expect(derivePassphraseKey('x'.repeat(1025), salt, fast)).rejects.toThrow(RangeError)
    await expect(derivePassphraseKey('phrase valide', new Uint8Array(8), fast)).rejects.toThrow(
      TypeError,
    )
    await expect(
      derivePassphraseKey('phrase valide', salt, { ...fast, algorithm: 1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      derivePassphraseKey('phrase valide', salt, { ...fast, opsLimit: 1 }),
    ).rejects.toThrow(RangeError)
    await expect(
      derivePassphraseKey('phrase valide', salt, { ...fast, memLimit: 8 * 1024 * 1024 }),
    ).rejects.toThrow(RangeError)
  })
})
