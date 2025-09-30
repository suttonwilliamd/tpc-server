const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');

const app = require('./server');
const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');
const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');

describe('Plans API', () => {
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
});