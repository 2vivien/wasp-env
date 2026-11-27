import { describe, expect, it } from 'vitest'
import { canCompleteRotation, rotationTargetCount } from './project-rotation'

describe('rotation de projet', () => {
  it('compte le projet, ses environnements et ses fichiers ENV', () => {
    expect(rotationTargetCount({ environments: 3, envFiles: 2 })).toBe(6)
  })

  it('n’autorise que la finalisation d’un job en attente et de la bonne version', () => {
    expect(canCompleteRotation({ fromVersion: 1, status: 'pending' }, 1)).toBe(true)
    expect(canCompleteRotation({ fromVersion: 1, status: 'completed' }, 1)).toBe(false)
    expect(canCompleteRotation({ fromVersion: 2, status: 'pending' }, 1)).toBe(false)
    expect(canCompleteRotation(undefined, 1)).toBe(false)
  })
})
