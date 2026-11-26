'use client'

import { useRef, useState } from 'react'
import { Button, Text, Textarea } from '@primer/react'
import { encryptVaultItemPayload } from '@/src/crypto/vault-items'
import { parseDotenv } from '@/lib/dotenv'

type ParsedFile = { filename: string; source: string; variableCount: number; duplicateNames: string[]; malformedLines: number[] }
const MAX_ENV_FILE_BYTES = 512 * 1024
const MAX_ENV_LINES = 1000

function parse(name: string, source: string): ParsedFile {
  const document = parseDotenv(source)
  return {
    filename: name,
    source,
    variableCount: document.variableNames.length,
    duplicateNames: document.duplicateNames,
    malformedLines: document.malformedLines,
  }
}

export function VaultEnvImportForm({ vaultId, onSaved }: { vaultId: string; onSaved: () => void }) {
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [pasted, setPasted] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])]
    setMessage('')
    const parsed: ParsedFile[] = []
    for (const file of selected) {
      if (!/^\.env(?:\.[A-Za-z0-9._-]+)?$/.test(file.name)) { setMessage(`Nom de fichier refusé : ${file.name}`); continue }
      if (file.size > MAX_ENV_FILE_BYTES) { setMessage(`Fichier trop volumineux : ${file.name}`); continue }
      try {
        const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
        if (source.split(/\r\n|\r|\n/).length > MAX_ENV_LINES) { setMessage(`Trop de lignes : ${file.name}`); continue }
        parsed.push(parse(file.name, source))
      } catch { setMessage(`Lecture impossible : ${file.name}`) }
    }
    if (parsed.length) setFiles((current) => [...current, ...parsed])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSave() {
    const selected = [...files]
    if (pasted.trim()) selected.push(parse('.env.pasted', pasted))
    if (!selected.length || isSaving) return
    setIsSaving(true); setMessage('')
    try {
      for (const file of selected) {
        const itemId = crypto.randomUUID()
        const encryptedPayload = await encryptVaultItemPayload(vaultId, itemId, 1, file.filename, file.source, 'env-file')
        const response = await fetch('/api/vault-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: itemId, vaultId, encryptedPayload }),
        })
        if (!response.ok) throw new Error('Import failed.')
      }
      setFiles([]); setPasted('')
      setMessage(`${selected.length} fichier(s) importé(s) et chiffré(s) dans le navigateur.`)
      onSaved()
    } catch { setMessage('Import impossible. Le contenu n’a pas été envoyé en clair.') }
    finally { setIsSaving(false) }
  }

  const totalVariables = files.reduce((sum, file) => sum + file.variableCount, 0) + (parseDotenv(pasted).variableNames.length)

  return (
    <section className="wasp-env-import" aria-labelledby="env-import-title">
      <div><Text className="wasp-eyebrow">VARIABLES ENV</Text><h3 id="env-import-title">Importer des fichiers .env</h3><Text size="small">Fichiers et texte collé sont chiffrés dans le navigateur avant envoi. Les valeurs ne sont pas affichées dans l’aperçu.</Text></div>
      <label className="wasp-field"><span>Fichiers .env (512 Kio, 1 000 lignes maximum chacun)</span><input ref={inputRef} type="file" multiple accept=".env,.example,.local,.development,.production,.test,.staging,text/plain" onChange={(event) => void handleFiles(event)} /></label>
      <label className="wasp-field"><span>Coller du texte .env</span><Textarea rows={4} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={'DATABASE_URL=…\nAPI_TOKEN=…'} /></label>
      {files.map((file) => <div className="wasp-env-preview" key={file.filename}><strong>{file.filename}</strong><Text size="small">{file.variableCount} variable(s) détectée(s){file.duplicateNames.length ? ` · doublons : ${file.duplicateNames.join(', ')}` : ''}{file.malformedLines.length ? ` · lignes à vérifier : ${file.malformedLines.join(', ')}` : ''}</Text></div>)}
      {totalVariables > 0 && <Text size="small">{totalVariables} variable(s) au total.</Text>}
      <div className="wasp-inline-action"><Button variant="primary" disabled={isSaving || (files.length === 0 && !pasted.trim())} onClick={() => void handleSave()}>{isSaving ? 'Chiffrement…' : 'Importer'}</Button><Button disabled={isSaving || (files.length === 0 && !pasted.trim())} onClick={() => { setFiles([]); setPasted(''); if (inputRef.current) inputRef.current.value = '' }}>Effacer</Button></div>
      {message && <Text role="status">{message}</Text>}
    </section>
  )
}
