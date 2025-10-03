import { test, expect } from '@playwright/test';

test.describe('v2.9 Component Interactions', () => {
  test('button click toggles loading', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('button:has-text("Add Plan")'); // Modal opens with loading
    await expect(page.locator('.loading--overlay')).toBeVisible(); // Simulate delay, then form
    await page.waitForTimeout(1000);
    await page.fill('[data-testid="title-input"]', 'Test Plan');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.loading-spinner')).toBeVisible({ timeout: 2000 }); // Expect success alert or list refresh
    await page.waitForSelector('.card:has-text("Test Plan")');
  });

  test('input validation shows error', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('button:has-text("Add Plan")');
    await page.fill('[data-testid="title-input"]', '');
    await page.click('button:has-text("Save")');
    await expect(page.locator('.input:invalid')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Title is required');
  });

  test('card hover lifts', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const card = page.locator('.card').first();
    await card.hover();
    await expect(card).toHaveCSS('transform', 'translateY(-2px)');
    await expect(card).toHaveCSS('box-shadow', 'var(--shadow-md)');
  });

  test('responsive rendering', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await expect(page.locator('.card')).toHaveCSS('margin', 'var(--space-s)'); // Mobile stacking
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('.input')).toHaveCSS('font-size', '0.9375rem'); // Tablet
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(page.locator('.card')).toHaveCSS('display', 'flex'); // Desktop
  });

  test('theme compatibility', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Toggle to dark
    await page.click('.theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.button--primary')).toHaveCSS('background-color', 'var(--primary-dark)');
    await expect(page.locator('.card')).toHaveCSS('background-color', 'var(--bg-dark)');
    // Toggle back
    await page.click('.theme-toggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});