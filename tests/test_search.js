/** @jest-environment node */
const request = require('supertest');
const { createApp } = require('../server');
const { runSql } = require('../db/database');

describe('SQLite search contract', () => {
  let app;
  let db;
  beforeAll(async () => ({ app, db } = await createApp({ skipMigration: true })));
  beforeEach(async () => {
    await runSql(db, 'DELETE FROM thoughts');
    await runSql(db, 'DELETE FROM plans');
  });
  afterAll(async () => { if (db) await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); });

  async function plan(title, description = 'details', tags = [], timestamp = '2026-01-01T00:00:00Z') {
    return (await runSql(db, 'INSERT INTO plans (title, description, tags, timestamp) VALUES (?, ?, ?, ?)', [title, description, JSON.stringify(tags), timestamp])).lastID;
  }

  async function thought(content, tags = [], timestamp = '2026-01-01T00:00:00Z') {
    return (await runSql(db, 'INSERT INTO thoughts (content, tags, timestamp) VALUES (?, ?, ?)', [content, JSON.stringify(tags), timestamp])).lastID;
  }

  function search(q, { type = 'all', tags = [], limit = 50 } = {}) {
    const params = new URLSearchParams({ q, type, limit: String(limit) });
    tags.forEach(tag => params.append('tags', tag));
    return request(app).get(`/search?${params}`).expect(200);
  }

  it('never allows a title or description match to bypass required tags', async () => {
    await plan('needle without tags');
    await plan('other', 'needle without tags');
    const expected = await plan('needle tagged', 'details', ['required']);
    const response = await request(app).get('/search').query({ q: 'needle', tags: 'required' }).expect(200);
    expect(response.body.map(r => r.id)).toEqual([expected]);
  });

  it('matches each searchable field and preserves REST result fields', async () => {
    const title = await plan('NEEDLE title');
    const description = await plan('other', 'needle description');
    const planTag = await plan('other', 'details', ['a needle tag']);
    const content = await thought('needle content');
    const thoughtTag = await thought('other', ['a needle tag']);
    const response = await search(' needle ');
    expect(response.body.map(r => `${r.type}:${r.id}`)).toEqual([
      `plan:${title}`, `plan:${planTag}`, `thought:${content}`, `thought:${thoughtTag}`, `plan:${description}`,
    ]);
    for (const row of response.body) {
      expect(Object.keys(row).sort()).toEqual(['content', 'id', 'tags', 'timestamp', 'title', 'type']);
      expect(row.tags).toBeInstanceOf(Array);
      if (row.type === 'thought') expect(row.title).toBe('');
    }
  });

  it('requires every exact tag independently of text matches, using ASCII case folding', async () => {
    await plan('needle', 'needle', ['first']);
    await thought('needle', ['second']);
    await plan('needle', 'details', ['first-extra', 'second']);
    const planId = await plan('needle', 'details', ['FIRST', 'Second']);
    const thoughtId = await thought('needle', ['First', 'SECOND']);
    const response = await search('needle', { tags: [' first ', 'SECOND', 'first'] });
    expect(response.body.map(r => `${r.type}:${r.id}`)).toEqual([`plan:${planId}`, `thought:${thoughtId}`]);
  });

  it.each(['%', '_', '\\', '"', '[', 'x,y', "x' OR 1=1 --"])('treats text and JSON special tag %p literally', async literal => {
    const p = await plan(`value ${literal}`, 'details', [literal]);
    const t = await thought(`value ${literal}`, [literal]);
    await plan('value unrelated', 'details', ['unrelated']);
    await thought('value unrelated', ['unrelated']);
    const response = await search(literal);
    expect(response.body.map(r => `${r.type}:${r.id}`)).toEqual([`plan:${p}`, `thought:${t}`]);
    const filtered = await search('value', { tags: [literal] });
    expect(filtered.body.map(r => `${r.type}:${r.id}`)).toEqual([`plan:${p}`, `thought:${t}`]);
  });

  it('matches decoded tag strings, not JSON serialization or tag boundaries', async () => {
    const p = await plan('other', 'details', ['alpha', 'beta']);
    const t = await thought('other', ['alpha', 'beta']);
    for (const q of ['[', '","', 'alpha","beta']) {
      expect((await search(q)).body).toEqual([]);
    }
    expect((await search('pha')).body.map(r => `${r.type}:${r.id}`)).toEqual([`plan:${p}`, `thought:${t}`]);
    expect((await search('other', { tags: ['pha'] })).body).toEqual([]);
  });

  it('applies only canonical plural type filters', async () => {
    await plan('needle');
    await thought('needle');
    expect((await search('needle', { type: 'plans' })).body.map(r => r.type)).toEqual(['plan']);
    expect((await search('needle', { type: 'thoughts' })).body.map(r => r.type)).toEqual(['thought']);
    expect((await search('missing')).body).toEqual([]);
  });

  it('ranks globally by matching fields before timestamps, with deterministic type and ID ties', async () => {
    const p1 = await plan('needle', 'needle', ['needle'], '2020-01-01T00:00:00Z'); // 8
    const t1 = await thought('needle', ['needle'], '2021-01-01T00:00:00Z'); // 6
    const p2 = await plan('needle', 'needle', [], '2022-01-01T00:00:00Z'); // 5
    const p3 = await plan('needle', 'other', [], '2026-01-01T01:00:00+01:00'); // 3, same instant
    const p4 = await plan('needle', 'other', [], '2026-01-01T00:00:00Z');
    const t2 = await thought('needle', [], '2026-01-01T00:00:00Z');
    const p5 = await plan('other', 'needle', [], '2029-01-01T00:00:00Z'); // 2
    const expected = [`plan:${p1}`, `thought:${t1}`, `plan:${p2}`, `plan:${p3}`, `plan:${p4}`, `thought:${t2}`, `plan:${p5}`];
    expect((await search('needle')).body.map(r => `${r.type}:${r.id}`)).toEqual(expected);
    expect((await search('needle', { limit: 4 })).body.map(r => `${r.type}:${r.id}`)).toEqual(expected.slice(0, 4));
  });

  it('applies default and maximum limits to the combined result set', async () => {
    for (let i = 0; i < 30; i++) {
      await plan('needle');
      await thought('needle');
    }
    expect((await request(app).get('/search?q=needle').expect(200)).body).toHaveLength(10);
    expect((await search('needle', { limit: 50 })).body).toHaveLength(50);
    expect((await search('needle', { limit: 1 })).body).toHaveLength(1);
  });

  it.each([
    '', 'q=', 'q=%20%20', 'q=x&q=y', 'q[x]=y', `q=${'x'.repeat(2001)}`,
    'q=x&type=plan', 'q=x&type=thought', 'q=x&type=', 'q=x&type=plans&type=thoughts', 'q=x&type[x]=plans',
    'q=x&limit=0', 'q=x&limit=-1', 'q=x&limit=51', 'q=x&limit=1.5', 'q=x&limit=2junk',
    'q=x&limit=1e1', 'q=x&limit=', 'q=x&limit=1&limit=2', 'q=x&limit[x]=1',
    'q=x&tags=', 'q=x&tags=%20', 'q=x&tags[x]=y', `q=x&tags=${'t'.repeat(65)}`,
    `q=x&${Array.from({ length: 65 }, () => 'tags=t').join('&')}`, 'q=x&query=y', 'q=x&offset=1',
  ])('rejects malformed search parameters as client errors: %s', async query => {
    const response = await request(app).get(`/search?${query}`).expect(400);
    expect(typeof response.body.error).toBe('string');
  });

  it('reuses literal search/ranking in context without changing its field shapes or unfiltered behavior', async () => {
    const p1 = await plan('100% title', '100% description');
    await plan('1000 title', 'other');
    const completed = await plan('100% completed', '100%', ['100%']);
    await runSql(db, "UPDATE plans SET status = 'completed' WHERE id = ?", [completed]);
    const t1 = await thought('100% content');
    await thought('1000 content');
    const response = await request(app).get('/context').query({ search: '100%' }).expect(200);
    expect(response.body.incompletePlans.map(p => p.id)).toEqual([p1]);
    expect(response.body.last10Thoughts.map(t => Number(t.id))).toEqual([t1]);
    expect(response.body.incompletePlans[0]).toHaveProperty('description', '100% description');
    expect(response.body.incompletePlans[0]).not.toHaveProperty('relevance_score');
    expect((await request(app).get('/context').expect(200)).body.incompletePlans).toHaveLength(2);
  });

  it('bounds searched context plans after excluding completed plans', async () => {
    for (let i = 0; i < 55; i++) await plan('needle', 'needle');
    const best = await plan('needle', 'needle', ['needle']);
    const completed = await plan('needle', 'needle', ['needle']);
    await runSql(db, "UPDATE plans SET status = 'completed' WHERE id = ?", [completed]);
    const response = await request(app).get('/context?search=needle').expect(200);
    expect(response.body.incompletePlans).toHaveLength(50);
    expect(response.body.incompletePlans[0].id).toBe(best);
    expect(response.body.incompletePlans.some(p => p.id === completed)).toBe(false);
  });

  it.each(['search=', 'search=x&search=y', 'search[x]=y', `search=${'x'.repeat(2001)}`])('rejects malformed context search: %s', async query => {
    await request(app).get(`/context?${query}`).expect(400);
  });
});
