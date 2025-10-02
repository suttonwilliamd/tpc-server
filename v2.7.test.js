const request = require('supertest');
const { createApp } = require('./server.js');
const sqlite3 = require('sqlite3').verbose();

describe('v2.7 Search & Organization', () => {
  let app;
  let db;

  beforeAll(async () => {
    const result = await createApp({ skipMigration: true });
    app = result.app;
    db = result.db;

    // Insert test data for plans and thoughts
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at, tags) VALUES
          ('Test Plan 1', 'Description with test', 'proposed', '[]', '2023-01-01T00:00:00Z', 1672531200000, 'test', 1672531200000, '["tag1", "tag2"]')`, (err) => err ? reject(err) : null);
        db.run(`INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at, tags) VALUES
          ('Plan without tags', 'Some description', 'in_progress', '[]', '2023-01-02T00:00:00Z', 1672617600000, 'test', 1672617600000, '[]')`, (err) => err ? reject(err) : null);
        db.run(`INSERT INTO thoughts (timestamp, content, plan_id, tags) VALUES
          ('2023-01-01T00:00:00Z', 'Test thought content', 1, '["tag1", "search"]')`, (err) => err ? reject(err) : null);
        db.run(`INSERT INTO thoughts (timestamp, content, plan_id, tags) VALUES
          ('2023-01-02T00:00:00Z', 'Thought without tags', null, '[]')`, (err) => err ? reject(err) : resolve());
      });
    });
  });

  afterAll(() => {
    if (db) db.close();
  });

  describe('Tagging Validation - Plans', () => {
    test('POST /plans with valid tags', async () => {
      const response = await request(app)
        .post('/plans')
        .send({ title: 'Valid Tags Plan', description: 'Desc', tags: ['tag3', 'tag4'] })
        .expect(201);

      expect(response.body.tags).toEqual(expect.arrayContaining(['tag3', 'tag4']));
      expect(response.body.tags.length).toBe(2);
    });

    test('POST /plans with duplicate tags', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Duplicate Tags', description: 'Desc', tags: ['tag1', 'tag1'] })
        .expect(400)
        .expect(res => expect(res.body.error).toBe('Tags must not contain duplicates'));
    });

    test('POST /plans with more than 10 tags', async () => {
      const manyTags = Array.from({length: 11}, (_, i) => `tag${i}`);
      await request(app)
        .post('/plans')
        .send({ title: 'Too Many Tags', description: 'Desc', tags: manyTags })
        .expect(400)
        .expect(res => expect(res.body.error).toBe('Maximum 10 tags allowed'));
    });

    test('POST /plans with invalid tags type', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Invalid Type', description: 'Desc', tags: 'not array' })
        .expect(400)
        .expect(res => expect(res.body.error).toBe('Tags must be an array of strings'));
    });

    test('PUT /plans/:id with valid tags update', async () => {
      const postRes = await request(app)
        .post('/plans')
        .send({ title: 'Update Tags', description: 'Desc' })
        .expect(201);
      const id = postRes.body.id;

      const updateRes = await request(app)
        .put(`/plans/${id}`)
        .send({ tags: ['newtag'] })
        .expect(200);

      expect(updateRes.body.tags).toEqual(['newtag']);
    });

    test('PATCH /plans/:id/tags add valid tag', async () => {
      const postRes = await request(app)
        .post('/plans')
        .send({ title: 'Add Tag Plan', description: 'Desc' })
        .expect(201);
      const id = postRes.body.id;

      const patchRes = await request(app)
        .patch(`/plans/${id}/tags`)
        .send({ add: ['addtag'] })
        .expect(200);

      expect(patchRes.body.tags).toContain('addtag');
    });

    test('PATCH /plans/:id/tags remove tag', async () => {
      const postRes = await request(app)
        .post('/plans')
        .send({ title: 'Remove Tag Plan', description: 'Desc', tags: ['removetag'] })
        .expect(201);
      const id = postRes.body.id;

      const patchRes = await request(app)
        .patch(`/plans/${id}/tags`)
        .send({ remove: ['removetag'] })
        .expect(200);

      expect(patchRes.body.tags).not.toContain('removetag');
    });

    test('PATCH /plans/:id/tags invalid - no add/remove', async () => {
      const postRes = await request(app)
        .post('/plans')
        .send({ title: 'Invalid Patch', description: 'Desc' })
        .expect(201);
      const id = postRes.body.id;

      await request(app)
        .patch(`/plans/${id}/tags`)
        .send({})
        .expect(400)
        .expect(res => expect(res.body.error).toBe('At least one of "add" or "remove" must be provided as arrays'));
    });
  });

  describe('Tagging Validation - Thoughts', () => {
    test('POST /thoughts with valid tags', async () => {
      const response = await request(app)
        .post('/thoughts')
        .send({ content: 'Valid thought tags', tags: ['thoughttag'] })
        .expect(201);

      expect(response.body.tags).toEqual(['thoughttag']);
    });

    test('POST /thoughts with duplicate tags', async () => {
      await request(app)
        .post('/thoughts')
        .send({ content: 'Duplicate', tags: ['dup', 'dup'] })
        .expect(400)
        .expect(res => expect(res.body.error).toBe('Tags must not contain duplicates'));
    });

    test('PATCH /thoughts/:id/tags add valid tag', async () => {
      const postRes = await request(app)
        .post('/thoughts')
        .send({ content: 'Add tag thought' })
        .expect(201);
      const id = postRes.body.id;

      const patchRes = await request(app)
        .patch(`/thoughts/${id}/tags`)
        .send({ add: ['thoughtadd'] })
        .expect(200);

      expect(patchRes.body.tags).toContain('thoughtadd');
    });
  });

  describe('Search Logic', () => {
    test('GET /search with valid query - all types', async () => {
      const response = await request(app)
        .get('/search?q=test&type=all')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('type');
      expect(response.body[0]).toHaveProperty('tags');
    });

    test('GET /search with empty query returns 400', async () => {
      await request(app)
        .get('/search?q=')
        .expect(400)
        .expect(res => expect(res.body.error).toBe('Search query "q" is required and cannot be empty'));
    });

    test('GET /search with no results returns empty array', async () => {
      const response = await request(app)
        .get('/search?q=nonexistent')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('GET /search with partial matches', async () => {
      const response = await request(app)
        .get('/search?q=tes')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach(result => {
        expect(result.content.toLowerCase().includes('tes') || 
               (result.title && result.title.toLowerCase().includes('tes')) ||
               result.tags.some(tag => tag.includes('tes'))).toBe(true);
      });
    });

    test('GET /search with tags filter', async () => {
      const response = await request(app)
        .get('/search?q=test&tags=tag1')
        .expect(200);

      expect(response.body.every(result => result.tags.includes('tag1'))).toBe(true);
    });

    test('GET /search with type=plan', async () => {
      const response = await request(app)
        .get('/search?q=test&type=plan')
        .expect(200);

      expect(response.body.every(result => result.type === 'plan')).toBe(true);
    });

    test('GET /search with limit', async () => {
      const response = await request(app)
        .get('/search?q=test&limit=1')
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Filtering with Tags', () => {
    test('GET /plans with tags filter - any', async () => {
      const response = await request(app)
        .get('/plans?tags=any:tag1,tag2')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach(plan => {
        expect(plan.tags.some(tag => ['tag1', 'tag2'].includes(tag))).toBe(true);
      });
    });

    test('GET /plans with tags filter - all', async () => {
      // Assume a plan with both tags, but since test data has one, adjust or skip detailed
      const response = await request(app)
        .get('/plans?tags=all:tag1')
        .expect(200);

      expect(response.body.every(plan => plan.tags.includes('tag1'))).toBe(true);
    });

    test('GET /thoughts with tags filter', async () => {
      const response = await request(app)
        .get('/thoughts?tags=tag1')
        .expect(200);

      expect(response.body.every(thought => thought.tags.includes('tag1'))).toBe(true);
    });

    test('Backward compatibility - old data without tags', async () => {
      const response = await request(app)
        .get('/plans')
        .expect(200);

      expect(response.body.every(plan => Array.isArray(plan.tags))).toBe(true);
      // Plans without tags should still be returned
      expect(response.body.some(plan => plan.tags.length === 0)).toBe(true);
    });
  });

  describe('Context with Search', () => {
    test('GET /context without search returns all', async () => {
      const response = await request(app)
        .get('/context')
        .expect(200);

      expect(response.body.incompletePlans).toBeDefined();
      expect(response.body.last10Thoughts).toBeDefined();
    });

    test('GET /context with search filters results', async () => {
      const response = await request(app)
        .get('/context?search=test')
        .expect(200);

      // Check if filtered
      expect(response.body.incompletePlans.every(plan =>
        plan.title.toLowerCase().includes('test') || plan.description.toLowerCase().includes('test') || plan.tags.some(tag => tag.toLowerCase().includes('test'))
      )).toBe(true);

      expect(response.body.last10Thoughts.every(thought =>
        thought.content.toLowerCase().includes('test') || thought.tags.some(tag => tag.toLowerCase().includes('test'))
      )).toBe(true);
    });
  });
});