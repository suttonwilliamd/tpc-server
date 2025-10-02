const { test, expect } = require('@playwright/test');

test.describe('v2.6 Markdown Rendering', () => {
  test('renders Markdown description as HTML', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Wait for plans to load
    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await page.waitForSelector('#plans-list li[data-plan-id]');

    // Get first plan ID
    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');

    // Mock plan with Markdown description
    const markdownPlan = {
      id: parseInt(planId),
      title: 'Markdown Test Plan',
      description: '**bold** and *italic* text with [link](https://example.com)',
      status: 'active',
      changelog: []
    };

    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 200, body: JSON.stringify(markdownPlan) });
    });

    await page.route(`**/plans/${planId}/thoughts`, route => {
      route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    // Click first plan
    await firstPlanLi.click();

    // Wait for detail panel
    await page.waitForSelector('#detail-panel', { state: 'visible' });
    await expect(page.locator('#detail-panel')).toBeVisible();

    // Verify title and status plain text
    await expect(page.locator('#plan-title')).toHaveText('Markdown Test Plan');
    await expect(page.locator('#plan-status')).toHaveText('active');

    // Verify Markdown rendered in description
    const descLocator = page.locator('#plan-description');
    await expect(descLocator).toBeVisible();
    const html = await descLocator.innerHTML();
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<a href="https://example.com">link</a>');

    // Verify other elements plain (changelog, thoughts)
    const changelogList = page.locator('#changelog-list li');
    await expect(changelogList).toHaveCount(1);
    await expect(changelogList).toContainText('No changelog entries');
    const thoughtsDetailList = page.locator('#thoughts-list-detail li');
    await expect(thoughtsDetailList).toHaveCount(1);
    await expect(thoughtsDetailList).toContainText('No linked thoughts');
  });

  test('renders plain text description unchanged', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await page.waitForSelector('#plans-list li[data-plan-id]');

    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');

    const plainPlan = {
      id: parseInt(planId),
      title: 'Plain Text Plan',
      description: 'This is plain text without any Markdown.',
      status: 'active',
      changelog: []
    };

    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 200, body: JSON.stringify(plainPlan) });
    });

    await page.route(`**/plans/${planId}/thoughts`, route => {
      route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    await firstPlanLi.click();

    await page.waitForSelector('#detail-panel', { state: 'visible' });

    const descLocator = page.locator('#plan-description');
    await expect(descLocator).toBeVisible();
    // marked wraps plain in <p>, but visible text unchanged
    await expect(descLocator).toHaveText('This is plain text without any Markdown.');
    const html = await descLocator.innerHTML();
    expect(html).toContain('<p>This is plain text without any Markdown.</p>');

    // Verify changelog and thoughts empty messages
    const changelogList = page.locator('#changelog-list li');
    await expect(changelogList).toHaveCount(1);
    await expect(changelogList).toContainText('No changelog entries');
    const thoughtsDetailList = page.locator('#thoughts-list-detail li');
    await expect(thoughtsDetailList).toHaveCount(1);
    await expect(thoughtsDetailList).toContainText('No linked thoughts');
  });

  test('handles empty or non-Markdown description gracefully', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await page.waitForSelector('#plans-list li[data-plan-id]');

    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');

    // Mock thoughts for both tests
    await page.route(`**/plans/${planId}/thoughts`, route => {
      route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    // Test empty
    const emptyPlan = {
      id: parseInt(planId),
      title: 'Empty Description Plan',
      description: '',
      status: 'active',
      changelog: []
    };

    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 200, body: JSON.stringify(emptyPlan) });
    });

    await firstPlanLi.click();

    await page.waitForSelector('#detail-panel', { state: 'visible' });

    const descLocator = page.locator('#plan-description');
    await expect(descLocator).toBeVisible();
    await expect(descLocator).toHaveText('No description');

    // Verify changelog and thoughts empty
    const changelogList = page.locator('#changelog-list li');
    await expect(changelogList).toHaveCount(1);
    await expect(changelogList).toContainText('No changelog entries');
    const thoughtsDetailList = page.locator('#thoughts-list-detail li');
    await expect(thoughtsDetailList).toHaveCount(1);
    await expect(thoughtsDetailList).toContainText('No linked thoughts');

    // Test non-Markdown (e.g., invalid like <script> but marked sanitizes, shows as text)
    const invalidPlan = {
      id: parseInt(planId),
      title: 'Invalid Description Plan',
      description: '<script>alert(1)</script> plain text',
      status: 'active',
      changelog: []
    };

    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 200, body: JSON.stringify(invalidPlan) });
    });

    // Re-click to trigger new mock
    await page.locator('#back-button').click();
    await expect(page.locator('#plans-list')).toBeVisible();
    await firstPlanLi.click();
    await page.waitForSelector('#detail-panel', { state: 'visible' });

    const invalidDesc = page.locator('#plan-description');
    await expect(invalidDesc).toBeVisible();
    const invalidHtml = await invalidDesc.innerHTML();
    // marked escapes script, wraps in p
    expect(invalidHtml).toContain('<script>alert(1)</script> plain text');
    await expect(invalidDesc).toContainText('plain text');

    // Reuse existing locators after re-click
    await expect(changelogList).toHaveCount(1);
    await expect(changelogList).toContainText('No changelog entries');
    await expect(thoughtsDetailList).toHaveCount(1);
    await expect(thoughtsDetailList).toContainText('No linked thoughts');
  });

  test('regression: prior E2E flows still work', async ({ page }) => {
    // Load list
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle('TPC Server');
    await expect(page.locator('h1')).toContainText('TPC Server');
    await expect(page.locator('#plans-list')).toBeVisible();
    await expect(page.locator('#thoughts-list')).toBeVisible();
    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await expect(page.locator('#thoughts-list li')).toHaveCount(1);

    // No loading errors
    await expect(page.locator('#plans-list li:has-text("Failed to load")')).toHaveCount(0);
    await expect(page.locator('#thoughts-list li:has-text("Failed to load")')).toHaveCount(0);

    // Navigation to detail and back (no mock, use real data)
    await page.waitForSelector('#plans-list li[data-plan-id]');
    const firstPlanLi = page.locator('#plans-list li').first();
    await firstPlanLi.click();

    await page.waitForSelector('#detail-panel', { state: 'visible' });
    await expect(page.locator('#detail-panel')).toBeVisible();
    await expect(page.locator('#plan-title')).toBeVisible();
    await expect(page.locator('#plan-description')).toBeVisible();
    await expect(page.locator('#plan-status')).toBeVisible();
    await expect(page.locator('#changelog-list')).toBeVisible();
    await expect(page.locator('#thoughts-list-detail')).toBeVisible();

    // Back navigation
    await page.locator('#back-button').click();
    await expect(page.locator('#detail-panel')).toBeHidden();
    await expect(page.locator('#plans-list')).toBeVisible();
    await expect(page.locator('#thoughts-list')).toBeVisible();
    await expect(page.locator('#plans-list li')).toHaveCount(10);
  });
});