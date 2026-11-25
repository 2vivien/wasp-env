export type DotenvNode = {
  kind: 'assignment' | 'comment' | 'blank' | 'continuation' | 'raw'
  source: string
  line: number
  key?: string
}

export type DotenvDocument = {
  source: string
  nodes: DotenvNode[]
  variableNames: string[]
  duplicateNames: string[]
  malformedLines: number[]
}

function splitSourceLines(source: string): string[] {
  const lines: string[] = []
  const linePattern = /([^\r\n]*)(\r\n|\r|\n|$)/g
  let match: RegExpExecArray | null

  while ((match = linePattern.exec(source)) !== null && match[0].length > 0) {
    lines.push(match[0])
    if (linePattern.lastIndex >= source.length) break
  }

  return lines
}

function classifyLine(source: string, line: number): DotenvNode {
  const content = source.replace(/(?:\r\n|\r|\n)$/, '').replace(/^\uFEFF/, '')
  if (content.trim().length === 0) return { kind: 'blank', source, line }
  if (/^\s*#/.test(content)) return { kind: 'comment', source, line }

  const assignment = content.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
  if (assignment?.[1]) return { kind: 'assignment', source, line, key: assignment[1] }
  return { kind: 'raw', source, line }
}

function hasClosingQuote(value: string, quote: string): boolean {
  let escaped = false
  for (const character of value) {
    if (escaped) {
      escaped = false
      continue
    }
    if (quote === '"' && character === '\\') {
      escaped = true
      continue
    }
    if (character === quote) return true
  }
  return false
}

export function parseDotenv(source: string): DotenvDocument {
  let openQuote: string | null = null
  let openQuoteLine = 0
  const nodes = splitSourceLines(source).map((line, index) => {
    const lineNumber = index + 1
    if (openQuote) {
      const continuation = { kind: 'continuation' as const, source: line, line: lineNumber }
      if (hasClosingQuote(line.replace(/(?:\r\n|\r|\n)$/, ''), openQuote)) {
        openQuote = null
        openQuoteLine = 0
      }
      return continuation
    }

    const node = classifyLine(line, lineNumber)
    if (node.kind === 'assignment') {
      const content = line.replace(/(?:\r\n|\r|\n)$/, '').replace(/^\uFEFF/, '')
      const value = content.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=(.*)$/)?.[1]?.trimStart()
      const quote = value?.[0]
      if ((quote === '"' || quote === "'") && value && !hasClosingQuote(value.slice(1), quote)) {
        openQuote = quote
        openQuoteLine = lineNumber
      }
    }
    return node
  })
  const counts = new Map<string, number>()
  for (const node of nodes) {
    if (node.kind === 'assignment' && node.key) counts.set(node.key, (counts.get(node.key) ?? 0) + 1)
  }
  const malformedLines = nodes.filter((node) => node.kind === 'raw').map((node) => node.line)
  if (openQuote && openQuoteLine > 0) malformedLines.push(openQuoteLine)

  return {
    source,
    nodes,
    variableNames: [...counts.keys()],
    duplicateNames: [...counts].filter(([, count]) => count > 1).map(([name]) => name),
    malformedLines,
  }
}

export function exportDotenv(document: DotenvDocument): string {
  return document.source
}
