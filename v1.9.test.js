const request = require('supertest');
const { createApp } = require('./server');

describe('v1.9 Timestamp Queries', () => {
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

  test('GET /plans?since=valid returns plans >= date, sorted asc', async () => {
    const plan1Res = await request(app).post('/plans').send({ title: 'Plan 1', description: 'Desc' }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms for timestamp diff
    const plan2Res = await request(app).post('/plans').send({ title: 'Plan 2', description: 'Desc' }).expect(201);

    const since = new Date(plan1Res.body.timestamp).getTime();
    const response = await request(app).get(`/plans?since=${since}`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].title).toBe('Plan 1');
    expect(response.body[1].title).toBe('Plan 2');

    const timestamps = response.body.map(p => new Date(p.timestamp));
    expect(timestamps[0] < timestamps[1]).toBe(true);
  });

  test('GET /plans?since=valid with no matches returns empty array', async () => {
    const planRes = await request(app).post('/plans').send({ title: 'Plan', description: 'Desc' }).expect(201);

    const futureDate = Date.now() + 10000; // 10s in future
    const response = await request(app).get(`/plans?since=${futureDate}`).expect(200);
    expect(response.body).toEqual([]);
  });

  test('GET /plans?since=invalid ISO returns all plans', async () => {
    await request(app).post('/plans').send({ title: 'Plan 1', description: 'Desc' }).expect(201);
    await request(app).post('/plans').send({ title: 'Plan 2', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans?since=invalid-date').expect(200);
    expect(response.body).toHaveLength(2);
  });

  test('GET /plans without ?since returns all plans, sorted asc', async () => {
    await request(app).post('/plans').send({ title: 'First', description: 'Desc' }).expect(201);
    await request(app).post('/plans').send({ title: 'Second', description: 'Desc' }).expect(201);

    const response = await request(app).get('/plans').expect(200);
    expect(response.body[0].title).toBe('First');
    expect(response.body[1].title).toBe('Second');
  });

  test('GET /thoughts?since=valid returns thoughts >= date, sorted asc', async () => {
    const thought1Res = await request(app).post('/thoughts').send({ content: 'Thought 1' }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
    const thought2Res = await request(app).post('/thoughts').send({ content: 'Thought 2' }).expect(201);

    const since = new Date(thought1Res.body.timestamp).getTime();
    const response = await request(app).get(`/thoughts?since=${since}`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].content).toBe('Thought 1');
    expect(response.body[1].content).toBe('Thought 2');

    const timestamps = response.body.map(t => new Date(t.timestamp));
    expect(timestamps[0] < timestamps[1]).toBe(true);
  });

  test('GET /thoughts?since=valid with no matches returns empty array', async () => {
    const thoughtRes = await request(app).post('/thoughts').send({ content: 'Thought' }).expect(201);

    const futureDate = Date.now() + 10000;
    const response = await request(app).get(`/thoughts?since=${futureDate}`).expect(200);
    expect(response.body).toEqual([]);
  });

  test('GET /thoughts?since=invalid ISO returns all thoughts', async () => {
    await request(app).post('/thoughts').send({ content: 'Thought 1' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Thought 2' }).expect(201);

    const response = await request(app).get('/thoughts?since=invalid-date').expect(200);
    expect(response.body).toHaveLength(2);
  });

  test('GET /thoughts without ?since returns all thoughts, sorted asc', async () => {
    await request(app).post('/thoughts').send({ content: 'First' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Second' }).expect(201);

    const response = await request(app).get('/thoughts').expect(200);
    expect(response.body[0].content).toBe('First');
    expect(response.body[1].content).toBe('Second');
  });

  test('GET /plans?since + ?status filters and sorts correctly', async () => {
    const plan1Res = await request(app).post('/plans').send({ title: 'Proposed 1', description: 'Desc' }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    const plan2Res = await request(app).post('/plans').send({ title: 'In Progress', description: 'Desc' }).expect(201);
    await request(app).patch(`/plans/${plan2Res.body.id}`).send({ status: 'in_progress' }).expect(200);
    await new Promise(resolve => setTimeout(resolve, 100));
    const plan3Res = await request(app).post('/plans').send({ title: 'Proposed 2', description: 'Desc' }).expect(201);

    const since = new Date(plan1Res.body.timestamp).getTime();
    const response = await request(app).get(`/plans?since=${since}&status=proposed`).expect(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].title).toBe('Proposed 1');
    expect(response.body[1].title).toBe('Proposed 2');
  });

  test('GET /thoughts?since + ?limit applies filters in order, sorted asc', async () => {
    const thought1Res = await request(app).post('/thoughts').send({ content: 'Thought 1' }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    const thought2Res = await request(app).post('/thoughts').send({ content: 'Thought 2' }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    const thought3Res = await request(app).post('/thoughts').send({ content: 'Thought 3' }).expect(201);

    const since = new Date(thought2Res.body.timestamp).getTime();
    const response = await request(app).get(`/thoughts?since=${since}&limit=1`).expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].content).toBe('Thought 2');
  });

  test('Integration: ?since with existing data and combinations', async () => {
    const planRes = await request(app).post('/plans').send({ title: 'Plan', description: 'Desc' }).expect(201);
    await request(app).post('/thoughts').send({ content: 'Thought 1', plan_id: planRes.body.id.toString() }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 100));
    await request(app).post('/thoughts').send({ content: 'Thought 2' }).expect(201);

    const since = new Date(planRes.body.timestamp).getTime();
    const plansRes = await request(app).get(`/plans?since=${since}`).expect(200);
    expect(plansRes.body).toHaveLength(1);

    const thoughtsRes = await request(app).get(`/thoughts?since=${since}&limit=2`).expect(200);
    expect(thoughtsRes.body).toHaveLength(2);
    expect(thoughtsRes.body[0].content).toBe('Thought 1');
  });

  test('schema update is idempotent', async () => {
    const instance1 = await createApp({ skipMigration: true });
    const columns1 = await new Promise((res, rej) => {
      instance1.db.all("PRAGMA table_info(plans)", (err, rows) => {
        if (err) rej(err);
        else res(rows.map(r => r.name));
      });
    });
    expect(columns1).toContain('created_at');
    instance1.db.close();

    const instance2 = await createApp({ skipMigration: true });
    const columns2 = await new Promise((res, rej) => {
      instance2.db.all("PRAGMA table_info(plans)", (err, rows) => {
        if (err) rej(err);
        else res(rows.map(r => r.name));
      });
    });
    expect(columns2).toContain('created_at');
    instance2.db.close();
  });
});