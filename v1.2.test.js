const request = require('supertest');
const { createApp } = require('./server');

describe('v1.2 Plan Status Updater', () => {
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

  describe('PATCH /plans/:id - status update', () => {
    test('success: creates plan, updates to in_progress, returns 200 with updated status, GET /plans/:id confirms', async () => {
      // Create plan
      const postResponse = await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      expect(postResponse.body.id).toBe(1);
      expect(postResponse.body.status).toBe('proposed');

      // Update status
      const patchResponse = await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      expect(patchResponse.body.status).toBe('in_progress');

      // Verify single retrieval
      const getResponse = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getResponse.body.id).toBe(1);
      expect(getResponse.body.title).toBe('Test Plan');
      expect(getResponse.body.description).toBe('Test desc');
      expect(getResponse.body.status).toBe('in_progress');
      expect(getResponse.body.timestamp).toBeDefined();
    });

    test('multiple updates: in_progress then completed, persists each', async () => {
      // Create plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      // First update
      const patch1Response = await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      expect(patch1Response.body.status).toBe('in_progress');

      // Second update
      const patch2Response = await request(app)
        .patch('/plans/1')
        .send({ status: 'completed' })
        .expect(200);

      expect(patch2Response.body.status).toBe('completed');

      // Verify final state
      const getResponse = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getResponse.body.status).toBe('completed');
    });

    test('PATCH without status: 200, no change', async () => {
      // Create plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      // Patch without status
      const patchResponse = await request(app)
        .patch('/plans/1')
        .send({})
        .expect(200);

      expect(patchResponse.body.status).toBe('proposed'); // No change

      // Verify
      const getResponse = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(getResponse.body.status).toBe('proposed');
    });
  });

  describe('GET /plans/:id - single retrieval', () => {
    test('empty state: GET /plans/1 returns 404', async () => {
      await request(app)
        .get('/plans/1')
        .expect(404);
    });

    test('after POST: returns 200 with full plan', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      const response = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(response.body.id).toBe(1);
      expect(response.body.title).toBe('Test Plan');
      expect(response.body.description).toBe('Test desc');
      expect(response.body.status).toBe('proposed');
      expect(response.body.timestamp).toBeDefined();
    });

    test('after PATCH: returns updated status', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      await request(app)
        .patch('/plans/1')
        .send({ status: 'completed' })
        .expect(200);

      const response = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(response.body.status).toBe('completed');
    });
  });

  describe('invalid cases', () => {
    test('PATCH non-existent id: 404', async () => {
      await request(app)
        .patch('/plans/999')
        .send({ status: 'in_progress' })
        .expect(404);
    });

    test('PATCH invalid status: 400', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      await request(app)
        .patch('/plans/1')
        .send({ status: 'invalid' })
        .expect(400);
    });

    test('PATCH non-existent in empty state: 404', async () => {
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(404);
    });
  });

  describe('retrieval and persistence', () => {
    test('after PATCH, GET /plans confirms update and sorted asc by timestamp', async () => {
      // Create two plans
      await request(app)
        .post('/plans')
        .send({ title: 'First Plan', description: 'First desc' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10)); // Different timestamps

      await request(app)
        .post('/plans')
        .send({ title: 'Second Plan', description: 'Second desc' })
        .expect(201);

      // Update first plan
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      // Update second plan
      await request(app)
        .patch('/plans/2')
        .send({ status: 'completed' })
        .expect(200);

      const getAllResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(getAllResponse.body).toHaveLength(2);
      expect(getAllResponse.body[0].id).toBe(1);
      expect(getAllResponse.body[0].status).toBe('in_progress'); // Older first
      expect(getAllResponse.body[1].id).toBe(2);
      expect(getAllResponse.body[1].status).toBe('completed');
      const timestamps = getAllResponse.body.map(p => new Date(p.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('regression - prior endpoints', () => {
    test('POST /plans succeeds as in v1.1', async () => {
      const response = await request(app)
        .post('/plans')
        .send({ title: 'Regression Plan', description: 'Regression desc' })
        .expect(201);

      expect(response.body.id).toBe(1);
      expect(response.body.title).toBe('Regression Plan');
      expect(response.body.description).toBe('Regression desc');
      expect(response.body.status).toBe('proposed');

      const getResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].status).toBe('proposed');
    });

    test('POST /thoughts succeeds as in v1.0/v1.1', async () => {
      const response = await request(app)
        .post('/thoughts')
        .send({ content: 'Regression thought' })
        .expect(201);

      expect(response.body.id).toBe('1');
      expect(response.body.content).toBe('Regression thought');
      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('string');

      const getResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(Array.isArray(getResponse.body)).toBe(true);
      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].id).toBe('1');
      expect(getResponse.body[0].content).toBe('Regression thought');
    });
  });
});