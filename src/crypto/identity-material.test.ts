import { describe, expect, it } from 'vitest'
import { createPendingIdentityMaterial, recoverIdentityPrivateKeys, unlockIdentityPrivateKeys } from './identity-material'

describe('account identity key material', () => {
  it('opens private identity keys with the passphrase or recovery key', async () => {
    const pending = await createPendingIdentityMaterial('a sufficiently long test passphrase')
    let fromPassphrase: Awaited<ReturnType<typeof unlockIdentityPrivateKeys>> | undefined
    let fromRecovery: Awaited<ReturnType<typeof recoverIdentityPrivateKeys>> | undefined
    try {
      fromPassphrase = await unlockIdentityPrivateKeys('a sufficiently long test passphrase', pending.record)
      fromRecovery = await recoverIdentityPrivateKeys(pending.recoveryKey, pending.record)
      expect(Array.from(fromPassphrase.privateKeyX25519)).toEqual(Array.from(fromRecovery.privateKeyX25519))
      expect(Array.from(fromPassphrase.privateKeyEd25519)).toEqual(Array.from(fromRecovery.privateKeyEd25519))
      expect(Array.from(fromPassphrase.publicKeyX25519)).toEqual(Array.from(fromRecovery.publicKeyX25519))
      await expect(unlockIdentityPrivateKeys('a different test passphrase', pending.record)).rejects.toThrow()
    } finally {
      for (const identity of [fromPassphrase, fromRecovery]) {
        identity?.privateKeyX25519.fill(0)
        identity?.privateKeyEd25519.fill(0)
        identity?.publicKeyX25519.fill(0)
        identity?.publicKeyEd25519.fill(0)
      }
    }
  })
})
