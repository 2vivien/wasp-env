import { describe, expect, it } from 'vitest'
import { rotationProgressEvent } from './rotation-progress'

describe('journal de progression de rotation', () => {
  const input = {
    actorId: 'user-1',
    vaultId: 'vault-1',
    jobId: 'job-1',
    completedCount: 42,
    keyVersion: 3,
    at: new Date('2026-11-27T12:00:00Z'),
  }

  it('écrit le lot dans un événement dédié sans donnée secrète', () => {
    const event = rotationProgressEvent(input)
    expect(event.event).toBe('vault_rotation_progress')
    expect(event.targetKind).toBe('rotation_job')
    expect(event.targetId).toBe('job-1')
    expect(event.metadata).toEqual({ count: 42, keyVersion: 3 })
    expect(event.createdAt).toBe(input.at)
  })

  it('n’expose ni valeur ni identifiant de secret dans les métadonnées', () => {
    const event = rotationProgressEvent(input)
    expect(JSON.stringify(event.metadata)).not.toMatch(/secret|value|ct|nonce/i)
  })
})
