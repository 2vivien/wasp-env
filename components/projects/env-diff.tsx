'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Heading, Text } from '@primer/react'
import { parseDotenv } from '@/lib/dotenv'
import { decryptEnvFile } from '@/lib/client/env-file'
import { valueFingerprint } from '@/src/crypto/value-hmac'
import type { EncryptedBlob } from '@/src/crypto/aead'

type Project = { id: string; vaultId: string }
type Environment = { id: string; projectId: string; vaultId: string; kind: string }
type EnvFile = { environmentId: string; encryptedLayout: EncryptedBlob; version: number }
type Row = { name: string; a: 'present' | 'absent'; b: 'present' | 'absent'; status: 'identical' | 'different' | 'missing' }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

function rawValue(line: string): string {
  return line.replace(/[\r\n]+$/, '').replace(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, '')
}

export function EnvDiff() {
  const projects = useSWR<{ projects: Project[] }>('/api/projects', fetchJson, { revalidateOnFocus: false })
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const first = projects.data?.projects[0]
    if (!first) return
    fetchJson<{ environments: Environment[] }>(`/api/projects/${first.id}/environments`)
      .then((data) => {
        if (!active) return
        setEnvironments(data.environments)
        setLeftId(data.environments[0]?.id ?? '')
        setRightId(data.environments[1]?.id ?? data.environments[0]?.id ?? '')
      })
      .catch(() => { if (active) setNotice('Impossible de charger les environnements.') })
    return () => { active = false }
  }, [projects.data])

  async function compare() {
    setNotice('Comparaison…')
    try {
      const load = async (environmentId: string) => {
        const environment = environments.find((entry) => entry.id === environmentId)
        if (!environment) throw new Error('Environnement introuvable.')
        const file = await fetchJson<EnvFile>(`/api/environments/${environmentId}/env-file`)
        const source = await decryptEnvFile(environment.vaultId, environmentId, file.encryptedLayout, file.version)
        const document = parseDotenv(source)
        const map = new Map<string, string>()
        for (const node of document.nodes) {
          if (node.kind !== 'assignment' || !node.key) continue
          map.set(node.key, await valueFingerprint(environment.vaultId, node.key, rawValue(node.source)))
        }
        return map
      }
      const [left, right] = await Promise.all([load(leftId), load(rightId)])
      const names = [...new Set([...left.keys(), ...right.keys()])].sort()
      setRows(names.map((name) => {
        const a = left.has(name)
        const b = right.has(name)
        return {
          name,
          a: a ? 'present' : 'absent',
          b: b ? 'present' : 'absent',
          status: !a || !b ? 'missing' : left.get(name) === right.get(name) ? 'identical' : 'different',
        }
      }))
      setNotice('Comparaison terminée. Aucune valeur n’est affichée.')
    } catch { setNotice('Comparaison impossible. Déverrouillez le coffre puis réessayez.') }
  }

  return (
    <section className="wasp-vault-card" aria-labelledby="env-diff-title">
      <Heading as="h2" id="env-diff-title">Comparateur d’environnements</Heading>
      <div className="wasp-inline-action">
        <select aria-label="Environnement A" value={leftId} onChange={(event) => setLeftId(event.target.value)}>{environments.map((entry) => <option key={entry.id} value={entry.id}>{entry.kind}</option>)}</select>
        <select aria-label="Environnement B" value={rightId} onChange={(event) => setRightId(event.target.value)}>{environments.map((entry) => <option key={entry.id} value={entry.id}>{entry.kind}</option>)}</select>
        <button type="button" onClick={() => void compare()} disabled={!leftId || !rightId}>Comparer</button>
      </div>
      {notice && <Text role="status" size="small">{notice}</Text>}
      {rows.length > 0 && <table className="wasp-diff-table"><thead><tr><th>Variable</th><th>A</th><th>B</th><th>État</th></tr></thead><tbody>{rows.map((row) => (
        <tr key={row.name}><td>{row.name}</td><td>{row.a}</td><td>{row.b}</td><td>{row.status}</td></tr>
      ))}</tbody></table>}
    </section>
  )
}
