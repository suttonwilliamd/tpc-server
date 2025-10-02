const express = require('express');
const Router = express.Router;
const sqlite3 = require('sqlite3').verbose();
const { getDB } = require('../db/database.js');

const router = new Router();

async function getAll(db, sql, params = []) {
  if (!db) db = getDB();
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getOne(db, sql, params = []) {
  if (!db) db = getDB();
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function runSql(db, sql, params = []) {
  if (!db) db = getDB();
  if (!db) throw new Error('DB not initialized');
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// POST /
router.post('/', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { title, description, tags: inputTags } = req.body;

    if (!title || title.trim() === '' || !description || description.trim() === '') {
      return res.status(400).json({ error: 'Title and description are required and cannot be empty' });
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

    const timestamp = new Date().toISOString();
    const status = "proposed";
    const changelog = "[]";

    const createdAt = Date.now();
    const result = await runSql(db,
      "INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at, needs_review, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      [title, description, status, changelog, timestamp, createdAt, 'agent', createdAt, JSON.stringify(tags)]
    );

    const id = result.lastID;
    console.log(`POST /plans: Inserted ID ${id}, title: "${title}"`);

    res.status(201).json({ id, title, description, status, timestamp, tags });
  } catch (err) {
    next(err);
  }
});

// GET /:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const planId = parseInt(req.params.id);
    const plan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }
    const responsePlan = {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      timestamp: plan.timestamp,
      created_at: plan.created_at,
      last_modified_at: plan.last_modified_at,
      last_modified_by: plan.last_modified_by,
      needs_review: plan.needs_review,
      changelog: JSON.parse(plan.changelog),
      tags: JSON.parse(plan.tags || '[]')
    };
    res.status(200).json(responsePlan);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id
router.patch('/:id', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { status, needs_review } = req.body;
    const validStatuses = ['proposed', 'in_progress', 'completed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: proposed, in_progress, completed' });
    }

    const planId = parseInt(req.params.id);
    let doUpdate = false;
    let updateFields = [];
    let params = [];

    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
      doUpdate = true;
    }

    if (needs_review !== undefined) {
      const nrValue = needs_review ? 1 : 0;
      updateFields.push('needs_review = ?');
      params.push(nrValue);
      doUpdate = true;
    } else if (status !== undefined) {
      updateFields.push('needs_review = ?');
      params.push(0);
    }

    let updatedPlan;
    if (doUpdate) {
      const now = Date.now();
      updateFields.push('last_modified_by = ?');
      updateFields.push('last_modified_at = ?');
      params.push('agent');
      params.push(now);

      const sql = `UPDATE plans SET ${updateFields.join(', ')} WHERE id = ?`;
      params.push(planId);

      const result = await runSql(db, sql, params);

      if (result.changes === 0) {
        const err = new Error('Plan not found');
        err.status = 404;
        throw err;
      }

      updatedPlan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    } else {
      const current = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
      if (!current) {
        const err = new Error('Plan not found');
        err.status = 404;
        throw err;
      }
      updatedPlan = current;
    }

    const responsePlan = {
      id: updatedPlan.id,
      title: updatedPlan.title,
      description: updatedPlan.description,
      status: updatedPlan.status,
      timestamp: updatedPlan.timestamp,
      created_at: updatedPlan.created_at,
      last_modified_at: updatedPlan.last_modified_at,
      last_modified_by: updatedPlan.last_modified_by,
      needs_review: updatedPlan.needs_review,
      changelog: JSON.parse(updatedPlan.changelog)
    };

    if (needs_review !== undefined) {
      res.status(200).json(responsePlan);
    } else {
      res.status(200).json({ status: updatedPlan.status });
    }
  } catch (err) {
    next(err);
  }
});

