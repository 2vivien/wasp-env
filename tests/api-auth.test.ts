import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const apiRoot = fileURLToPath(new URL('../app/api', import.meta.url))

const PUBLIC_ROUTES = [
  'auth/[...all]/route.ts',
  'health/route.ts',
  'handles/check/route.ts',
  'links/route.ts',
  'links/[token]/route.ts',
  'links/[token]/uses/route.ts',
  'private-links/[token]/route.ts',
  'private-links/[token]/uses/route.ts',
]

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return routeFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

describe('authentification des endpoints', () => {
  it('exige une session sur toutes les routes métier', () => {
    const missing = routeFiles(apiRoot)
      .map((path) => path.slice(apiRoot.length + 1))
      .filter((relative) => !PUBLIC_ROUTES.includes(relative))
      .filter(
        (relative) => !readFileSync(`${apiRoot}/${relative}`, 'utf8').includes('getCurrentSession'),
      )

    expect(missing).toEqual([])
  })

  it('passe les exceptions à chaque appel de can()', () => {
    const missing = routeFiles(apiRoot)
      .map((path) => path.slice(apiRoot.length + 1))
      .filter((relative) => !PUBLIC_ROUTES.includes(relative))
      .filter((relative) => {
        const source = readFileSync(`${apiRoot}/${relative}`, 'utf8')
        return source.includes('can(') && !/\.permissions/.test(source)
      })
    expect(missing).toEqual([])
  })

  it('filtre chaque mutation par propriétaire ou par la matrice de permissions', () => {
    const missing = routeFiles(apiRoot)
      .map((path) => path.slice(apiRoot.length + 1))
      .filter((relative) => !PUBLIC_ROUTES.includes(relative))
      .filter((relative) => {
        const source = readFileSync(`${apiRoot}/${relative}`, 'utf8')
        if (!/export async function (POST|PUT|PATCH|DELETE)/.test(source)) return false
        return (
          !source.includes('session.user.id') &&
          !source.includes('current.user.id') &&
          !source.includes('access.permissions')
        )
      })
    expect(missing).toEqual([])
  })
})
