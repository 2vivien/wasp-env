'use client'

import { useState } from 'react'
import { Button, Heading, Text } from '@primer/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { broadcastVaultLock, lockKeyStore } from '@/src/crypto/key-store'
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

export function VaultWorkspace({
  userName,
  initialVault,
}: {
  userName: string
  initialVault: VaultRecord | null
}) {
  const router = useRouter()
  const [vault, setVault] = useState(initialVault)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [signOutError, setSignOutError] = useState(false)

  async function handleSignOut() {
    lockKeyStore()
    broadcastVaultLock()
    setIsUnlocked(false)
    const result = await authClient.signOut()
    if (result.error) {
      setSignOutError(true)
      return
    }
    router.replace('/')
    router.refresh()
  }

  return (
    <main className="wasp-dashboard">
      <header className="wasp-dashboard-header">
        <Link className="wasp-wordmark" href="/">Wasp</Link>
        <nav className="wasp-dashboard-nav" aria-label="Navigation principale">
          <Link href="/projects">Projets</Link>
          <Link href="/shared">Partagés</Link>
          <Link href="/security">Sécurité</Link>
        </nav>
        <div className="wasp-dashboard-account">
          <Text size="small">{userName}</Text>
          <Button variant="default" onClick={handleSignOut}>Se déconnecter</Button>
        </div>
      </header>
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
        {signOutError && <Text role="alert" className="wasp-auth-error">Déconnexion impossible. Réessayez.</Text>}
        {!vault && <VaultSetupForm onCreated={(createdVault) => {
          setVault(createdVault)
          setIsUnlocked(true)
        }} />}
        {vault && !isUnlocked && <VaultUnlockForm vault={vault} onUnlocked={(updatedVault) => {
          if (updatedVault) setVault(updatedVault)
          setIsUnlocked(true)
        }} />}
        {vault && isUnlocked && <VaultItemsPanel vaultId={vault.id} onLock={() => {
          lockKeyStore()
          setIsUnlocked(false)
        }} />}
      </section>
    </main>
  )
}
