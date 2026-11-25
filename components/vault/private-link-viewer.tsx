'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Button, Heading, Text, TextInput } from '@primer/react'
import { decodeBase64Url } from '@/src/crypto/encoding'

type EncryptedPayload = { v: 1; alg: 'A256GCM'; nonce: string; ct: string }
type LinkResponse = { encryptedPayload?: EncryptedPayload; requiresAccessCode?: boolean }

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}
type SharedSecret = { name: string; value: string; kind: 'secret' | 'env-file' }

async function fetchLink(url: string): Promise<LinkResponse> {
  const response = await fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('Ce lien est expiré, révoqué ou a atteint sa limite d’utilisation.')
  return response.json() as Promise<LinkResponse>
}

export function PrivateLinkViewer({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR(`/api/private-links/${token}`, fetchLink, { revalidateOnFocus: false, shouldRetryOnError: false })
  const [secret, setSecret] = useState<SharedSecret | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [accessCode, setAccessCode] = useState('')

  async function decryptLink(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const encodedKey = fragment.get('k')
    if (!encodedKey || !data) { setNotice('La clé privée est absente du lien. Demandez à l’expéditeur de le renvoyer.'); return }
    if (data.requiresAccessCode && (accessCode.trim().length < 12 || accessCode.trim().length > 128)) {
      setNotice('Saisissez le code d’accès communiqué séparément (12 à 128 caractères).')
      return
    }
    setBusy(true); setNotice('')
    let keyBytes: Uint8Array | undefined
    let nonceBytes: Uint8Array | undefined
    let ciphertextBytes: Uint8Array | undefined
    let plaintextBytes: Uint8Array | undefined
    try {
      const response = await fetch(`/api/private-links/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data.requiresAccessCode ? { accessCode: accessCode.trim() } : {}),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      })
      if (response.status === 401) throw new Error('Code d’accès incorrect.')
      if (response.status === 429) throw new Error('Trop de tentatives. Réessayez dans une minute.')
      if (response.status === 503) throw new Error('La vérification du code est temporairement indisponible. Réessayez plus tard.')
      if (!response.ok) throw new Error('Ce lien est expiré, révoqué ou a atteint sa limite d’utilisation.')
      const result = await response.json() as LinkResponse
      const encryptedPayload = result.encryptedPayload
      if (!encryptedPayload) throw new Error('Le contenu chiffré est indisponible.')
      keyBytes = decodeBase64Url(encodedKey)
      nonceBytes = decodeBase64Url(encryptedPayload.nonce)
      ciphertextBytes = decodeBase64Url(encryptedPayload.ct)
      if (keyBytes.length !== 32 || nonceBytes.length !== 12) throw new Error('Invalid key or nonce.')
      const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-GCM', false, ['decrypt'])
      plaintextBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(nonceBytes), additionalData: toArrayBuffer(new TextEncoder().encode('wasp:private-share:v1')) }, key, toArrayBuffer(ciphertextBytes)))
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintextBytes)) as SharedSecret
      if (typeof parsed.name !== 'string' || typeof parsed.value !== 'string' || !['secret', 'env-file'].includes(parsed.kind)) throw new Error('Invalid secret payload.')
      setSecret(parsed)
      setAccessCode('')
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    } catch (cause) {
      setNotice(cause instanceof Error && ['Code d’accès incorrect.', 'Trop de tentatives. Réessayez dans une minute.', 'La vérification du code est temporairement indisponible. Réessayez plus tard.'].includes(cause.message)
        ? cause.message
        : 'La clé ne correspond pas à ce contenu ou le lien est altéré.')
    } finally {
      keyBytes?.fill(0)
      nonceBytes?.fill(0)
      ciphertextBytes?.fill(0)
      plaintextBytes?.fill(0)
      setBusy(false)
    }
  }

  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><Link className="wasp-wordmark" href="/">Wasp</Link><Text>Secret partagé</Text></header><section className="wasp-dashboard-content">
    <Text className="wasp-eyebrow">LIEN PRIVÉ CHIFFRÉ</Text>
    <Heading as="h1">{secret?.name ?? 'Un secret vous a été partagé'}</Heading>
    <Text>Le contenu reste chiffré sur le serveur. La clé privée est lue depuis le fragment de l’URL puis retirée de la barre d’adresse après ouverture.</Text>
    {isLoading && <Text role="status">Vérification du lien…</Text>}
    {error && <Text role="alert">Ce lien est indisponible. Il peut être expiré, révoqué ou déjà utilisé.</Text>}
    {!secret && data?.requiresAccessCode && <form className="wasp-edit-secret-form" onSubmit={(event) => void decryptLink(event)}>
      <Text>Un code d’accès est requis. Demandez-le à l’expéditeur par un canal séparé du lien.</Text>
      <label className="wasp-field"><span>Code d’accès</span><TextInput type="password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} minLength={12} maxLength={128} autoComplete="off" required /></label>
      <Button type="submit" variant="primary" disabled={busy || accessCode.trim().length < 12}>{busy ? 'Vérification…' : 'Vérifier et ouvrir'}</Button>
    </form>}
    {!secret && data && !data.requiresAccessCode && <Button variant="primary" disabled={busy} onClick={() => void decryptLink()}>{busy ? 'Déchiffrement…' : 'Ouvrir le secret dans ce navigateur'}</Button>}
    {notice && <Text role="alert">{notice}</Text>}
    {secret && <article className="wasp-vault-card"><Heading as="h2">{secret.name}</Heading><pre className="wasp-copy-notice" tabIndex={0}>{secret.value}</pre><Button onClick={async () => { await navigator.clipboard.writeText(secret.value); setNotice('Copié dans le presse-papiers.') }}>Copier</Button></article>}
  </section></main>
}
