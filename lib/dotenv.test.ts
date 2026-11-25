import { describe, expect, it } from 'vitest'
import { exportDotenv, parseDotenv } from './dotenv'

describe('dotenv source preservation', () => {
  it('round-trips a corpus of 40 edge-case documents byte-for-byte', () => {
    const cases = Array.from({ length: 40 }, (_, index) => {
      const newline = ['\n', '\r\n', '\r'][index % 3] ?? '\n'
      const prefix = index % 5 === 0 ? '\uFEFF' : ''
      const quote = index % 2 === 0 ? '"' : "'"
      const lines = [
        `${prefix}# fixture ${index}`,
        `export API_KEY_${index}=${quote}value=#${index}=${quote}`,
        `EMPTY_${index}=`,
        `UNICODE_${index}=café-東京-🔐`,
        '',
        `MULTILINE_${index}="first line\\nsecond line"`,
      ]
      return lines.join(newline) + (index % 2 === 0 ? newline : '')
    })

    for (const source of cases) {
      expect(exportDotenv(parseDotenv(source))).toBe(source)
    }
  })

  it('recognizes multiline quoted values while preserving their source', () => {
    const source = 'CERT="first line\r\n# still a value\r\nlast line"\nPORT=3000'
    const document = parseDotenv(source)
    expect(document.variableNames).toEqual(['CERT', 'PORT'])
    expect(document.malformedLines).toEqual([])
    expect(document.nodes[1]?.kind).toBe('continuation')
    expect(exportDotenv(document)).toBe(source)
  })

  it('flags the opening line of an unterminated quoted value', () => {
    expect(parseDotenv('TOKEN="begin\nstill open').malformedLines).toEqual([1])
  })

  it('detects assignment names, duplicate keys and malformed lines without parsing values', () => {
    const document = parseDotenv('\uFEFF# keep\r\nexport API_KEY="a=b#c"\r\nAPI_KEY=second\nBROKEN LINE\n\n')
    expect(document.variableNames).toEqual(['API_KEY'])
    expect(document.duplicateNames).toEqual(['API_KEY'])
    expect(document.malformedLines).toEqual([4])
    expect(exportDotenv(document)).toBe('\uFEFF# keep\r\nexport API_KEY="a=b#c"\r\nAPI_KEY=second\nBROKEN LINE\n\n')
  })
})
