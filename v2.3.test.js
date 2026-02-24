const request = require('supertest');
const { createApp } = require('./server.js');

describe('v2.3 Plan Editing API', () => {
  let app;
  let db;

  beforeAll(async () => {
    const { app: localApp, db: localDb } = await createApp({ skipMigration: true });
    app = localApp;
    db = localDb;

    // Insert a test plan
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['Test Plan', 'Test Description', 'proposed', '[]', new Date().toISOString(), Date.now(), 'agent', Date.now()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM plans', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      db.close();
    }
  });

  describe('PUT /plans/:id', () => {
    it('should update title partially and set last_modified_by to human', async () => {
      const planId = 1;
      const response = await request(app)
        .put(`/plans/${planId}`)
        .send({ title: 'Updated Title' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
      expect(response.body.description).toBe('Test Description');
      expect(response.body.last_modified_by).toBe('human');
      expect(response.body.last_modified_at).toBeGreaterThanOrEqual(Date.now() - 1000);
      expect(response.body.id).toBe(planId);
    });

    it('should update description partially', async () => {
      const planId = 1;
      const response = await request(app)
        .put(`/plans/${planId}`)
        .send({ description: 'Updated Description' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.description).toBe('Updated Description');
      expect(response.body.last_modified_by).toBe('human');
    });

    it('should update both title and description', async () => {
      const planId = 1;
      const response = await request(app)
        .put(`/plans/${planId}`)
        .send({ title: 'New Title', description: 'New Description' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.title).toBe('New Title');
      expect(response.body.description).toBe('New Description');
      expect(response.body.last_modified_by).toBe('human');
    });

    it('should return 400 for empty title', async () => {
      const response = await request(app)
        .put('/plans/1')
        .send({ title: '' })
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.error).toBe('Title cannot be empty if provided');
    });

    it('should return 400 if no fields provided', async () => {
      const response = await request(app)
        .put('/plans/1')
        .send({})
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.error).toBe('At least one field must be provided');
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await request(app)
        .put('/plans/999')
        .send({ title: 'Test' })
        .set('Content-Type', 'application/json')
        .expect(404);

      expect(response.body.error).toBe('Plan not found');
    });

    it('should return full updated plan including all fields', async () => {
      const planId = 1;
      const response = await request(app)
        .put(`/plans/${planId}`)
        .send({ title: 'Full Update' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('last_modified_at');
      expect(response.body).toHaveProperty('last_modified_by');
      expect(response.body).toHaveProperty('changelog');
    });
  });

  describe('Integration with GET /plans/:id', () => {
    it('should reflect PUT changes in GET', async () => {
      const planId = 1;
      await request(app)
        .put(`/plans/${planId}`)
        .send({ title: 'Integrated Title' })
        .set('Content-Type', 'application/json')
        .expect(200);

      const getResponse = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(getResponse.body.title).toBe('Integrated Title');
      expect(getResponse.body.last_modified_by).toBe('human');
    });
  });

  describe('Agent updates via PATCH', () => {
    it('PATCH /plans/:id should set last_modified_by to agent', async () => {
      const planId = 1;
      const response = await request(app)
        .patch(`/plans/${planId}`)
        .send({ status: 'in_progress' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.status).toBe('in_progress');

      const getResponse = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(getResponse.body.last_modified_by).toBe('agent');
      expect(getResponse.body.last_modified_at).toBeGreaterThanOrEqual(Date.now() - 1000);
    });

    it('PATCH /plans/:id/changelog should set last_modified_by to agent', async () => {
      const planId = 1;
      const response = await request(app)
        .patch(`/plans/${planId}/changelog`)
        .send({ change: 'Agent update' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body.changelog).toHaveLength(1);
      expect(response.body.changelog[0].change).toBe('Agent update');

      const getResponse = await request(app)
        .get(`/plans/${planId}`)
        .expect(200);

      expect(getResponse.body.last_modified_by).toBe('agent');
    });
  });

  describe('Backfill for existing data', () => {
    beforeAll(async () => {
      // Insert a plan without new fields (simulating pre-v2.3)
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO plans (title, description, status, changelog, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['Old Plan', 'Old Description', 'proposed', '[]', new Date().toISOString(), Date.now()],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // Simulate backfill migration
      await new Promise((res, rej) => {
        db.run("UPDATE plans SET last_modified_by = 'agent' WHERE last_modified_by IS NULL", (err) => {
          if (err) rej(err); else res();
        });
      });
      await new Promise((res, rej) => {
        db.run("UPDATE plans SET last_modified_at = created_at WHERE last_modified_at IS NULL", (err) => {
          if (err) rej(err); else res();
        });
      });
    });

    it('should have backfilled last_modified_by and last_modified_at after migration', async () => {
      const response = await request(app)
        .get('/plans')
        .expect(200);

      console.log(`Test backfill: GET /plans response body:`, response.body);

      const oldPlan = response.body.find(p => p.title === 'Old Plan');
      expect(oldPlan).toBeDefined();
      expect(oldPlan.last_modified_by).toBe('agent');
      expect(oldPlan.last_modified_at).toBeDefined();
      expect(oldPlan.last_modified_at).toEqual(oldPlan.created_at);
    });
  });

  describe('Compatibility with filters', () => {
    it('GET /plans with ?status should include updated plans', async () => {
      // Create a new proposed plan for this test
      const newPlanRes = await request(app)
        .post('/plans')
        .send({ title: 'To Update', description: 'Desc' })
        .set('Content-Type', 'application/json')
        .expect(201);
      const newPlanId = newPlanRes.body.id;

      await request(app)
        .put(`/plans/${newPlanId}`)
        .send({ title: 'Filtered Title' })
        .set('Content-Type', 'application/json')
        .expect(200);

      const response = await request(app)
        .get('/plans?status=proposed')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      const updatedPlan = response.body.find(p => p.title === 'Filtered Title');
      expect(updatedPlan).toBeDefined();
      expect(updatedPlan.last_modified_by).toBe('human');
    });

    it('GET /plans with ?since should include updated plans', async () => {
      const since = Date.now() - 10000; // 10s ago
      const response = await request(app)
        .get(`/plans?since=${since}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.some(p => p.last_modified_by === 'human')).toBe(true);
    });
  });

  describe('POST /plans sets agent fields', () => {
    it('should set last_modified_by and last_modified_at to agent on create', async () => {
      const response = await request(app)
        .post('/plans')
        .send({ title: 'New Plan', description: 'New Description' })
        .set('Content-Type', 'application/json')
        .expect(201);

      expect(response.body.id).toBeDefined();

      const getResponse = await request(app)
        .get(`/plans/${response.body.id}`)
        .expect(200);

      expect(getResponse.body.last_modified_by).toBe('agent');
      expect(getResponse.body.last_modified_at).toEqual(getResponse.body.created_at);
    });
  });
});