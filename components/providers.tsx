'use client'

import { useSyncExternalStore } from 'react'
import { ThemeProvider, BaseStyles } from '@primer/react'
import { preferencesStore } from '@/lib/preferences'
import { StyledComponentsRegistry } from './styled-components-registry'

export function Providers({ children }: { children: React.ReactNode }) {
  const preferences = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getSnapshot, preferencesStore.getServerSnapshot)
  const colorMode = preferences.theme === 'light' ? 'day' : 'night'

  return (
    <StyledComponentsRegistry>
      <ThemeProvider colorMode={colorMode} dayScheme="light" nightScheme="dark" preventSSRMismatch>
        <BaseStyles>{children}</BaseStyles>
      </ThemeProvider>
    </StyledComponentsRegistry>
  )
}
