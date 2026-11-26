'use client'

import { Button, Heading, Text } from '@primer/react'

export type BoardCard = { name: string; source: string; environmentId: string }

export function BoardColumn({
  id,
  name,
  cards,
  targets,
  onDrop,
  onMove,
}: {
  id: string
  name: string
  cards: BoardCard[]
  targets: Array<{ id: string; name: string }>
  onDrop: (sourceId: string, targetId: string, card: BoardCard, mode: 'copy' | 'move') => void
  onMove: (targetId: string, card: BoardCard, mode: 'copy' | 'move') => void
}) {
  return (
    <section
      className="wasp-board-column"
      aria-label={`Environnement ${name}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData('application/x-wasp-card')
        if (!raw) return
        const payload = JSON.parse(raw) as { sourceId: string; card: BoardCard }
        onDrop(payload.sourceId, id, payload.card, event.altKey ? 'move' : 'copy')
      }}
    >
      <header className="wasp-board-column-header">
        <Heading as="h2">{name}</Heading>
        <Text size="small">{cards.length}</Text>
      </header>
      <ul>
        {cards.map((card) => (
          <li key={`${id}-${card.name}`}>
            <article
              className="wasp-board-card"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  'application/x-wasp-card',
                  JSON.stringify({ sourceId: id, card }),
                )
              }
            >
              <Text>{card.name}</Text>
              <Text size="small">••••••••</Text>
              <div className="wasp-inline-action">
                {targets
                  .filter((target) => target.id !== id)
                  .map((target) => (
                    <span key={target.id}>
                      <Button variant="invisible" onClick={() => onMove(target.id, card, 'copy')}>
                        Copier vers {target.name}
                      </Button>
                      <Button variant="invisible" onClick={() => onMove(target.id, card, 'move')}>
                        Déplacer vers {target.name}
                      </Button>
                    </span>
                  ))}
              </div>
            </article>
          </li>
        ))}
      </ul>
      {cards.length === 0 && <Text size="small">Aucune variable.</Text>}
    </section>
  )
}
