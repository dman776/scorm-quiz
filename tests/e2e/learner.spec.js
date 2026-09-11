// @ts-check
/** Playwright E2E (requires @playwright/test + browsers; network install needed).
 *  Start the dev server first: npm run dev (serves preview.html on :5173). */
import { test, expect } from '@playwright/test';
const BASE = 'http://localhost:5173';
test.describe('Learner attempt (standalone preview)', () => {
  test('renders first question and is keyboard operable', async ({ page }) => {
    await page.goto(`${BASE}/preview.html`);
    await expect(page.locator('.sqb-prompt')).toBeVisible();
    await page.keyboard.press('Tab'); await page.keyboard.press('Space');
    await expect(page.locator('input:checked')).toHaveCount(1);
  });
  test('completes an attempt and shows a result', async ({ page }) => {
    await page.goto(`${BASE}/preview.html`);
    for (let i = 0; i < 20; i++) {
      const radios = page.locator('input[type=radio], input[type=checkbox]');
      if (await radios.count()) await radios.first().check().catch(() => {});
      if (await page.locator('button:has-text("Review & submit")').count()) { await page.locator('button:has-text("Review & submit")').click(); break; }
      await page.locator('button:has-text("Next")').first().click();
    }
    await page.locator('button:has-text("Submit assessment")').click();
    await expect(page.locator('.sqb-results h2')).toBeVisible();
  });
  test('standalone banner shows with no LMS', async ({ page }) => {
    await page.goto(`${BASE}/preview.html`);
    await expect(page.locator('.sqb-banner')).toContainText('Standalone preview');
  });
});
