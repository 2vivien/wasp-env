import { afterEach, describe, expect, it } from 'vitest'
import { lockKeyStore, storeKey } from './key-store'
import { createAccountKey } from './keys'
import { decryptVaultItemMetadata, decryptVaultItemValue, encryptVaultItemPayload, rotateVaultItemPayload } from './vault-items'
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
    await expect(decryptVaultItemMetadata(vaultId, itemId, item)).resolves.toEqual(expect.objectContaining({ name: 'Production API key', kind: 'secret' }))
    await expect(decryptVaultItemValue(vaultId, itemId, item)).resolves.toBe('private-value')
  })

  it('round-trips structured secret metadata without leaking it in ciphertext', async () => {
    const vaultId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const rootKey = createAccountKey()
    rootKeys.push(rootKey)
    storeKey(vaultId, rootKey)

    const item = await encryptVaultItemPayload(vaultId, itemId, 1, 'API key', 'private-value', 'secret', 1, undefined, false, {
      category: 'api-keys',
      description: 'Clé de production',
      tags: ['prod', 'api'],
      notes: 'Rotate every 90 days',
      customFields: [{ key: 'scope', value: 'read:write', secret: false }],
      favorite: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
    })
    expect(JSON.stringify(item)).not.toContain('Clé de production')
    const meta = await decryptVaultItemMetadata(vaultId, itemId, item)
    expect(meta).toMatchObject({
      name: 'API key',
      category: 'api-keys',
      description: 'Clé de production',
      tags: ['prod', 'api'],
      notes: 'Rotate every 90 days',
      favorite: true,
    })
  })

  it('rotates a secret key and re-encrypts every historical revision', async () => {
    const vaultId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const rootKey = createAccountKey()
    rootKeys.push(rootKey)
    storeKey(vaultId, rootKey)
    const first = await encryptVaultItemPayload(vaultId, itemId, 1, 'API key', 'old value')
    const current = await encryptVaultItemPayload(vaultId, itemId, 2, 'API key', 'current value', 'secret', 1, first.scopeKeyEnvelope)
    current.history = [{ version: 1, metadata: first.metadata, value: first.value, createdAt: new Date().toISOString() }]

    const rotated = await rotateVaultItemPayload(vaultId, itemId, current, 2)
    expect(rotated.scopeKeyVersion).toBe(2)
    expect(await decryptVaultItemValue(vaultId, itemId, rotated)).toBe('current value')
    const oldRevision = { ...rotated, version: rotated.history?.[0]?.version ?? 1, metadata: rotated.history?.[0]?.metadata ?? rotated.metadata, value: rotated.history?.[0]?.value ?? rotated.value }
    await expect(decryptVaultItemValue(vaultId, itemId, oldRevision)).resolves.toBe('old value')
    await expect(decryptVaultItemMetadata(vaultId, itemId, oldRevision)).resolves.toEqual(expect.objectContaining({ name: 'API key', kind: 'secret' }))
  })

  it('round-trips an environment file without changing its BOM or line endings', async () => {
    const vaultId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const rootKey = createAccountKey()
    rootKeys.push(rootKey)
    storeKey(vaultId, rootKey)
    const source = '\uFEFF# local config\r\nexport API_URL="https://example.test?a=b"\r\nTOKEN=first\nTOKEN=second\n'

    const item = await encryptVaultItemPayload(vaultId, itemId, 1, '.env.local', source, 'env-file')
    await expect(decryptVaultItemMetadata(vaultId, itemId, item)).resolves.toEqual(expect.objectContaining({ name: '.env.local', kind: 'env-file' }))
    await expect(decryptVaultItemValue(vaultId, itemId, item, 'env-file')).resolves.toBe(source)
  })

  it('accepts the supported 512 KiB environment-file limit', async () => {
    const vaultId = crypto.randomUUID()
    const itemId = crypto.randomUUID()
    const rootKey = createAccountKey()
    rootKeys.push(rootKey)
    storeKey(vaultId, rootKey)
    const source = `KEY=${'x'.repeat(512 * 1024 - 4)}`

    const item = await encryptVaultItemPayload(vaultId, itemId, 1, '.env.large', source, 'env-file')
    await expect(decryptVaultItemValue(vaultId, itemId, item, 'env-file')).resolves.toBe(source)
  })
})
