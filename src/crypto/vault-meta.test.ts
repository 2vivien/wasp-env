import { afterEach, describe, expect, it } from 'vitest'
import { createAccountKey } from './keys'
import { lockKeyStore, storeKey } from './key-store'
import { wipeBytes } from './encoding'
import { decryptVaultMeta, encryptVaultMeta } from './vault-meta'

afterEach(() => lockKeyStore())

describe('vault metadata', () => {
  it('round-trips encrypted vault metadata', async () => {
    const vaultId = crypto.randomUUID()
    const key = createAccountKey()
    storeKey(vaultId, key)
    const blob = await encryptVaultMeta(vaultId, {
      name: 'Équipe',
      description: 'Secrets partagés',
      icon: 'team',
      color: 'blue',
    })

    expect(blob.ct).not.toContain('Équipe')
    await expect(decryptVaultMeta(vaultId, blob)).resolves.toEqual({
      name: 'Équipe',
      description: 'Secrets partagés',
      icon: 'team',
      color: 'blue',
    })
    wipeBytes(key)
  })

  it('refuses to decrypt while the vault is locked', async () => {
    const vaultId = crypto.randomUUID()
    const key = createAccountKey()
    storeKey(vaultId, key)
    const blob = await encryptVaultMeta(vaultId, { name: 'Coffre' })
    lockKeyStore()
    await expect(decryptVaultMeta(vaultId, blob)).rejects.toThrow('vault is locked')
    wipeBytes(key)
  })
})
