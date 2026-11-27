import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Next 16/Turbopack fusionne les chunks entre toutes les routes : le budget porte
// sur le payload JS initial total, pas sur une somme par route (voir DECISIONS.md).
const PUBLIC_BUDGET = 180 * 1024
const APP_BUDGET = 250 * 1024

const targets = [
  { route: '/page', label: '/', budget: PUBLIC_BUDGET },
  { route: '/login/page', label: '/login', budget: PUBLIC_BUDGET },
  { route: '/dashboard/page', label: '/dashboard', budget: APP_BUDGET },
  { route: '/secrets/page', label: '/secrets', budget: APP_BUDGET },
]

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength
}

function routeSize(route) {
  const manifestPath = join('.next', 'server', 'app', route, 'build-manifest.json')
  if (!existsSync(manifestPath)) return null
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const files = new Set([
    ...(manifest.rootMainFiles ?? []),
    ...(manifest.polyfillFiles ?? []),
    ...(manifest.pagesChunkGroupBootstrapParams?.[route]?.otherChunks ?? []),
  ])
  let total = 0
  for (const file of files) {
    const path = join('.next', file)
    if (existsSync(path)) total += gzipSize(path)
  }
  return total
}

const failures = []
for (const target of targets) {
  const size = routeSize(target.route)
  if (size === null) {
    failures.push(`${target.label}: manifest de build introuvable`)
    continue
  }
  const kb = (size / 1024).toFixed(1)
  console.log(`${target.label}: ${kb} Ko gzip (budget ${target.budget / 1024} Ko)`)
  if (size > target.budget) failures.push(`${target.label}: ${kb} Ko > ${target.budget / 1024} Ko`)
}

if (failures.length) {
  console.error('Budgets de performance dépassés :')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
