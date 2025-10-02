const express = require('express');
const { Router } = express;
const { getDB } = require('../db/database.js');

const router = Router();

// Helper to build search score for plans
function buildPlanSearchSQL(query, tagsFilter = []) {
  if (!query) return { sql: '', params: [], score: 0 };

  const escapedQuery = `%${query}%`;
  const tagConditions = tagsFilter.map(tag => `tags LIKE ?`).join(' OR ');
  const tagParams = tagsFilter.map(tag => `%${JSON.stringify(tag.toLowerCase())}%`);

  let whereClauses = [];
  let params = [];
  let scoreSql = '0';

  // Search in title (high score)
  whereClauses.push('title LIKE ?');
  params.push(escapedQuery);
  scoreSql += ' + CASE WHEN title LIKE ? THEN 3 ELSE 0 END';
  params.push(escapedQuery);

  // Search in description (medium score)
  whereClauses.push('description LIKE ?');
  params.push(escapedQuery);
  scoreSql += ' + CASE WHEN description LIKE ? THEN 2 ELSE 0 END';
  params.push(escapedQuery);

  // Search in tags (high score)
  whereClauses.push('tags LIKE ?');
  params.push(escapedQuery);
  scoreSql += ' + CASE WHEN tags LIKE ? THEN 3 ELSE 0 END';
  params.push(escapedQuery);

  let sql = `SELECT *, (${scoreSql}) AS relevance_score FROM plans WHERE `;
  sql += whereClauses.join(' OR ');

  if (tagsFilter.length > 0) {
    sql += ` AND (${tagConditions})`;
    params = params.concat(tagParams);
  }

  return { sql, params };
}

// Helper to build search score for thoughts
function buildThoughtSearchSQL(query, tagsFilter = []) {
  if (!query) return { sql: '', params: [], score: 0 };

  const escapedQuery = `%${query}%`;
  const tagConditions = tagsFilter.map(tag => `tags LIKE ?`).join(' OR ');
  const tagParams = tagsFilter.map(tag => `%\"${tag.toLowerCase()}\"%`);

  let whereClauses = [];
  let params = [];
  let scoreSql = '0';

  // Search in content (high score)
  whereClauses.push('content LIKE ?');
  params.push(escapedQuery);
  scoreSql += ' + CASE WHEN content LIKE ? THEN 3 ELSE 0 END';
  params.push(escapedQuery);

  // Search in tags (high score)
  whereClauses.push('tags LIKE ?');
  params.push(escapedQuery);
  scoreSql += ' + CASE WHEN tags LIKE ? THEN 3 ELSE 0 END';
  params.push(escapedQuery);

  let sql = `SELECT *, (${scoreSql}) AS relevance_score FROM thoughts WHERE `;
  sql += whereClauses.join(' OR ');

  if (tagsFilter.length > 0) {
    sql += ` AND (${tagConditions})`;
    params = params.concat(tagParams);
  }

  return { sql, params };
}

// GET /search
router.get('/', async (req, res, next) => {
  try {
    const { q: query, limit = 10, type = 'all', tags: tagsStr } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Search query "q" is required and cannot be empty' });
    }

    const searchQuery = query.trim();
    const limitNum = parseInt(limit);
    const actualLimit = isNaN(limitNum) || limitNum < 1 ? 10 : Math.min(limitNum, 50); // Cap at 50
    const tagsFilter = tagsStr ? tagsStr.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [];

    const db = req.db || getDB();

    let plansResults = [];
    let thoughtsResults = [];

    if (type === 'all' || type === 'plan') {
      const { sql, params } = buildPlanSearchSQL(searchQuery, tagsFilter);
      if (sql) {
        const fullSql = `${sql} ORDER BY relevance_score DESC, timestamp DESC LIMIT ?`;
        const allParams = params.concat(actualLimit);
        const rawPlans = await new Promise((resolve, reject) => {
          db.all(fullSql, allParams, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        plansResults = rawPlans.map(p => ({
          type: 'plan',
          id: p.id,
          title: p.title,
          content: p.description,
          tags: JSON.parse(p.tags || '[]'),
          timestamp: p.timestamp
        }));
      }
    }

    if (type === 'all' || type === 'thought') {
      const { sql, params } = buildThoughtSearchSQL(searchQuery, tagsFilter);
      if (sql) {
        const fullSql = `${sql} ORDER BY relevance_score DESC, timestamp DESC LIMIT ?`;
        const allParams = params.concat(actualLimit);
        const rawThoughts = await new Promise((resolve, reject) => {
          db.all(fullSql, allParams, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        thoughtsResults = rawThoughts.map(t => ({
          type: 'thought',
          id: t.id,
          title: '', // Thoughts don't have title
          content: t.content,
          tags: JSON.parse(t.tags || '[]'),
          timestamp: t.timestamp
        }));
      }
    }

    // Combine and sort by relevance (but since separate, approximate by concatenating and sorting by timestamp DESC)
    const combined = [...plansResults, ...thoughtsResults].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    console.log(`GET /search: Query "${searchQuery}", type "${type}", tags "${tagsStr}", results: ${combined.length}`);
    res.status(200).json(combined.slice(0, actualLimit));
  } catch (err) {
    next(err);
  }
});

module.exports = router;