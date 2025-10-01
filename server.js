const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = 3000;

// Standalone query functions that take db as first param
async function getAll(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getOne(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function runSql(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Local cleanDB that always resets sequences
async function localCleanDB(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) return reject(err);
        db.run('DELETE FROM thoughts', (err) => {
          if (err) return reject(err);
          db.run('DELETE FROM plans', (err) => {
            if (err) return reject(err);
            db.run('COMMIT', (err) => {
              if (err) reject(err);
              else {
                // Always reset AUTOINCREMENT sequences
                db.run('DELETE FROM sqlite_sequence WHERE name = "plans"', (err) => {
                  if (err) return reject(err);
                  db.run('DELETE FROM sqlite_sequence WHERE name = "thoughts"', (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }
            });
          });
        });
      });
    });
  });
}

// Local initDB with migration
async function localInitDB(db, dbPath, skipMigration = false) {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      Promise.all([
        new Promise((res, rej) => {
          db.run(`CREATE TABLE IF NOT EXISTS thoughts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            content TEXT NOT NULL,
            plan_id TEXT
          )`, (err) => err ? rej(err) : res());
        }),
        new Promise((res, rej) => {
          db.run(`CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'proposed',
            changelog TEXT DEFAULT '[]',
            timestamp TEXT NOT NULL
          )`, (err) => err ? rej(err) : res());
        })
      ]).then(async () => {
        if (!skipMigration) {
          // Migrate plans if empty
          const planCount = await new Promise((res, rej) => {
            db.get("SELECT COUNT(*) as cnt FROM plans", (err, row) => {
              if (err) rej(err);
              else res(row.cnt);
            });
          });

          if (planCount === 0) {
            try {
              const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');
              const data = await fs.readFile(PLANS_FILE, 'utf8');
              const plans = JSON.parse(data);
              console.log(`Parsed ${plans.length} plans from JSON`);
              let inserted = 0;
              for (const plan of plans) {
                await new Promise((res, rej) => {
                  db.run("INSERT INTO plans (title, description, status, changelog, timestamp) VALUES (?, ?, ?, ?, ?)",
                    [plan.title, plan.description, plan.status, JSON.stringify(plan.changelog || []), plan.timestamp],
                    function(err) {
                      if (err) {
                        console.error(`Insert plan failed: ${err.message}`);
                        rej(err);
                      } else {
                        console.log(`Inserted plan ID: ${this.lastID}, title: ${plan.title}`);
                        inserted++;
                        res();
                      }
                    });
                });
              }
              console.log(`Plans migration completed: ${inserted} inserted successfully`);
            } catch (e) {
              console.error('Plans migration failed:', e);
            }
          }

          // Migrate thoughts if empty
          const thoughtCount = await new Promise((res, rej) => {
            db.get("SELECT COUNT(*) as cnt FROM thoughts", (err, row) => {
              if (err) rej(err);
              else res(row.cnt);
            });
          });

          if (thoughtCount === 0) {
            try {
              const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');
              const data = await fs.readFile(DATA_FILE, 'utf8');
              const thoughts = JSON.parse(data);
              console.log(`Parsed ${thoughts.length} thoughts from JSON`);
              let inserted = 0;
              for (const thought of thoughts) {
                await new Promise((res, rej) => {
                  db.run("INSERT INTO thoughts (timestamp, content, plan_id) VALUES (?, ?, ?)",
                    [thought.timestamp, thought.content, thought.plan_id || null],
                    function(err) {
                      if (err) {
                        console.error(`Insert thought failed: ${err.message}`);
                        rej(err);
                      } else {
                        console.log(`Inserted thought ID: ${this.lastID}, content: ${thought.content}`);
                        inserted++;
                        res();
                      }
                    });
                });
              }
              console.log(`Thoughts migration completed: ${inserted} inserted successfully`);
            } catch (e) {
              console.error('Thoughts migration failed:', e);
            }
          }
        }

        resolve(db);
      }).catch(reject);
    });
  });
}

