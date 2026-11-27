import { describe, expect, it } from 'vitest'
import { estimatePassphraseStrength, generatePassphrase } from './passphrase'

describe('phrase secrète générée localement', () => {
  it('génère six mots séparés par des espaces et assez longue', () => {
    const passphrase = generatePassphrase(() => new Uint8Array([7]))
    expect(passphrase.split(' ')).toHaveLength(6)
    expect(passphrase.length).toBeGreaterThanOrEqual(20)
  })

  it('rejette les octets hors dictionnaire au lieu de biaiser le tirage', () => {
    let call = 0
    const passphrase = generatePassphrase(() => {
      call += 1
      return new Uint8Array([call === 1 ? 255 : 3])
    })
    expect(call).toBeGreaterThan(6)
    expect(passphrase.split(' ')).toHaveLength(6)
  })
})

describe('estimation de force', () => {
  it('classe une phrase générée comme forte et une phrase courte comme faible', () => {
    expect(estimatePassphraseStrength(generatePassphrase(() => new Uint8Array([7]))).label).toBe(
      'Forte',
    )
    expect(estimatePassphraseStrength('azerty123').label).toBe('Faible')
    expect(estimatePassphraseStrength('une phrase longue sans').label).toBe('Correcte')
  })

  it('dégrade les motifs répétitifs même quand ils sont longs', () => {
    expect(estimatePassphraseStrength('aaaaaaaaaaaaaaaa').label).toBe('Faible')
    expect(estimatePassphraseStrength('Abcdef1234Abcdef1234').label).toBe('Faible')
  })
})
