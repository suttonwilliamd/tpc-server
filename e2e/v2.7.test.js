const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { once } = require('node:events');
const { createIsolatedRuntime } = require('../scripts/isolated-runtime');

test.describe('Unified search UI', () => {
  test.describe.configure({ mode: 'serial' });
  let runtime;
  let database;
  let db;
  let server;
  let base;
  const special = 'quote"slash\\%_comma,';
  test.beforeAll(async () => {
    runtime = await createIsolatedRuntime();
    database = require(path.join(runtime.root, 'db/database.js'));
    await database.initGlobalDB(true);
    db = database.getDB();
    server = require(path.join(runtime.root, 'server.js')).app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  });
  test.afterAll(async () => {
    try {
      if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    } finally {
      try { if (db) await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); }
      finally { if (runtime) await runtime.close(); }
    }
  });
  test.beforeEach(async ({ page }) => {
    await database.runSql(db, 'DELETE FROM thoughts');
    await database.runSql(db, 'DELETE FROM plans');
    await database.runSql(db, 'INSERT INTO plans (title, description, timestamp, tags, status) VALUES (?, ?, ?, ?, ?)', ['needle plan', 'description-only haystack 100%', '2020-01-01T00:00:00Z', JSON.stringify(['needle', 'first', 'second', special]), 'in_progress']);
    for (const [content, tags] of [['needle thought', ['first']], ['tag-only match', ['needle', 'first', 'second']], ['1000 wildcard decoy', ['unrelated']]]) {
      await database.runSql(db, 'INSERT INTO thoughts (content, timestamp, tags) VALUES (?, ?, ?)', [content, '2026-01-01T00:00:00Z', JSON.stringify(tags)]);
    }
    await page.goto(base);
    await expect(page.locator('#cards-container .card')).toHaveCount(3);
  });

  test('shows global API relevance order and complete plan details', async ({ page }) => {
    await page.locator('#search-input').fill('needle');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('.card-title')).toHaveText(['needle plan', 'needle thought', 'tag-only match']);
    await page.locator('.card').first().click();
    await expect(page.locator('#modal-title')).toHaveText('needle plan');
    await expect(page.locator('#modal-content')).toHaveText('description-only haystack 100%');
    await expect(page.locator('#modal-status')).toHaveText('in progress');
    await page.locator('#modal-close').click();
    await expect(page.locator('#modal-overlay')).toBeHidden();
  });

  test('uses canonical type filters and searches descriptions and decoded tags', async ({ page }) => {
    await page.locator('#search-input').fill('haystack');
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
    await page.locator('#type-filter').selectOption('thoughts');
    await expect(page.locator('.empty-state-text')).toHaveText('No search results found');
    await page.locator('#search-input').fill('needle');
    await expect(page.locator('.card-title')).toHaveText(['needle thought', 'tag-only match']);
    await page.locator('#type-filter').selectOption('plans');
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
  });

  test('requires all selected exact tags, including encoded JSON special characters', async ({ page }) => {
    await page.locator('#search-input').fill('needle');
    await expect(page.locator('.card')).toHaveCount(3);
    await page.getByRole('button', { name: 'first', exact: true }).click();
    await page.getByRole('button', { name: 'second', exact: true }).click();
    await expect(page.locator('.card-title')).toHaveText(['needle plan', 'tag-only match']);
    const request = page.waitForRequest(r => r.url().includes('/search?') && new URL(r.url()).searchParams.getAll('tags').includes(special));
    await page.getByRole('button', { name: special, exact: true }).click();
    expect(new URL((await request).url()).searchParams.getAll('tags')).toEqual(['first', 'second', special]);
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
  });

  test('treats percent text literally and clearing search restores all-tag list filtering', async ({ page }) => {
    await page.locator('#search-input').fill('100%');
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
    await page.locator('#search-input').fill('');
    await expect(page.locator('.card')).toHaveCount(3);
    await page.getByRole('button', { name: 'first', exact: true }).click();
    await page.getByRole('button', { name: 'second', exact: true }).click();
    await expect(page.locator('.card-title')).toHaveText(['tag-only match']);
    await page.locator('.tab[data-tab="plans"]').click();
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
  });

  test('surfaces API validation errors instead of rendering them as results', async ({ page }) => {
    await page.locator('#search-input').fill('x'.repeat(2001));
    await expect(page.locator('#cards-container')).toHaveText('Search failed: q exceeds max length (2000)');
    await page.locator('#search-input').fill('haystack');
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
  });

  test('ignores an older response arriving after a newer query', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/search?**', async route => {
      if (new URL(route.request().url()).searchParams.get('q') === 'needle') await gate;
      await route.continue();
    });
    const oldRequest = page.waitForRequest(r => r.url().includes('/search?') && new URL(r.url()).searchParams.get('q') === 'needle');
    await page.locator('#search-input').fill('needle');
    await oldRequest;
    await page.locator('#search-input').fill('haystack');
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
    const oldResponse = page.waitForResponse(r => r.url().includes('/search?') && new URL(r.url()).searchParams.get('q') === 'needle');
    release();
    await oldResponse;
    await expect(page.locator('.card-title')).toHaveText(['needle plan']);
  });

  async function delayPlanDetail(page) {
    await page.locator('#search-input').fill('needle');
    await expect(page.locator('.card-title')).toHaveText(['needle plan', 'needle thought', 'tag-only match']);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/plans/*', async route => {
      await gate;
      await route.continue();
    });
    const requested = page.waitForRequest(r => /\/plans\/\d+$/.test(new URL(r.url()).pathname));
    await page.locator('.card').filter({ has: page.getByRole('heading', { name: 'needle plan', exact: true }) }).click();
    const request = await requested;
    return {
      id: Number(new URL(request.url()).pathname.split('/').pop()),
      async release() {
        const response = page.waitForResponse(r => r.url() === request.url());
        release();
        await (await response).finished();
        // Observe a paint after the genuine delayed HTTP response, not the
        // unchanged pre-response DOM. This also drains its fetch/JSON microtasks.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      },
    };
  }

  async function selectThought(page) {
    await page.locator('.card').filter({ has: page.getByRole('heading', { name: 'needle thought', exact: true }) }).click();
    await expect(page.locator('#modal-title')).toHaveText('needle thought');
    await expect(page.locator('#modal-overlay')).toBeVisible();
  }

  test('keeps the latest selection when an older detail response arrives', async ({ page }) => {
    const delayed = await delayPlanDetail(page);
    try {
      await selectThought(page);
    } finally {
      await delayed.release();
    }
    await expect(page.locator('#modal-title')).toHaveText('needle thought');
    await expect(page.locator('#modal-overlay')).toBeVisible();
  });

  test('does not reopen a dismissed modal when an older detail response arrives', async ({ page }) => {
    const delayed = await delayPlanDetail(page);
    try {
      await selectThought(page);
      await page.locator('#modal-close').click();
      await expect(page.locator('#modal-overlay')).toBeHidden();
    } finally {
      await delayed.release();
    }
    await expect(page.locator('#modal-overlay')).toBeHidden();
  });

  for (const query of ['haystack', '']) {
    test(`invalidates pending details immediately when search is ${query ? 'changed' : 'cleared'}`, async ({ page }) => {
      const delayed = await delayPlanDetail(page);
      try {
        // Release during the input debounce window: invalidation must happen on
        // the input event itself, not only when render() eventually starts.
        await page.locator('#search-input').fill(query);
      } finally {
        await delayed.release();
      }
      await expect(page.locator('#modal-overlay')).toBeHidden();
      if (query) {
        await expect(page.locator('.card-title')).toHaveText(['needle plan']);
      } else {
        await expect(page.getByRole('heading', { name: 'needle plan', exact: true })).toHaveCount(0);
        expect((await page.locator('.card-title').allTextContents()).sort()).toEqual(
          ['needle thought', 'tag-only match', '1000 wildcard decoy'].sort());
      }
    });
  }

  test('ignores an obsolete real detail error without replacing current results or modal', async ({ page }) => {
    const delayed = await delayPlanDetail(page);
    try {
      // The delayed request will receive a real 404 from the disposable server.
      await database.runSql(db, 'DELETE FROM plans WHERE id = ?', [delayed.id]);
      await selectThought(page);
    } finally {
      await delayed.release();
    }
    await expect(page.locator('#modal-title')).toHaveText('needle thought');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await expect(page.locator('.card-title')).toHaveText(['needle plan', 'needle thought', 'tag-only match']);
  });

  test('Enter cancels queued input debounce so a valid delayed detail still opens', async ({ page }) => {
    // Control the debounce clock, but keep all search/detail HTTP responses real.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/plans/*', async route => {
      await gate;
      await route.continue();
    });
    await page.locator('#search-input').fill('needle');
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('.card-title')).toHaveText(['needle plan', 'needle thought', 'tag-only match']);
    const requested = page.waitForRequest(r => /\/plans\/\d+$/.test(new URL(r.url()).pathname));
    await page.locator('.card').filter({ has: page.getByRole('heading', { name: 'needle plan', exact: true }) }).click();
    await requested;
    try {
      // A queued duplicate render would fire here and invalidate this selection.
      await page.clock.runFor(301);
    } finally {
      release();
    }
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await expect(page.locator('#modal-title')).toHaveText('needle plan');
    await expect(page.locator('#modal-content')).toHaveText('description-only haystack 100%');
  });
});
