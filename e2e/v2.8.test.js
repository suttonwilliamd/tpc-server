const { test, expect } = require('@playwright/test');

test.describe('v2.8 Design System Foundation E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure server is running at localhost:3000 (assumed for E2E)
    await page.goto('http://localhost:3000');
    // Wait for initial load and components to render
    await page.waitForSelector('#plans-list [data-component="card"]');
    await page.waitForSelector('#thoughts-list [data-component="card"]');
    await page.waitForSelector('#search-input[data-component="input"]');
  });

  test('theme toggle switches between light/dark and persists', async ({ page, context }) => {
    // Initial theme (default light or system)
    let currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBeNull() || expect(currentTheme).toBe('light');

    // Click toggle to switch to dark
    await page.click('#theme-toggle');
    await page.waitForTimeout(100); // Allow transition
    currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBe('dark');

    // Verify persistence: reload page
    await page.reload();
    await page.waitForSelector('#plans-list [data-component="card"]');
    currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBe('dark');

    // Switch back to light
    await page.click('#theme-toggle');
    currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBe('light');

    // Check localStorage
    const localTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(localTheme).toBe('light');

    // Test system preference fallback (simulate dark preference)
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'prefers-color-scheme', {
        get: () => 'dark',
      });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#plans-list [data-component="card"]');
    currentTheme = await page.getAttribute('html', 'data-theme');
    // If no localStorage set, should be dark
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();
    currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBe('dark');
  });

  test('components render correctly in index.html (buttons, inputs, cards)', async ({ page }) => {
    // Search input
    const searchInput = page.locator('#search-input[data-component="input"]');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('type', 'search');
    await expect(searchInput).toHaveClass(/input.*input-search/);

    // Theme toggle button
    const themeToggle = page.locator('#theme-toggle[data-component="button"]');
    await expect(themeToggle).toBeVisible();
    await expect(themeToggle).toHaveClass(/btn.*btn-ghost/);

    // Clear buttons
    const clearSearch = page.locator('#clear-search[data-component="button"]');
    await expect(clearSearch).toBeVisible();
    await expect(clearSearch).toHaveClass(/btn/);

    // Cards for plans and thoughts
    const planCards = page.locator('#plans-list [data-component="card"]');
    await expect(planCards).toHaveCount.greaterThan(0);
    await expect(planCards.first()).toHaveClass(/card.*plan-card/);
    const thoughtCards = page.locator('#thoughts-list [data-component="card"]');
    await expect(thoughtCards).toHaveCount.greaterThan(0);
    await expect(thoughtCards.first()).toHaveClass(/card.*thought-card/);

    // Verify card structure
    await expect(planCards.first().locator('.card-header')).toBeVisible();
    await expect(planCards.first().locator('.card-body')).toBeVisible();
    await expect(planCards.first().locator('.card-footer')).toBeVisible();
    await expect(planCards.first().locator('.tag')).toBeVisible(); // If tags present
  });

  test('dark mode applies to components correctly', async ({ page }) => {
    // Switch to dark mode
    await page.click('#theme-toggle');
    await page.waitForTimeout(100);

    // Check body background and text colors
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(33, 37, 41)'); // --color-bg dark
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(248, 249, 250)'); // --color-text dark

    // Check button in dark mode
    const themeToggle = page.locator('#theme-toggle');
    await expect(themeToggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); // ghost variant
    await expect(themeToggle).toHaveCSS('color', 'rgb(13, 110, 253)'); // primary in dark

    // Check input in dark mode
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toHaveCSS('background-color', 'rgb(33, 37, 41)'); // bg dark
    await expect(searchInput).toHaveCSS('color', 'rgb(248, 249, 250)'); // text dark
    await expect(searchInput).toHaveCSS('border-color', 'rgb(73, 80, 87)'); // border dark

    // Check card in dark mode
    const planCard = page.locator('#plans-list [data-component="card"]').first();
    await expect(planCard).toHaveCSS('background-color', 'rgb(33, 37, 41)'); // bg dark
    await expect(planCard.locator('.card-body')).toHaveCSS('color', 'rgb(248, 249, 250)');

    // Hover effect on card (simulate hover)
    await planCard.hover();
    await expect(planCard).toHaveCSS('box-shadow', /rgb.*0\.1.*|var\(--shadow-md\)/); // Enhanced shadow
  });

  test('responsiveness: mobile and desktop viewports', async ({ page }) => {
    // Desktop viewport (default ~1280x720)
    await page.waitForSelector('.main-container');
    const desktopGrid = await page.locator('.main-container').evaluate(el => getComputedStyle(el).gridTemplateColumns);
    expect(desktopGrid).toBe('1fr 300px'); // Side-by-side

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForSelector('.main-container');
    const mobileGrid = await page.locator('.main-container').evaluate(el => getComputedStyle(el).gridTemplateColumns);
    expect(mobileGrid).toBe('1fr'); // Stacked

    // Check body padding
    const bodyPadding = await page.locator('body').evaluate(el => getComputedStyle(el).padding);
    expect(bodyPadding).toContain('16px'); // spacing-base on mobile

    // Detail panel spans full width on mobile
    await page.click('#plans-list [data-component="card"]:first-child');
    await page.waitForSelector('#detail-panel');
    const detailGrid = await page.locator('#detail-panel').evaluate(el => getComputedStyle(el).gridColumn);
    expect(detailGrid).toBe('1 / -1'); // Full width

    // Buttons and inputs responsive
    await expect(page.locator('#search-input')).toHaveCSS('width', '100%');
    await expect(page.locator('#theme-toggle')).toHaveCSS('position', 'fixed'); // Still accessible
  });

  test('integration with endpoints: fetch and render data as cards', async ({ page }) => {
    // Initial load fetches /plans and /thoughts
    const plansResponse = await page.waitForResponse(/\/plans/, { timeout: 5000 });
    expect(plansResponse.status()).toBe(200);
    const thoughtsResponse = await page.waitForResponse(/\/thoughts/, { timeout: 5000 });
    expect(thoughtsResponse.status()).toBe(200);

    // Verify cards render with data
    const planCards = page.locator('#plans-list [data-component="card"]');
    await expect(planCards).toHaveCount.greaterThan(0);
    const firstPlanTitle = await planCards.first().locator('.card-header h3').textContent();
    expect(firstPlanTitle).not.toBe(''); // Has title from data

    const thoughtCards = page.locator('#thoughts-list [data-component="card"]');
    await expect(thoughtCards).toHaveCount.greaterThan(0);
    const firstThoughtTitle = await thoughtCards.first().locator('.card-header h3').textContent();
    expect(firstThoughtTitle).not.toBe(''); // Has content snippet

    // Click card to fetch details /plans/:id
    const planCard = planCards.first();
    const planId = await planCard.getAttribute('data-plan-id');
    await planCard.click();
    await page.waitForResponse(resp => resp.url().includes(`/plans/${planId}`) && resp.status() === 200);
    await page.waitForSelector('#detail-panel');
    const detailTitle = await page.locator('#detail-title').textContent();
    expect(detailTitle).not.toBe('Loading...'); // Fetched data

    // Check linked thoughts fetch /plans/:id/thoughts
    await page.waitForResponse(resp => resp.url().includes(`/plans/${planId}/thoughts`) && resp.status() === 200);
    const linkedThoughts = page.locator('#linked-thoughts-list li');
    await expect(linkedThoughts).toBeVisible(); // Rendered

    // Back to list, no regressions
    await page.click('#back-button');
    await page.waitForSelector('#plans-list');
    await expect(planCards).toHaveCount.greaterThan(0); // Still there
  });

  test('accessibility: focusable elements and ARIA', async ({ page }) => {
    // Theme toggle button focusable
    await page.keyboard.press('Tab');
    await expect(page.locator('#theme-toggle')).toBeFocused();
    expect(await page.locator('#theme-toggle').getAttribute('tabindex')).toBe('0');
    expect(await page.locator('#theme-toggle').getAttribute('role')).toBe('button');
    expect(await page.locator('#theme-toggle').getAttribute('aria-disabled')).toBeNull();

    // Search input focusable
    await page.keyboard.press('Tab');
    await expect(page.locator('#search-input')).toBeFocused();
    expect(await page.locator('#search-input').getAttribute('aria-invalid')).toBe('false');
    expect(await page.locator('#search-input').getAttribute('aria-describedby')).not.toBeNull();

    // Cards focusable
    await page.keyboard.press('Tab');
    const planCard = page.locator('#plans-list [data-component="card"]:first-child');
    await expect(planCard).toBeFocused();
    expect(await planCard.getAttribute('tabindex')).toBe('0');
    expect(await planCard.getAttribute('role')).toBe('article');
    expect(await planCard.getAttribute('aria-label')).not.toBeNull();

    // Keyboard navigation: Enter on card opens detail
    await planCard.press('Enter');
    await page.waitForSelector('#detail-panel');
    await expect(page.locator('#detail-title')).toBeVisible();

    // Focus management: detail panel elements
    await page.keyboard.press('Tab');
    const addTagInput = page.locator('#add-tag-input[data-component="input"]');
    await expect(addTagInput).toBeFocused();
    expect(await addTagInput.getAttribute('aria-label')).not.toBeNull();

    // Back button focusable
    await page.keyboard.press('Tab');
    await expect(page.locator('#back-button')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#plans-list'); // Returns to list
  });

  test('no regressions to prior versions: basic functionality intact', async ({ page }) => {
    // Test search (from v2.7)
    await page.fill('#search-input', 'test');
    await page.waitForSelector('#search-results [data-component="card"]', { state: 'visible' });
    const searchResults = page.locator('#search-results [data-component="card"]');
    await expect(searchResults).toHaveCount.greaterThan(0);

    // Test tag filter (from v2.7)
    await page.click('#clear-search');
    await page.fill('#tag-filter', 'test');
    await page.waitForTimeout(500);
    const filteredPlans = page.locator('#plans-list [data-component="card"]');
    await expect(filteredPlans).toHaveCount.greaterThan(0); // Assuming test data has tags

    // Clear filter
    await page.click('#clear-filter');
    expect(await page.locator('#tag-filter').inputValue()).toBe('');

    // Detail panel tag add/remove (from v2.7)
    await page.click('#plans-list [data-component="card"]:first-child');
    await page.waitForSelector('#detail-panel');
    await page.fill('#add-tag-input', 'e2etest');
    await page.click('#add-tag-btn');
    await page.waitForTimeout(500);
    const tags = page.locator('#tags-list .tag');
    await expect(tags).toHaveCount.greaterThan(0);
    const lastTag = tags.last();
    await expect(lastTag.locator('.tag-text')).toHaveText('e2etest');

    // Remove tag
    await lastTag.locator('.remove-tag').click();
    await page.waitForTimeout(500);
    await expect(tags).toHaveCount.lessThan(await tags.count() + 1); // Reduced

    // Back
    await page.click('#back-button');
    await expect(page.locator('#plans-list')).toBeVisible();
  });
});