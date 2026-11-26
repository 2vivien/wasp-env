import { expect, test } from '@playwright/test'

test('la page publique et la santé répondent', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vos secrets')
  const response = await request.get('/api/health')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toEqual({ status: 'ok' })
})

test('une route privée redirige vers la connexion', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login\?callbackURL=%2Fdashboard/)
})
