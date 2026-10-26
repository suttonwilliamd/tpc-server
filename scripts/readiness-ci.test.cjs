'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { childEnvironment, runBounded, redactSyntheticRoot } = require('./readiness-ci.cjs');

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

test('synthetic Windows roots redact raw, JSON, inspection and normalized forms only', () => {
  const { inspect } = require('node:util');
  for (const root of ['D:\\a\\_temp\\readiness-ci-ABC123',
    'C:\\space dir\\雪 café\\readiness-ci-DEF456',
    'E:\\dots.[x]+(y)\\readiness-ci-GHI789']) {
    const normalized = root.replaceAll('\\', '/');
    for (const form of [root, normalized]) {
      for (const render of [value => value, JSON.stringify, inspect]) {
        for (const suffix of ['', '\\fixtures', '/fixtures']) {
          const input = `prefix ${render(form + suffix)} suffix`;
          assert.equal(redactSyntheticRoot(input, root),
            `prefix ${render('[synthetic-root]' + suffix)} suffix`);
        }
      }
    }
    const unrelated = `other C:\\unrelated\\file ${root}-sibling ${root}Extra prefix${root}`;
    assert.equal(redactSyntheticRoot(unrelated, root), unrelated);
    assert.equal(redactSyntheticRoot(`(${root}) ${root}/child`, root),
      '([synthetic-root]) [synthetic-root]/child');
  }
});

test('actual child stdout/stderr representations are redacted without hiding failure', () => {
  const before = fs.readdirSync(parent).sort();
  const spacedParent = path.join(parent, 'space 雪 café');
  const result = runBounded(['-e', `const path=require('node:path');
    const root=path.dirname(process.env.TPC_RUNTIME_FIXTURE_ROOT);
    process.stdout.write(JSON.stringify({root})+'\\n');
    process.stderr.write(require('node:util').inspect({root})+'\\n');
    process.stderr.write(root+'/fixtures sentinel-unrelated'); process.exit(9);`], spacedParent);
  assert.equal(result.status, 9);
  assert.equal(result.reason, 'exit');
  assert.equal(result.output.includes(parent), false);
  assert.equal(result.output.split('[synthetic-root]').length - 1, 3);
  assert.match(result.output, /sentinel-unrelated/);
  assert.deepEqual(fs.readdirSync(spacedParent), []);
  fs.rmdirSync(spacedParent);
  assert.deepEqual(fs.readdirSync(parent).sort(), before);
});

test('overflow and signal fail closed and clean up', () => {
  const before = fs.readdirSync(parent).sort();
  const overflow = runBounded(['-e', 'process.stdout.write("x".repeat(2*1024*1024))'], parent, 2000);
  assert.equal(overflow.status, 1);
  assert.equal(overflow.reason, 'ENOBUFS');
  const signal = runBounded(['-e', 'process.kill(process.pid,"SIGTERM")'], parent, 2000);
  assert.equal(signal.status, 1);
  if (process.platform !== 'win32') assert.equal(signal.reason, 'SIGTERM');
  // Windows signal reporting is platform-dependent; status must still fail closed.
  assert.deepEqual(fs.readdirSync(parent).sort(), before);
});

test('relative fixture parents fail closed', () => {
  assert.throws(() => runBounded(['-e', 'process.exit(0)'], 'relative'), /absolute/);
});
