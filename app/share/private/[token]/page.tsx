import type { Metadata } from 'next'
import { PrivateLinkViewer } from '@/components/vault/private-link-viewer'

export const metadata: Metadata = {
  title: 'Secret partagé — Wasp',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PrivateLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PrivateLinkViewer token={token} />
}