// PUT /:id
router.put('/:id', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { title, description, tags: inputTags } = req.body;

    let updateFields = [];
    let params = [];

    if (title !== undefined) {
      if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Title cannot be empty if provided' });
      }
      updateFields.push('title = COALESCE(?, title)');
      params.push(title.trim());
    }

    if (description !== undefined) {
      if (!description || description.trim() === '') {
        return res.status(400).json({ error: 'Description cannot be empty if provided' });
      }
      updateFields.push('description = COALESCE(?, description)');
      params.push(description.trim());
    }

    let tags = null;
    if (inputTags !== undefined) {
      if (inputTags === null) {
        tags = [];
      } else if (!Array.isArray(inputTags)) {
        return res.status(400).json({ error: 'Tags must be an array of strings or null' });
      } else {
        const processedTags = inputTags.filter(tag => typeof tag === 'string' && tag.trim() !== '').map(tag => tag.trim().toLowerCase());
        const uniqueTags = [...new Set(processedTags)];
        if (uniqueTags.length !== processedTags.length) {
          return res.status(400).json({ error: 'Tags must not contain duplicates' });
        }
        if (uniqueTags.length > 10) {
          return res.status(400).json({ error: 'Maximum 10 tags allowed' });
        }
        tags = uniqueTags;
      }
      updateFields.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'At least one field must be provided' });
    }

    const now = Date.now();
    const setClause = updateFields.join(', ') + ', last_modified_by = ?, last_modified_at = ?, needs_review = 1';
    params.push('human');
    params.push(now);

    const sql = `UPDATE plans SET ${setClause} WHERE id = ?`;
    params.push(parseInt(req.params.id));

    const planId = parseInt(req.params.id);
    const result = await runSql(db, sql, params);

    if (result.changes === 0) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }

    const updatedPlan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    const responsePlan = {
      id: updatedPlan.id,
      title: updatedPlan.title,
      description: updatedPlan.description,
      status: updatedPlan.status,
      timestamp: updatedPlan.timestamp,
      created_at: updatedPlan.created_at,
      last_modified_at: updatedPlan.last_modified_at,
      last_modified_by: updatedPlan.last_modified_by,
      needs_review: updatedPlan.needs_review,
      changelog: JSON.parse(updatedPlan.changelog),
      tags: JSON.parse(updatedPlan.tags || '[]')
    };
    res.status(200).json(responsePlan);
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/changelog
router.patch('/:id/changelog', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { change } = req.body;

    if (!change || change.trim() === '') {
      return res.status(400).json({ error: 'Change is required and cannot be empty' });
    }

    const planId = parseInt(req.params.id);
    const plan = await getOne(db, "SELECT changelog FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }

    let changelog = JSON.parse(plan.changelog || '[]');
    const timestamp = Date.now();
    changelog.push({ timestamp, change: change.trim() });

    const now = Date.now();
    await runSql(db, "UPDATE plans SET changelog = ?, last_modified_by = 'agent', last_modified_at = ?, needs_review = 0 WHERE id = ?", [JSON.stringify(changelog), now, planId]);

    const updatedPlan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    const responsePlan = {
      id: updatedPlan.id,
      title: updatedPlan.title,
      description: updatedPlan.description,
      status: updatedPlan.status,
      timestamp: updatedPlan.timestamp,
      created_at: updatedPlan.created_at,
      last_modified_at: updatedPlan.last_modified_at,
      last_modified_by: updatedPlan.last_modified_by,
      needs_review: updatedPlan.needs_review,
      changelog
    };
    res.status(200).json(responsePlan);
  } catch (err) {
    next(err);
  }
});

// GET /
router.patch('/:id/tags', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const { add, remove } = req.body;
    const planId = parseInt(req.params.id);

    if (!add && !remove) {
      return res.status(400).json({ error: 'At least one of "add" or "remove" must be provided as arrays' });
    }

    const plan = await getOne(db, "SELECT tags FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      const err = new Error('Plan not found');
      err.status = 404;
      throw err;
    }

    let currentTags = JSON.parse(plan.tags || '[]');

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
    await runSql(db, "UPDATE plans SET tags = ?, last_modified_by = 'agent', last_modified_at = ? WHERE id = ?", [JSON.stringify(newTags), now, planId]);

    const updatedPlan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    const responsePlan = {
      id: updatedPlan.id,
      title: updatedPlan.title,
      description: updatedPlan.description,
      status: updatedPlan.status,
      timestamp: updatedPlan.timestamp,
      tags: newTags
    };
    res.status(200).json(responsePlan);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const validStatuses = ['proposed', 'in_progress', 'completed'];
    let whereClauses = [];
    let sqlParams = [];
    const since = Number(req.query.since);
    if (!isNaN(since)) {
      whereClauses.push("created_at >= ?");
      sqlParams.push(since);
    }
    if (req.query.status && validStatuses.includes(req.query.status)) {
      whereClauses.push("status = ?");
      sqlParams.push(req.query.status);
    }
    if (req.query.needs_review === 'true') {
      whereClauses.push("needs_review = 1");
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

    let sql = "SELECT * FROM plans";
    if (whereClauses.length > 0) {
      sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY created_at ASC";
    let plans = await getAll(db, sql, sqlParams);
    plans = plans.map(p => ({
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
    console.log(`GET /plans: Returning ${plans.length} plans`);
    res.status(200).json(plans);
  } catch (err) {
    next(err);
  }
});

// GET /:id/thoughts
router.get('/:id/thoughts', async (req, res, next) => {
  try {
    const db = req.db || getDB();
    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }
    const plan = await getOne(db, "SELECT * FROM plans WHERE id = ?", [planId]);
    if (!plan) {
      return res.status(200).json([]);
    }

    const thoughts = await getAll(db,
      "SELECT * FROM thoughts WHERE plan_id = ? ORDER BY timestamp ASC",
      [planId]
    );
    const responseThoughts = thoughts.map(t => ({
      id: t.id.toString(),
      content: t.content,
      timestamp: t.timestamp,
      plan_id: t.plan_id ? t.plan_id.toString() : undefined
    }));
    res.status(200).json(responseThoughts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;