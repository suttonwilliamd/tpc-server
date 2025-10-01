const request = require('supertest');
const { createApp } = require('./server');

describe('v1.3 Simple Retrieval', () => {
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

  describe('GET /thoughts - retrieval', () => {
    test('empty state: returns 200 with empty array', async () => {
      const response = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('after single POST /thoughts: returns 200 with sorted array of one', async () => {
      // Create thought
      await request(app)
        .post('/thoughts')
        .send({ content: 'Test thought' })
        .expect(201);

      const response = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('1');
      expect(response.body[0].content).toBe('Test thought');
      expect(response.body[0].timestamp).toBeDefined();
    });

    test('multiple POST /thoughts: returns sorted ascending by timestamp', async () => {
      // First thought
      await request(app)
        .post('/thoughts')
        .send({ content: 'First thought' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps

      // Second thought
      await request(app)
        .post('/thoughts')
        .send({ content: 'Second thought' })
        .expect(201);

      const response = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].id).toBe('1');
      expect(response.body[0].content).toBe('First thought');
      expect(response.body[1].id).toBe('2');
      expect(response.body[1].content).toBe('Second thought');

      const timestamps = response.body.map(t => new Date(t.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('GET /plans - retrieval', () => {
    test('empty state: returns 200 with empty array', async () => {
      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('after single POST /plans: returns 200 with sorted array of one', async () => {
      // Create plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(1);
      expect(response.body[0].title).toBe('Test Plan');
      expect(response.body[0].description).toBe('Test desc');
      expect(response.body[0].status).toBe('proposed');
      expect(response.body[0].timestamp).toBeDefined();
    });

    test('after PATCH /plans/:id: returns updated status in sorted array', async () => {
      // Create plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      // Update status
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBe('in_progress');
    });

    test('multiple POST /plans: returns sorted ascending by timestamp', async () => {
      // First plan
      await request(app)
        .post('/plans')
        .send({ title: 'First Plan', description: 'First desc' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps

      // Second plan
      await request(app)
        .post('/plans')
        .send({ title: 'Second Plan', description: 'Second desc' })
        .expect(201);

      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].id).toBe(1);
      expect(response.body[0].title).toBe('First Plan');
      expect(response.body[1].id).toBe(2);
      expect(response.body[1].title).toBe('Second Plan');

      const timestamps = response.body.map(p => new Date(p.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('persistence after operations', () => {
    test('mixed operations: POST thought/plan, PATCH plan, GETs confirm data and sorting', async () => {
      // POST thought
      await request(app)
        .post('/thoughts')
        .send({ content: 'Test thought' })
        .expect(201);

      // POST plan
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10));

      // POST another plan
      await request(app)
        .post('/plans')
        .send({ title: 'Second Plan', description: 'Second desc' })
        .expect(201);

      // PATCH first plan
      await request(app)
        .patch('/plans/1')
        .send({ status: 'in_progress' })
        .expect(200);

      // GET thoughts
      const thoughtsResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(thoughtsResponse.body).toHaveLength(1);
      expect(thoughtsResponse.body[0].content).toBe('Test thought');

      // GET plans
      const plansResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(plansResponse.body).toHaveLength(2);
      expect(plansResponse.body[0].id).toBe(1);
      expect(plansResponse.body[0].status).toBe('in_progress');
      expect(plansResponse.body[0].title).toBe('Test Plan');
      expect(plansResponse.body[1].id).toBe(2);
      expect(plansResponse.body[1].title).toBe('Second Plan');

      const planTimestamps = plansResponse.body.map(p => new Date(p.timestamp));
      expect(planTimestamps[0] < planTimestamps[1]).toBe(true);

      // GET /plans/:id works
      const singleResponse = await request(app)
        .get('/plans/1')
        .expect(200);

      expect(singleResponse.body.status).toBe('in_progress');
    });
  });

  describe('regression - prior endpoints', () => {
    test('POST /thoughts succeeds', async () => {
      const response = await request(app)
        .post('/thoughts')
        .send({ content: 'Regression thought' })
        .expect(201);

      expect(response.body.id).toBe('1');
      expect(response.body.content).toBe('Regression thought');
      expect(response.body.timestamp).toBeDefined();

      const getResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].id).toBe('1');
    });

    test('POST /plans succeeds', async () => {
      const response = await request(app)
        .post('/plans')
        .send({ title: 'Regression Plan', description: 'Regression desc' })
        .expect(201);

      expect(response.body.id).toBe(1);
      expect(response.body.title).toBe('Regression Plan');
      expect(response.body.status).toBe('proposed');

      const getResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].status).toBe('proposed');
    });

    test('PATCH /plans/:id succeeds', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      const patchResponse = await request(app)
        .patch('/plans/1')
        .send({ status: 'completed' })
        .expect(200);

      expect(patchResponse.body.status).toBe('completed');
    });
  });
});