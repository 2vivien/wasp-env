'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button, Text } from '@primer/react'
import { authClient } from '@/lib/auth-client'

export function GoogleSignInButton({ callbackURL }: { callbackURL: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  async function handleSignIn() {
    setHasError(false)
    setIsLoading(true)
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL })
      if (result.error) {
        setIsLoading(false)
        setHasError(true)
      }
    } catch {
      setIsLoading(false)
      setHasError(true)
    }
  }

  return (
    <div className="wasp-auth-action">
      <Button variant="primary" size="large" onClick={handleSignIn} disabled={isLoading}>
        <Image src="/brands/google.svg" width={20} height={20} alt="" aria-hidden="true" />
        {isLoading ? 'Redirection vers Google…' : 'Continuer avec Google'}
      </Button>
      {hasError && <Text role="alert" className="wasp-auth-error">Connexion impossible. Réessayez.</Text>}
      {isLoading && <Text role="status" size="small">Vous allez être redirigé vers Google.</Text>}
    </div>
  )
}
