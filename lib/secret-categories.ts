import type { SecretCategory } from '@/src/crypto/vault-items'

export type SecretFieldDefinition = {
  key: string
  label: string
  type: 'text' | 'password' | 'url' | 'date' | 'textarea'
}

export const SECRET_CATEGORIES: Array<{ value: SecretCategory; label: string }> = [
  { value: 'passwords', label: 'Mots de passe' },
  { value: 'api-keys', label: 'Clés API' },
  { value: 'tokens', label: 'Jetons' },
  { value: 'emails', label: 'E-mails' },
  { value: 'databases', label: 'Bases de données' },
  { value: 'ssh', label: 'SSH' },
  { value: 'certificates', label: 'Certificats' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'env', label: 'ENV' },
  { value: 'custom', label: 'Personnalisé' },
]

export const CATEGORY_FIELDS: Record<SecretCategory, SecretFieldDefinition[]> = {
  passwords: [
    { key: 'service', label: 'Service', type: 'text' },
    { key: 'url', label: 'URL', type: 'url' },
    { key: 'username', label: 'Identifiant', type: 'text' },
    { key: 'totp', label: 'Secret TOTP', type: 'password' },
  ],
  'api-keys': [
    { key: 'provider', label: 'Fournisseur', type: 'text' },
    { key: 'variable', label: 'Nom de variable', type: 'text' },
    { key: 'scope', label: 'Portée', type: 'text' },
    { key: 'expiresAt', label: 'Expiration', type: 'date' },
  ],
  tokens: [
    { key: 'type', label: 'Type (JWT/OAuth/Bearer)', type: 'text' },
    { key: 'issuer', label: 'Émetteur', type: 'text' },
    { key: 'expiresAt', label: 'Expiration', type: 'date' },
  ],
  emails: [
    { key: 'address', label: 'Adresse', type: 'text' },
    { key: 'smtpHost', label: 'Serveur SMTP', type: 'text' },
    { key: 'imapHost', label: 'Serveur IMAP', type: 'text' },
    { key: 'port', label: 'Port', type: 'text' },
  ],
  databases: [
    { key: 'engine', label: 'Moteur', type: 'text' },
    { key: 'host', label: 'Hôte', type: 'text' },
    { key: 'port', label: 'Port', type: 'text' },
    { key: 'database', label: 'Base', type: 'text' },
    { key: 'username', label: 'Utilisateur', type: 'text' },
    { key: 'connectionUrl', label: 'URL de connexion', type: 'password' },
  ],
  ssh: [
    { key: 'host', label: 'Hôte', type: 'text' },
    { key: 'username', label: 'Utilisateur', type: 'text' },
    { key: 'port', label: 'Port', type: 'text' },
    { key: 'privateKey', label: 'Clé privée', type: 'textarea' },
    { key: 'passphrase', label: 'Phrase de passe', type: 'password' },
  ],
  certificates: [
    { key: 'certificate', label: 'Certificat', type: 'textarea' },
    { key: 'chain', label: 'Chaîne', type: 'textarea' },
    { key: 'expiresAt', label: 'Expiration', type: 'date' },
  ],
  infrastructure: [
    { key: 'type', label: 'Type (FTP/DNS/S3/serveur)', type: 'text' },
    { key: 'host', label: 'Hôte', type: 'text' },
    { key: 'region', label: 'Région/bucket', type: 'text' },
  ],
  env: [{ key: 'variable', label: 'Nom de variable', type: 'text' }],
  custom: [],
}
