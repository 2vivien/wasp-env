'use client'

import { useEffect, useState } from 'react'
import { Text } from '@primer/react'

type PublicProfile = { handle: string; fingerprint: string }
type Result = { handle: string; state: 'known' | 'changed' | 'unavailable'; fingerprint: string }

function storageKey(handle: string): string {
  return `wasp-fingerprint:${handle.toLowerCase()}`
}

export function RecipientFingerprint({ handle }: { handle: string }) {
  const normalized = handle.trim().replace(/^@/, '').toLowerCase()
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (normalized.length < 3) return
    let active = true
    fetch(`/api/users/${encodeURIComponent(normalized)}`, { cache: 'no-store' })
      .then((response) =>
        response.ok ? (response.json() as Promise<PublicProfile>) : Promise.reject(),
      )
      .then((profile) => {
        if (!active) return
        const previous = window.localStorage.getItem(storageKey(normalized))
        if (!previous) window.localStorage.setItem(storageKey(normalized), profile.fingerprint)
        setResult({
          handle: normalized,
          state: !previous || previous === profile.fingerprint ? 'known' : 'changed',
          fingerprint: profile.fingerprint,
        })
      })
      .catch(() => {
        if (active) setResult({ handle: normalized, state: 'unavailable', fingerprint: '' })
      })
    return () => {
      active = false
    }
  }, [normalized])

  if (normalized.length < 3) return null
  const current = result?.handle === normalized ? result : null
  if (!current) return <Text size="small">Empreinte en cours de vérification…</Text>
  if (current.state === 'unavailable') return <Text size="small">Empreinte indisponible.</Text>
  if (current.state === 'changed') {
    return (
      <Text role="alert" size="small">
        La clé publique de ce contact a changé. Vérifiez son identité avant de partager.
      </Text>
    )
  }
  return <Text size="small">Empreinte de clé : {current.fingerprint}</Text>
}
