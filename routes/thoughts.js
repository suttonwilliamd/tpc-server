const express = require('express');
const { Router } = express;
const { getAll, runSql, getDB } = require('../db/database.js');

const router = Router();

// POST /
router.post('/', async (req, res, next) => {
  try {
    const { content, plan_id } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required and cannot be empty' });
    }

    const db = req.db || getDB();
    const timestamp = new Date().toISOString();
    const planIdParam = plan_id ? parseInt(plan_id) : null;
    if (plan_id && isNaN(planIdParam)) {
      return res.status(400).json({ error: 'Invalid plan_id' });
    }
    const result = await runSql(db, "INSERT INTO thoughts (timestamp, content, plan_id) VALUES (?, ?, ?)", [timestamp, content, planIdParam]);
    const id = result.lastID;
    console.log(`POST /thoughts: Inserted ID ${id}, content: "${content}"`);
    const newThought = {
      id: id.toString(),
      content,
      timestamp,
      ...(plan_id && { plan_id })
    };

    res.status(201).json(newThought);
  } catch (err) {
    next(err);
  }
});

// GET /
router.get('/', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    let sql = "SELECT * FROM thoughts";
    let params = [];
    let whereClauses = [];
    if (req.query.since) {
      const since = Number(req.query.since);
      if (!isNaN(since)) {
        const sinceIso = new Date(since).toISOString();
        whereClauses.push("timestamp >= ?");
        params.push(sinceIso);
      }
    }
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY timestamp ASC";
    const limit = req.query.limit;
    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        sql += " LIMIT ?";
        params.push(limitNum);
      }
      // ignore invalid or <=0
    }
    const rawThoughts = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    const responseThoughts = rawThoughts.map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      ...(t.plan_id && { plan_id: t.plan_id.toString() })
    }));
    console.log(`GET /thoughts: Returning ${responseThoughts.length} thoughts`);
    res.status(200).json(responseThoughts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;