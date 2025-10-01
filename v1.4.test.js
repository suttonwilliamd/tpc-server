const request = require('supertest');
const { createApp } = require('./server');

describe('v1.4 Thought-Plan Linking', () => {
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

  describe('POST /thoughts - with/without plan_id', () => {
    test('with plan_id: creates thought linked to existing plan', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Desc' })
        .expect(201);

      // POST thought with plan_id
      const thoughtRes = await request(app)
        .post('/thoughts')
        .send({ content: 'Linked', plan_id: 1 })
        .expect(201);

      expect(thoughtRes.body.plan_id).toBe(1);

      // GET /thoughts
      const getRes = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getRes.body).toHaveLength(1);
      expect(getRes.body[0].content).toBe('Linked');
      expect(getRes.body[0].plan_id).toBe('1');
    });

    test('without plan_id: creates unlinked thought', async () => {
      const thoughtRes = await request(app)
        .post('/thoughts')
        .send({ content: 'Unlinked' })
        .expect(201);

      expect(thoughtRes.body).not.toHaveProperty('plan_id');

      const getRes = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getRes.body[0].content).toBe('Unlinked');
      expect(getRes.body[0].plan_id).toBeUndefined();
    });

    test('with invalid plan_id: still creates thought (no validation on POST)', async () => {
      const thoughtRes = await request(app)
        .post('/thoughts')
        .send({ content: 'Invalid link', plan_id: 999 })
        .expect(201);

      expect(thoughtRes.body.plan_id).toBe(999);

      const getRes = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getRes.body[0].plan_id).toBe('999');
    });
  });

  describe('GET /plans/:id/thoughts - linked retrieval', () => {
    test('success: returns linked thoughts sorted asc by timestamp', async () => {
      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Plan1', description: 'Desc' })
        .expect(201);

      // POST two thoughts with delay
      await request(app)
        .post('/thoughts')
        .send({ content: 'First linked', plan_id: 1 })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post('/thoughts')
        .send({ content: 'Second linked', plan_id: 1 })
        .expect(201);

      const res = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].content).toBe('First linked');
      expect(res.body[1].content).toBe('Second linked');

      const timestamps = res.body.map(t => new Date(t.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });

    test('multiple linked/unlinked: filters correctly', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Plan1', description: 'Desc' })
        .expect(201);

      await request(app)
        .post('/thoughts')
        .send({ content: 'Linked1', plan_id: 1 })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post('/thoughts')
        .send({ content: 'Linked2', plan_id: 1 })
        .expect(201);

      await request(app)
        .post('/thoughts')
        .send({ content: 'Unlinked' })
        .expect(201);

      const linkedRes = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(linkedRes.body).toHaveLength(2);
      expect(linkedRes.body[0].content).toBe('Linked1');
      expect(linkedRes.body[1].content).toBe('Linked2');

      const allRes = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(allRes.body).toHaveLength(3);

      const allTimestamps = allRes.body.map(t => new Date(t.timestamp));
      expect(allTimestamps[0] < allTimestamps[1]).toBe(true);
      expect(allTimestamps[1] < allTimestamps[2]).toBe(true);
    });
  });

  describe('invalid and empty cases', () => {
    test('empty linked: returns 200 with []', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Empty Plan', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(res.body).toEqual([]);

      // POST unlinked, still empty
      await request(app)
        .post('/thoughts')
        .send({ content: 'Unlinked' })
        .expect(201);

      const res2 = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(res2.body).toEqual([]);
    });

    test('invalid plan: returns 200 with []', async () => {
      const res1 = await request(app)
        .get('/plans/999/thoughts')
        .expect(200);

      expect(res1.body).toEqual([]);

      // Even after POST with invalid plan_id, still returns []
      await request(app)
        .post('/thoughts')
        .send({ content: 'Test', plan_id: 999 })
        .expect(201);

      // Verify thought created via GET /thoughts
      const allRes = await request(app)
        .get('/thoughts')
        .expect(200);
      expect(allRes.body).toHaveLength(1);
      expect(allRes.body[0].plan_id).toBe('999');

      const res2 = await request(app)
        .get('/plans/999/thoughts')
        .expect(200);

      expect(res2.body).toEqual([]);
    });
  });

  describe('persistence and integration', () => {
    test('persistence: plan_id persists in GET /thoughts, filter works', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Persistent Plan', description: 'Desc' })
        .expect(201);

      await request(app)
        .post('/thoughts')
        .send({ content: 'Persistent', plan_id: 1 })
        .expect(201);

      await request(app)
        .post('/thoughts')
        .send({ content: 'Another' })
        .expect(201);

      const allRes = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(allRes.body).toHaveLength(2);

      const linked = allRes.body.find(t => t.plan_id === '1');
      expect(linked.content).toBe('Persistent');

      const linkedRes = await request(app)
        .get('/plans/1/thoughts')
        .expect(200);

      expect(linkedRes.body).toHaveLength(1);
      expect(linkedRes.body[0].content).toBe('Persistent');
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

    test('GET /plans succeeds', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Plan', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .get('/plans')
        .expect(200);

      expect(res.body).toHaveLength(1);
    });

    test('PATCH /plans/:id succeeds', async () => {
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

    test('POST /thoughts without plan_id succeeds', async () => {
      const res = await request(app)
        .post('/thoughts')
        .send({ content: 'Reg No Plan' })
        .expect(201);

      expect(res.body).not.toHaveProperty('plan_id');
    });
  });
});