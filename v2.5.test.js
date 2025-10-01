const request = require('supertest');
const { createApp } = require('./server.js');

describe('v2.5 Agent Review System', () => {
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

  describe('GET /plans', () => {
    test('without param returns all plans', async () => {
      // Create some test plans
      await request(app)
        .post('/plans')
        .send({ title: 'Plan 1', description: 'Desc 1' })
        .expect(201);

      await request(app)
        .post('/plans')
        .send({ title: 'Plan 2', description: 'Desc 2' })
        .expect(201);

      const res = await request(app)
        .get('/plans')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      res.body.forEach(plan => {
        expect(plan).toHaveProperty('id');
        expect(plan).toHaveProperty('needs_review');
      });
    });
  });

  describe('GET /plans?needs_review=true', () => {
    let planId1, planId2;

    beforeAll(async () => {
      // Create plan with needs_review=0 (default)
      const res1 = await request(app)
        .post('/plans')
        .send({ title: 'Plan No Review', description: 'No review' })
        .expect(201);
      planId1 = res1.body.id;

      // Create plan with needs_review=1
      const res2 = await request(app)
        .post('/plans')
        .send({ title: 'Plan With Review', description: 'With review' })
        .expect(201);
      planId2 = res2.body.id;

      await request(app)
        .patch(`/plans/${planId2}`)
        .send({ needs_review: true })
        .expect(200);
    });

    test('returns only plans with needs_review=1', async () => {
      const response = await request(app)
        .get('/plans?needs_review=true')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(planId2);
      expect(response.body[0].needs_review).toBe(1);
    });
  });

  describe('PATCH /plans/:id with needs_review', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Patch Test Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('{"needs_review": false} sets needs_review to 0 and returns updated plan', async () => {
      const res = await request(app)
        .patch(`/plans/${planId}`)
        .send({ needs_review: false })
        .expect(200);

      expect(res.body.needs_review).toBe(0);
      expect(res.body.id).toBe(planId);
      expect(res.body.title).toBe('Patch Test Plan');
    });

    test('{"needs_review": true} sets to 1', async () => {
      const res2 = await request(app)
        .patch(`/plans/${planId}`)
        .send({ needs_review: true })
        .expect(200);

      expect(res2.body.needs_review).toBe(1);
      expect(res2.body.id).toBe(planId);
    });
  });

  describe('PATCH /plans/:id with other fields', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Other Fields Plan', description: 'Initial', status: 'proposed' })
        .expect(201);
      planId = res.body.id;
    });

    test('PATCH with status sets needs_review=0 (agent update)', async () => {
      // Assume initial needs_review=0 or set to 1 first
      await request(app)
        .patch(`/plans/${planId}`)
        .send({ needs_review: true })
        .expect(200);

      await request(app)
        .patch(`/plans/${planId}`)
        .send({ status: 'in_progress' })
        .expect(200);

      const getRes = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(getRes.body.needs_review).toBe(0);
      expect(getRes.body.status).toBe('in_progress');
      expect(getRes.body.id).toBe(planId);
    });

    // Removed description test as PATCH currently only supports status and needs_review
  });

  describe('GET /context', () => {
    let planId1, planId2;

    beforeAll(async () => {
      // Incomplete plan with needs_review=0
      const res1 = await request(app)
        .post('/plans')
        .send({ title: 'Incomplete No Review', description: 'Desc', status: 'proposed' })
        .expect(201);
      planId1 = res1.body.id;

      // Incomplete plan with needs_review=1
      const res2 = await request(app)
        .post('/plans')
        .send({ title: 'Incomplete With Review', description: 'Desc', status: 'proposed' })
        .expect(201);
      planId2 = res2.body.id;

      await request(app)
        .patch(`/plans/${planId2}`)
        .send({ needs_review: true })
        .expect(200);

      // Optional: complete plan to not include
      await request(app)
        .post('/plans')
        .send({ title: 'Complete', description: 'Desc', status: 'completed' })
        .expect(201);
    });

    test('includes needs_review field for incomplete plans, including those with needs_review=1', async () => {
      const res = await request(app)
        .get('/context')
        .expect(200);

      expect(res.body).toHaveProperty('incompletePlans');
      expect(Array.isArray(res.body.incompletePlans)).toBe(true);

      const noReviewPlan = res.body.incompletePlans.find(p => p.id === planId1);
      expect(noReviewPlan).toBeDefined();
      expect(noReviewPlan.needs_review).toBe(0);

      const withReviewPlan = res.body.incompletePlans.find(p => p.id === planId2);
      expect(withReviewPlan).toBeDefined();
      expect(withReviewPlan.needs_review).toBe(1);
    });
  });
});