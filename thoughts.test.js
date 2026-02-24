const request = require('supertest');
const { createApp } = require('./server');

describe('Thoughts API', () => {
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

  test('POST /thoughts with valid content succeeds and persists', async () => {
    const response = await request(app)
      .post('/thoughts')
      .send({ content: 'Test thought' })
      .expect(201);

    expect(response.body).toHaveProperty('id', '1');
    expect(response.body).toHaveProperty('content', 'Test thought');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');

    // Verify persistence
    const getResponse = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0]).toEqual(response.body);
  });

  test('POST /thoughts with empty content returns 400', async () => {
    await request(app)
      .post('/thoughts')
      .send({ content: '' })
      .expect(400);
  });

  test('POST /thoughts with missing content returns 400', async () => {
    await request(app)
      .post('/thoughts')
      .send({})
      .expect(400);
  });

  test('POST /thoughts allows duplicate content with incrementing ID', async () => {
    await request(app)
      .post('/thoughts')
      .send({ content: 'Duplicate thought' })
      .expect(201);

    const secondResponse = await request(app)
      .post('/thoughts')
      .send({ content: 'Duplicate thought' })
      .expect(201);

    expect(secondResponse.body.id).toBe('2');
    expect(secondResponse.body.content).toBe('Duplicate thought');

    // Verify both persisted
    const getResponse = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(getResponse.body).toHaveLength(2);
    expect(getResponse.body[0].content).toBe('Duplicate thought');
    expect(getResponse.body[1].content).toBe('Duplicate thought');
  });

  test('GET /thoughts returns empty array when no thoughts exist', async () => {
    const response = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  test('GET /thoughts returns thoughts sorted chronologically ascending', async () => {
    // Create thoughts with different timestamps (order implies ascending)
    await request(app)
      .post('/thoughts')
      .send({ content: 'First thought' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Second thought' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Third thought' })
      .expect(201);

    const response = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(response.body).toHaveLength(3);
    expect(response.body[0].content).toBe('First thought');
    expect(response.body[1].content).toBe('Second thought');
    expect(response.body[2].content).toBe('Third thought');

    // Verify timestamps are in ascending order
    const timestamps = response.body.map(t => new Date(t.timestamp));
    expect(timestamps[0] < timestamps[1]).toBe(true);
    expect(timestamps[1] < timestamps[2]).toBe(true);
  });

  test('POST /thoughts with plan_id includes it in response and persists', async () => {
    const response = await request(app)
      .post('/thoughts')
      .send({ content: 'Thought with plan', plan_id: '1' })
      .expect(201);

    expect(response.body).toHaveProperty('id', '1');
    expect(response.body).toHaveProperty('content', 'Thought with plan');
    expect(response.body).toHaveProperty('plan_id', '1');
    expect(response.body).toHaveProperty('timestamp');

    // Verify persistence
    const getResponse = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0]).toEqual(response.body);
  });

  test('POST /thoughts without plan_id does not include it', async () => {
    const response = await request(app)
      .post('/thoughts')
      .send({ content: 'Thought without plan' })
      .expect(201);

    expect(response.body).toHaveProperty('id', '1');
    expect(response.body).toHaveProperty('content', 'Thought without plan');
    expect(response.body).not.toHaveProperty('plan_id');
    expect(response.body).toHaveProperty('timestamp');

    // Verify persistence
    const getResponse = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0]).toEqual(response.body);
    expect(getResponse.body[0]).not.toHaveProperty('plan_id');
  });
});