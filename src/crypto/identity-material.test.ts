import { describe, expect, it } from 'vitest'
import { decodeBase64Url } from './encoding'
import {
  createPendingIdentityMaterial,
  recoverIdentityPrivateKeys,
  rewrapIdentityPassphrase,
  rewrapIdentityRecovery,
  unlockIdentityPrivateKeys,
} from './identity-material'

describe('account identity key material', () => {
  it('opens private identity keys with the passphrase or recovery key', async () => {
    const pending = await createPendingIdentityMaterial('a sufficiently long test passphrase')
    let fromPassphrase: Awaited<ReturnType<typeof unlockIdentityPrivateKeys>> | undefined
    let fromRecovery: Awaited<ReturnType<typeof recoverIdentityPrivateKeys>> | undefined
    try {
      fromPassphrase = await unlockIdentityPrivateKeys(
        'a sufficiently long test passphrase',
        pending.record,
      )
      fromRecovery = await recoverIdentityPrivateKeys(pending.recoveryKey, pending.record)
      expect(Array.from(fromPassphrase.privateKeyX25519)).toEqual(
        Array.from(fromRecovery.privateKeyX25519),
      )
      expect(Array.from(fromPassphrase.privateKeyEd25519)).toEqual(
        Array.from(fromRecovery.privateKeyEd25519),
      )
      expect(Array.from(fromPassphrase.publicKeyX25519)).toEqual(
        Array.from(fromRecovery.publicKeyX25519),
      )
      await expect(
        unlockIdentityPrivateKeys('a different test passphrase', pending.record),
      ).rejects.toThrow()
    } finally {
      for (const identity of [fromPassphrase, fromRecovery]) {
        identity?.privateKeyX25519.fill(0)
        identity?.privateKeyEd25519.fill(0)
        identity?.publicKeyX25519.fill(0)
        identity?.publicKeyEd25519.fill(0)
      }
    }
  })

  it('rewraps the passphrase without invalidating recovery', async () => {
    const pending = await createPendingIdentityMaterial('an old long test passphrase')
    const rewrapped = await rewrapIdentityPassphrase(
      pending.record,
      'an old long test passphrase',
      'a new long test passphrase',
    )
    const nextRecord = { ...pending.record, ...rewrapped }
    let identity: Awaited<ReturnType<typeof unlockIdentityPrivateKeys>> | undefined
    try {
      identity = await unlockIdentityPrivateKeys('a new long test passphrase', nextRecord)
      expect(identity.publicKeyX25519).toEqual(decodeBase64Url(pending.record.publicKeyX25519))
      await expect(
        unlockIdentityPrivateKeys('an old long test passphrase', nextRecord),
      ).rejects.toThrow()
      await expect(
        recoverIdentityPrivateKeys(pending.recoveryKey, nextRecord),
      ).resolves.toBeDefined()
    } finally {
      identity?.privateKeyX25519.fill(0)
      identity?.privateKeyEd25519.fill(0)
    }
  })

  it('regenerates the recovery key while keeping the same identity', async () => {
    const pending = await createPendingIdentityMaterial('a sufficiently long test passphrase')
    const rewrapped = await rewrapIdentityRecovery(pending.record, pending.recoveryKey)
    const nextRecord = { ...pending.record, ...rewrapped }
    let identity: Awaited<ReturnType<typeof recoverIdentityPrivateKeys>> | undefined
    try {
      identity = await recoverIdentityPrivateKeys(rewrapped.recoveryKey, nextRecord)
      expect(identity.publicKeyX25519).toEqual(decodeBase64Url(pending.record.publicKeyX25519))
      await expect(recoverIdentityPrivateKeys(pending.recoveryKey, nextRecord)).rejects.toThrow()
    } finally {
      identity?.privateKeyX25519.fill(0)
      identity?.privateKeyEd25519.fill(0)
    }
  })
})
