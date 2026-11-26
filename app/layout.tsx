import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from '@/components/providers'
import { AppShell } from '@/components/layout/app-shell'

export const metadata: Metadata = {
  title: 'Wasp — Vos secrets, un seul endroit sûr',
  description:
    'Un coffre numérique privé pour organiser vos secrets et les partager sans e-mail.',
  applicationName: 'Wasp',
  openGraph: {
    title: 'Wasp — Vos secrets, un seul endroit sûr',
    description:
      'Un coffre numérique privé pour organiser vos secrets et les partager sans e-mail.',
    type: 'website',
    locale: 'fr_FR',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await headers()

  return (
    <html
      lang="fr"
      data-color-mode="dark"
      data-light-theme="light"
      data-dark-theme="dark"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <Providers><AppShell>{children}</AppShell></Providers>
      </body>
    </html>
  )
}
