'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { preferencesStore, savePreferences, type Preferences } from '@/lib/preferences'
import { SecurityBackup } from '@/components/security/security-backup'

export function SettingsWorkspace() {
  const preferences = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot, preferencesStore.getServerSnapshot)
  const update = (patch: Partial<Preferences>) => savePreferences(patch)

  return (
    <section className="wasp-dashboard-content" aria-labelledby="settings-title">
      <Heading as="h1" id="settings-title">Réglages</Heading>
      <nav className="wasp-settings-nav" aria-label="Sections des réglages">
        <a href="#apparence">Apparence</a><a href="#securite">Sécurité</a><a href="#donnees">Données</a>
      </nav>

      <section className="wasp-vault-card" id="apparence" aria-labelledby="appearance-title">
        <Heading as="h2" id="appearance-title">Apparence</Heading>
        <label className="wasp-field"><span>Thème</span><select value={preferences.theme} onChange={(event) => update({ theme: event.target.value as Preferences['theme'] })}><option value="light">Clair</option><option value="dark">Sombre</option><option value="system">Système</option></select></label>
        <label className="wasp-field"><span>Densité</span><select value={preferences.density} onChange={(event) => update({ density: event.target.value as Preferences['density'] })}><option value="comfortable">Confortable</option><option value="compact">Compact</option></select></label>
        <label className="wasp-field"><span>Barre latérale repliée</span><input type="checkbox" checked={preferences.sidebarCollapsed} onChange={(event) => update({ sidebarCollapsed: event.target.checked })} /></label>
        <Text size="small">Langue : Français. Prêt pour l’anglais.</Text>
      </section>

      <section className="wasp-vault-card" id="securite" aria-labelledby="security-title">
        <Heading as="h2" id="security-title">Sécurité</Heading>
        <label className="wasp-field"><span>Verrouillage automatique (minutes)</span><TextInput type="number" min={1} max={120} value={preferences.idleMinutes} onChange={(event) => update({ idleMinutes: Number(event.target.value) })} /></label>
        <label className="wasp-field"><span>Délai de révélation (secondes)</span><TextInput type="number" min={5} max={60} value={preferences.revealSeconds} onChange={(event) => update({ revealSeconds: Number(event.target.value) })} /></label>
        <label className="wasp-field"><span>Effacement du presse-papiers (secondes)</span><TextInput type="number" min={10} max={120} value={preferences.clipboardSeconds} onChange={(event) => update({ clipboardSeconds: Number(event.target.value) })} /></label>
        <label className="wasp-field"><span>Remasquer à la perte de focus</span><input type="checkbox" checked={preferences.remaskOnBlur} onChange={(event) => update({ remaskOnBlur: event.target.checked })} /></label>
        <div className="wasp-inline-action"><Button as={Link} href="/security">Phrase, récupération et sessions</Button><Button as={Link} href="/activity">Journal d’activité</Button></div>
      </section>

      <section className="wasp-vault-card" id="donnees" aria-labelledby="data-title">
        <Heading as="h2" id="data-title">Données</Heading>
        <SecurityBackup />
      </section>
    </section>
  )
}
