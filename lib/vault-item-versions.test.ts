import { describe, expect, it } from 'vitest'
import { previousVersionRow } from './vault-item-versions'

const blob = {
  v: 1 as const,
  alg: 'A256GCM' as const,
  nonce: 'bm9uY2VfMTIzNDU2Nzg',
  ct: 'Y2lwaGVydGV4dA',
}

describe('versions immuables des secrets', () => {
  it('construit une ligne de version sortante sans écraser la version courante', () => {
    const at = new Date('2026-11-27T12:00:00Z')
    const row = previousVersionRow({
      itemId: 'item-1',
      vaultId: 'vault-1',
      userId: 'user-1',
      version: 4,
      metadata: blob,
      value: blob,
      updatedAt: at,
    })
    expect(row).toEqual({
      itemId: 'item-1',
      vaultId: 'vault-1',
      userId: 'user-1',
      version: 4,
      metadata: blob,
      value: blob,
      createdAt: at,
    })
  })
})
