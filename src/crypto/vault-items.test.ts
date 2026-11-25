import { afterEach, describe, expect, it } from 'vitest'
import { lockKeyStore, storeKey } from './key-store'
import { createAccountKey } from './keys'
import { decryptVaultItemName, decryptVaultItemValue, encryptVaultItemPayload } from './vault-items'
import { wipeBytes } from './encoding'

const rootKeys: Uint8Array[] = []
afterEach(() => {
  lockKeyStore()
  for (const key of rootKeys.splice(0)) wipeBytes(key)
})

describe('encrypted vault items', () => {
  it('keeps metadata and values encrypted under distinct object contexts', async () => {
    const vaultId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const rootKey = createAccountKey()
    rootKeys.push(rootKey)
    storeKey(vaultId, rootKey)

    const item = await encryptVaultItemPayload(vaultId, itemId, 1, 'Production API key', 'private-value')
    expect(item.metadata.ct).not.toContain('Production API key')
    expect(item.value.ct).not.toContain('private-value')
    await expect(decryptVaultItemName(vaultId, itemId, item)).resolves.toBe('Production API key')
    await expect(decryptVaultItemValue(vaultId, itemId, item)).resolves.toBe('private-value')
  })
})
