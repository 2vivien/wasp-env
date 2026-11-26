'use client'

import { useRouter } from 'next/navigation'
import { Text } from '@primer/react'
import { VaultSetupForm } from '@/components/vault/vault-setup-form'

const STEPS = ['Pseudo', 'Phrase secrète', 'Récupération'] as const

export function OnboardingStepper() {
  const router = useRouter()
  return (
    <section className="wasp-onboarding">
      <ol className="wasp-stepper" aria-label="Étapes de configuration">
        {STEPS.map((step, index) => (
          <li key={step} aria-current={index === 0 ? 'step' : undefined}>
            <span>{index + 1}</span>{step}
          </li>
        ))}
      </ol>
      <Text size="small">Étape 1 terminée. La phrase et la clé de récupération restent dans ce navigateur.</Text>
      <VaultSetupForm onCreated={() => { router.replace('/dashboard'); router.refresh() }} />
    </section>
  )
}
