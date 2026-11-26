'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button, Text } from '@primer/react'
import { authClient } from '@/lib/auth-client'
import { lockKeyStore, broadcastVaultLock } from '@/src/crypto/key-store'
import { CommandPalette } from './command-palette'
import { MOBILE_ITEMS, SIDEBAR_ITEMS } from './nav-items'
import messages from '@/messages/fr.json'

const PUBLIC_PREFIXES = ['/', '/login', '/onboarding', '/share/private']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || (prefix !== '/' && pathname.startsWith(`${prefix}/`)))
}

async function fetchMe(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Profil indisponible')
  return response.json() as Promise<{ profile: { handle: string | null } | null }>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const profile = useSWR('/api/me', fetchMe, { revalidateOnFocus: false })

  const lock = useCallback(() => {
    lockKeyStore()
    broadcastVaultLock()
    router.refresh()
  }, [router])

  const signOut = useCallback(async () => {
    lock()
    const result = await authClient.signOut()
    if (!result.error) { router.replace('/'); router.refresh() }
  }, [lock, router])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        lock()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lock])

  if (isPublicPath(pathname)) return <>{children}</>

  return (
    <div className="wasp-app-shell">
      <aside className="wasp-sidebar" aria-label="Navigation principale">
        <Link className="wasp-sidebar-brand" href="/dashboard">Wasp</Link>
        <button type="button" className="wasp-sidebar-search" onClick={() => setPaletteOpen(true)}>
          <Text>{messages.nav.search}</Text><kbd>⌘K</kbd>
        </button>
        <nav>
          <ul>
            {SIDEBAR_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
                  {messages.nav[item.key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="wasp-sidebar-footer">
          <Text size="small">{profile.data?.profile?.handle ? `@${profile.data.profile.handle}` : 'Profil'}</Text>
          <Button variant="invisible" onClick={lock}>{messages.nav.lock}</Button>
          <Button variant="invisible" onClick={() => void signOut()}>{messages.nav.signOut}</Button>
        </div>
      </aside>
      <div className="wasp-app-main">
        <header className="wasp-topbar">
          <Button variant="invisible" onClick={() => setPaletteOpen(true)}>{messages.nav.search} <kbd>⌘K</kbd></Button>
          <Text size="small">Coffre chiffré</Text>
        </header>
        <main className="wasp-app-content">{children}</main>
      </div>
      <nav className="wasp-mobile-nav" aria-label="Navigation mobile">
        {MOBILE_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{messages.nav[item.key]}</Link>
        ))}
      </nav>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
