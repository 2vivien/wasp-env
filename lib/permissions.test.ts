import { describe, expect, it } from 'vitest'
import { ATOMIC_PERMISSIONS, can, normalizeOverrides, permissionsForRole } from './permissions'

describe('permission matrix', () => {
  it('grants only view to a reader', () => {
    expect(permissionsForRole('viewer')).toEqual(['view'])
    expect(can('viewer', 'view')).toBe(true)
    expect(can('viewer', 'reveal')).toBe(false)
    expect(can('viewer', 'share')).toBe(false)
  })

  it('grants every atomic action to an owner', () => {
    for (const action of ATOMIC_PERMISSIONS) expect(can('owner', action)).toBe(true)
  })

  it('applies explicit member exceptions over the role', () => {
    expect(can('viewer', 'copy', { copy: true })).toBe(true)
    expect(can('admin', 'delete', { delete: false })).toBe(false)
  })

  it('ignores unknown or non-boolean overrides', () => {
    expect(normalizeOverrides({ copy: true, unknown: true, share: 'yes' })).toEqual({ copy: true })
  })
})
