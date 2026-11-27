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
})
