export type NavItem = { href: string; key: 'dashboard' | 'vaults' | 'projects' | 'secrets' | 'env' | 'shared' | 'groups' | 'activity' | 'settings' }

export const SIDEBAR_ITEMS: NavItem[] = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/vaults', key: 'vaults' },
  { href: '/projects', key: 'projects' },
  { href: '/secrets', key: 'secrets' },
  { href: '/env', key: 'env' },
  { href: '/shared', key: 'shared' },
  { href: '/groups', key: 'groups' },
  { href: '/activity', key: 'activity' },
  { href: '/settings', key: 'settings' },
]

export const MOBILE_ITEMS: NavItem[] = [
  { href: '/dashboard', key: 'dashboard' },
  { href: '/vaults', key: 'vaults' },
  { href: '/secrets', key: 'secrets' },
  { href: '/shared', key: 'shared' },
  { href: '/settings', key: 'settings' },
]
