import { describe, expect, it } from 'vitest'
import {
  createPendingVaultKey,
  recoverVaultKey,
  recoveryGroups,
  rewrapVaultPassphrase,
  unlockVaultKey,
} from './vault-key'

describe('groupes de confirmation de la clé de récupération', () => {
  it('découpe la clé en groupes de quatre et gère une chaîne vide', () => {
    expect(recoveryGroups('')).toEqual([])
    expect(recoveryGroups('abcd1234efgh')).toEqual(['abcd', '1234', 'efgh'])
  })
})
import { wipeBytes } from './encoding'

describe('vault key envelopes', () => {
  it('opens the same account key with the passphrase or recovery key', async () => {
    const pending = await createPendingVaultKey('a sufficiently long test passphrase')
    let fromPassphrase: Uint8Array | undefined
    let fromRecovery: Uint8Array | undefined

    try {
      fromPassphrase = await unlockVaultKey(
        pending.vaultId,
        pending.keySalt,
        pending.wrappedKey,
        pending.kdfParameters,
        'a sufficiently long test passphrase',
      )
      fromRecovery = await recoverVaultKey(pending.vaultId, pending.wrappedKey, pending.recoveryKey)
      expect(Array.from(fromPassphrase)).toEqual(Array.from(pending.rootKey))
      expect(Array.from(fromRecovery)).toEqual(Array.from(pending.rootKey))
    } finally {
      wipeBytes(pending.rootKey)
      if (fromPassphrase) wipeBytes(fromPassphrase)
      if (fromRecovery) wipeBytes(fromRecovery)
    }
  })

  it('rewraps the key without invalidating the recovery key', async () => {
    const pending = await createPendingVaultKey('a sufficiently long test passphrase')
    const originalRecoveryKey = pending.recoveryKey
    let opened: Uint8Array | undefined

    try {
      const rewrapped = await rewrapVaultPassphrase(
        pending.rootKey,
        'a newer test passphrase',
        pending.vaultId,
        pending.wrappedKey,
      )
      opened = await unlockVaultKey(
        pending.vaultId,
        rewrapped.keySalt,
        rewrapped.wrappedKey,
        rewrapped.kdfParameters,
        'a newer test passphrase',
      )
      expect(Array.from(opened)).toEqual(Array.from(pending.rootKey))
      await expect(
        unlockVaultKey(
          pending.vaultId,
          rewrapped.keySalt,
          rewrapped.wrappedKey,
          rewrapped.kdfParameters,
          'a sufficiently long test passphrase',
        ),
      ).rejects.toThrow()
      const recovered = await recoverVaultKey(
        pending.vaultId,
        rewrapped.wrappedKey,
        originalRecoveryKey,
      )
      expect(Array.from(recovered)).toEqual(Array.from(pending.rootKey))
      wipeBytes(recovered)
    } finally {
      wipeBytes(pending.rootKey)
      if (opened) wipeBytes(opened)
    }
  })

  it('does not open the key with a different passphrase', async () => {
    const pending = await createPendingVaultKey('a sufficiently long test passphrase')
    try {
      await expect(
        unlockVaultKey(
          pending.vaultId,
          pending.keySalt,
          pending.wrappedKey,
          pending.kdfParameters,
          'a different test passphrase',
        ),
      ).rejects.toThrow()
    } finally {
      wipeBytes(pending.rootKey)
    }
  })
})
