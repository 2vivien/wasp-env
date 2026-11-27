'use client'

import { useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button, Heading, Text } from '@primer/react'

export type BoardCard = { name: string; source: string; environmentId: string }

function DraggableCard({
  card,
  targets,
  onMove,
}: {
  card: BoardCard
  targets: Array<{ id: string; name: string }>
  onMove: (targetId: string, card: BoardCard, mode: 'copy' | 'move') => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${card.environmentId}:${card.name}`,
    data: { card, sourceId: card.environmentId },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`wasp-board-card${isDragging ? ' is-dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <Text>{card.name}</Text>
      <Text size="small">••••••••</Text>
      <div className="wasp-inline-action" onPointerDown={(event) => event.stopPropagation()}>
        {targets
          .filter((target) => target.id !== card.environmentId)
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
  )
}

export function BoardColumn({
  id,
  name,
  cards,
  targets,
  onMove,
}: {
  id: string
  name: string
  cards: BoardCard[]
  targets: Array<{ id: string; name: string }>
  onMove: (sourceId: string, targetId: string, card: BoardCard, mode: 'copy' | 'move') => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { setNodeRef, isOver } = useDroppable({ id })
  // Les fonctions renvoyées par TanStack Virtual ne sont pas memoisables ; ce composant reste non memoisé.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 8,
  })
  const virtual = cards.length > 100

  return (
    <section
      ref={setNodeRef}
      className={`wasp-board-column${isOver ? ' is-over' : ''}`}
      aria-label={`Environnement ${name}`}
    >
      <header className="wasp-board-column-header">
        <Heading as="h2">{name}</Heading>
        <Text size="small">{cards.length}</Text>
      </header>
      <div className="wasp-board-column-scroll" ref={scrollRef}>
        {virtual ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={cards[item.index]?.name}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <DraggableCard
                  card={cards[item.index]!}
                  targets={targets}
                  onMove={(targetId, card, mode) => onMove(id, targetId, card, mode)}
                />
              </div>
            ))}
          </div>
        ) : (
          <ul>
            {cards.map((card) => (
              <li key={card.name}>
                <DraggableCard
                  card={card}
                  targets={targets}
                  onMove={(targetId, next, mode) => onMove(id, targetId, next, mode)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {cards.length === 0 && <Text size="small">Aucune variable.</Text>}
    </section>
  )
}
