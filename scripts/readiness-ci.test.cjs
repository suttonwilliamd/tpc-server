'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { childEnvironment, runBounded } = require('./readiness-ci.cjs');

const parent = process.env.TPC_RUNTIME_FIXTURE_ROOT;
if (!parent || !path.isAbsolute(parent)) throw new Error('Absolute synthetic fixture parent required');

test('allowlist drops ambient secrets and Node injection, preserves Windows system variables', () => {
  const env = childEnvironment(parent, { Path: 'synthetic-path', SYSTEMROOT: 'C:\\Windows',
    WINDIR: 'C:\\Windows', ComSpec: 'cmd.exe', PATHEXT: '.EXE',
    NODE_OPTIONS: '--require evil', NODE_PATH: 'evil', SECRET: 'sentinel' });
  assert.equal(env.PATH, 'synthetic-path');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.NODE_PATH, undefined);
  assert.equal(env.SECRET, undefined);
});

test('bounded child isolates environment, propagates real nonzero, times out and cleans up', () => {
  fs.mkdirSync(parent, { recursive: true });
  const before = fs.readdirSync(parent).sort();
  process.env.READINESS_PROBE_SENTINEL = 'must-not-inherit';
  try {
    const ok = runBounded(['-e', `const a=require('node:assert/strict');
      a.equal(process.env.READINESS_PROBE_SENTINEL,undefined);
      a.equal(process.env.NODE_ENV,'test');
      require('node:fs').writeFileSync(require('node:path').join(process.env.TPC_RUNTIME_FIXTURE_ROOT,'synthetic.txt'),'fixture');`], parent);
    assert.equal(ok.status, 0);
    const fail = runBounded(['-e', 'process.exit(7)'], parent);
    assert.equal(fail.status, 7);
    const stalled = runBounded(['-e', 'setInterval(()=>{},1000)'], parent, 200);
    assert.equal(stalled.status, 1);
    assert.equal(stalled.reason, 'ETIMEDOUT');
    assert.deepEqual(fs.readdirSync(parent).sort(), before);
    console.log('Expected negative probes: exit=7, ETIMEDOUT; all roots removed');
  } finally {
    delete process.env.READINESS_PROBE_SENTINEL;
  }
});

test('relative fixture parents fail closed', () => {
  assert.throws(() => runBounded(['-e', 'process.exit(0)'], 'relative'), /absolute/);
});
