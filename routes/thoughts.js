const express = require('express');
const { Router } = express;
const { getAll, runSql, getDB } = require('../db/database.js');

const router = Router();

// POST /
router.post('/', async (req, res, next) => {
  try {
    const { content, plan_id, tags: inputTags } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required and cannot be empty' });
    }

    let tags = [];
    if (inputTags) {
      if (!Array.isArray(inputTags)) {
        return res.status(400).json({ error: 'Tags must be an array of strings' });
      }
      tags = inputTags.filter(tag => typeof tag === 'string' && tag.trim() !== '').map(tag => tag.trim().toLowerCase());
      const uniqueTags = [...new Set(tags)];
      if (uniqueTags.length !== tags.length) {
        return res.status(400).json({ error: 'Tags must not contain duplicates' });
      }
      if (uniqueTags.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 tags allowed' });
      }
      tags = uniqueTags;
    }

    const db = req.db || getDB();
    const timestamp = new Date().toISOString();
    const planIdParam = plan_id ? parseInt(plan_id) : null;
    if (plan_id && isNaN(planIdParam)) {
      return res.status(400).json({ error: 'Invalid plan_id' });
    }
    const result = await runSql(db, "INSERT INTO thoughts (timestamp, content, plan_id, tags) VALUES (?, ?, ?, ?)", [timestamp, content, planIdParam, JSON.stringify(tags)]);
    const id = result.lastID;
    console.log(`POST /thoughts: Inserted ID ${id}, content: "${content}"`);
    const newThought = {
      id: id.toString(),
      content,
      timestamp,
      ...(plan_id && { plan_id }),
      tags
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

    // Tags filtering
    if (req.query.tags) {
      const tagsValue = req.query.tags.toString().trim();
      let mode = 'any';
      let tagsList = [];
      if (tagsValue.startsWith('any:')) {
        tagsList = tagsValue.substring(4).split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      } else if (tagsValue.startsWith('all:')) {
        mode = 'all';
        tagsList = tagsValue.substring(4).split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      } else {
        tagsList = tagsValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
      }
      if (tagsList.length > 0) {
        const tagConditions = tagsList.map(tag => `tags LIKE '%"${tag}"%'`).join(mode === 'all' ? ' AND ' : ' OR ');
        whereClauses.push(`(${tagConditions})`);
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
      tags: JSON.parse(t.tags || '[]'),
      ...(t.plan_id && { plan_id: t.plan_id.toString() })
    }));
    console.log(`GET /thoughts: Returning ${responseThoughts.length} thoughts`);
    res.status(200).json(responseThoughts);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/tags', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { add, remove } = req.body;
    const thoughtId = parseInt(req.params.id);

    if (!add && !remove) {
      return res.status(400).json({ error: 'At least one of "add" or "remove" must be provided as arrays' });
    }

    const thought = await new Promise((resolve, reject) => {
      db.get("SELECT tags FROM thoughts WHERE id = ?", [thoughtId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!thought) {
      const err = new Error('Thought not found');
      err.status = 404;
      throw err;
    }

    let currentTags = JSON.parse(thought.tags || '[]');

    let newTags = [...currentTags];

    if (add) {
      if (!Array.isArray(add)) {
        return res.status(400).json({ error: '"add" must be an array of strings' });
      }
      const addTags = add.filter(tag => typeof tag === 'string' && tag.trim() !== '').map(tag => tag.trim().toLowerCase());
      const uniqueAdd = addTags.filter(tag => !newTags.includes(tag));
      newTags = [...new Set([...newTags, ...uniqueAdd])];
    }

    if (remove) {
      if (!Array.isArray(remove)) {
        return res.status(400).json({ error: '"remove" must be an array of strings' });
      }
      const removeTags = remove.filter(tag => typeof tag === 'string' && tag.trim() !== '').map(tag => tag.trim().toLowerCase());
      newTags = newTags.filter(tag => !removeTags.includes(tag));
    }

    if (newTags.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 tags allowed after operation' });
    }

    const now = Date.now();
    await new Promise((resolve, reject) => {
      db.run("UPDATE thoughts SET tags = ? WHERE id = ?", [JSON.stringify(newTags), thoughtId], function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

    const updatedThought = {
      id: thoughtId.toString(),
      tags: newTags
    };
    res.status(200).json(updatedThought);
  } catch (err) {
    next(err);
  }
});

module.exports = router;