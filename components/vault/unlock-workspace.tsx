'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Text } from '@primer/react'
import { VaultUnlockForm } from './vault-unlock-form'
import type { VaultRecord } from './vault-workspace'

type VaultResponse = { vaults: VaultRecord[] }

export function UnlockWorkspace({ next }: { next: string }) {
  const router = useRouter()
  const [vault, setVault] = useState<VaultRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/vaults?includeKeys=1', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<VaultResponse> : Promise.reject())
      .then((data) => { if (active) setVault(data.vaults[0] ?? null) })
      .catch(() => { if (active) setVault(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <Text role="status">Chargement du coffre…</Text>
  if (!vault) return <Text>Aucun coffre à déverrouiller sur ce compte.</Text>

  return <VaultUnlockForm vault={vault} onUnlocked={() => { router.replace(next); router.refresh() }} />
}
