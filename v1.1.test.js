const request = require('supertest');
const { createApp } = require('./server');

describe('v1.1 Basic Plan Creator', () => {
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

  describe('GET /plans - empty state', () => {
    test('returns 200 with empty array on initial empty state', async () => {
      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('POST /plans - valid creation', () => {
    test('creates a plan with valid title and description and returns 201 with id, title, description, status="proposed"', async () => {
      const response = await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      expect(response.body).toHaveProperty('id', 1);
      expect(response.body.title).toBe('Test Plan');
      expect(response.body.description).toBe('Test desc');
      expect(response.body.status).toBe('proposed');
    });

    test('persists the plan: subsequent GET /plans returns the array sorted asc by timestamp', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: 'Test desc' })
        .expect(201);

      const getResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(Array.isArray(getResponse.body)).toBe(true);
      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].id).toBe(1);
      expect(getResponse.body[0].title).toBe('Test Plan');
      expect(getResponse.body[0].description).toBe('Test desc');
      expect(getResponse.body[0].status).toBe('proposed');
      expect(getResponse.body[0].timestamp).toBeDefined();
    });
  });

  describe('POST /plans - multiple creates', () => {
    test('creates multiple plans and GET returns them sorted asc by timestamp', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'First Plan', description: 'First desc' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps

      const secondResponse = await request(app)
        .post('/plans')
        .send({ title: 'Second Plan', description: 'Second desc' })
        .expect(201);

      const getResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(getResponse.body).toHaveLength(2);
      expect(getResponse.body[0].title).toBe('First Plan'); // Older first (asc)
      expect(getResponse.body[1].title).toBe('Second Plan'); // Newer second
      expect(getResponse.body[1].id).toBe(2);
      const timestamps = getResponse.body.map(p => new Date(p.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('POST /plans - invalid inputs', () => {
    test('returns 400 for missing title', async () => {
      await request(app)
        .post('/plans')
        .send({ description: 'Test desc' })
        .expect(400);
    });

    test('returns 400 for missing description', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan' })
        .expect(400);
    });

    test('returns 400 for empty title', async () => {
      await request(app)
        .post('/plans')
        .send({ title: '', description: 'Test desc' })
        .expect(400);
    });

    test('returns 400 for empty description', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Test Plan', description: '' })
        .expect(400);
    });
  });

  describe('retrieval and persistence', () => {
    test('confirms persistence after create: GET returns created data sorted asc by timestamp', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Persistent Plan', description: 'Persistent desc' })
        .expect(201);

      const getResponse = await request(app)
        .get('/plans')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].title).toBe('Persistent Plan');
      expect(getResponse.body[0].description).toBe('Persistent desc');
      expect(getResponse.body[0].status).toBe('proposed');
      expect(getResponse.body[0].id).toBe(1);
      expect(getResponse.body[0].timestamp).toBeDefined();
      // Verifies no regression: id auto-increment, timestamp ISO, defaults, sorted (single item)
    });
  });

  describe('regression - thoughts unchanged', () => {
    test('POST /thoughts with valid content succeeds as in v1.0 and persists', async () => {
      const response = await request(app)
        .post('/thoughts')
        .send({ content: 'Regression thought' })
        .expect(201);

      expect(response.body).toHaveProperty('id', '1');
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
      expect(getResponse.body[0].timestamp).toBeDefined();
    });
  });
});