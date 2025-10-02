const request = require('supertest');
const { createApp } = require('./server.js');

describe('v2.6 Markdown Support', () => {
  let app;
  let db;

  beforeAll(async () => {
    ({ app, db } = await createApp({ skipMigration: false }));
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve, reject) => {
        db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  describe('PUT /plans/:id with Markdown description', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Markdown Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('accepts Markdown in description, stores raw, sets needs_review=1 and last_modified_by=human', async () => {
      const markdown = '**bold** text with *italics*';
      const res = await request(app)
        .put(`/plans/${planId}`)
        .send({ description: markdown })
        .expect(200);

      expect(res.body.description).toBe(markdown);
      expect(res.body.needs_review).toBe(1);
      expect(res.body.last_modified_by).toBe('human');
      expect(res.body.title).toBe('Markdown Plan'); // unchanged
      expect(res.body.id).toBe(planId);
    });
  });

  describe('GET /plans/:id returns raw Markdown', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Get Markdown Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;

      const markdown = '**bold** text';
      await request(app)
        .put(`/plans/${planId}`)
        .send({ description: markdown })
        .expect(200);
    });

    test('returns plan with exact raw Markdown in description', async () => {
      const res = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(res.body.description).toBe('**bold** text');
      expect(res.body.id).toBe(planId);
    });
  });

  describe('GET /plans includes raw Markdown', () => {
    let markdownPlanId;

    beforeAll(async () => {
      // Plain plan
      await request(app)
        .post('/plans')
        .send({ title: 'Plain Plan', description: 'Plain text' })
        .expect(201);

      // Markdown plan
      const res = await request(app)
        .post('/plans')
        .send({ title: 'List Markdown Plan', description: 'Initial' })
        .expect(201);
      markdownPlanId = res.body.id;

      const markdown = '**bold** in list';
      await request(app)
        .put(`/plans/${markdownPlanId}`)
        .send({ description: markdown })
        .expect(200);
    });

    test('list includes plans with raw Markdown in description', async () => {
      const res = await request(app)
        .get('/plans')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const markdownPlan = res.body.find(p => p.id === markdownPlanId);
      expect(markdownPlan).toBeDefined();
      expect(markdownPlan.description).toBe('**bold** in list');
      expect(markdownPlan.needs_review).toBe(1);
    });
  });

  describe('GET /context includes raw Markdown', () => {
    let markdownPlanId;

    beforeAll(async () => {
      // Complete plan (excluded)
      await request(app)
        .post('/plans')
        .send({ title: 'Complete', description: 'Desc', status: 'completed' })
        .expect(201);

      // Incomplete markdown plan
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Context Markdown Plan', description: 'Initial', status: 'proposed' })
        .expect(201);
      markdownPlanId = res.body.id;

      const markdown = '**bold** in context';
      await request(app)
        .put(`/plans/${markdownPlanId}`)
        .send({ description: markdown })
        .expect(200);
    });

    test('includes incomplete plans with raw Markdown in description', async () => {
      const res = await request(app)
        .get('/context')
        .expect(200);

      expect(res.body).toHaveProperty('incompletePlans');
      expect(Array.isArray(res.body.incompletePlans)).toBe(true);

      const markdownPlan = res.body.incompletePlans.find(p => p.id === markdownPlanId);
      expect(markdownPlan).toBeDefined();
      expect(markdownPlan.description).toBe('**bold** in context');
      expect(markdownPlan.needs_review).toBe(1);
      expect(markdownPlan.status).toBe('proposed');
    });
  });

  describe('PUT /plans/:id with plain text', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Plain Text Plan', description: 'Initial plain' })
        .expect(201);
      planId = res.body.id;
    });

    test('stores and returns plain text unchanged', async () => {
      const plain = 'Simple plain text';
      const res = await request(app)
        .put(`/plans/${planId}`)
        .send({ description: plain })
        .expect(200);

      expect(res.body.description).toBe(plain);
      expect(res.body.needs_review).toBe(1);
      expect(res.body.last_modified_by).toBe('human');
      expect(res.body.title).toBe('Plain Text Plan'); // unchanged
    });
  });

  describe('PUT /plans/:id with empty description', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Empty Test Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('returns 400 error for empty description', async () => {
      await request(app)
        .put(`/plans/${planId}`)
        .send({ description: '' })
        .expect(400);
    });
  });

  describe('PUT /plans/:id with invalid plan ID', () => {
    test('returns 404 for invalid ID', async () => {
      await request(app)
        .put('/plans/invalid-id')
        .send({ description: 'Test' })
        .expect(404);
    });
  });

  describe('PUT /plans/:id does not impact other fields or thoughts endpoints', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Unchanged Fields Plan', description: 'Initial', status: 'proposed' })
        .expect(201);
      planId = res.body.id;
    });

    test('other fields like title and status remain unchanged', async () => {
      const markdown = '**bold** text';
      const res = await request(app)
        .put(`/plans/${planId}`)
        .send({ description: markdown })
        .expect(200);

      expect(res.body.title).toBe('Unchanged Fields Plan');
      expect(res.body.status).toBe('proposed');
      expect(res.body.description).toBe(markdown);
    });

    test('thoughts endpoints unaffected', async () => {
      // Create a thought
      const thoughtRes = await request(app)
        .post('/thoughts')
        .send({ content: 'Test thought', plan_id: planId })
        .expect(201);

      // GET thoughts
      const getThoughts = await request(app)
        .get('/thoughts')
        .expect(200);

      expect(Array.isArray(getThoughts.body)).toBe(true);
      expect(getThoughts.body.length).toBeGreaterThan(0);
      const testThought = getThoughts.body.find(t => t.content === 'Test thought');
      expect(testThought).toBeDefined();
      expect(Number(testThought.plan_id)).toBe(planId);
    });
  });
});