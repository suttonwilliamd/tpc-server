const request = require('supertest');
const fs = require('fs').promises;
const path = require('path');

const app = require('./server');
const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');

describe('Thoughts API', () => {
  beforeEach(async () => {
    await fs.writeFile(DATA_FILE, '[]');
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
});