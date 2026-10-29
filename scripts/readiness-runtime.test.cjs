'use strict';

// Real modules, copied byte-for-byte to isolate database.js's __dirname paths.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const source = path.resolve(__dirname, '..');
const root = process.env.TPC_RUNTIME_FIXTURE_ROOT;
if (!root || !path.isAbsolute(root) || process.env.NODE_ENV !== 'test') {
  throw new Error('Set NODE_ENV=test and absolute TPC_RUNTIME_FIXTURE_ROOT to a private synthetic output directory');
}

function request(server, route) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: server.address().port, path: route }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(2000, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
}

test('real Express readiness with real sqlite3 and synthetic on-disk database', { timeout: 15000 }, async t => {
  await fs.mkdir(root, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(root, 'ready-'));
  let server;
  let db;
  try {
    // Do not copy tracked data, user JSON, DBs, public assets, or main-entry scripts.
    for (const entry of ['server.js', 'db', 'routes', 'middleware']) {
      await fs.cp(path.join(source, entry), path.join(fixture, entry), { recursive: true });
    }
    await fs.symlink(path.join(source, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
    const database = require(path.join(fixture, 'db/database.js'));
    const { app } = require(path.join(fixture, 'server.js'));
    assert.throws(() => database.getDB(), /not initialized/);
    server = http.createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    await t.test('uninitialized database returns 503', async () => {
      const response = await request(server, '/ready');
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, { ready: false, error: 'Global DB not initialized' });
    });
    await t.test('health is independent before initialization', async () => {
      const response = await request(server, '/health');
      assert.equal(response.status, 200);
      assert.equal(response.body.status, 'ok');
      assert.equal(response.body.service, 'tpc-server');
      assert.ok(Number.isFinite(Date.parse(response.body.timestamp)));
    });
    await t.test('real migration and successful SQLite callback return 200', async () => {
      // skipMigration skips JSON imports, NOT the actual schema/FTS migrations.
      await database.initGlobalDB(true);
      db = database.getDB();
      assert.equal(db.constructor.name, 'Database');
      const response = await request(server, '/ready');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ready: true, db: path.join(fixture, 'data/tpc.db') });
      assert.ok((await fs.stat(path.join(fixture, 'data/tpc.db'))).size > 0);
      assert.deepEqual(await database.getAll(db, 'plans'), []);
      assert.deepEqual(await database.getAll(db, 'thoughts'), []);
    });
    await t.test('closed native handle returns 503 while health stays 200', async () => {
      await closeDb(db);
      db = undefined;
      const response = await request(server, '/ready');
      assert.equal(response.status, 503);
      assert.equal(response.body.ready, false);
      assert.match(response.body.error, /SQLITE_MISUSE.*Database is closed/);
      assert.equal((await request(server, '/health')).status, 200);
    });
  } finally {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      try {
        if (db) await closeDb(db);
      } finally {
        await fs.rm(fixture, { recursive: true, force: true });
        await assert.rejects(fs.stat(fixture), { code: 'ENOENT' });
      }
    }
  }
});
