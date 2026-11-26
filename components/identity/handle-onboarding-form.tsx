'use client'

import { useEffect, useState } from 'react'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { useRouter } from 'next/navigation'
import { isValidHandle } from '@/src/modules/identity/handle'

export function HandleOnboardingForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [availability, setAvailability] = useState<'checking' | 'available' | 'taken' | null>(null)
  const isValid = isValidHandle(handle)

  useEffect(() => {
    if (!isValid) return
    const timer = window.setTimeout(() => {
      setAvailability('checking')
      fetch(`/api/handles/check?h=${encodeURIComponent(handle)}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() as Promise<{ available: boolean }> : Promise.reject())
        .then((result) => setAvailability(result.available ? 'available' : 'taken'))
        .catch(() => setAvailability(null))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [handle, isValid])

  async function saveHandle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || isSaving || availability !== 'available') return
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
      router.replace(next)
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
              onChange={(event) => {
                const next = event.target.value.toLowerCase()
                setHandle(next)
                setAvailability(isValidHandle(next) ? 'checking' : null)
              }}
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
            {handle.length === 0
              ? 'Le pseudo sera visible lors du partage.'
              : !isValid
                ? 'Format invalide ou pseudo réservé.'
                : availability === 'checking'
                  ? 'Vérification de la disponibilité…'
                  : availability === 'available'
                    ? 'Disponible.'
                    : availability === 'taken'
                      ? 'Déjà pris.'
                      : 'Disponibilité indisponible. Réessayez.'}
          </Text>
          {error && <Text role="alert" className="wasp-auth-error">{error}</Text>}
          <Button type="submit" variant="primary" disabled={!isValid || isSaving || availability !== 'available'}>
            {isSaving ? 'Enregistrement…' : 'Continuer'}
          </Button>
        </form>
      </section>
    </main>
  )
}
