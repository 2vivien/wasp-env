'use client'

import { wipeBytes } from './encoding'

const KEY_ID_PATTERN = /^[A-Za-z0-9:_-]{1,160}$/
const keys = new Map<string, Uint8Array>()

export function storeKey(keyId: string, key: Uint8Array): void {
  if (!KEY_ID_PATTERN.test(keyId) || key.byteLength !== 32) {
    throw new TypeError('Invalid in-memory key entry.')
  }

  const previous = keys.get(keyId)
  if (previous) wipeBytes(previous)
  keys.set(keyId, new Uint8Array(key))
}

export async function withKey<T>(keyId: string, operation: (key: Uint8Array) => T | Promise<T>): Promise<T> {
  const storedKey = keys.get(keyId)
  if (!storedKey) throw new Error('The vault is locked.')

  const temporaryKey = new Uint8Array(storedKey)
  try {
    return await operation(temporaryKey)
  } finally {
    wipeBytes(temporaryKey)
  }
}

export function removeKey(keyId: string): void {
  const key = keys.get(keyId)
  if (key) wipeBytes(key)
  keys.delete(keyId)
}

export function lockKeyStore(): void {
  for (const key of keys.values()) wipeBytes(key)
  keys.clear()
}

export function broadcastVaultLock(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel('wasp-vault-lock')
  channel.postMessage('lock')
  channel.close()
}
