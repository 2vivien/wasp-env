'use client'

import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/** Aperçu virtualisé des lignes d'un gros fichier ENV. Les valeurs ne sont jamais rendues. */
export function EnvLineMap({ source }: { source: string }) {
  const lines = source.split(/\r?\n/)
  const parentRef = useRef<HTMLDivElement>(null)
  // TanStack Virtual renvoie des fonctions stables par conception : faux positif de la règle React.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 8,
  })

  return (
    <div
      ref={parentRef}
      className="wasp-env-line-map"
      style={{ height: 220, overflowY: 'auto' }}
      aria-label="Aperçu des lignes du fichier ENV"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const line = lines[row.index] ?? ''
          const separator = line.indexOf('=')
          const name = separator > 0 ? line.slice(0, separator).trim() : ''
          return (
            <div
              key={row.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              <span>{row.index + 1} · </span>
              <span>
                {name ? `${name} = ••••••••` : separator === 0 ? 'ligne à vérifier' : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
