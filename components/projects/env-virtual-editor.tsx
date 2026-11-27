'use client'

import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseDotenv, replaceDotenvLine, type DotenvNode } from '@/lib/dotenv'

/** Éditeur virtualisé : une seule ligne est en clair à la fois, les autres restent masquées. */
export function EnvVirtualEditor({
  source,
  onChange,
}: {
  source: string
  onChange: (next: string) => void
}) {
  const document = useMemo(() => parseDotenv(source), [source])
  const [editingLine, setEditingLine] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const parentRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual renvoie des fonctions stables par conception : faux positif de la règle React.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: document.nodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 8,
  })

  function startEditing(node: DotenvNode) {
    setEditingLine(node.line)
    setDraft(node.source.replace(/(\r\n|\r|\n)$/, ''))
  }

  function commit() {
    if (editingLine !== null) onChange(replaceDotenvLine(document, editingLine, draft))
    setEditingLine(null)
    setDraft('')
  }

  return (
    <div
      ref={parentRef}
      className="wasp-env-virtual-editor"
      style={{ height: 320, overflowY: 'auto' }}
      aria-label="Éditeur virtualisé du fichier ENV"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const node = document.nodes[row.index]
          if (!node) return null
          const isEditing = editingLine === node.line
          const label =
            node.kind === 'assignment'
              ? `${node.key} = ••••••••`
              : node.kind === 'comment'
                ? 'commentaire'
                : node.kind === 'blank'
                  ? ''
                  : 'ligne à vérifier'
          return (
            <div
              key={node.line}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              <span>{node.line} · </span>
              {isEditing ? (
                <input
                  aria-label={`Ligne ${node.line}`}
                  value={draft}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit()
                    if (event.key === 'Escape') setEditingLine(null)
                  }}
                />
              ) : (
                <button type="button" onClick={() => startEditing(node)}>
                  {label || 'ligne vide'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
