import {
  decryptBytes,
  deriveObjectKey,
  deriveObjectKeyBytes,
  encryptBytes,
  importAesKey,
  importRootKey,
} from './aead'
import { decodeBase64Url, encodeBase64Url, randomBytes, wipeBytes } from './encoding'
import { withKey } from './key-store'
import type { EncryptedVaultItem, KeyEnvelope } from './vault-key'

export type VaultItemKind = 'secret' | 'env-file'
export type SecretCategory =
  | 'passwords'
  | 'api-keys'
  | 'tokens'
  | 'emails'
  | 'databases'
  | 'ssh'
  | 'certificates'
  | 'infrastructure'
  | 'env'
  | 'custom'

export type SecretCustomField = { key: string; value: string; secret: boolean }
export type VaultItemMetadata = {
  name: string
  kind: VaultItemKind
  category: SecretCategory
  description: string
  tags: string[]
  notes: string
  fields: Record<string, string>
  customFields: SecretCustomField[]
  favorite: boolean
  archivedAt: string | null
  expiresAt: string | null
}
export type VaultItemScopeKeys = { metadataKey: Uint8Array; secretKey: Uint8Array }

const CATEGORIES: readonly SecretCategory[] = [
  'passwords',
  'api-keys',
  'tokens',
  'emails',
  'databases',
  'ssh',
  'certificates',
  'infrastructure',
  'env',
  'custom',
]

function normalizeMetadata(
  value: Partial<VaultItemMetadata> & { name?: unknown; kind?: unknown },
): VaultItemMetadata {
  const rawTags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  const rawFields = Array.isArray(value.customFields) ? value.customFields : []
  return {
    name: typeof value.name === 'string' ? value.name : 'Secret sans nom',
    kind: value.kind === 'env-file' ? 'env-file' : 'secret',
    category: CATEGORIES.includes(value.category as SecretCategory)
      ? (value.category as SecretCategory)
      : 'custom',
    description: typeof value.description === 'string' ? value.description : '',
    tags: rawTags.slice(0, 20).map((tag) => tag.slice(0, 32)),
    notes: typeof value.notes === 'string' ? value.notes : '',
    fields:
      value.fields && typeof value.fields === 'object'
        ? Object.fromEntries(
            Object.entries(value.fields).flatMap(([key, entry]) =>
              typeof entry === 'string' ? [[key.slice(0, 64), entry]] : [],
            ),
          )
        : {},
    customFields: rawFields.slice(0, 30).flatMap((field) => {
      if (!field || typeof field !== 'object') return []
      const entry = field as Partial<SecretCustomField>
      if (typeof entry.key !== 'string' || typeof entry.value !== 'string') return []
      return [{ key: entry.key.slice(0, 64), value: entry.value, secret: entry.secret === true }]
    }),
    favorite: value.favorite === true,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : null,
  }
}

async function openScopeKeys(
  rawRootKey: Uint8Array,
  vaultId: string,
  itemId: string,
  item: Pick<EncryptedVaultItem, 'scopeKeyEnvelope' | 'scopeKeyVersion'>,
): Promise<VaultItemScopeKeys> {
  if (!item.scopeKeyEnvelope) {
    return {
      metadataKey: await deriveObjectKeyBytes(
        rawRootKey,
        'metadata',
        itemId,
        item.scopeKeyVersion ?? 1,
      ),
      secretKey: await deriveObjectKeyBytes(
        rawRootKey,
        'secret',
        itemId,
        item.scopeKeyVersion ?? 1,
      ),
    }
  }
  const rootKey = await importRootKey(rawRootKey)
  const wrappingKey = await deriveObjectKey(rootKey, 'metadata', itemId)
  const version = item.scopeKeyVersion ?? 1
  const plaintext = await decryptBytes(wrappingKey, item.scopeKeyEnvelope, {
    vaultId,
    objectType: 'scope-key',
    objectId: itemId,
    version,
  })
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as {
      metadataKey?: unknown
      secretKey?: unknown
    }
    if (typeof parsed.metadataKey !== 'string' || typeof parsed.secretKey !== 'string')
      throw new Error('Invalid scope key envelope.')
    const metadataKey = decodeBase64Url(parsed.metadataKey)
    const secretKey = decodeBase64Url(parsed.secretKey)
    if (metadataKey.length !== 32 || secretKey.length !== 32) {
      wipeBytes(metadataKey)
      wipeBytes(secretKey)
      throw new Error('Invalid scope key envelope.')
    }
    return { metadataKey, secretKey }
  } finally {
    wipeBytes(plaintext)
  }
}

async function sealScopeKeys(
  rawRootKey: Uint8Array,
  vaultId: string,
  itemId: string,
  version: number,
  keys: VaultItemScopeKeys,
): Promise<KeyEnvelope> {
  const rootKey = await importRootKey(rawRootKey)
  const wrappingKey = await deriveObjectKey(rootKey, 'metadata', itemId)
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      metadataKey: encodeBase64Url(keys.metadataKey),
      secretKey: encodeBase64Url(keys.secretKey),
    }),
  )
  try {
    return await encryptBytes(wrappingKey, plaintext, {
      vaultId,
      objectType: 'scope-key',
      objectId: itemId,
      version,
    })
  } finally {
    wipeBytes(plaintext)
  }
}

