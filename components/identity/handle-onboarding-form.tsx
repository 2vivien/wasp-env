'use client'

import { useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { useRouter } from 'next/navigation'
import { isValidHandle } from '@/src/modules/identity/handle'

export function HandleOnboardingForm() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isValid = isValidHandle(handle)

  async function saveHandle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || isSaving) return
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/me/handle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      if (response.status === 409) {
        setError('Ce pseudo est déjà utilisé ou ne peut plus être modifié.')
        return
      }
      if (!response.ok) throw new Error('Profile update failed.')
      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('Impossible d’enregistrer le pseudo. Vérifiez la connexion puis réessayez.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="wasp-login-wrap">
      <section className="wasp-login-card" aria-labelledby="handle-title">
        <Text className="wasp-eyebrow">ÉTAPE 1 · IDENTITÉ PUBLIQUE</Text>
        <Heading as="h1" id="handle-title">Choisissez un pseudo</Heading>
        <Text>Les autres vous trouvent avec ce pseudo. Votre adresse e-mail reste privée.</Text>
        <form className="wasp-vault-form" onSubmit={saveHandle}>
          <label className="wasp-field" htmlFor="handle-input">
            <span>Pseudo</span>
            <TextInput
              id="handle-input"
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              autoComplete="username"
              autoCapitalize="none"
              maxLength={20}
              aria-invalid={handle.length > 0 && !isValid}
              aria-describedby="handle-help handle-status"
              required
            />
          </label>
          <Text id="handle-help" size="small">3 à 20 caractères, minuscules, chiffres ou _, en commençant par une lettre.</Text>
          <Text id="handle-status" role="status" size="small">
            {handle.length === 0 ? 'Le pseudo sera visible lors du partage.' : isValid ? 'Format valide. La disponibilité est vérifiée à l’enregistrement.' : 'Format invalide ou pseudo réservé.'}
          </Text>
          {error && <Text role="alert" className="wasp-auth-error">{error}</Text>}
          <Button type="submit" variant="primary" disabled={!isValid || isSaving}>
            {isSaving ? 'Enregistrement…' : 'Continuer'}
          </Button>
        </form>
      </section>
    </main>
  )
}
