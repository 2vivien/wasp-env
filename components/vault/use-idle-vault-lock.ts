'use client'

import { useEffect, useRef } from 'react'
import { lockKeyStore } from '@/src/crypto/key-store'

const LOCK_CHANNEL = 'wasp-vault-lock'
const INACTIVITY_LIMIT = 15 * 60 * 1000

export function useIdleVaultLock(onLock: () => void): () => void {
  const onLockRef = useRef(onLock)
  const lockRef = useRef<() => void>(() => undefined)

  useEffect(() => { onLockRef.current = onLock }, [onLock])

  useEffect(() => {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(LOCK_CHANNEL)
    let lastActivity = Date.now()
    let timer = 0

    const lock = (broadcast: boolean) => {
      window.clearTimeout(timer)
      lockKeyStore()
      if (broadcast) channel?.postMessage('lock')
      onLockRef.current()
    }

    const resetTimer = () => {
      lastActivity = Date.now()
      window.clearTimeout(timer)
      timer = window.setTimeout(() => lock(true), INACTIVITY_LIMIT)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastActivity >= INACTIVITY_LIMIT) lock(true)
      else resetTimer()
    }

    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'lock') lock(false)
    })
    window.addEventListener('pointerdown', resetTimer, { passive: true })
    window.addEventListener('keydown', resetTimer)
    window.addEventListener('touchstart', resetTimer, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    resetTimer()
    lockRef.current = () => lock(true)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', resetTimer)
      window.removeEventListener('keydown', resetTimer)
      window.removeEventListener('touchstart', resetTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.close()
      lockRef.current = () => undefined
    }
  }, [])

  return () => lockRef.current()
}
