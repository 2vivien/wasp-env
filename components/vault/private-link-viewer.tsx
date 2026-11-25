'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Button, Heading, Text } from '@primer/react'
import { decodeBase64Url } from '@/src/crypto/encoding'

type EncryptedPayload = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
type SharedSecret = { name: string; value: string; kind: 'secret' | 'env-file' }

async function fetchEncrypted(url: string): Promise<{ encryptedPayload: EncryptedPayload }> {
  const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('Ce lien est expiré, révoqué ou a atteint sa limite d’utilisation.')
  return response.json() as Promise<{ encryptedPayload: EncryptedPayload }>
}

export function PrivateLinkViewer({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR(`/api/private-links/${token}`, fetchEncrypted, { revalidateOnFocus: false, shouldRetryOnError: false })
  const [secret, setSecret] = useState<SharedSecret | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function decryptLink() {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const encodedKey = fragment.get('k')
    if (!encodedKey || !data?.encryptedPayload) { setNotice('La clé privée est absente du lien. Demandez à l’expéditeur de le renvoyer.'); return }
    setBusy(true); setNotice('')
    try {
      const keyBytes = decodeBase64Url(encodedKey)
      if (keyBytes.length !== 32) throw new Error('Invalid key.')
      const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
      const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(decodeBase64Url(data.encryptedPayload.nonce)), additionalData: toArrayBuffer(new TextEncoder().encode('wasp:private-share:v1')) }, key, toArrayBuffer(decodeBase64Url(data.encryptedPayload.ct))))
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as SharedSecret
      bytes.fill(0); keyBytes.fill(0)
      if (typeof parsed.name !== 'string' || typeof parsed.value !== 'string' || !['secret', 'env-file'].includes(parsed.kind)) throw new Error('Invalid secret payload.')
      setSecret(parsed)
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    } catch { setNotice('La clé ne correspond pas à ce contenu ou le lien est altéré.') }
    finally { setBusy(false) }
  }

  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><Link className="wasp-wordmark" href="/">Wasp</Link><Text>Secret partagé</Text></header><section className="wasp-dashboard-content">
    <Text className="wasp-eyebrow">LIEN PRIVÉ CHIFFRÉ</Text>
    <Heading as="h1">{secret?.name ?? 'Un secret vous a été partagé'}</Heading>
    <Text>Le contenu reste chiffré sur le serveur. La clé est lue depuis le fragment privé de cette URL, puis retirée de la barre d’adresse.</Text>
    {isLoading && <Text role="status">Vérification du lien…</Text>}
    {error && <Text role="alert">Ce lien est indisponible. Il peut être expiré, révoqué ou déjà utilisé.</Text>}
    {!secret && data && <Button variant="primary" disabled={busy} onClick={() => void decryptLink()}>{busy ? 'Déchiffrement…' : 'Ouvrir le secret dans ce navigateur'}</Button>}
    {notice && <Text role="alert">{notice}</Text>}
    {secret && <article className="wasp-vault-card"><Heading as="h2">{secret.name}</Heading><pre className="wasp-copy-notice" tabIndex={0}>{secret.value}</pre><Button onClick={async () => { await navigator.clipboard.writeText(secret.value); setNotice('Copié dans le presse-papiers.') }}>Copier</Button></article>}
  </section></main>
}
