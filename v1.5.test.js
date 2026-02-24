const request = require('supertest');
const { createApp } = require('./server');

describe('v1.5 Plan Changelog', () => {
  let app;
  let db;

  beforeEach(async () => {
    const instance = await createApp({ skipMigration: true });
    app = instance.app;
    db = instance.db;
  });

  afterEach(() => {
    db.close();
  });

  describe('PATCH /plans/:id/changelog - append change', () => {
    test('success: POST plan initializes changelog [], PATCH appends change, returns 200 with full plan and changelog', async () => {
      // POST plan
      const postRes = await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      expect(postRes.body).not.toHaveProperty('changelog'); // Backward compatible, no changelog in POST response

      // PATCH changelog
      const patchRes = await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'First change' })
        .expect(200);

      expect(patchRes.body.id).toBe(1);
      expect(patchRes.body.changelog).toHaveLength(1);
      expect(patchRes.body.changelog[0]).toHaveProperty('change', 'First change');
      expect(patchRes.body.changelog[0]).toHaveProperty('timestamp');
      expect(typeof patchRes.body.changelog[0].timestamp).toBe('number');
    });

    test('multiple appends: appends to existing changelog with distinct timestamps', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      // First PATCH
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'First change' })
        .expect(200);

      // Second PATCH with delay for distinct timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const secondRes = await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Second change' })
        .expect(200);

      expect(secondRes.body.changelog).toHaveLength(2);
      expect(secondRes.body.changelog[0].change).toBe('First change');
      expect(secondRes.body.changelog[1].change).toBe('Second change');
      const timestamps = secondRes.body.changelog.map(c => c.timestamp);
      expect(timestamps[0] < timestamps[1]).toBe(true);
      expect(typeof timestamps[0]).toBe('number');
      expect(typeof timestamps[1]).toBe('number');
    });
  });

  describe('retrieval with changelog', () => {
    test('GET /plans/:id returns full plan with changelog [], 200; 404 if not found', async () => {
      // GET non-existent
      await request(app)
        .get('/plans/999')
        .expect(404);

      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.id).toBe(1);
      expect(getRes.body.title).toBe('Test Plan');
      expect(getRes.body.description).toBe('Desc');
      expect(getRes.body.status).toBe('proposed');
      expect(getRes.body.changelog).toEqual([]);
    });

    test('GET /plans/:id includes changelog after append', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      // PATCH changelog
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Test change' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.changelog).toHaveLength(1);
      expect(getRes.body.changelog[0].change).toBe('Test change');
      expect(getRes.body.changelog[0]).toHaveProperty('timestamp');
      expect(typeof getRes.body.changelog[0].timestamp).toBe('number');
    });

    test('GET /plans returns all plans sorted asc with updated changelog', async () => {
      // POST two plans
      await request(app)
        .post('/plans')
        .send({ title: 'Plan 1', description: 'Desc 1' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post('/plans')
        .send({ title: 'Plan 2', description: 'Desc 2' })
        .expect(201);

      // PATCH changelog for plan 1
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Change for Plan 1' })
        .expect(200);

      // PATCH changelog for plan 2
      await request(app)
        .patch('/plans/2/changelog')
        .send({ change: 'Change for Plan 2' })
        .expect(200);

      const getAllRes = await request(app)
        .get('/plans')
        .expect(200);

      expect(getAllRes.body).toHaveLength(2);
      expect(getAllRes.body[0].title).toBe('Plan 1');
      expect(getAllRes.body[1].title).toBe('Plan 2');
      const planTimestamps = getAllRes.body.map(p => new Date(p.timestamp));
      expect(planTimestamps[0] < planTimestamps[1]).toBe(true);
      expect(getAllRes.body[0].changelog).toHaveLength(1);
      expect(getAllRes.body[0].changelog[0].change).toBe('Change for Plan 1');
      expect(getAllRes.body[1].changelog).toHaveLength(1);
      expect(getAllRes.body[1].changelog[0].change).toBe('Change for Plan 2');
    });
  });

  describe('invalid and empty cases', () => {
    test('PATCH non-existent id returns 404', async () => {
      await request(app)
        .patch('/plans/999/changelog')
        .send({ change: 'Test change' })
        .expect(404);
    });

    test('PATCH empty change returns 400', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: '' })
        .expect(400);
    });

    test('PATCH without change returns 400', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      await request(app)
        .patch('/plans/1/changelog')
        .send({})
        .expect(400);
    });

    test('GET non-existent id returns 404', async () => {
      await request(app)
        .get('/plans/999')
        .expect(404);
    });

    test('no plan exists: PATCH returns 404, initial GET changelog is [] after POST', async () => {
      // PATCH non-existent
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Test' })
        .expect(404);

      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.changelog).toEqual([]);
    });
  });

  describe('persistence and integration', () => {
    test('persistence: multiple PATCH, GET /plans/:id confirms changelog accumulates', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Persistent Plan', description: 'Desc' })
        .expect(201);

      // Multiple PATCH
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'First persistent' })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Second persistent' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.changelog).toHaveLength(2);
      expect(getRes.body.changelog[0].change).toBe('First persistent');
      expect(getRes.body.changelog[1].change).toBe('Second persistent');
      expect(typeof getRes.body.changelog[0].timestamp).toBe('number');
      expect(typeof getRes.body.changelog[1].timestamp).toBe('number');
      expect(getRes.body.changelog[0].timestamp < getRes.body.changelog[1].timestamp).toBe(true);
    });

    test('integration: create plan, add changelog entries, retrieve via GET /plans/:id shows them', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Integrated Plan', description: 'Desc' })
        .expect(201);

      // PATCH status (existing endpoint unaffected)
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      // Multiple changelog entries
      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'First integrated change' })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .patch('/plans/1/changelog')
        .send({ change: 'Second integrated change' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.status).toBe('in_progress');
      expect(getRes.body.changelog).toHaveLength(2);
      expect(getRes.body.changelog[0].change).toBe('First integrated change');
      expect(getRes.body.changelog[1].change).toBe('Second integrated change');
      expect(getRes.body.changelog[0].timestamp < getRes.body.changelog[1].timestamp).toBe(true);
    });
  });

  describe('regression - prior endpoints unaffected', () => {
    test('POST /plans initializes changelog [] but returns backward compatible response without it', async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Reg Plan', description: 'Desc' })
        .expect(201);

      expect(res.body.id).toBe(1);
      expect(res.body.title).toBe('Reg Plan');
      expect(res.body.description).toBe('Desc');
      expect(res.body.status).toBe('proposed');
      expect(res.body).not.toHaveProperty('changelog'); // Backward compatible
    });

    test('POST /thoughts succeeds unaffected', async () => {
      const res = await request(app)
        .post('/thoughts')
        .send({ content: 'Reg Thought' })
        .expect(201);

      expect(res.body.content).toBe('Reg Thought');
    });

    test('GET /plans returns all with changelog', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Plan', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .get('/plans')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].changelog).toEqual([]);
    });

    test('GET /thoughts returns all unaffected', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: 'Reg Thought' })
        .expect(201);

      const res = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    test('PATCH /plans/:id (status) succeeds unaffected, does not affect changelog', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Patch Plan', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      expect(res.body.status).toBe('in_progress');

      // Verify changelog unchanged
      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.status).toBe('in_progress');
      expect(getRes.body.changelog).toEqual([]);
    });

    test('GET /plans/:id/thoughts succeeds unaffected', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Plan with Thoughts', description: 'Desc' })
        .expect(201);

      await request(app)
        .post('/thoughts')
        .send({ content: 'Linked Thought', plan_id: 1 })
        .expect(201);

      const res = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].content).toBe('Linked Thought');
    });
  });
});