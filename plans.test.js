const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');

const app = require('./server');
const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');
const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');

describe('Plans API', () => {
  beforeAll(async () => {
    await fs.writeFile(DATA_FILE, '[]');
    await fs.writeFile(PLANS_FILE, '[]');
  });

  beforeEach(async () => {
    await fs.writeFile(DATA_FILE, '[]');
    await fs.writeFile(PLANS_FILE, '[]');
  });

  test('POST /plans with valid title and description succeeds and persists', async () => {
    const response = await request(app)
      .post('/plans')
      .send({ title: 'Test Plan', description: 'Test description' })
      .expect(201);

    expect(response.body).toHaveProperty('id', 1);
    expect(response.body).toHaveProperty('title', 'Test Plan');
    expect(response.body).toHaveProperty('description', 'Test description');
    expect(response.body).toHaveProperty('status', 'proposed');

    // Verify persistence
    const fileData = await fs.readFile(PLANS_FILE, 'utf8');
    const plans = JSON.parse(fileData);

    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe(1);
    expect(plans[0].title).toBe('Test Plan');
    expect(plans[0].description).toBe('Test description');
    expect(plans[0].status).toBe('proposed');
    expect(plans[0].timestamp).toBeDefined();
  });

  test('POST /plans with missing title returns 400', async () => {
    await request(app)
      .post('/plans')
      .send({ description: 'Test description' })
      .expect(400);
  });

  test('POST /plans with empty description returns 400', async () => {
    await request(app)
      .post('/plans')
      .send({ title: 'Test Plan', description: '' })
      .expect(400);
  });

  test('POST /plans allows duplicate titles with incrementing ID', async () => {
    await request(app)
      .post('/plans')
      .send({ title: 'Duplicate Plan', description: 'Description 1' })
      .expect(201);

    const secondResponse = await request(app)
      .post('/plans')
      .send({ title: 'Duplicate Plan', description: 'Description 2' })
      .expect(201);

    expect(secondResponse.body.id).toBe(2);
    expect(secondResponse.body.title).toBe('Duplicate Plan');
    expect(secondResponse.body.description).toBe('Description 2');
    expect(secondResponse.body.status).toBe('proposed');

    // Verify both persisted
    const fileData = await fs.readFile(PLANS_FILE, 'utf8');
    const plans = JSON.parse(fileData);

    expect(plans).toHaveLength(2);
    expect(plans[0].title).toBe('Duplicate Plan');
    expect(plans[1].title).toBe('Duplicate Plan');
    expect(plans[1].id).toBe(2);
  });

  test('Regression: POST /thoughts still works', async () => {
    const response = await request(app)
      .post('/thoughts')
      .send({ content: 'Test thought' })
      .expect(201);

    expect(response.body).toHaveProperty('id', '1');
    expect(response.body).toHaveProperty('content', 'Test thought');
    expect(response.body).toHaveProperty('timestamp');

    // Verify using GET /thoughts
    const getResponse = await request(app)
      .get('/thoughts')
      .expect(200);

    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0]).toEqual(response.body);
  });

  test('PATCH /plans/:id updates status successfully', async () => {
    // Create a plan first
    const createResponse = await request(app)
      .post('/plans')
      .send({ title: 'Test Plan', description: 'Test description' })
      .expect(201);

    const planId = createResponse.body.id;

    // Update status
    const updateResponse = await request(app)
      .patch(`/plans/${planId}`)
      .send({ status: 'in_progress' })
      .expect(200);

    expect(updateResponse.body).toEqual({ status: 'in_progress' });

    // Verify persistence with GET
    const getResponse = await request(app)
      .get(`/plans/${planId}`)
      .expect(200);

    expect(getResponse.body.status).toBe('in_progress');
    expect(getResponse.body.id).toBe(planId);
  });

  test('PATCH /plans/:id with invalid status returns 400', async () => {
    // Create a plan
    const createResponse = await request(app)
      .post('/plans')
      .send({ title: 'Test Plan', description: 'Test description' })
      .expect(201);

    const planId = createResponse.body.id;

    await request(app)
      .patch(`/plans/${planId}`)
      .send({ status: 'invalid_status' })
      .expect(400);
  });

  test('PATCH /plans/:id for non-existent plan returns 404', async () => {
    await request(app)
      .patch('/plans/999')
      .send({ status: 'completed' })
      .expect(404);
  });

  test('PATCH /plans/:id without status does nothing but succeeds', async () => {
    // Create a plan
    const createResponse = await request(app)
      .post('/plans')
      .send({ title: 'Test Plan', description: 'Test description' })
      .expect(201);

    const planId = createResponse.body.id;
    const originalStatus = createResponse.body.status;

    // PATCH without status
    const updateResponse = await request(app)
      .patch(`/plans/${planId}`)
      .send({})
      .expect(200);

    expect(updateResponse.body.status).toBe(originalStatus);

    // Verify no change
    const getResponse = await request(app)
      .get(`/plans/${planId}`)
      .expect(200);

    expect(getResponse.body.status).toBe(originalStatus);
  });

  test('GET /plans returns empty array when no plans exist', async () => {
    await fs.writeFile(PLANS_FILE, '[]');
    const response = await request(app)
      .get('/plans')
      .expect(200);
  
    expect(response.body).toEqual([]);
  });

  test('GET /plans returns plans sorted chronologically ascending', async () => {
    await fs.writeFile(PLANS_FILE, '[]');
    // Create plans with different timestamps (order implies ascending)
    await request(app)
      .post('/plans')
      .send({ title: 'First Plan', description: 'First description' })
      .expect(201);
  
    await request(app)
      .post('/plans')
      .send({ title: 'Second Plan', description: 'Second description' })
      .expect(201);
  
    const response = await request(app)
      .get('/plans')
      .expect(200);
  
    expect(response.body).toHaveLength(2);
    expect(response.body[0].title).toBe('First Plan');
    expect(response.body[1].title).toBe('Second Plan');
  
    // Verify timestamps ascending
    const timestamps = response.body.map(p => new Date(p.timestamp));
    expect(timestamps[0] < timestamps[1]).toBe(true);
  });

  test('GET /plans integrates with POST and PATCH, returns sorted with updated status', async () => {
    await fs.writeFile(PLANS_FILE, '[]');
    // Create first plan
    const firstResponse = await request(app)
      .post('/plans')
      .send({ title: 'Plan A', description: 'Desc A' })
      .expect(201);
  
    // Create second plan
    const secondResponse = await request(app)
      .post('/plans')
      .send({ title: 'Plan B', description: 'Desc B' })
      .expect(201);
  
    // Update second plan status
    await request(app)
      .patch(`/plans/${secondResponse.body.id}`)
      .send({ status: 'in_progress' })
      .expect(200);
  
    // GET all plans
    const getResponse = await request(app)
      .get('/plans')
      .expect(200);
  expect(getResponse.body).toHaveLength(2);
  expect(getResponse.body[0].title).toBe('Plan A');
  expect(getResponse.body[0].status).toBe('proposed');
  expect(getResponse.body[1].title).toBe('Plan B');
  expect(getResponse.body[1].status).toBe('in_progress');
  expect(getResponse.body[1].description).toBe('Desc B');
  expect(getResponse.body[1].timestamp).toBeDefined();

  // Timestamps ascending
  const timestamps = getResponse.body.map(p => new Date(p.timestamp));
  expect(timestamps[0] < timestamps[1]).toBe(true);
});
});

