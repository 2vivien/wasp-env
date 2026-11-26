'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decryptBytes, deriveObjectKey, importRootKey } from '@/src/crypto/aead'
import { withKey } from '@/src/crypto/key-store'
import { decryptVaultItemMetadata } from '@/src/crypto/vault-items'
import messages from '@/messages/fr.json'

type Result = { id: string; label: string; kind: 'action' | 'secret' | 'project' | 'vault'; href: string }
type Blob = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }

const KIND_LABELS: Record<Result['kind'], string> = {
  action: messages.palette.actions,
  secret: messages.palette.secrets,
  project: messages.palette.projects,
  vault: messages.palette.vaults,
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

async function decryptProjectName(vaultId: string, projectId: string, blob: Blob): Promise<string> {
  return withKey(vaultId, async (rawKey) => {
    const root = await importRootKey(rawKey)
    const key = await deriveObjectKey(root, 'metadata', projectId)
    const bytes = await decryptBytes(key, blob, { vaultId, objectType: 'project-meta', objectId: projectId, version: 1 })
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown }
      return typeof parsed.name === 'string' ? parsed.name : 'Projet sans nom'
    } finally { bytes.fill(0) }
  })
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [locked, setLocked] = useState(false)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (!open) return
    let active = true

    async function buildIndex() {
      const actions: Result[] = [
        { id: 'new-secret', label: 'Nouveau secret', kind: 'action', href: '/dashboard' },
        { id: 'import-env', label: 'Importer un .env', kind: 'action', href: '/dashboard' },
        { id: 'new-project', label: 'Nouveau projet', kind: 'action', href: '/projects' },
      ]
      try {
        const { vaults } = await fetchJson<{ vaults: Array<{ id: string }> }>('/api/vaults')
        const vaultId = vaults[0]?.id
        if (!vaultId) { if (active) setResults(actions); return }
        const [items, projects] = await Promise.all([
          fetchJson<{ items: Array<{ id: string; encryptedPayload: Parameters<typeof decryptVaultItemMetadata>[2] }> }>(`/api/vault-items?vaultId=${encodeURIComponent(vaultId)}`),
          fetchJson<{ projects: Array<{ id: string; encryptedMetadata: Blob }> }>('/api/projects'),
        ])
        const secrets = await Promise.all(items.items.map(async (item) => ({
          id: item.id,
          label: (await decryptVaultItemMetadata(vaultId, item.id, item.encryptedPayload)).name,
          kind: 'secret' as const,
          href: '/secrets',
        })))
        const projectRows = await Promise.all(projects.projects.map(async (project) => ({
          id: project.id,
          label: await decryptProjectName(vaultId, project.id, project.encryptedMetadata),
          kind: 'project' as const,
          href: '/projects',
        })))
        if (active) {
          setLocked(false)
          setResults([...actions, ...secrets, ...projectRows, ...vaults.map((vault) => ({ id: vault.id, label: vault.id.slice(0, 8), kind: 'vault' as const, href: '/vaults' }))])
        }
      } catch {
        if (active) { setLocked(true); setResults(actions) }
      }
    }

    void buildIndex()
    return () => { active = false }
  }, [open])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return needle ? results.filter((result) => result.label.toLocaleLowerCase().includes(needle)) : results
  }, [query, results])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((current) => Math.min(current + 1, filtered.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((current) => Math.max(current - 1, 0)) }
      if (event.key === 'Enter') {
        const target = filtered[selected]
        if (target) { onClose(); router.push(target.href) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, open, onClose, router, selected])

  if (!open) return null

  return (
    <div className="wasp-palette-scrim" role="presentation" onPointerDown={onClose}>
      <section className="wasp-palette" role="dialog" aria-modal="true" aria-labelledby="palette-title" onPointerDown={(event) => event.stopPropagation()}>
        <Heading as="h2" id="palette-title">{messages.palette.title}</Heading>
        <TextInput autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }} placeholder={messages.palette.placeholder} aria-label={messages.palette.placeholder} />
        {locked && <Text role="status" size="small">{messages.palette.locked}</Text>}
        <ul className="wasp-palette-results">
          {filtered.map((result, index) => (
            <li key={result.id}>
              <Button variant="invisible" className={index === selected ? 'is-selected' : undefined} onClick={() => { onClose(); router.push(result.href) }}>
                <span>{result.label}</span><span className="wasp-palette-kind">{KIND_LABELS[result.kind]}</span>
              </Button>
            </li>
          ))}
        </ul>
        {filtered.length === 0 && <Text>{messages.palette.empty}</Text>}
      </section>
    </div>
  )
}
