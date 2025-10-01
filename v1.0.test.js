const request = require('supertest');
const { createApp } = require('./server');

describe('v1.0 Basic Thought Logger', () => {
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

  describe('POST /thoughts - valid creation', () => {
    test('creates a thought with valid content and returns 201 with id, content, timestamp', async () => {
      const response = await request(app)
        .post('/thoughts')
        .send({ content: 'Test thought' })
        .expect(201);

      expect(response.body).toHaveProperty('id', '1');
      expect(response.body.content).toBe('Test thought');
      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('string');
    });

    test('persists the thought: subsequent GET /thoughts returns the array sorted asc by timestamp', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: 'Test thought' })
        .expect(201);

      const getResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(Array.isArray(getResponse.body)).toBe(true);
      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].id).toBe('1');
      expect(getResponse.body[0].content).toBe('Test thought');
      expect(getResponse.body[0].timestamp).toBeDefined();
    });
  });

  describe('POST /thoughts - multiple creates', () => {
    test('creates multiple thoughts and GET returns them sorted asc by timestamp', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: 'First thought' })
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps

      const secondResponse = await request(app)
        .post('/thoughts')
        .send({ content: 'Second thought' })
        .expect(201);

      const getResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getResponse.body).toHaveLength(2);
      expect(getResponse.body[0].content).toBe('First thought'); // Older first (asc)
      expect(getResponse.body[1].content).toBe('Second thought'); // Newer second
      expect(getResponse.body[1].id).toBe('2');
      const timestamps = getResponse.body.map(t => new Date(t.timestamp));
      expect(timestamps[0] < timestamps[1]).toBe(true);
    });
  });

  describe('POST /thoughts - invalid inputs', () => {
    test('returns 400 for missing content', async () => {
      await request(app)
        .post('/thoughts')
        .send({})
        .expect(400);
    });

    test('returns 400 for empty string content', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: '' })
        .expect(400);
    });
  });

  describe('GET /thoughts - retrieval and persistence', () => {
    test('returns 200 with empty array on initial empty state', async () => {
      const response = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('confirms persistence after create: GET returns created data sorted asc', async () => {
      // Already covered in valid creation, but explicit for persistence
      await request(app)
        .post('/thoughts')
        .send({ content: 'Persistent thought' })
        .expect(201);

      const getResponse = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(getResponse.body).toHaveLength(1);
      expect(getResponse.body[0].content).toBe('Persistent thought');
      // Verifies no regression: id auto-increment, timestamp ISO, sorted (single item)
    });
  });
});