const { test, expect } = require('@playwright/test');

test.describe('v2.8 Design System', () => {
  test('theme toggle light to dark', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify initial light theme
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const initialBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(initialBg).toBe('rgb(249, 249, 249)'); // --bg-secondary light

    // Click toggle button
    await page.click('#theme-toggle');

    // Verify switch to dark theme
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).toBe('rgb(42, 42, 42)'); // --bg-secondary dark
    const darkText = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(darkText).toBe('rgb(224, 224, 224)'); // --text dark
  });

  test('theme toggle dark to light', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Set to dark theme initially
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Click toggle button
    await page.click('#theme-toggle');

    // Verify switch to light theme
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(lightBg).toBe('rgb(249, 249, 249)'); // --bg-secondary light
    const lightText = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(lightText).toBe('rgb(51, 51, 51)'); // --text light
  });

  test('typography rendering', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify body font-family
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont).toMatch(/Inter|system-ui/);

    // Verify base font-size 16px
    const baseSize = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    expect(baseSize).toBe('16px');

    // Verify h1 font-size ~2.5rem (40px)
    const h1Size = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize);
    expect(h1Size).toBe('40px');
  });

  test('layout responsiveness mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Verify h1 font-size 2rem (32px) on mobile
    const h1Size = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize);
    expect(h1Size).toBe('32px');

    // Verify .container max-width (full width on mobile, but fixed max)
    const containerMaxWidth = await page.evaluate(() => getComputedStyle(document.querySelector('.container')).maxWidth);
    expect(containerMaxWidth).toBe('1200px');

    // Verify sections use flex column (stacks vertically)
    const sectionDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('section')).display);
    expect(sectionDisplay).toBe('flex');
    const sectionFlexDir = await page.evaluate(() => getComputedStyle(document.querySelector('section')).flexDirection);
    expect(sectionFlexDir).toBe('column');

    // Verify ul items stack (flex column)
    const ulDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('ul')).display);
    expect(ulDisplay).toBe('flex');
    const ulFlexDir = await page.evaluate(() => getComputedStyle(document.querySelector('ul')).flexDirection);
    expect(ulFlexDir).toBe('column');
  });

  test('layout responsiveness tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // At 768px, mobile styles apply (max-width: 768px)
    const h1Size = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize);
    expect(h1Size).toBe('32px');

    // Verify .container max-width
    const containerMaxWidth = await page.evaluate(() => getComputedStyle(document.querySelector('.container')).maxWidth);
    expect(containerMaxWidth).toBe('1200px');

    // Verify flex stacking
    const sectionFlexDir = await page.evaluate(() => getComputedStyle(document.querySelector('section')).flexDirection);
    expect(sectionFlexDir).toBe('column');
  });

  test('layout responsiveness desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Desktop styles: h1 2.5rem (40px)
    const h1Size = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontSize);
    expect(h1Size).toBe('40px');

    // Verify .container max-width
    const containerMaxWidth = await page.evaluate(() => getComputedStyle(document.querySelector('.container')).maxWidth);
    expect(containerMaxWidth).toBe('1200px');

    // Verify body grid layout (min-width: 1024px applies)
    const bodyDisplay = await page.evaluate(() => getComputedStyle(document.body).display);
    expect(bodyDisplay).toBe('grid');
  });
});