export async function getVaultItemScopeKeys(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
): Promise<VaultItemScopeKeys> {
  return withKey(vaultId, (rawRootKey) => openScopeKeys(rawRootKey, vaultId, itemId, item))
}

export async function decryptVaultItemMetadata(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
): Promise<VaultItemMetadata> {
  return withKey(vaultId, async (rawRootKey) => {
    const scopeKeys = await openScopeKeys(rawRootKey, vaultId, itemId, item)
    const key = await importAesKey(scopeKeys.metadataKey, ['decrypt'])
    let bytes: Uint8Array | undefined
    try {
      bytes = await decryptBytes(key, item.metadata, {
        vaultId,
        objectType: 'secret-meta',
        objectId: itemId,
        version: item.version,
      })
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<VaultItemMetadata>
      return normalizeMetadata(parsed)
    } finally {
      if (bytes) wipeBytes(bytes)
      wipeBytes(scopeKeys.metadataKey)
      wipeBytes(scopeKeys.secretKey)
    }
  })
}

export async function decryptVaultItemValue(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
  kind: VaultItemKind = 'secret',
): Promise<string> {
  return withKey(vaultId, async (rawRootKey) => {
    const scopeKeys = await openScopeKeys(rawRootKey, vaultId, itemId, item)
    const key = await importAesKey(scopeKeys.secretKey, ['decrypt'])
    let bytes: Uint8Array | undefined
    try {
      bytes = await decryptBytes(key, item.value, {
        vaultId,
        objectType: 'secret',
        objectId: itemId,
        version: item.version,
      })
      const decoded =
        kind === 'env-file'
          ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
          : new TextDecoder().decode(bytes)
      if (kind === 'env-file') return decoded
      const parsed = JSON.parse(decoded) as { value?: unknown }
      return typeof parsed.value === 'string' ? parsed.value : ''
    } finally {
      if (bytes) wipeBytes(bytes)
      wipeBytes(scopeKeys.metadataKey)
      wipeBytes(scopeKeys.secretKey)
    }
  })
}

export async function decryptVaultItemMetadataWithScopeKey(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
  metadataKeyBytes: Uint8Array,
): Promise<VaultItemMetadata> {
  const key = await importAesKey(metadataKeyBytes, ['decrypt'])
  const bytes = await decryptBytes(key, item.metadata, {
    vaultId,
    objectType: 'secret-meta',
    objectId: itemId,
    version: item.version,
  })
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<VaultItemMetadata>
    return normalizeMetadata(parsed)
  } finally {
    bytes.fill(0)
  }
}

export async function decryptVaultItemValueWithScopeKey(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
  secretKeyBytes: Uint8Array,
  kind: VaultItemKind = 'secret',
): Promise<string> {
  const key = await importAesKey(secretKeyBytes, ['decrypt'])
  const bytes = await decryptBytes(key, item.value, {
    vaultId,
    objectType: 'secret',
    objectId: itemId,
    version: item.version,
  })
  try {
    const decoded =
      kind === 'env-file'
        ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
        : new TextDecoder().decode(bytes)
    if (kind === 'env-file') return decoded
    const parsed = JSON.parse(decoded) as { value?: unknown }
    return typeof parsed.value === 'string' ? parsed.value : ''
  } finally {
    bytes.fill(0)
  }
}