// Factory to create isolated app and db
async function createApp({ skipMigration = false } = {}) {
  const localApp = express();
  const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'data', 'tpc.db');
  let localDb;

  // Init DB with optional migration
  localDb = await localInitDB(localDb, dbPath, skipMigration);

  localApp.use(express.json());

  // POST /thoughts
  localApp.post('/thoughts', async (req, res) => {
    const { content, plan_id } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required and cannot be empty' });
    }

    try {
      const timestamp = new Date().toISOString();
      const result = await runSql(localDb,
        "INSERT INTO thoughts (timestamp, content, plan_id) VALUES (?, ?, ?)",
        [timestamp, content, plan_id || null]
      );
      const id = result.lastID;
      console.log(`POST /thoughts: Inserted ID ${id}, content: "${content}"`);
      const newThought = {
        id: id.toString(),
        content,
        timestamp,
        ...(plan_id && { plan_id })
      };

      res.status(201).json(newThought);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /plans
  localApp.post('/plans', async (req, res) => {
    const { title, description } = req.body;

    if (!title || title.trim() === '' || !description || description.trim() === '') {
      return res.status(400).json({ error: 'Title and description are required and cannot be empty' });
    }

    try {
      const timestamp = new Date().toISOString();
      const status = "proposed";
      const changelog = "[]";

      const result = await runSql(localDb,
        "INSERT INTO plans (title, description, status, changelog, timestamp) VALUES (?, ?, ?, ?, ?)",
        [title, description, status, changelog, timestamp]
      );

      const id = result.lastID;
      console.log(`POST /plans: Inserted ID ${id}, title: "${title}"`);

      res.status(201).json({ id, title, description, status });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /plans/:id
  localApp.get('/plans/:id', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await getOne(localDb, "SELECT * FROM plans WHERE id = ?", [planId]);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }
      const responsePlan = {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        timestamp: plan.timestamp,
        changelog: JSON.parse(plan.changelog)
      };
      res.status(200).json(responsePlan);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /plans/:id - Update status
  localApp.patch('/plans/:id', async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['proposed', 'in_progress', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: proposed, in_progress, completed' });
    }

    try {
      const planId = parseInt(req.params.id);
      if (status) {
        await runSql(localDb, "UPDATE plans SET status = ? WHERE id = ?", [status, planId]);
      }

      const updated = await getOne(localDb, "SELECT status FROM plans WHERE id = ?", [planId]);
      if (!updated) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      res.status(200).json({ status: updated.status });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /plans/:id/changelog
  localApp.patch('/plans/:id/changelog', async (req, res) => {
    const { entry } = req.body;

    if (!entry || entry.trim() === '') {
      return res.status(400).json({ error: 'Entry is required and cannot be empty' });
    }

    try {
      const planId = parseInt(req.params.id);
      const plan = await getOne(localDb, "SELECT changelog FROM plans WHERE id = ?", [planId]);
      if (!plan) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      let changelog = JSON.parse(plan.changelog || '[]');
      const timestamp = new Date().toISOString();
      changelog.push({ timestamp, entry: entry.trim() });

      await runSql(localDb, "UPDATE plans SET changelog = ? WHERE id = ?", [JSON.stringify(changelog), planId]);

      const updatedPlan = await getOne(localDb, "SELECT * FROM plans WHERE id = ?", [planId]);
      const responsePlan = {
        id: updatedPlan.id,
        title: updatedPlan.title,
        description: updatedPlan.description,
        status: updatedPlan.status,
        timestamp: updatedPlan.timestamp,
        changelog
      };
      res.status(200).json(responsePlan);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /plans
  localApp.get('/plans', async (req, res) => {
    try {
      const validStatuses = ['proposed', 'in_progress', 'completed'];
      let whereClauses = [];
      let sqlParams = [];
      const since = req.query.since;
      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          whereClauses.push("timestamp >= ?");
          sqlParams.push(since);
        }
      }
      if (req.query.status && validStatuses.includes(req.query.status)) {
        whereClauses.push("status = ?");
        sqlParams.push(req.query.status);
      }
      let sql = "SELECT * FROM plans";
      if (whereClauses.length > 0) {
        sql += " WHERE " + whereClauses.join(" AND ");
      }
      sql += " ORDER BY timestamp ASC";
      let plans = await getAll(localDb, sql, sqlParams);
      plans = plans.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        timestamp: p.timestamp,
        changelog: JSON.parse(p.changelog)
      }));
      console.log(`GET /plans: Returning ${plans.length} plans`);
      res.status(200).json(plans);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /plans/:id/thoughts
  localApp.get('/plans/:id/thoughts', async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await getOne(localDb, "SELECT * FROM plans WHERE id = ?", [planId]);
      if (!plan) {
        return res.status(200).json([]);
      }

      const thoughts = await getAll(localDb,
        "SELECT * FROM thoughts WHERE plan_id = ? ORDER BY timestamp ASC",
        [req.params.id]
      );
      const responseThoughts = thoughts.map(t => ({
        id: t.id.toString(),
        content: t.content,
        timestamp: t.timestamp,
        plan_id: t.plan_id
      }));
      res.status(200).json(responseThoughts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /thoughts
  localApp.get('/thoughts', async (req, res) => {
    try {
      const since = req.query.since;
      let whereClauses = [];
      let sqlParams = [];
      if (since) {
        const sinceDate = new Date(since);
        if (!isNaN(sinceDate.getTime())) {
          whereClauses.push("timestamp >= ?");
          sqlParams.push(since);
        }
      }
      let sql = "SELECT * FROM thoughts";
      if (whereClauses.length > 0) {
        sql += " WHERE " + whereClauses.join(" AND ");
      }
      sql += " ORDER BY timestamp ASC";
      let rawThoughts = await getAll(localDb, sql, sqlParams);
      let thoughts = rawThoughts;
      const limitVal = req.query.limit ? parseInt(req.query.limit) : NaN;
      if (!isNaN(limitVal)) {
        if (limitVal <= 0) {
          thoughts = [];
        } else {
          thoughts = rawThoughts.slice(0, limitVal);
        }
      }
      const responseThoughts = thoughts.map(t => ({
        id: t.id.toString(),
        content: t.content,
        timestamp: t.timestamp,
        ...(t.plan_id && { plan_id: t.plan_id })
      }));
      console.log(`GET /thoughts: Returning ${responseThoughts.length} thoughts`);
      res.status(200).json(responseThoughts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /context
  localApp.get('/context', async (req, res) => {
    try {
      const incompletePlansRaw = await getAll(localDb,
        "SELECT * FROM plans WHERE status != 'completed' ORDER BY timestamp ASC"
      );
      const incompletePlans = incompletePlansRaw.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: p.status,
        timestamp: p.timestamp,
        changelog: JSON.parse(p.changelog)
      }));

      const allThoughtsRaw = await getAll(localDb, "SELECT * FROM thoughts ORDER BY timestamp DESC");
      const last10Thoughts = allThoughtsRaw.slice(0, 10).map(t => ({
        id: t.id.toString(),
        content: t.content,
        timestamp: t.timestamp,
        ...(t.plan_id && { plan_id: t.plan_id })
      }));

      console.log(`GET /context: incompletePlans=${incompletePlans.length}, last10Thoughts=${last10Thoughts.length}`);
      res.status(200).json({ incompletePlans, last10Thoughts });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return { app: localApp, db: localDb, cleanDB: () => localCleanDB(localDb) };
}

// Global app for production
const globalApp = express();
let globalDb;
const globalDBPath = path.join(__dirname, 'data', 'tpc.db');

// Global initDB (adapted)
async function initDB() {
  return new Promise((resolve, reject) => {
    globalDb = new sqlite3.Database(globalDBPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      Promise.all([
        new Promise((res, rej) => {
          globalDb.run(`CREATE TABLE IF NOT EXISTS thoughts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            content TEXT NOT NULL,
            plan_id TEXT
          )`, (err) => err ? rej(err) : res());
        }),
        new Promise((res, rej) => {
          globalDb.run(`CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'proposed',
            changelog TEXT DEFAULT '[]',
            timestamp TEXT NOT NULL
          )`, (err) => err ? rej(err) : res());
        })
      ]).then(async () => {
        // Same migration logic as local, but for globalDb
        const planCount = await new Promise((res, rej) => {
          globalDb.get("SELECT COUNT(*) as cnt FROM plans", (err, row) => {
            if (err) rej(err);
            else res(row.cnt);
          });
        });

        if (planCount === 0) {
          try {
            const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');
            const data = await fs.readFile(PLANS_FILE, 'utf8');
            const plans = JSON.parse(data);
            console.log(`Parsed ${plans.length} plans from JSON`);
            let inserted = 0;
            for (const plan of plans) {
              await new Promise((res, rej) => {
                globalDb.run("INSERT INTO plans (title, description, status, changelog, timestamp) VALUES (?, ?, ?, ?, ?)",
                  [plan.title, plan.description, plan.status, JSON.stringify(plan.changelog || []), plan.timestamp],
                  function(err) {
                    if (err) {
                      console.error(`Insert plan failed: ${err.message}`);
                      rej(err);
                    } else {
                      console.log(`Inserted plan ID: ${this.lastID}, title: ${plan.title}`);
                      inserted++;
                      res();
                    }
                  });
              });
            }
            console.log(`Plans migration completed: ${inserted} inserted successfully`);
          } catch (e) {
            console.error('Plans migration failed:', e);
          }
        }

        const thoughtCount = await new Promise((res, rej) => {
          globalDb.get("SELECT COUNT(*) as cnt FROM thoughts", (err, row) => {
            if (err) rej(err);
            else res(row.cnt);
          });
        });

        if (thoughtCount === 0) {
          try {
            const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');
            const data = await fs.readFile(DATA_FILE, 'utf8');
            const thoughts = JSON.parse(data);
            console.log(`Parsed ${thoughts.length} thoughts from JSON`);
            let inserted = 0;
            for (const thought of thoughts) {
              await new Promise((res, rej) => {
                globalDb.run("INSERT INTO thoughts (timestamp, content, plan_id) VALUES (?, ?, ?)",
                  [thought.timestamp, thought.content, thought.plan_id || null],
                  function(err) {
                    if (err) {
                      console.error(`Insert thought failed: ${err.message}`);
                      rej(err);
                    } else {
                      console.log(`Inserted thought ID: ${this.lastID}, content: ${thought.content}`);
                      inserted++;
                      res();
                    }
                  });
              });
            }
            console.log(`Thoughts migration completed: ${inserted} inserted successfully`);
          } catch (e) {
            console.error('Thoughts migration failed:', e);
          }
        }

        resolve();
      }).catch(reject);
    });
  });
}

// Global cleanDB
async function cleanDB() {
  if (!globalDb) await initDB();
  return new Promise((resolve, reject) => {
    globalDb.serialize(() => {
      globalDb.run('BEGIN TRANSACTION', (err) => {
        if (err) return reject(err);
        globalDb.run('DELETE FROM thoughts', (err) => {
          if (err) return reject(err);
          globalDb.run('DELETE FROM plans', (err) => {
            if (err) return reject(err);
            globalDb.run('COMMIT', (err) => {
              if (err) reject(err);
              else {
                // Always reset
                globalDb.run('DELETE FROM sqlite_sequence WHERE name = "plans"', (err) => {
                  if (err) return reject(err);
                  globalDb.run('DELETE FROM sqlite_sequence WHERE name = "thoughts"', (err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              }
            });
          });
        });
      });
    });
  });
}

// Attach routes to globalApp (duplicate logic for global)
globalApp.use(express.json());

// Duplicate POST /thoughts for global
globalApp.post('/thoughts', async (req, res) => {
  const { content, plan_id } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required and cannot be empty' });
  }

  try {
    const timestamp = new Date().toISOString();
    const result = await runSql(globalDb,
      "INSERT INTO thoughts (timestamp, content, plan_id) VALUES (?, ?, ?)",
      [timestamp, content, plan_id || null]
    );
    const id = result.lastID;
    console.log(`POST /thoughts: Inserted ID ${id}, content: "${content}"`);
    const newThought = {
      id: id.toString(),
      content,
      timestamp,
      ...(plan_id && { plan_id })
    };

    res.status(201).json(newThought);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate all other routes for globalApp... (to avoid duplication, actually call the same handlers, but for simplicity, duplicate as in original)

globalApp.post('/plans', async (req, res) => {
  const { title, description } = req.body;

  if (!title || title.trim() === '' || !description || description.trim() === '') {
    return res.status(400).json({ error: 'Title and description are required and cannot be empty' });
  }

  try {
    const timestamp = new Date().toISOString();
    const status = "proposed";
    const changelog = "[]";

    const result = await runSql(globalDb,
      "INSERT INTO plans (title, description, status, changelog, timestamp) VALUES (?, ?, ?, ?, ?)",
      [title, description, status, changelog, timestamp]
    );

    const id = result.lastID;
    console.log(`POST /plans: Inserted ID ${id}, title: "${title}"`);

    res.status(201).json({ id, title, description, status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.get('/plans/:id', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const plan = await getOne(globalDb, "SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    const responsePlan = {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      timestamp: plan.timestamp,
      changelog: JSON.parse(plan.changelog)
    };
    res.status(200).json(responsePlan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.patch('/plans/:id', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['proposed', 'in_progress', 'completed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: proposed, in_progress, completed' });
  }

  try {
    const planId = parseInt(req.params.id);
    if (status) {
      await runSql(globalDb, "UPDATE plans SET status = ? WHERE id = ?", [status, planId]);
    }

    const updated = await getOne(globalDb, "SELECT status FROM plans WHERE id = ?", [planId]);
    if (!updated) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    res.status(200).json({ status: updated.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.patch('/plans/:id/changelog', async (req, res) => {
  const { entry } = req.body;

  if (!entry || entry.trim() === '') {
    return res.status(400).json({ error: 'Entry is required and cannot be empty' });
  }

  try {
    const planId = parseInt(req.params.id);
    const plan = await getOne(globalDb, "SELECT changelog FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    let changelog = JSON.parse(plan.changelog || '[]');
    const timestamp = new Date().toISOString();
    changelog.push({ timestamp, entry: entry.trim() });

    await runSql(globalDb, "UPDATE plans SET changelog = ? WHERE id = ?", [JSON.stringify(changelog), planId]);

    const updatedPlan = await getOne(globalDb, "SELECT * FROM plans WHERE id = ?", [planId]);
    const responsePlan = {
      id: updatedPlan.id,
      title: updatedPlan.title,
      description: updatedPlan.description,
      status: updatedPlan.status,
      timestamp: updatedPlan.timestamp,
      changelog
    };
    res.status(200).json(responsePlan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.get('/plans', async (req, res) => {
  try {
    const validStatuses = ['proposed', 'in_progress', 'completed'];
    let whereClauses = [];
    let sqlParams = [];
    const since = req.query.since;
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        whereClauses.push("timestamp >= ?");
        sqlParams.push(since);
      }
    }
    if (req.query.status && validStatuses.includes(req.query.status)) {
      whereClauses.push("status = ?");
      sqlParams.push(req.query.status);
    }
    let sql = "SELECT * FROM plans";
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY timestamp ASC";
    let plans = await getAll(globalDb, sql, sqlParams);
    plans = plans.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      timestamp: p.timestamp,
      changelog: JSON.parse(p.changelog)
    }));
    console.log(`GET /plans: Returning ${plans.length} plans`);
    res.status(200).json(plans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.get('/plans/:id/thoughts', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const plan = await getOne(globalDb, "SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      return res.status(200).json([]);
    }

    const thoughts = await getAll(globalDb,
      "SELECT * FROM thoughts WHERE plan_id = ? ORDER BY timestamp ASC",
      [req.params.id]
    );
    const responseThoughts = thoughts.map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      plan_id: t.plan_id
    }));
    res.status(200).json(responseThoughts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.get('/thoughts', async (req, res) => {
  try {
    const since = req.query.since;
    let whereClauses = [];
    let sqlParams = [];
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        whereClauses.push("timestamp >= ?");
        sqlParams.push(since);
      }
    }
    let sql = "SELECT * FROM thoughts";
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY timestamp ASC";
    let rawThoughts = await getAll(globalDb, sql, sqlParams);
    let thoughts = rawThoughts;
    const limitVal = req.query.limit ? parseInt(req.query.limit) : NaN;
    if (!isNaN(limitVal)) {
      if (limitVal <= 0) {
        thoughts = [];
      } else {
        thoughts = rawThoughts.slice(0, limitVal);
      }
    }
    const responseThoughts = thoughts.map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      ...(t.plan_id && { plan_id: t.plan_id })
    }));
    console.log(`GET /thoughts: Returning ${responseThoughts.length} thoughts`);
    res.status(200).json(responseThoughts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

globalApp.get('/context', async (req, res) => {
  try {
    const incompletePlansRaw = await getAll(globalDb,
      "SELECT * FROM plans WHERE status != 'completed' ORDER BY timestamp ASC"
    );
    const incompletePlans = incompletePlansRaw.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      timestamp: p.timestamp,
      changelog: JSON.parse(p.changelog)
    }));

    const allThoughtsRaw = await getAll(globalDb, "SELECT * FROM thoughts ORDER BY timestamp DESC");
    const last10Thoughts = allThoughtsRaw.slice(0, 10).map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      ...(t.plan_id && { plan_id: t.plan_id })
    }));

    console.log(`GET /context: incompletePlans=${incompletePlans.length}, last10Thoughts=${last10Thoughts.length}`);
    res.status(200).json({ incompletePlans, last10Thoughts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  initDB().then(() => {
    globalApp.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(console.error);
}

module.exports = { app: globalApp, cleanDB, createApp };