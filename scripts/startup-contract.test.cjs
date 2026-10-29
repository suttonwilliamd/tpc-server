// Dependency-free contract tests: execute the real server module with fake boundaries.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load({ main = false } = {}) {
  const handlers = new Map();
  const calls = [];
  const errors = [];
  let resolveInit, rejectInit;
  let database;
  const initialization = new Promise((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });
  const app = {
    use() {},
    get(route, handler) { handlers.set(route, handler); },
    listen(port, callback) {
      calls.push(['listen', port]);
      callback();
      return { ref() { calls.push(['ref']); } };
    }
  };
  const express = () => app;
  express.json = express.static = () => () => {};
  const db = {
    initGlobalDB() { calls.push(['init']); return initialization; },
    cleanDB() {},
    getDB() {
      if (!database) throw new Error('Global DB not initialized');
      return database;
    }
  };
  const module = { exports: {} };
  const requireFake = (name) => {
    if (name === 'express') return express;
    if (name === 'path') return path;
    if (name === './db/database.js') return db;
    if (name.startsWith('./routes/')) return () => {};
    if (name === './middleware/errorHandler') return { errorHandler() {} };
    throw new Error(`Unexpected import: ${name}`);
  };
  requireFake.main = main ? module : {};
  const filename = path.join(__dirname, '..', 'server.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: requireFake, module, __dirname: path.dirname(filename),
    process: { env: { NODE_ENV: 'test' } },
    console: { log() {}, error(error) { errors.push(error); } }
  }, { filename });
  return {
    handlers, calls, errors, resolveInit, rejectInit,
    setDB(value) { database = value; },
    async request(route) {
      const response = { statusCode: 200, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
      await handlers.get(route)({}, response);
      return response;
    }
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('import neither initializes the database nor opens a listener', () => {
  assert.deepEqual(load().calls, []);
});

test('main waits for initialization before listening', async () => {
  const fixture = load({ main: true });
  assert.deepEqual(fixture.calls, [['init']]);
  fixture.resolveInit();
  await flush();
  assert.deepEqual(fixture.calls, [['init'], ['listen', 3001], ['ref']]);
});

test('initialization rejection is reported and never starts a listener', async () => {
  const fixture = load({ main: true });
  const error = new Error('synthetic initialization failure');
  fixture.rejectInit(error);
  await flush();
  assert.deepEqual(fixture.calls, [['init']]);
  assert.deepEqual(fixture.errors, [error]);
});

test('health is liveness, but readiness fails before database initialization', async () => {
  const fixture = load();
  assert.equal((await fixture.request('/health')).statusCode, 200);
  const response = await fixture.request('/ready');
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ready, false);
});

test('readiness waits for a successful database query', async () => {
  const fixture = load();
  let finish;
  fixture.setDB({ get(sql, callback) {
    assert.equal(sql, 'SELECT 1');
    finish = callback;
  } });
  let settled = false;
  const pending = fixture.request('/ready').then(response => { settled = true; return response; });
  await flush();
  assert.equal(settled, false);
  finish(null, { '1': 1 });
  const response = await pending;
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ready, true);
  assert.equal(response.body.db, path.join(__dirname, '..', 'data', 'tpc.db'));
});

test('readiness becomes unavailable on a database query failure', async () => {
  const fixture = load();
  fixture.setDB({ get(sql, callback) { callback(new Error('synthetic closed database')); } });
  const response = await fixture.request('/ready');
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ready, false);
});