describe('Plan Thoughts Linking', () => {
test('GET /plans/:id/thoughts returns linked thoughts sorted by timestamp', async () => {
  // Create plan
  const planResponse = await request(app)
    .post('/plans')
    .send({ title: 'Test Plan', description: 'Test desc' })
    .expect(201);

  const planId = planResponse.body.id.toString();

  // Create two thoughts linked to plan
  await request(app)
    .post('/thoughts')
    .send({ content: 'First linked thought', plan_id: planId })
    .expect(201);

  const secondThought = await request(app)
    .post('/thoughts')
    .send({ content: 'Second linked thought', plan_id: planId })
    .expect(201);

  // GET linked thoughts
  const thoughtsResponse = await request(app)
    .get(`/plans/${planId}/thoughts`)
    .expect(200);

  expect(thoughtsResponse.body).toHaveLength(2);
  expect(thoughtsResponse.body[0].content).toBe('First linked thought');
  expect(thoughtsResponse.body[1].content).toBe('Second linked thought');

  // Verify timestamps ascending
  const timestamps = thoughtsResponse.body.map(t => new Date(t.timestamp));
  expect(timestamps[0] < timestamps[1]).toBe(true);
});

test('GET /plans/:id/thoughts returns empty array if no linked thoughts', async () => {
  // Create plan
  const planResponse = await request(app)
    .post('/plans')
    .send({ title: 'Test Plan', description: 'Test desc' })
    .expect(201);

  const planId = planResponse.body.id.toString();

  // Create a thought without plan_id
  await request(app)
    .post('/thoughts')
    .send({ content: 'Unlinked thought' })
    .expect(201);

  // GET linked thoughts
  const thoughtsResponse = await request(app)
    .get(`/plans/${planId}/thoughts`)
    .expect(200);

  expect(thoughtsResponse.body).toEqual([]);
});

test('GET /plans/:id/thoughts returns 404 for non-existent plan', async () => {
  await request(app)
    .get('/plans/999/thoughts')
    .expect(404);
});

test('GET /plans/:id/thoughts excludes thoughts with different plan_id', async () => {
  // Create plan 1
  const plan1Response = await request(app)
    .post('/plans')
    .send({ title: 'Plan 1', description: 'Desc 1' })
    .expect(201);

  const plan1Id = plan1Response.body.id.toString();

  // Create plan 2
  const plan2Response = await request(app)
    .post('/plans')
    .send({ title: 'Plan 2', description: 'Desc 2' })
    .expect(201);

  const plan2Id = plan2Response.body.id.toString();

  // Create thought for plan 2
  await request(app)
    .post('/thoughts')
    .send({ content: 'Thought for plan 2', plan_id: plan2Id })
    .expect(201);

  // GET for plan 1
  const thoughtsResponse = await request(app)
    .get(`/plans/${plan1Id}/thoughts`)
    .expect(200);

  expect(thoughtsResponse.body).toEqual([]);
});
});
