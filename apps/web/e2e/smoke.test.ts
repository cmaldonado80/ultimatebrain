import { expect, test } from '@playwright/test'

test('homepage loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Solarc/)
})

test('auth redirect works', async ({ page }) => {
  const response = await page.goto('/agents')
  // Should redirect to signin if not authenticated
  expect(page.url()).toContain('/auth/signin')
})
