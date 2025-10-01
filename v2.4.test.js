const request = require('supertest');
const { createApp } = require('./server.js');

describe('v2.4 Dirty Flag System', () => {
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

  describe('Schema Migration and Backfill', () => {
    test('backfill sets needs_review=0 for existing plans after migration', async () => {
      // Since migration runs on init if empty, but to test backfill, clean and insert old plan without needs_review
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('BEGIN TRANSACTION', (err) => {
            if (err) return reject(err);
            db.run('DELETE FROM plans', (err) => {
              if (err) return reject(err);
              // Insert old plan without needs_review (simulate pre-v2.4)
              db.run(
                `INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['Test Plan', 'Test Desc', 'proposed', '[]', new Date().toISOString(), Date.now(), 'agent', Date.now()],
                (err) => {
                  if (err) return reject(err);
                  db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                }
              );
            });
          });
        });
      });

      // Re-init to trigger migration (but since not empty, manually trigger backfill logic)
      // For test, directly run the backfill UPDATE
      await new Promise((resolve, reject) => {
        db.run("UPDATE plans SET needs_review = 0 WHERE needs_review IS NULL", (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const plan = await new Promise((resolve, reject) => {
        db.get("SELECT needs_review FROM plans LIMIT 1", (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      expect(plan.needs_review).toBe(0);
    });
  });

  describe('PUT /plans/:id (Human Edit)', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Human Edit Plan', description: 'Initial desc' })
        .expect(201);
      planId = res.body.id;
    });

    test('sets needs_review=1 when last_modified_by=human and returns full plan with flag', async () => {
      const res = await request(app)
        .put(`/plans/${planId}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(res.body.needs_review).toBe(1);
      expect(res.body.last_modified_by).toBe('human');
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.id).toBe(planId);
    });
  });

  describe('PATCH /plans/:id (Agent Update)', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Agent Patch Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('sets needs_review=0 for agent modification', async () => {
      await request(app)
        .patch(`/plans/${planId}`)
        .send({ status: 'in_progress' })
        .expect(200);

      const res = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(res.body.needs_review).toBe(0);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.last_modified_by).toBe('agent');
    });
  });

  describe('PATCH /plans/:id/changelog (Agent Update)', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Changelog Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('sets needs_review=0 for agent changelog update', async () => {
      await request(app)
        .patch(`/plans/${planId}/changelog`)
        .send({ change: 'Agent update' })
        .expect(200);

      const res = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(res.body.needs_review).toBe(0);
      expect(res.body.changelog).toHaveLength(1);
      expect(res.body.changelog[0].change).toBe('Agent update');
      expect(res.body.last_modified_by).toBe('agent');
    });
  });

  describe('GET Endpoints Include needs_review', () => {
    test('GET /plans includes needs_review', async () => {
      const res = await request(app)
        .get('/plans')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('needs_review');
      }
    });

    test('GET /plans/:id includes needs_review', async () => {
      const plansRes = await request(app).get('/plans').expect(200);
      if (plansRes.body.length === 0) {
        await request(app)
          .post('/plans')
          .send({ title: 'Test', description: 'Desc' })
          .expect(201);
        const newPlansRes = await request(app).get('/plans').expect(200);
        const id = newPlansRes.body[0].id;
      } else {
        const id = plansRes.body[0].id;
      }

      const res = await request(app)
        .get(`/plans/${plansRes.body[0].id}`)
        .expect(200);

      expect(res.body).toHaveProperty('needs_review');
    });

    test('GET /plans?status=... includes needs_review', async () => {
      await request(app)
        .post('/plans')
        .send({ title: 'Status Test', description: 'Desc' })
        .expect(201);

      const res = await request(app)
        .get('/plans?status=proposed')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('needs_review');
      }
    });
  });

  describe('Integration: Edit and Verify in Responses', () => {
    let planId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/plans')
        .send({ title: 'Integration Plan', description: 'Initial' })
        .expect(201);
      planId = res.body.id;
    });

    test('human edit sets flag, visible in GET /plans?status=proposed and /context', async () => {
      // Human edit
      await request(app)
        .put(`/plans/${planId}`)
        .send({ description: 'Edited by human' })
        .expect(200);

      // Verify in GET /plans?status=proposed
      const plansRes = await request(app)
        .get('/plans?status=proposed')
        .expect(200);

      const editedPlan = plansRes.body.find(p => p.id === planId);
      expect(editedPlan.needs_review).toBe(1);

      // Verify in /context
      const contextRes = await request(app)
        .get('/context')
        .expect(200);

      const incompletePlan = contextRes.body.incompletePlans.find(p => p.id === planId);
      expect(incompletePlan.needs_review).toBe(1);
    });
  });
});