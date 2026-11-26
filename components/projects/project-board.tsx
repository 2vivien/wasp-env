'use client'

import { useEffect, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Heading, Text } from '@primer/react'
import { parseDotenv } from '@/lib/dotenv'
import { decryptObjectName } from '@/lib/client/metadata'
import { decryptEnvFile, encryptEnvFile } from '@/lib/client/env-file'
import { BoardColumn, type BoardCard } from './board-column'
import type { EncryptedBlob } from '@/src/crypto/aead'

type Project = { id: string; vaultId: string; encryptedMetadata: EncryptedBlob }
type Environment = {
  id: string
  projectId: string
  vaultId: string
  kind: string
  encryptedMetadata: EncryptedBlob
  version: number
}
type EnvFile = { encryptedLayout: EncryptedBlob; version: number }
type Column = { id: string; name: string; source: string; version: number; cards: BoardCard[] }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Chargement impossible')
  return response.json() as Promise<T>
}

function cardsFrom(source: string, environmentId: string): BoardCard[] {
  return parseDotenv(source).nodes.flatMap((node) =>
    node.kind === 'assignment' && node.key
      ? [{ name: node.key, source: node.source, environmentId }]
      : [],
  )
}

function appendLine(source: string, line: string): string {
  if (!source) return line
  return source.endsWith('\n') || source.endsWith('\r')
    ? `${source}${line}\n`
    : `${source}\n${line}\n`
}

function removeLine(source: string, card: BoardCard): string {
  const lines = source.split(/(?<=\n)|(?<=\r)/)
  const index = lines.findIndex((line) => line === card.source)
  if (index >= 0) lines.splice(index, 1)
  return lines.join('')
}

export function ProjectBoard({ projectId }: { projectId: string }) {
  const [columns, setColumns] = useState<Column[]>([])
  const [vaultId, setVaultId] = useState('')
  const [notice, setNotice] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const data = active.data.current as { sourceId?: string; card?: BoardCard } | undefined
    if (!data?.sourceId || !data.card) return
    void transfer(data.sourceId, String(over.id), data.card, 'copy')
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { project } = await fetchJson<{ project: Project }>(`/api/projects/${projectId}`)
        const { environments } = await fetchJson<{ environments: Environment[] }>(
          `/api/projects/${projectId}/environments`,
        )
        const name = await decryptObjectName(
          project.vaultId,
          project.id,
          'project-meta',
          project.encryptedMetadata,
        )
        const rows = await Promise.all(
          environments.map(async (environment) => {
            const environmentName = await decryptObjectName(
              environment.vaultId,
              environment.id,
              'environment-meta',
              environment.encryptedMetadata,
            )
            const response = await fetch(`/api/environments/${environment.id}/env-file`, {
              cache: 'no-store',
            })
            let source = ''
            let version = 0
            if (response.ok) {
              const file = (await response.json()) as EnvFile
              version = file.version
              source = await decryptEnvFile(
                environment.vaultId,
                environment.id,
                file.encryptedLayout,
                file.version,
              )
            }
            return {
              id: environment.id,
              name: environmentName,
              source,
              version,
              cards: cardsFrom(source, environment.id),
            }
          }),
        )
        if (active) {
          setColumns(rows)
          setVaultId(project.vaultId)
          setNotice(`Projet ${name}`)
        }
      } catch {
        if (active) setNotice('Déverrouillez le coffre pour afficher le tableau.')
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [projectId])

  async function save(column: Column, source: string) {
    if (!vaultId) throw new Error('Vault introuvable')
    const encryptedLayout = await encryptEnvFile(vaultId, column.id, source, column.version + 1)
    const response = await fetch(`/api/environments/${column.id}/env-file`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ encryptedLayout, expectedVersion: column.version }),
    })
    if (!response.ok) throw new Error('Enregistrement impossible')
  }

  async function transfer(
    sourceId: string,
    targetId: string,
    card: BoardCard,
    mode: 'copy' | 'move',
  ) {
    const source = columns.find((column) => column.id === sourceId)
    const target = columns.find((column) => column.id === targetId)
    if (!source || !target) return
    const sourceText = mode === 'move' ? removeLine(source.source, card) : source.source
    const targetText = appendLine(target.source, card.source.replace(/[\r\n]+$/, ''))
    try {
      await Promise.all([
        mode === 'move' ? save(source, sourceText) : Promise.resolve(),
        save(target, targetText),
      ])
      setColumns((current) =>
        current.map((column) => {
          if (column.id === sourceId && mode === 'move')
            return {
              ...column,
              source: sourceText,
              version: column.version + 1,
              cards: cardsFrom(sourceText, sourceId),
            }
          if (column.id === targetId)
            return {
              ...column,
              source: targetText,
              version: column.version + 1,
              cards: cardsFrom(targetText, targetId),
            }
          return column
        }),
      )
      setNotice(mode === 'move' ? 'Variable déplacée.' : 'Variable copiée.')
    } catch {
      setNotice('Enregistrement impossible. Déverrouillez le coffre puis réessayez.')
    }
  }

  return (
    <section className="wasp-dashboard-content" aria-labelledby="board-title">
      <Heading as="h1" id="board-title">
        Tableau du projet
      </Heading>
      {notice && (
        <Text role="status" size="small">
          {notice}
        </Text>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="wasp-board" aria-live="polite">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              id={column.id}
              name={column.name}
              cards={column.cards}
              targets={columns.map(({ id, name }) => ({ id, name }))}
              onMove={(sourceId, targetId, card, mode) =>
                void transfer(sourceId, targetId, card, mode)
              }
            />
          ))}
        </div>
      </DndContext>
    </section>
  )
}
