const request = require('supertest');
const { createApp } = require('./server');

describe('v1.6 Context Window', () => {
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

  test('GET /context returns 200 OK with correct structure: incompletePlans filtered/sorted asc, last10Thoughts recent 10 desc or all/empty', async () => {
    // Create incomplete plans
    await request(app)
      .post('/plans')
      .send({ title: 'Plan 1', description: 'Proposed plan' })
      .expect(201);

    await request(app)
      .post('/plans')
      .send({ title: 'Plan 2', description: 'In progress plan' })
      .expect(201);

    // Create a complete plan
    await request(app)
      .post('/plans')
      .send({ title: 'Plan 3', description: 'Complete plan' })
      .expect(201);

    await request(app)
      .patch('/plans/3')
      .send({ status: 'completed' })
      .expect(200);

    // Create thoughts
    await request(app)
      .post('/thoughts')
      .send({ content: 'Old thought 1' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Old thought 2' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Recent thought 1' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Recent thought 2' })
      .expect(201);

    const response = await request(app)
      .get('/context')
      .expect(200);

    expect(response.body).toHaveProperty('incompletePlans');
    expect(response.body).toHaveProperty('last10Thoughts');
    expect(Array.isArray(response.body.incompletePlans)).toBe(true);
    expect(Array.isArray(response.body.last10Thoughts)).toBe(true);

    // Incomplete plans: only proposed and in_progress, sorted asc by timestamp
    expect(response.body.incompletePlans).toHaveLength(2);
    expect(response.body.incompletePlans[0].title).toBe('Plan 1');
    expect(response.body.incompletePlans[1].title).toBe('Plan 2');
    const planTimestamps = response.body.incompletePlans.map(p => new Date(p.timestamp));
    expect(planTimestamps[0] < planTimestamps[1]).toBe(true);

    // Last 10 thoughts: all 4 since <10, sorted desc by timestamp (most recent first)
    expect(response.body.last10Thoughts).toHaveLength(4);
    expect(response.body.last10Thoughts[0].content).toBe('Recent thought 2');
    expect(response.body.last10Thoughts[3].content).toBe('Old thought 1');
    const thoughtTimestamps = response.body.last10Thoughts.map(t => new Date(t.timestamp));
    expect(thoughtTimestamps[0] > thoughtTimestamps[1]).toBe(true);
    expect(thoughtTimestamps[3] < thoughtTimestamps[2]).toBe(true);
  });

  test('Integration: GET /context with no incomplete plans', async () => {
    await request(app)
      .post('/plans')
      .send({ title: 'Complete Plan', description: 'Desc' })
      .expect(201);

    await request(app)
      .patch('/plans/1')
      .send({ status: 'completed' })
      .expect(200);

    const response = await request(app)
      .get('/context')
      .expect(200);

    expect(response.body.incompletePlans).toEqual([]);
  });

  test('Integration: GET /context with <10 thoughts', async () => {
    await request(app)
      .post('/thoughts')
      .send({ content: 'Thought 1' })
      .expect(201);

    await new Promise(resolve => setTimeout(resolve, 10));

    await request(app)
      .post('/thoughts')
      .send({ content: 'Thought 2' })
      .expect(201);

    const response = await request(app)
      .get('/context')
      .expect(200);

    expect(response.body.last10Thoughts).toHaveLength(2);
    expect(response.body.last10Thoughts[0].content).toBe('Thought 2');
    expect(response.body.last10Thoughts[1].content).toBe('Thought 1');
  });

  test('Integration: GET /context with no thoughts', async () => {
    const response = await request(app)
      .get('/context')
      .expect(200);

    expect(response.body.last10Thoughts).toEqual([]);
  });

  test('Integration: GET /context with no plans', async () => {
    const response = await request(app)
      .get('/context')
      .expect(200);

    expect(response.body.incompletePlans).toEqual([]);
  });

  test('Integration: GET /context verifies filtering/limiting/sorting with >10 thoughts', async () => {
    // Create 12 thoughts
    for (let i = 1; i <= 12; i++) {
      await request(app)
        .post('/thoughts')
        .send({ content: `Thought ${i}` })
        .expect(201);
    }

    // Create mixed plans
    await request(app)
      .post('/plans')
      .send({ title: 'Early Incomplete', description: 'Desc 1' })
      .expect(201);

    await request(app)
      .post('/plans')
      .send({ title: 'Later Complete', description: 'Desc 2' })
      .expect(201);

    await request(app)
      .patch('/plans/2')
      .send({ status: 'completed' })
      .expect(200);

    await request(app)
      .post('/plans')
      .send({ title: 'Later Incomplete', description: 'Desc 3' })
      .expect(201);

    const response = await request(app)
      .get('/context')
      .expect(200);

    // Incomplete plans: 1 and 3, sorted asc timestamp
    expect(response.body.incompletePlans).toHaveLength(2);
    expect(response.body.incompletePlans[0].title).toBe('Early Incomplete');
    expect(response.body.incompletePlans[1].title).toBe('Later Incomplete');

    // Last 10 thoughts: most recent 10, desc timestamp
    expect(response.body.last10Thoughts).toHaveLength(10);
    expect(response.body.last10Thoughts[0].content).toBe('Thought 12');
    expect(response.body.last10Thoughts[9].content).toBe('Thought 3');
  });
});