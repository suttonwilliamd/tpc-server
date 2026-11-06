const { Router } = require('express');
const { getDB } = require('../db/database.js');
const { buildSearchQuery, parseRestSearch } = require('../db/search.js');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { sql, params } = buildSearchQuery(parseRestSearch(req.query));
    const db = req.db || getDB();
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, params, (error, results) => error ? reject(error) : resolve(results));
    });
    res.json(rows.map(row => ({
      type: row.result_type,
      id: row.id,
      title: row.title,
      content: row.content,
      tags: JSON.parse(row.tags || '[]'),
      timestamp: row.timestamp,
    })));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
