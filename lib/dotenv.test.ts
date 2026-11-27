import { describe, expect, it } from 'vitest'
import { dotenvSourceFromNodes, exportDotenv, parseDotenv, replaceDotenvLine } from './dotenv'

describe('édition virtualisée des lignes', () => {
  it('reconstruit la source sans altérer les fins de ligne', () => {
    for (const source of ['A=1\nB=2\n', 'A=1\r\nB=2\r\n', 'A=1\rB=2\r', '# c\nA="x\ny"\n']) {
      const document = parseDotenv(source)
      expect(dotenvSourceFromNodes(document.nodes)).toBe(source)
      expect(exportDotenv(document)).toBe(source)
    }
  })

  it('remplace uniquement la ligne visée', () => {
    const source = 'A=1\r\n# commentaire\r\nB="x"\r\n'
    const document = parseDotenv(source)
    const updated = replaceDotenvLine(document, 1, 'A=42')
    expect(updated).toBe('A=42\r\n# commentaire\r\nB="x"\r\n')
    expect(parseDotenv(updated).variableNames).toEqual(['A', 'B'])
  })
})

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
    const document = parseDotenv(
      '\uFEFF# keep\r\nexport API_KEY="a=b#c"\r\nAPI_KEY=second\nBROKEN LINE\n\n',
    )
    expect(document.variableNames).toEqual(['API_KEY'])
    expect(document.duplicateNames).toEqual(['API_KEY'])
    expect(document.malformedLines).toEqual([4])
    expect(exportDotenv(document)).toBe(
      '\uFEFF# keep\r\nexport API_KEY="a=b#c"\r\nAPI_KEY=second\nBROKEN LINE\n\n',
    )
  })
})
