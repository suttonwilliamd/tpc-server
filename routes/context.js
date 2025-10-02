const express = require('express');
const { Router } = express;
const path = require('path');
const { getDB } = require('../db/database.js');

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
    const db = req.db || getDB();
    const incompletePlansRaw = await getAll(db,
      "SELECT * FROM plans WHERE status != 'completed' ORDER BY timestamp ASC"
    );
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
      changelog: JSON.parse(p.changelog)
    }));

    const allThoughtsRaw = await getAll(db, "SELECT * FROM thoughts ORDER BY timestamp DESC");
    const last10Thoughts = allThoughtsRaw.slice(0, 10).map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      ...(t.plan_id && { plan_id: t.plan_id })
    }));

    console.log(`GET /context: incompletePlans=${incompletePlans.length}, last10Thoughts=${last10Thoughts.length}`);
    res.status(200).json({ incompletePlans, last10Thoughts });
  } catch (err) {
    next(err);
  }
});

// GET /tpc.db
router.get('/tpc.db', (req, res, next) => {
  try {
    const dbPath = path.join(__dirname, '..', 'data', 'tpc.db');
    res.sendFile(dbPath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;