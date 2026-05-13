const { test, expect } = require('@playwright/test');

test.describe('v2.1 Dynamic API UI', () => {
  test('loads index.html with dynamic fetch data', async ({ page }) => {
    // Intercept network requests to verify API calls
    const plansCalled = { called: false };
    const thoughtsCalled = { called: false };
    const tpcDbCalled = { called: false };

    await page.route('**/plans', route => {
      plansCalled.called = true;
      route.continue();
    });
    await page.route('**/thoughts', route => {
      thoughtsCalled.called = true;
      route.continue();
    });
    await page.route('**/tpc.db', route => {
      tpcDbCalled.called = true;
      route.abort();
    });

    await page.goto('/');
    await expect(page).toHaveTitle('TPC Server');
    await expect(page.locator('h1')).toContainText('TPC Server');

    // Wait for loading to finish (no "Loading..." text)
    await expect(page.locator('#plans-list li:has-text("Loading...")')).toHaveCount(0);
    await expect(page.locator('#thoughts-list li:has-text("Loading...")')).toHaveCount(0);
    // Additional wait for data attributes to ensure full render
    await page.waitForSelector('#plans-list li[data-plan-id]');
    await page.waitForSelector('#thoughts-list li[data-thought-id]');

    // Verify data loaded (assuming data exists)
    await expect(page.locator('#plans-list li')).toHaveCount(10); // From migration
    await expect(page.locator('#thoughts-list li')).toHaveCount(6);

    // Verify no error
    await expect(page.locator('#plans-list li:has-text("Failed to load")')).toHaveCount(0);
    await expect(page.locator('#thoughts-list li:has-text("Failed to load")')).toHaveCount(0);

    // Verify API calls happened, no tpc.db
    expect(plansCalled.called).toBe(true);
    expect(thoughtsCalled.called).toBe(true);
    expect(tpcDbCalled.called).toBe(false);
  });

  test('handles empty plans list', async ({ page }) => {
    // For empty state, would need clean DB, but since persistent, skip or mock
    // Mock empty responses for demonstration
    await page.route('**/plans', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));
    await page.route('**/thoughts', route => route.fulfill({ status: 200, body: JSON.stringify([]) }));

    await page.goto('/');
    await expect(page.locator('#plans-list li')).toContainText('No plans yet');
    await expect(page.locator('#thoughts-list li')).toContainText('No thoughts yet');
  });
});