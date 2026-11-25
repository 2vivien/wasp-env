'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button, Heading, Text, Textarea } from '@primer/react'
import { decryptBytes, deriveObjectKey, encryptBytes, importRootKey } from '@/src/crypto/aead'
import { withKey } from '@/src/crypto/key-store'
import { parseDotenv } from '@/lib/dotenv'

type EncryptedFile = { id: string; encryptedLayout: { v: 1; alg: 'A256GCM'; nonce: string; ct: string }; version: number }

async function fetchFile(url: string): Promise<EncryptedFile> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('No saved file')
  return response.json() as Promise<EncryptedFile>
}

export function EnvFileEditor({ environmentId, vaultId, name }: { environmentId: string; vaultId: string; name: string }) {
  const { data, mutate } = useSWR<EncryptedFile>(`/api/environments/${environmentId}/env-file`, fetchFile, { revalidateOnFocus: false, shouldRetryOnError: false })
  const [source, setSource] = useState('')
  const [opened, setOpened] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const document = parseDotenv(source)

  async function openFile() {
    setBusy(true); setNotice('')
    try {
      if (!data) { setSource(''); setOpened(true); return }
      const plaintext = await withKey(vaultId, async (rawKey) => {
        const root = await importRootKey(rawKey)
        const key = await deriveObjectKey(root, 'secret', environmentId)
        return decryptBytes(key, data.encryptedLayout, { vaultId, objectType: 'env-file', objectId: environmentId, version: data.version })
      })
      try { setSource(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)); setOpened(true) }
      finally { plaintext.fill(0) }
    } catch { setNotice('Déverrouillez le coffre pour ouvrir ce fichier ENV.') }
    finally { setBusy(false) }
  }

  async function saveFile() {
    setBusy(true); setNotice('')
    const nextVersion = (data?.version ?? 0) + 1
    const bytes = new TextEncoder().encode(source)
    try {
      const encryptedLayout = await withKey(vaultId, async (rawKey) => {
        const root = await importRootKey(rawKey)
        const key = await deriveObjectKey(root, 'secret', environmentId)
        return encryptBytes(key, bytes, { vaultId, objectType: 'env-file', objectId: environmentId, version: nextVersion })
      })
      const response = await fetch(`/api/environments/${environmentId}/env-file`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedLayout, expectedVersion: data?.version ?? 0 }),
      })
      if (response.status === 409) throw new Error('Ce fichier a changé dans une autre session. Rechargez-le avant de réessayer.')
      if (!response.ok) throw new Error('Impossible d’enregistrer le fichier.')
      await mutate(); setNotice('Fichier chiffré et enregistré.'); setOpened(false); setSource('')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Impossible d’enregistrer le fichier.') }
    finally { bytes.fill(0); setBusy(false) }
  }

  return <main className="wasp-dashboard"><header className="wasp-dashboard-header"><a className="wasp-wordmark" href="/projects">Wasp</a><Text>Fichier ENV</Text></header><section className="wasp-dashboard-content"><Text className="wasp-eyebrow">{name}</Text><Heading as="h1">Fichier d’environnement</Heading><Text>Le contenu reste chiffré dans votre navigateur avant d’être enregistré.</Text>
    {!opened ? <Button variant="primary" disabled={busy} onClick={() => void openFile()}>{data ? 'Déverrouiller et ouvrir' : 'Créer un fichier ENV'}</Button> : <><label className="wasp-field"><span>Contenu .env</span><Textarea aria-label="Contenu du fichier .env" rows={16} value={source} onChange={(event) => setSource(event.target.value)} placeholder={'DATABASE_URL=…\nAPI_TOKEN=…'} /></label><Text size="small">{document.variableNames.length} variable(s) reconnue(s){document.duplicateNames.length ? ` · doublons : ${document.duplicateNames.join(', ')}` : ''}{document.malformedLines.length ? ` · lignes à vérifier : ${document.malformedLines.join(', ')}` : ''}</Text><div className="wasp-inline-action"><Button variant="primary" disabled={busy} onClick={() => void saveFile()}>Chiffrer et enregistrer</Button><Button disabled={busy} onClick={() => { setOpened(false); setSource('') }}>Fermer sans enregistrer</Button></div></>}
    {notice && <Text role="status">{notice}</Text>}
  </section></main>
}
