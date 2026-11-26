'use client'

import { useState } from 'react'
import { Heading, Text } from '@primer/react'
import type { KdfParameters, WrappedVaultKey } from '@/src/crypto/vault-key'
import { VaultSetupForm } from './vault-setup-form'
import { VaultUnlockForm } from './vault-unlock-form'
import { VaultItemsPanel } from './vault-items-panel'

export type VaultRecord = {
  id: string
  keySalt: string
  wrappedKey: WrappedVaultKey
  kdfParameters: KdfParameters
}

export function VaultWorkspace({ initialVault }: { userName: string; initialVault: VaultRecord | null }) {
  const [vault, setVault] = useState(initialVault)
  const [isUnlocked, setIsUnlocked] = useState(false)

  return (
    <section className="wasp-dashboard-content" aria-labelledby="workspace-title">
      <div className="wasp-dashboard-heading">
        <div>
          <Text className="wasp-eyebrow">ESPACE PRIVÉ</Text>
          <Heading as="h1" id="workspace-title">Votre coffre</Heading>
        </div>
        <span className={`wasp-lock-status${isUnlocked ? ' is-open' : ''}`}>
          <span aria-hidden="true" className="wasp-lock-indicator" />
          {isUnlocked ? 'Déverrouillé' : 'Verrouillé'}
        </span>
      </div>
      {!vault && <VaultSetupForm onCreated={(createdVault) => {
        setVault(createdVault)
        setIsUnlocked(true)
      }} />}
      {vault && !isUnlocked && <VaultUnlockForm vault={vault} onUnlocked={(updatedVault) => {
        if (updatedVault) setVault(updatedVault)
        setIsUnlocked(true)
      }} />}
      {vault && isUnlocked && <VaultItemsPanel vaultId={vault.id} onLock={() => setIsUnlocked(false)} />}
    </section>
  )
}
