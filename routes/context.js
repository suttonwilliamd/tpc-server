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
    const searchQuery = req.query.search ? req.query.search.toString().trim() : '';
    const escapedQuery = searchQuery ? `%${searchQuery}%` : '%';

    let incompletePlansQuery = "SELECT * FROM plans WHERE status != 'completed'";
    let plansParams = [];
    if (searchQuery) {
      incompletePlansQuery += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)";
      plansParams = [escapedQuery, escapedQuery, escapedQuery];
    }
    incompletePlansQuery += " ORDER BY timestamp ASC";
    const incompletePlansRaw = await getAll(db, incompletePlansQuery, plansParams);
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

    let thoughtsQuery = "SELECT * FROM thoughts";
    let thoughtsParams = [];
    if (searchQuery) {
      thoughtsQuery += " WHERE (content LIKE ? OR tags LIKE ?)";
      thoughtsParams = [escapedQuery, escapedQuery];
    }
    thoughtsQuery += " ORDER BY timestamp DESC LIMIT 10";
    const filteredThoughtsRaw = await getAll(db, thoughtsQuery, thoughtsParams);
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