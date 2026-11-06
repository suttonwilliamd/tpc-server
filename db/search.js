// One literal-search contract for REST and MCP. SQLite lower()/NOCASE fold ASCII only.
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeSearch({ q, type = 'all', tags = [], limit = 10, offset = 0 }) {
  if (typeof q !== 'string' || !q.trim()) throw badRequest('q must be a non-empty string');
  if (q.length > 2000) throw badRequest('q exceeds max length (2000)');
  if (!['all', 'plans', 'thoughts'].includes(type)) throw badRequest('type must be all, plans, or thoughts');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw badRequest('limit must be an integer from 1 to 50');
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) throw badRequest('offset must be an integer from 0 to 1000000');
  if (!Array.isArray(tags) || tags.length > 64 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 64)) {
    throw badRequest('tags must contain at most 64 non-empty strings of at most 64 characters');
  }
  return { q: q.trim(), type, tags: [...new Set(tags.map(tag => tag.trim()))], limit, offset };
}

function parseRestSearch(query) {
  for (const key of Object.keys(query)) {
    if (!['q', 'type', 'tags', 'limit'].includes(key)) throw badRequest(`Unknown search parameter: ${key}`);
  }
  // Repeated tags represent distinct exact values, never CSV or JSON-encoded patterns.
  const tags = query.tags === undefined ? [] : Array.isArray(query.tags) ? query.tags : [query.tags];
  let limit;
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^\d+$/.test(query.limit)) throw badRequest('limit must be an integer from 1 to 50');
    limit = Number(query.limit);
  }
  return normalizeSearch({ q: query.q, type: query.type, tags, limit });
}

function buildSearchQuery(options, { incompletePlans = false, fullRows = false } = {}) {
  const { q, type, tags, limit, offset } = normalizeSearch(options);
  if (fullRows && type === 'all') throw new Error('Full search rows require one type');
  const params = [];
  function branch(table) {
    const plan = table === 'plans';
    const textMatch = column => {
      params.push(q);
      return `instr(lower(COALESCE(${column}, '')), lower(?)) > 0`;
    };
    const tagMatch = `EXISTS (SELECT 1 FROM json_each(COALESCE(tags, '[]')) AS tag WHERE tag.type = 'text' AND ${textMatch('tag.value')})`;
    // Build parameters in the same order as the score expression.
    const textScore = plan
      ? `3 * (${textMatch('title')}) + 2 * (${textMatch('description')})`
      : `3 * (${textMatch('content')})`;
    // tagMatch's parameter was added first, so put its score first too.
    const score = `3 * (${tagMatch}) + ${textScore}`;
    const tagConditions = tags.map(tag => {
      params.push(tag);
      return `EXISTS (SELECT 1 FROM json_each(COALESCE(tags, '[]')) AS tag WHERE tag.type = 'text' AND tag.value = ? COLLATE NOCASE)`;
    });
    if (plan && incompletePlans) tagConditions.push("status != 'completed'");
    const fields = fullRows ? '*' : `id, ${plan ? 'title' : "''"} AS title,
      ${plan ? 'description' : 'content'} AS content, tags, timestamp,
      ${plan ? 'NULL' : 'plan_id'} AS plan_id`;
    return `SELECT ${fields}, '${plan ? 'plan' : 'thought'}' AS result_type, (${score}) AS relevance_score
      FROM ${table}${tagConditions.length ? ` WHERE ${tagConditions.join(' AND ')}` : ''}`;
  }
  const branches = [];
  if (type !== 'thoughts') branches.push(branch('plans'));
  if (type !== 'plans') branches.push(branch('thoughts'));
  params.push(limit, offset);
  return {
    sql: `SELECT * FROM (${branches.join(' UNION ALL ')}) WHERE relevance_score > 0
      ORDER BY relevance_score DESC, julianday(timestamp) DESC, result_type ASC, id ASC LIMIT ? OFFSET ?`,
    params,
  };
}

module.exports = { buildSearchQuery, parseRestSearch };
