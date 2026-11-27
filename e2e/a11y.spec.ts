import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of [
  '/',
  '/login',
  '/unlock',
  '/page-introuvable-test',
  '/l/00000000-0000-4000-8000-000000000000',
]) {
  test(`accessibilité WCAG A/AA de ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main, h1').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} (${violation.nodes.length})`)
    expect(blocking).toEqual([])
  })
}
