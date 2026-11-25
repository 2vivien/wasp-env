import { describe, expect, it } from 'vitest'
import { decryptBackup, encryptBackup } from './backup'

describe('encrypted backups', () => {
  it('round-trips snapshots only with the correct passphrase', async () => {
    const snapshot = { format: 'wasp-encrypted-backup', version: 1, vaultItems: [{ id: 'secret-id', ciphertext: 'ciphertext-only' }] }
    const encrypted = await encryptBackup(snapshot, 'a strong backup phrase')

    expect(encrypted.ciphertext).not.toContain('secret-id')
    await expect(decryptBackup(encrypted, 'a strong backup phrase')).resolves.toEqual(snapshot)
    await expect(decryptBackup(encrypted, 'a different backup phrase')).rejects.toThrow()
  })

  it('rejects malformed envelopes before decryption', async () => {
    await expect(decryptBackup({ format: 'wasp-encrypted-backup', version: 2 }, 'phrase')).rejects.toThrow('Invalid backup file.')
  })
})
