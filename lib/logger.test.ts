import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLogger } from './logger'

describe('logger', () => {
  it('rédige les champs sensibles même imbriqués', async () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    const log = createLogger(stream)
    log.info({ password: 'hunter2', nested: { value: 'top-secret' }, safe: 'visible' }, 'test')
    await new Promise((resolve) => setImmediate(resolve))
    const output = chunks.join('')
    expect(output).toContain('visible')
    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('top-secret')
    expect(output).toContain('[REDACTED]')
  })

  it('ne laisse fuir aucune valeur sur 1 000 opérations', async () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    const log = createLogger(stream)
    const keys = [
      'password',
      'passphrase',
      'secret',
      'value',
      'ciphertext',
      'key',
      'token',
      'authorization',
      'cookie',
      'fragment',
      'recoveryKey',
      'email',
      'accessCode',
    ]
    const secrets: string[] = []
    let seed = 42
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed
    }

    for (let i = 0; i < 1000; i += 1) {
      const value = `SECRET_${i}_${random().toString(36)}`
      secrets.push(value)
      const key = keys[i % keys.length] ?? 'secret'
      if (i % 2 === 0) log.info({ [key]: value, nested: { value } }, 'opération')
      else log.info({ nested: { [key]: value }, safe: i }, 'opération')
    }

    await new Promise((resolve) => setImmediate(resolve))
    const output = chunks.join('')
    expect(secrets.some((value) => output.includes(value))).toBe(false)
    expect(output).toContain('[REDACTED]')
  })
})
