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

  describe('PATCH /plans/:id/changelog - append entry', () => {
    test('success: POST plan, PATCH appends entry, returns 200 with full plan and changelog', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      // PATCH changelog
      const patchRes = await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'First entry' })
        .expect(200);

      expect(patchRes.body.id).toBe(1);
      expect(patchRes.body.changelog).toHaveLength(1);
      expect(patchRes.body.changelog[0]).toHaveProperty('entry', 'First entry');
      expect(patchRes.body.changelog[0]).toHaveProperty('timestamp');
      expect(typeof patchRes.body.changelog[0].timestamp).toBe('string');
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
        .send({ entry: 'First entry' })
        .expect(200);

      // Second PATCH with delay for distinct timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const secondRes = await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'Second entry' })
        .expect(200);

      expect(secondRes.body.changelog).toHaveLength(2);
      expect(secondRes.body.changelog[0].entry).toBe('First entry');
      expect(secondRes.body.changelog[1].entry).toBe('Second entry');
      const timestamps = secondRes.body.changelog.map(c => new Date(c.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('retrieval with changelog', () => {
    test('GET /plans/:id includes changelog after append', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      // PATCH changelog
      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'Test entry' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.changelog).toHaveLength(1);
      expect(getRes.body.changelog[0].entry).toBe('Test entry');
      expect(getRes.body.changelog[0]).toHaveProperty('timestamp');
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
        .send({ entry: 'Entry for Plan 1' })
        .expect(200);

      // PATCH changelog for plan 2
      await request(app)
        .patch('/plans/2/changelog')
        .send({ entry: 'Entry for Plan 2' })
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
      expect(getAllRes.body[1].changelog).toHaveLength(1);
    });
  });

  describe('invalid and empty cases', () => {
    test('PATCH non-existent id returns 404', async () => {
      await request(app)
        .patch('/plans/999/changelog')
        .send({ entry: 'Test entry' })
        .expect(404);
    });

    test('PATCH empty entry returns 400', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: '' })
        .expect(400);
    });

    test('PATCH without entry returns 400', async () => {
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

    test('no plan exists: PATCH returns 404, initial GET changelog is [] after POST', async () => {
      // PATCH non-existent
      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'Test' })
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
    test('persistence: multiple PATCH, GET /plans/:id confirms changelog', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Persistent Plan', description: 'Desc' })
        .expect(201);

      // Multiple PATCH
      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'First persistent' })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'Second persistent' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.changelog).toHaveLength(2);
      expect(getRes.body.changelog[0].entry).toBe('First persistent');
      expect(getRes.body.changelog[1].entry).toBe('Second persistent');
    });

    test('integration: PATCH status then changelog, GET includes both', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Integrated Plan', description: 'Desc' })
        .expect(201);

      // PATCH status
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      // PATCH changelog
      await request(app)
        .patch('/plans/1/changelog')
        .send({ entry: 'Status updated entry' })
        .expect(200);

      const getRes = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getRes.body.status).toBe('in_progress');
      expect(getRes.body.changelog).toHaveLength(1);
      expect(getRes.body.changelog[0].entry).toBe('Status updated entry');
    });
  });

  describe('regression - prior endpoints', () => {
    test('POST /plans succeeds', async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Reg Plan', description: 'Desc' })
        .expect(201);

      expect(res.body.id).toBe(1);
      expect(res.body.status).toBe('proposed');
    });

    test('POST /thoughts succeeds', async () => {
      const res = await request(app)
        .post('/thoughts')
        .send({ content: 'Reg Thought' })
        .expect(201);

      expect(res.body.content).toBe('Reg Thought');
    });

    test('GET /plans returns all', async () => {
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

    test('GET /thoughts returns all', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: 'Reg Thought' })
        .expect(201);

      const res = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    test('PATCH /plans/:id (status) succeeds', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Patch Plan', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      expect(res.body.status).toBe('in_progress');
    });

    test('GET /plans/:id/thoughts succeeds', async () => {
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