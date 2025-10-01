const request = require('supertest');
const { createApp } = require('./server');

describe('v1.8 Basic Filtering', () => {
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

  test('GET /plans?status=proposed returns only proposed plans, sorted asc', async () => {
    await request(app).post('/plans').send({ title: 'Proposed 1', description: 'Desc' }).expect(201);
    const inProgressRes = await request(app).post('/plans').send({ title: 'In Progress', description: 'Desc' }).expect(201);
    await request(app).patch(`/plans/${inProgressRes.body.id}`).send({ status: 'in_progress' }).expect(200);
    await request(app).post('/plans').send({ title: 'Proposed 2', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans?status=proposed').expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].title).toBe('Proposed 1');
    expect(response.body[1].title).toBe('Proposed 2');

    const timestamps = response.body.map(p => new Date(p.timestamp));
    expect(timestamps[0] < timestamps[1]).toBe(true);
  });

  test('GET /plans?status=invalid returns all plans', async () => {
    await request(app).post('/plans').send({ title: 'Plan 1', description: 'Desc' }).expect(201);
    await request(app).post('/plans').send({ title: 'Plan 2', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans?status=invalid').expect(200);
    expect(response.body).toHaveLength(2);
  });

  test('GET /plans without status returns all plans, sorted asc', async () => {
    await request(app).post('/plans').send({ title: 'First', description: 'Desc' }).expect(201);
    await request(app).post('/plans').send({ title: 'Second', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans').expect(200);
    expect(response.body[0].title).toBe('First');
    expect(response.body[1].title).toBe('Second');
  });

  test('GET /plans?status=no_match returns empty array', async () => {
    await request(app).post('/plans').send({ title: 'Proposed', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans?status=completed').expect(200);
    expect(response.body).toEqual([]);
  });

  test('GET /thoughts?limit=2 returns first 2 thoughts, sorted asc', async () => {
    await request(app).post('/thoughts').send({ content: 'First' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Second' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Third' }).expect(201);

    const response = await request(app).get('/thoughts?limit=2').expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].content).toBe('First');
    expect(response.body[1].content).toBe('Second');
  });

  test('GET /thoughts?limit=10 when total=3 returns all 3', async () => {
    await request(app).post('/thoughts').send({ content: 'One' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Two' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Three' }).expect(201);

    const response = await request(app).get('/thoughts?limit=10').expect(200);
    expect(response.body).toHaveLength(3);
  });

  test('GET /thoughts?limit=0 returns empty array', async () => {
    await request(app).post('/thoughts').send({ content: 'Test' }).expect(201);

    const response = await request(app).get('/thoughts?limit=0').expect(200);
    expect(response.body).toEqual([]);
  });

  test('GET /thoughts?limit=-1 returns empty array', async () => {
    await request(app).post('/thoughts').send({ content: 'Test' }).expect(201);

    const response = await request(app).get('/thoughts?limit=-1').expect(200);
    expect(response.body).toEqual([]);
  });

  test('GET /thoughts?limit=invalid ignores and returns all', async () => {
    await request(app).post('/thoughts').send({ content: 'Test' }).expect(201);

    const response = await request(app).get('/thoughts?limit=abc').expect(200);
    expect(response.body).toHaveLength(1);
  });

  test('GET /thoughts without limit returns all, sorted asc', async () => {
    await request(app).post('/thoughts').send({ content: 'First' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Second' }).expect(201);

    const response = await request(app).get('/thoughts').expect(200);
    expect(response.body[0].content).toBe('First');
    expect(response.body[1].content).toBe('Second');
  });

  test('Integration: Filter plans and limit thoughts', async () => {
    const planRes = await request(app).post('/plans').send({ title: 'Plan', description: 'Desc' }).expect(201);

    await request(app).post('/thoughts').send({ content: 'Thought 1', plan_id: planRes.body.id.toString() }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Thought 2' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Thought 3', plan_id: planRes.body.id.toString() }).expect(201);

    const plansRes = await request(app).get('/plans?status=proposed').expect(200);
    expect(plansRes.body).toHaveLength(1);

    const thoughtsRes = await request(app).get('/thoughts?limit=2').expect(200);
    expect(thoughtsRes.body).toHaveLength(2);
    expect(thoughtsRes.body[0].content).toBe('Thought 1');
    expect(thoughtsRes.body[1].content).toBe('Thought 2');
  });
});