'use client'

import { useRef, useState } from 'react'
import { Button, Text } from '@primer/react'
import { encryptVaultItemPayload } from '@/src/crypto/vault-items'
import { parseDotenv } from '@/lib/dotenv'

type ParsedFile = { filename: string; source: string; variableCount: number; duplicateNames: string[]; malformedLines: number[] }
const MAX_ENV_FILE_BYTES = 512 * 1024

export function VaultEnvImportForm({ vaultId, onSaved }: { vaultId: string; onSaved: () => void }) {
  const [file, setFile] = useState<ParsedFile | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    if (!selected) return
    setMessage('')
    if (!/^\.env(?:\.[A-Za-z0-9._-]+)?$/.test(selected.name)) {
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessage('Choisissez un fichier nommé .env ou .env.*.')
      return
    }
    if (selected.size > MAX_ENV_FILE_BYTES) {
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessage('Le fichier dépasse la limite de 512 Kio du coffre chiffré.')
      return
    }

    try {
      const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await selected.arrayBuffer())
      const document = parseDotenv(source)
      setFile({
        filename: selected.name,
        source,
        variableCount: document.variableNames.length,
        duplicateNames: document.duplicateNames,
        malformedLines: document.malformedLines,
      })
    } catch {
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessage('Impossible de lire ce fichier. Choisissez un fichier texte .env.')
    }
  }

  async function handleSave() {
    if (!file || isSaving) return
    setIsSaving(true)
    setMessage('')
    const itemId = crypto.randomUUID()

    try {
      const encryptedPayload = await encryptVaultItemPayload(
        vaultId,
        itemId,
        1,
        file.filename,
        file.source,
        'env-file',
      )
      const response = await fetch('/api/vault-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, vaultId, encryptedPayload }),
      })
      if (!response.ok) throw new Error('Import failed.')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setMessage('Fichier importé et chiffré dans le coffre.')
      onSaved()
    } catch {
      setMessage('Import impossible. Le contenu n’a pas été envoyé en clair.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="wasp-env-import" aria-labelledby="env-import-title">
      <div>
        <Text className="wasp-eyebrow">VARIABLES ENV</Text>
        <h3 id="env-import-title">Importer un fichier .env</h3>
        <Text size="small">Le fichier complet est chiffré dans le navigateur et peut être exporté sans modifier ses octets.</Text>
      </div>
      <label className="wasp-field">
        <span>Fichier .env (max. 512 Kio)</span>
        <input ref={inputRef} type="file" accept=".env,.example,.local,.development,.production,.test,.staging,text/plain" onChange={(event) => void handleFileChange(event)} />
      </label>
      {file && (
        <div className="wasp-env-preview" aria-live="polite">
          <strong>{file.filename}</strong>
          <Text size="small">{file.variableCount} variable(s) détectée(s) · {new TextEncoder().encode(file.source).byteLength} octets</Text>
          {file.duplicateNames.length > 0 && <Text role="status">Clés répétées : {file.duplicateNames.join(', ')}</Text>}
          {file.malformedLines.length > 0 && <Text role="status">Lignes à vérifier : {file.malformedLines.join(', ')}</Text>}
          <div className="wasp-inline-action">
            <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Chiffrement…' : 'Chiffrer et importer'}
            </Button>
            <Button variant="default" onClick={() => {
              setFile(null)
              if (inputRef.current) inputRef.current.value = ''
            }} disabled={isSaving}>
              Effacer la sélection
            </Button>
          </div>
        </div>
      )}
      {message && <Text role="status">{message}</Text>}
    </section>
  )
}