export async function rotateVaultItemPayload(
  vaultId: string,
  itemId: string,
  item: EncryptedVaultItem,
  nextScopeKeyVersion: number,
): Promise<EncryptedVaultItem> {
  const currentScopeKeyVersion = item.scopeKeyVersion ?? 1
  if (
    !Number.isSafeInteger(nextScopeKeyVersion) ||
    nextScopeKeyVersion !== currentScopeKeyVersion + 1
  )
    throw new TypeError('Invalid next key version.')
  return withKey(vaultId, async (rawRootKey) => {
    const oldKeys = await openScopeKeys(rawRootKey, vaultId, itemId, item)
    const nextKeys = { metadataKey: randomBytes(32), secretKey: randomBytes(32) }
    try {
      const oldMetadataKey = await importAesKey(oldKeys.metadataKey, ['decrypt'])
      const oldSecretKey = await importAesKey(oldKeys.secretKey, ['decrypt'])
      const nextMetadataKey = await importAesKey(nextKeys.metadataKey)
      const nextSecretKey = await importAesKey(nextKeys.secretKey)
      const history = await Promise.all(
        (item.history ?? []).map(async (revision) => {
          const context = { vaultId, objectId: itemId, version: revision.version }
          const metadataBytes = await decryptBytes(oldMetadataKey, revision.metadata, {
            ...context,
            objectType: 'secret-meta',
          })
          let valueBytes: Uint8Array | undefined
          try {
            valueBytes = await decryptBytes(oldSecretKey, revision.value, {
              ...context,
              objectType: 'secret',
            })
            const [metadata, value] = await Promise.all([
              encryptBytes(nextMetadataKey, metadataBytes, {
                ...context,
                objectType: 'secret-meta',
              }),
              encryptBytes(nextSecretKey, valueBytes, { ...context, objectType: 'secret' }),
            ])
            return { version: revision.version, metadata, value, createdAt: revision.createdAt }
          } finally {
            wipeBytes(metadataBytes)
            if (valueBytes) wipeBytes(valueBytes)
          }
        }),
      )

      const currentContext = { vaultId, objectId: itemId, version: item.version }
      const currentMetadataBytes = await decryptBytes(oldMetadataKey, item.metadata, {
        ...currentContext,
        objectType: 'secret-meta',
      })
      let currentValueBytes: Uint8Array | undefined
      const nextVersion = item.version + 1
      try {
        currentValueBytes = await decryptBytes(oldSecretKey, item.value, {
          ...currentContext,
          objectType: 'secret',
        })
        const [metadata, value, oldCurrentMetadata, oldCurrentValue] = await Promise.all([
          encryptBytes(nextMetadataKey, currentMetadataBytes, {
            vaultId,
            objectType: 'secret-meta',
            objectId: itemId,
            version: nextVersion,
          }),
          encryptBytes(nextSecretKey, currentValueBytes, {
            vaultId,
            objectType: 'secret',
            objectId: itemId,
            version: nextVersion,
          }),
          encryptBytes(nextMetadataKey, currentMetadataBytes, {
            ...currentContext,
            objectType: 'secret-meta',
          }),
          encryptBytes(nextSecretKey, currentValueBytes, {
            ...currentContext,
            objectType: 'secret',
          }),
        ])
        history.push({
          version: item.version,
          metadata: oldCurrentMetadata,
          value: oldCurrentValue,
          createdAt: new Date().toISOString(),
        })
        const scopeKeyEnvelope = await sealScopeKeys(
          rawRootKey,
          vaultId,
          itemId,
          nextScopeKeyVersion,
          nextKeys,
        )
        return {
          version: nextVersion,
          scopeKeyVersion: nextScopeKeyVersion,
          scopeKeyEnvelope,
          metadata,
          value,
          history: history.slice(-49),
        }
      } finally {
        wipeBytes(currentMetadataBytes)
        if (currentValueBytes) wipeBytes(currentValueBytes)
      }
    } finally {
      wipeBytes(oldKeys.metadataKey)
      wipeBytes(oldKeys.secretKey)
      wipeBytes(nextKeys.metadataKey)
      wipeBytes(nextKeys.secretKey)
    }
  })
}

export async function encryptVaultItemPayload(
  vaultId: string,
  itemId: string,
  version: number,
  name: string,
  value: string,
  kind: VaultItemKind = 'secret',
  scopeKeyVersion = 1,
  scopeKeyEnvelope?: KeyEnvelope,
  legacyMode = false,
  details: Partial<VaultItemMetadata> = {},
): Promise<EncryptedVaultItem> {
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify(normalizeMetadata({ ...details, name: name.trim(), kind })),
  )
  const valueBytes = new TextEncoder().encode(
    kind === 'env-file' ? value : JSON.stringify({ value }),
  )
  try {
    return await withKey(vaultId, async (rawRootKey) => {
      const scopeKeys = scopeKeyEnvelope
        ? await openScopeKeys(rawRootKey, vaultId, itemId, { scopeKeyEnvelope, scopeKeyVersion })
        : legacyMode
          ? await openScopeKeys(rawRootKey, vaultId, itemId, { scopeKeyVersion })
          : { metadataKey: randomBytes(32), secretKey: randomBytes(32) }
      try {
        const metadataKey = await importAesKey(scopeKeys.metadataKey)
        const secretKey = await importAesKey(scopeKeys.secretKey)
        const [metadata, encryptedValue] = await Promise.all([
          encryptBytes(metadataKey, metadataBytes, {
            vaultId,
            objectType: 'secret-meta',
            objectId: itemId,
            version,
          }),
          encryptBytes(secretKey, valueBytes, {
            vaultId,
            objectType: 'secret',
            objectId: itemId,
            version,
          }),
        ])
        const wrappedScopeKey =
          scopeKeyEnvelope ??
          (legacyMode
            ? undefined
            : await sealScopeKeys(rawRootKey, vaultId, itemId, scopeKeyVersion, scopeKeys))
        return {
          version,
          scopeKeyVersion,
          ...(wrappedScopeKey ? { scopeKeyEnvelope: wrappedScopeKey } : {}),
          metadata,
          value: encryptedValue,
        }
      } finally {
        wipeBytes(scopeKeys.metadataKey)
        wipeBytes(scopeKeys.secretKey)
      }
    })
  } finally {
    metadataBytes.fill(0)
    valueBytes.fill(0)
  }
}
