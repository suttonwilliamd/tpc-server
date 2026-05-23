const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let globalDb = null;
const GLOBAL_DB_PATH = path.join(__dirname, '..', 'data', 'tpc.db');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 7;

async function ensureWritableDBPath(dbPath) {
  const dir = path.dirname(dbPath);
  await fs.mkdir(dir, { recursive: true });

  // Best-effort permission normalization. Ignore chmod errors on filesystems that don't support it.
  try { await fs.chmod(dir, 0o775); } catch {}

  if (fssync.existsSync(dbPath)) {
    try { await fs.chmod(dbPath, 0o664); } catch {}
  }
}

// Low-level query helpers
async function _getAll(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function _getOne(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function _runSql(db, sql, params = []) {
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Convenience query helpers
async function getAll(db, table, filters = {}) {
  let sql = `SELECT * FROM ${table}`;
  let params = [];
  let conditions = [];

  if (filters.id !== undefined) {
    conditions.push('id = ?');
    params.push(filters.id);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.needs_review !== undefined) {
    conditions.push('needs_review = ?');
    params.push(filters.needs_review ? 1 : 0);
  }
  if (filters.since !== undefined) {
    if (table === 'plans') {
      conditions.push('created_at >= ?');
      params.push(filters.since);
    } else if (table === 'thoughts') {
      const sinceIso = new Date(filters.since).toISOString();
      conditions.push('timestamp >= ?');
      params.push(sinceIso);
    }
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  if (table === 'plans') {
    sql += ' ORDER BY created_at ASC';
  } else if (table === 'thoughts') {
    sql += ' ORDER BY timestamp ASC';
  } else {
    sql += ' ORDER BY id ASC';
  }

  if (table === 'thoughts' && filters.limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(filters.limit));
  }

  return await _getAll(db, sql, params);
}

async function getOne(db, table, id) {
  return await _getOne(db, `SELECT * FROM ${table} WHERE id = ?`, [id]);
}

async function runSql(db, sql, params = []) {
  return await _runSql(db, sql, params);
}

// Clean DB function
async function cleanDB(db) {
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

// Migration function
async function performMigration(db, skipMigration = false) {
  // Create tables
  await Promise.all([
    new Promise((res, rej) => {
      db.run(`CREATE TABLE IF NOT EXISTS thoughts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        content TEXT NOT NULL,
        plan_id TEXT,
        tags TEXT DEFAULT '[]'
      )`, (err) => err ? rej(err) : res());
    }),
    new Promise((res, rej) => {
      db.run(`CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'proposed',
        changelog TEXT DEFAULT '[]',
        timestamp TEXT NOT NULL,
        created_at INTEGER,
        last_modified_by TEXT DEFAULT 'agent',
        last_modified_at INTEGER,
        tags TEXT DEFAULT '[]'
      )`, (err) => err ? rej(err) : res());
    }),
    new Promise((res, rej) => {
      db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`, (err) => err ? rej(err) : res());
    })
  ]);

  // Get current plan columns
  const planColumns = await new Promise((res, rej) => {
    db.all("PRAGMA table_info(plans)", (err, rows) => {
      if (err) rej(err);
      else res(rows.map(r => r.name));
    });
  });
  console.log(`plan columns: ${planColumns.join(', ')}`);

  // Add missing columns
  if (!planColumns.includes('created_at')) {
    console.log('Adding created_at');
    await runSql(db, 'ALTER TABLE plans ADD COLUMN created_at INTEGER');
    await runSql(db, "UPDATE plans SET created_at = CAST(strftime('%s', timestamp) AS INTEGER) * 1000 WHERE created_at IS NULL");
  }

  if (!planColumns.includes('last_modified_by')) {
    console.log('Adding last_modified_by');
    await runSql(db, 'ALTER TABLE plans ADD COLUMN last_modified_by TEXT DEFAULT "agent"');
    await runSql(db, "UPDATE plans SET last_modified_by = 'agent' WHERE last_modified_by IS NULL");
  }

  if (!planColumns.includes('last_modified_at')) {
    console.log('Adding last_modified_at');
    await runSql(db, 'ALTER TABLE plans ADD COLUMN last_modified_at INTEGER');
    await runSql(db, "UPDATE plans SET last_modified_at = created_at WHERE last_modified_at IS NULL");
  }

  if (!planColumns.includes('needs_review')) {
    console.log('Adding needs_review');
    await runSql(db, 'ALTER TABLE plans ADD COLUMN needs_review INTEGER DEFAULT 0');
    await runSql(db, "UPDATE plans SET needs_review = 0 WHERE needs_review IS NULL");
  }

  // Get current thought columns
  const thoughtColumns = await new Promise((res, rej) => {
    db.all("PRAGMA table_info(thoughts)", (err, rows) => {
      if (err) rej(err);
      else res(rows.map(r => r.name));
    });
  });
  console.log(`thought columns: ${thoughtColumns.join(', ')}`);

  if (!thoughtColumns.includes('tags')) {
    console.log('Adding tags to thoughts');
    await runSql(db, 'ALTER TABLE thoughts ADD COLUMN tags TEXT DEFAULT "[]"');
    await runSql(db, "UPDATE thoughts SET tags = '[]' WHERE tags IS NULL");
  }

  // Add indexes on tags
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_plans_tags ON plans(tags)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_thoughts_tags ON thoughts(tags)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_plans_status_last_modified ON plans(status, last_modified_at DESC)');
  await runSql(db, 'CREATE INDEX IF NOT EXISTS idx_thoughts_timestamp ON thoughts(timestamp DESC)');

  // FTS5 virtual table for thought search performance
  await runSql(db, `
    CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts
    USING fts5(content, tags, content='thoughts', content_rowid='id')
  `);

  // Keep FTS table in sync with base table (idempotent trigger setup)
  await runSql(db, 'DROP TRIGGER IF EXISTS thoughts_ai');
  await runSql(db, 'DROP TRIGGER IF EXISTS thoughts_ad');
  await runSql(db, 'DROP TRIGGER IF EXISTS thoughts_au');

  await runSql(db, `
    CREATE TRIGGER thoughts_ai AFTER INSERT ON thoughts BEGIN
      INSERT INTO thoughts_fts(rowid, content, tags) VALUES (new.id, new.content, COALESCE(new.tags, '[]'));
    END
  `);

  await runSql(db, `
    CREATE TRIGGER thoughts_ad AFTER DELETE ON thoughts BEGIN
      INSERT INTO thoughts_fts(thoughts_fts, rowid, content, tags) VALUES('delete', old.id, old.content, COALESCE(old.tags, '[]'));
    END
  `);

  await runSql(db, `
    CREATE TRIGGER thoughts_au AFTER UPDATE ON thoughts BEGIN
      INSERT INTO thoughts_fts(thoughts_fts, rowid, content, tags) VALUES('delete', old.id, old.content, COALESCE(old.tags, '[]'));
      INSERT INTO thoughts_fts(rowid, content, tags) VALUES (new.id, new.content, COALESCE(new.tags, '[]'));
    END
  `);

  // Rebuild index from canonical table to ensure sync for pre-existing rows
  await runSql(db, "INSERT INTO thoughts_fts(thoughts_fts) VALUES('rebuild')");

  // Mark baseline migration if missing
  await runSql(
    db,
    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'))"
  );

  if (skipMigration) {
    console.log(`skipMigration=${skipMigration}`);
    return;
  }

  console.log('Running migration (JSON import)');

  // Import plans if empty
  const planCount = await new Promise((res, rej) => {
    db.get("SELECT COUNT(*) as cnt FROM plans", (err, row) => {
      if (err) rej(err);
      else res(row.cnt);
    });
  });

  if (planCount === 0) {
    try {
      const PLANS_FILE = path.join(__dirname, '..', 'data', 'plans.json');
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

  // Import thoughts if empty
  const thoughtCount = await new Promise((res, rej) => {
    db.get("SELECT COUNT(*) as cnt FROM thoughts", (err, row) => {
      if (err) rej(err);
      else res(row.cnt);
    });
  });

  if (thoughtCount === 0) {
    try {
      const THOUGHTS_FILE = path.join(__dirname, '..', 'data', 'thoughts.json');
      const data = await fs.readFile(THOUGHTS_FILE, 'utf8');
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
                console.log(`Inserted thought ID: ${this.lastID}, content: ${thought.content.substring(0, 50)}...`);
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

// Main initDB function
async function initDB(dbPath, skipMigration = false) {
  await ensureWritableDBPath(dbPath);
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      performMigration(db, skipMigration).then(() => {
        if (dbPath === GLOBAL_DB_PATH) {
          globalDb = db;
        }
        resolve(db);
      }).catch(reject);
    });
  });
}

// Global functions
function getDB() {
  if (!globalDb) throw new Error('Global DB not initialized');
  return globalDb;
}

async function rotateBackupIfNeeded() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const dbBackups = files.filter((f) => f.endsWith('.db')).sort();
    while (dbBackups.length >= MAX_BACKUPS) {
      const oldest = dbBackups.shift();
      await fs.unlink(path.join(BACKUP_DIR, oldest));
    }
  } catch {
    // ignore if backup dir does not exist yet
  }
}

async function backupGlobalDB() {
  if (process.env.NODE_ENV === 'test') return;
  if (!fssync.existsSync(GLOBAL_DB_PATH)) return;

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await rotateBackupIfNeeded();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `tpc-${stamp}.db`);
  await fs.copyFile(GLOBAL_DB_PATH, target);
}

async function initGlobalDB(skipMigration = false) {
  await backupGlobalDB();
  globalDb = await initDB(GLOBAL_DB_PATH, skipMigration);
}

module.exports = {
  initDB,
  cleanDB,
  getDB,
  initGlobalDB,
  getAll,
  getOne,
  runSql
};