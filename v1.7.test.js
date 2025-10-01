const request = require('supertest');
const { createApp } = require('./server.js');
const path = require('path');
const fs = require('fs').promises;

const DB_PATH = path.join(__dirname, 'data', 'tpc.db');

describe('v1.7 SQLite Migration - Migration Tests', () => {
  let app;
  let db;

  beforeAll(async () => {
    const instance = await createApp();
    app = instance.app;
    db = instance.db;
  });

  test('Migration loads data from JSON files on first run', async () => {
    const plansResponse = await request(app).get('/plans');
    expect(plansResponse.status).toBe(200);
    expect(Array.isArray(plansResponse.body)).toBe(true);
    expect(plansResponse.body.length).toBe(10); // From plans.json

    const thoughtsResponse = await request(app).get('/thoughts');
    expect(thoughtsResponse.status).toBe(200);
    expect(Array.isArray(thoughtsResponse.body)).toBe(true);
    expect(thoughtsResponse.body.length).toBe(1); // From thoughts.json
  });

  afterAll(() => {
    db.close();
  });
});

describe('v1.7 SQLite Migration - Regression Tests', () => {
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

  test('Data persists after write/read in DB session', async () => {
    const newPlanRes = await request(app)
      .post('/plans')
      .send({ title: 'Persistent Plan', description: 'Test desc' })
      .expect(201);

    const planId = newPlanRes.body.id;

    const getResponse = await request(app).get(`/plans/${planId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(planId);
    expect(getResponse.body.title).toBe('Persistent Plan');
  });

  test('Concurrent requests do not corrupt data', async () => {
    const planPromises = [
      request(app).post('/plans').send({ title: 'Concurrent 1', description: 'Desc 1' }),
      request(app).post('/plans').send({ title: 'Concurrent 2', description: 'Desc 2' }),
      request(app).post('/plans').send({ title: 'Concurrent 3', description: 'Desc 3' })
    ];

    const responses = await Promise.all(planPromises);
    expect(responses.every(r => r.status === 201)).toBe(true);

    const getPlans = await request(app).get('/plans');
    expect(getPlans.body.length).toBe(3);
  });

  test('POST /thoughts creates and persists thought', async () => {
    const response = await request(app)
      .post('/thoughts')
      .send({ content: 'Test thought v1.7' })
      .expect(201);

    expect(response.body.content).toBe('Test thought v1.7');
    expect(response.body.id).toBeDefined();
    expect(response.body.timestamp).toBeDefined();

    const getThoughts = await request(app).get('/thoughts');
    expect(getThoughts.body.length).toBe(1);
    expect(getThoughts.body[0].content).toBe('Test thought v1.7');
  });

  test('POST /thoughts with plan_id links to plan', async () => {
    const planRes = await request(app)
      .post('/plans')
      .send({ title: 'Linked Plan', description: 'Desc' })
      .expect(201);
    const planId = planRes.body.id;

    const thoughtRes = await request(app)
      .post('/thoughts')
      .send({ content: 'Linked thought', plan_id: planId.toString() })
      .expect(201);

    expect(thoughtRes.body.plan_id).toBe(planId.toString());

    const linkedThoughts = await request(app).get(`/plans/${planId}/thoughts`);
    expect(linkedThoughts.body.length).toBe(1);
    expect(linkedThoughts.body[0].content).toBe('Linked thought');
  });

  test('GET /thoughts returns all thoughts sorted by timestamp ASC', async () => {
    await request(app).post('/thoughts').send({ content: 'First' });
    await new Promise(resolve => setTimeout(resolve, 10));
    await request(app).post('/thoughts').send({ content: 'Second' });

    const response = await request(app).get('/thoughts');
    expect(response.body.length).toBe(2);
    expect(response.body[0].content).toBe('First');
    expect(response.body[1].content).toBe('Second');
  });

  test('POST /plans creates plan with default status', async () => {
    const response = await request(app)
      .post('/plans')
      .send({ title: 'New Plan v1.7', description: 'Test desc' })
      .expect(201);

    expect(response.body.status).toBe('proposed');
    expect(response.body.id).toBe(1);
  });

  test('GET /plans returns all plans sorted by timestamp ASC', async () => {
    await request(app).post('/plans').send({ title: 'Plan A', description: 'Desc A' });
    await new Promise(resolve => setTimeout(resolve, 10));
    await request(app).post('/plans').send({ title: 'Plan B', description: 'Desc B' });

    const response = await request(app).get('/plans');
    expect(response.body.length).toBe(2);
    expect(response.body[0].title).toBe('Plan A');
  });

  test('GET /plans/:id returns specific plan with changelog parsed', async () => {
    const postRes = await request(app)
      .post('/plans')
      .send({ title: 'Detailed Plan', description: 'Desc' })
      .expect(201);
    const id = postRes.body.id;

    await request(app)
      .patch(`/plans/${id}/changelog`)
      .send({ entry: 'Test entry' })
      .expect(200);

    const getRes = await request(app).get(`/plans/${id}`);
    expect(getRes.body.title).toBe('Detailed Plan');
    expect(Array.isArray(getRes.body.changelog)).toBe(true);
    expect(getRes.body.changelog.length).toBe(1);
    expect(getRes.body.changelog[0].entry).toBe('Test entry');
  });

  test('PATCH /plans/:id updates status', async () => {
    const postRes = await request(app)
      .post('/plans')
      .send({ title: 'Status Plan', description: 'Desc' })
      .expect(201);
    const id = postRes.body.id;

    await request(app)
      .patch(`/plans/${id}`)
      .send({ status: 'in_progress' })
      .expect(200);

    const getRes = await request(app).get(`/plans/${id}`);
    expect(getRes.body.status).toBe('in_progress');
  });

  test('PATCH /plans/:id/changelog appends entry', async () => {
    const postRes = await request(app)
      .post('/plans')
      .send({ title: 'Changelog Plan', description: 'Desc' })
      .expect(201);
    const id = postRes.body.id;

    const patchRes = await request(app)
      .patch(`/plans/${id}/changelog`)
      .send({ entry: 'First change' })
      .expect(200);

    expect(patchRes.body.changelog.length).toBe(1);
    expect(patchRes.body.changelog[0].entry).toBe('First change');

    await request(app)
      .patch(`/plans/${id}/changelog`)
      .send({ entry: 'Second change' })
      .expect(200);

    const getRes = await request(app).get(`/plans/${id}`);
    expect(getRes.body.changelog.length).toBe(2);
  });

  test('GET /plans/:id/thoughts returns linked thoughts', async () => {
    const postPlan = await request(app)
      .post('/plans')
      .send({ title: 'Thoughts Plan', description: 'Desc' })
      .expect(201);
    const planId = postPlan.body.id;

    await request(app)
      .post('/thoughts')
      .send({ content: 'Unlinked' })
      .expect(201);

    await request(app)
      .post('/thoughts')
      .send({ content: 'Linked', plan_id: planId.toString() })
      .expect(201);

    const response = await request(app).get(`/plans/${planId}/thoughts`);
    expect(response.body.length).toBe(1);
    expect(response.body[0].content).toBe('Linked');
  });

  test('GET /context returns incomplete plans and last 10 thoughts DESC', async () => {
    // Create completed plan
    await request(app)
      .post('/plans')
      .send({ title: 'Completed', description: 'Desc' });
    const completedId = 1;
    await request(app).patch(`/plans/${completedId}`).send({ status: 'completed' });

    // Incomplete
    await request(app)
      .post('/plans')
      .send({ title: 'Incomplete 1', description: 'Desc' });
    await request(app)
      .post('/plans')
      .send({ title: 'Incomplete 2', description: 'Desc' });

    // Create 12 thoughts with delays for timestamps
    for (let i = 0; i < 12; i++) {
      await request(app).post('/thoughts').send({ content: `Thought ${i}` });
      if (i < 11) await new Promise(resolve => setTimeout(resolve, 1));
    }

    const response = await request(app).get('/context');
    expect(response.body.incompletePlans.length).toBe(2);
    expect(response.body.last10Thoughts.length).toBe(10);
    expect(response.body.last10Thoughts[0].content).toBe('Thought 11'); // Most recent
    expect(response.body.last10Thoughts[9].content).toBe('Thought 2'); // Oldest in last10
  });

  test('Error handling: Invalid inputs return 400', async () => {
    await request(app)
      .post('/thoughts')
      .send({ content: '' })
      .expect(400);

    await request(app)
      .post('/plans')
      .send({ title: '', description: 'Desc' })
      .expect(400);

    const planRes = await request(app)
      .post('/plans')
      .send({ title: 'Invalid Status Plan', description: 'Desc' })
      .expect(201);
    const id = planRes.body.id;
    await request(app)
      .patch(`/plans/${id}`)
      .send({ status: 'invalid' })
      .expect(400);

    await request(app)
      .patch(`/plans/${id}/changelog`)
      .send({ entry: '' })
      .expect(400);
  });

  test('Non-existent resources return 404', async () => {
    await request(app).get('/plans/999').expect(404);
    await request(app).get('/plans/999/thoughts').expect(404);
    await request(app).patch('/plans/999').send({ status: 'proposed' }).expect(404);
    await request(app).patch('/plans/999/changelog').send({ entry: 'test' }).expect(404);
  });

  test('Empty DB returns empty arrays', async () => {
    const plansRes = await request(app).get('/plans');
    expect(plansRes.body).toEqual([]);

    const thoughtsRes = await request(app).get('/thoughts');
    expect(thoughtsRes.body).toEqual([]);

    const contextRes = await request(app).get('/context');
    expect(contextRes.body.incompletePlans).toEqual([]);
    expect(contextRes.body.last10Thoughts).toEqual([]);
  });
});