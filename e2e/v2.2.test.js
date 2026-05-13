const { test, expect } = require('@playwright/test');

test.describe('v2.2 Plan Detail Pages', () => {
  test('displays plan details on click and returns on back', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for plans to load and event listeners ready
    await page.waitForSelector('#plans-list li[data-plan-id]');
    await page.waitForSelector('#thoughts-list li[data-thought-id]');
    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await expect(page.locator('#thoughts-list li')).toHaveCount(6);
    await page.waitForSelector('#plans-list li[data-plan-id]');
    
    // Get first plan ID
    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');
    
    // Click first plan
    await firstPlanLi.click();
    
    // Wait for detail panel to show
    await page.waitForSelector('#detail-panel', { state: 'visible' });
    await expect(page.locator('#detail-panel')).toBeVisible();
    
    // Verify sections hidden by checking style or visibility
    const plansSection = page.locator('section:has(#plans-list)');
    const thoughtsSection = page.locator('section:has(#thoughts-list)');
    await expect(plansSection).toHaveCSS('display', 'none');
    await expect(thoughtsSection).toHaveCSS('display', 'none');
    
    // Verify plan info loaded
    await expect(page.locator('#detail-title')).toBeVisible();
    await expect(page.locator('#detail-title')).not.toHaveText('Loading...');
    await expect(page.locator('#detail-content')).toBeVisible();
    await expect(page.locator('#detail-status')).toBeVisible();
    
    // Verify changelog list
    const changelogList = page.locator('#changelog-list');
    await expect(changelogList).toBeVisible();
    
    // Verify linked thoughts list visible
    const thoughtsDetailList = page.locator('#linked-thoughts-list');
    await expect(thoughtsDetailList).toBeVisible();
    
    // Click back
    await page.locator('#back-button').click();
    
    // Verify return to list
    await expect(page.locator('#detail-panel')).toBeHidden();
    await expect(plansSection).toHaveCSS('display', 'block');
    await expect(thoughtsSection).toHaveCSS('display', 'block');
    await expect(page.locator('#plans-list li')).toHaveCount(10);
  });

  test('handles empty changelog and linked thoughts', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for list
    await page.waitForSelector('#plans-list li[data-plan-id]');
    await page.waitForSelector('#thoughts-list li[data-thought-id]');
    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await page.waitForSelector('#plans-list li[data-plan-id]');
    
    // Get first plan ID
    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');
    
    // Mock plan with empty changelog
    const mockPlan = {
      id: parseInt(planId),
      title: 'Mock Plan',
      description: 'Mock description',
      status: 'active',
      changelog: []
    };
    
    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 200, body: JSON.stringify(mockPlan) });
    });
    
    await page.route(`**/plans/${planId}/thoughts`, route => {
      route.fulfill({ status: 200, body: JSON.stringify([]) });
    });
    
    // Click first plan
    await firstPlanLi.click();
    
    await page.waitForSelector('#detail-panel', { state: 'visible' });
    
    // Verify empty changelog
    const changelogList = page.locator('#changelog-list li');
    await expect(changelogList).toHaveText('No changelog entries');
    
    // Verify empty thoughts
    const thoughtsDetailList = page.locator('#linked-thoughts-list li');
    await expect(thoughtsDetailList).toHaveText('No linked thoughts');
    
    // Verify plan info
    await expect(page.locator('#detail-title')).toHaveText('Mock Plan');
    await expect(page.locator('#detail-content')).toHaveText('Mock description');
  });

  test('handles error loading plan details', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Wait for list
    await page.waitForSelector('#plans-list li[data-plan-id]');
    await page.waitForSelector('#thoughts-list li[data-thought-id]');
    await expect(page.locator('#plans-list li')).toHaveCount(10);
    await page.waitForSelector('#plans-list li[data-plan-id]');
    
    // Get first plan ID
    const firstPlanLi = page.locator('#plans-list li').first();
    const planId = await firstPlanLi.getAttribute('data-plan-id');
    
    // Mock error for plan fetch
    await page.route(`**/plans/${planId}`, route => {
      route.fulfill({ status: 404 });
    });
    
    // Click first plan
    await firstPlanLi.click();
    
    await page.waitForSelector('#detail-panel', { state: 'visible' });
    
    // Verify error message
    await expect(page.locator('#detail-title')).toHaveText('Error loading plan details');
    await expect(page.locator('#detail-content')).toContainText('Failed to fetch plan: 404');
  });
});