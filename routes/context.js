const express = require('express');
const { Router } = express;
const path = require('path');
const { getDB } = require('../db/database.js');
const { buildSearchQuery } = require('../db/search.js');

const router = Router();

async function getAll(db, sql, params = []) {
  db = db || getDB();
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// GET /
router.get('/', async (req, res, next) => {
  try {
    const unknown = Object.keys(req.query).find(key => key !== 'search');
    if (unknown) return res.status(400).json({ error: `Unknown context parameter: ${unknown}` });
    const db = req.db || getDB();
    const searchQuery = req.query.search;
    let incompletePlansRaw;
    let filteredThoughtsRaw;
    if (searchQuery !== undefined) {
      const plans = buildSearchQuery({ q: searchQuery, type: 'plans', limit: 50 }, { incompletePlans: true, fullRows: true });
      const thoughts = buildSearchQuery({ q: searchQuery, type: 'thoughts', limit: 10 }, { fullRows: true });
      incompletePlansRaw = await getAll(db, plans.sql, plans.params);
      filteredThoughtsRaw = await getAll(db, thoughts.sql, thoughts.params);
    } else {
      incompletePlansRaw = await getAll(db, "SELECT * FROM plans WHERE status != 'completed' ORDER BY timestamp ASC");
      filteredThoughtsRaw = await getAll(db, 'SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10');
    }
    const incompletePlans = incompletePlansRaw.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      timestamp: p.timestamp,
      created_at: p.created_at,
      last_modified_at: p.last_modified_at,
      last_modified_by: p.last_modified_by,
      needs_review: p.needs_review,
      changelog: JSON.parse(p.changelog),
      tags: JSON.parse(p.tags || '[]')
    }));

    // Preserve the context response shape; search-only score/type columns stay internal.
    const last10Thoughts = filteredThoughtsRaw.map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      tags: JSON.parse(t.tags || '[]'),
      ...(t.plan_id && { plan_id: t.plan_id })
    }));

    console.log(`GET /context: search="${searchQuery}", incompletePlans=${incompletePlans.length}, last10Thoughts=${last10Thoughts.length}`);
    res.status(200).json({ incompletePlans, last10Thoughts });
  } catch (err) {
    next(err);
  }
});

// GET /tpc.db (disabled in production unless explicitly enabled)
router.get('/tpc.db', (req, res, next) => {
  try {
    const allowDbDownload = process.env.NODE_ENV !== 'production' || process.env.EXPOSE_TPC_DB === 'true';
    if (!allowDbDownload) {
      return res.status(403).json({ error: 'Database download is disabled' });
    }
    const dbPath = path.join(__dirname, '..', 'data', 'tpc.db');
    res.sendFile(dbPath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;