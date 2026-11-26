import { afterEach, describe, expect, it } from 'vitest'
import { createAccountKey } from './keys'
import { lockKeyStore, storeKey } from './key-store'
import { wipeBytes } from './encoding'
import { compareFingerprints, valueFingerprint } from './value-hmac'

afterEach(() => lockKeyStore())

describe('value fingerprints', () => {
  it('is stable for the same value and different for a changed value', async () => {
    const vaultId = crypto.randomUUID()
    const objectId = crypto.randomUUID()
    const key = createAccountKey()
    storeKey(vaultId, key)

    const first = await valueFingerprint(vaultId, objectId, 'secret')
    const second = await valueFingerprint(vaultId, objectId, 'secret')
    const changed = await valueFingerprint(vaultId, objectId, 'other')
    expect(first).toBe(second)
    expect(first).not.toBe(changed)
    await expect(compareFingerprints(vaultId, objectId, 'secret', 'secret')).resolves.toBe(true)
    await expect(compareFingerprints(vaultId, objectId, 'secret', 'other')).resolves.toBe(false)
    expect(first).not.toContain('secret')
    wipeBytes(key)
  })
})
