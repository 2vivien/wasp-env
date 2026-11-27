import { describe, expect, it, vi } from 'vitest'
import { broadcastVaultLock, lockKeyStore, removeKey, storeKey, withKey } from './key-store'

const key = () => new Uint8Array(32).fill(7)

describe('stockage des clés en mémoire', () => {
  it('stocke une clé et la restitue sous forme de copie', async () => {
    storeKey('vault:one', key())
    const value = await withKey('vault:one', (stored) => stored.slice())
    expect(value).toEqual(key())
    removeKey('vault:one')
  })

  it('refuse un identifiant ou une taille invalide', () => {
    expect(() => storeKey('vault:!!', key())).toThrow(TypeError)
    expect(() => storeKey('vault:two', new Uint8Array(16))).toThrow(TypeError)
  })

  it('efface la clé précédente lors d’un remplacement', async () => {
    storeKey('vault:two', key())
    storeKey('vault:two', new Uint8Array(32).fill(9))
    const value = await withKey('vault:two', (stored) => stored.slice())
    expect(value.every((byte) => byte === 9)).toBe(true)
    removeKey('vault:two')
  })

  it('refuse toute opération après verrouillage', async () => {
    storeKey('vault:three', key())
    lockKeyStore()
    await expect(withKey('vault:three', () => true)).rejects.toThrow('The vault is locked.')
  })

  it('diffuse le verrouillage aux autres onglets quand BroadcastChannel existe', () => {
    const postMessage = vi.fn()
    const close = vi.fn()
    class FakeBroadcastChannel {
      constructor(public name: string) {}
      postMessage = postMessage
      close = close
    }
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    broadcastVaultLock()
    expect(postMessage).toHaveBeenCalledWith('lock')
    expect(close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('ne fait rien si BroadcastChannel est absent', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(() => broadcastVaultLock()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
