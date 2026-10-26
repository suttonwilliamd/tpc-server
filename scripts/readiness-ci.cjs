'use strict';

// Deliberately only a bounded Node child; not a general command runner.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

function childEnvironment(root, inherited = process.env) {
  const env = { NODE_ENV: 'test', HOME: path.join(root, 'home'),
    USERPROFILE: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
    npm_config_cache: path.join(root, 'cache'),
    TPC_RUNTIME_FIXTURE_ROOT: path.join(root, 'fixtures') };
  // Windows variable names are case insensitive. Never forward NODE_OPTIONS,
  // NODE_PATH, credentials, proxy settings or the ambient CI environment.
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT']) {
    const key = Object.keys(inherited).find(k => k.toLowerCase() === name.toLowerCase());
    if (key) env[name] = inherited[key];
  }
  return env;
}

// Finite representations of this runner's known root, not a secret scrubber.
function redactSyntheticRoot(value, root) {
  const forms = new Set();
  for (const form of [root, root.replaceAll('\\', '/')]) {
    forms.add(form);
    forms.add(form.replaceAll('\\', '\\\\')); // Node inspection backslashes
    forms.add(JSON.stringify(form).slice(1, -1));
  }
  const alternatives = [...forms].sort((a, b) => b.length - a.length)
    .map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Do not match a sibling sharing the root's prefix or a longer path prefix.
  const pattern = new RegExp(`(^|[^a-zA-Z0-9_./\\\\-])(?:${alternatives})(?=$|[/\\\\\\s'"\x60,;:)\\]}])`, 'g');
  return (value || '').replace(pattern, '$1[synthetic-root]');
}

function runBounded(args, parent, timeout = 25000) {
  if (!parent || !path.isAbsolute(parent)) throw new Error('An absolute synthetic parent directory is required');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'readiness-ci-'));
  try {
    const env = childEnvironment(root);
    for (const key of ['HOME', 'TMPDIR', 'npm_config_cache', 'TPC_RUNTIME_FIXTURE_ROOT']) {
      fs.mkdirSync(env[key], { recursive: true });
    }
    const result = spawnSync(process.execPath, args, {
      cwd: path.resolve(__dirname, '..'), env, timeout, killSignal: 'SIGKILL',
      encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true
    });
    const sanitize = value => redactSyntheticRoot(value, root);
    const output = sanitize(result.stdout) + sanitize(result.stderr);
    return { status: result.error || result.signal || result.status === null ? 1 : result.status,
      reason: result.error ? result.error.code : result.signal || 'exit', output };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    if (fs.existsSync(root)) throw new Error('Synthetic root cleanup failed');
    console.log('Synthetic root removed: true');
  }
}

function provenance() {
  const sqlite = require('sqlite3');
  const native = path.join(path.dirname(require.resolve('sqlite3/package.json')), 'build/Release/node_sqlite3.node');
  console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    os: os.release(), express: require('express/package.json').version,
    sqlite3: require('sqlite3/package.json').version, sqlite: sqlite.VERSION,
    nativeSHA256: createHash('sha256').update(fs.readFileSync(native)).digest('hex') }));
}

if (require.main === module) {
  try {
    provenance();
    const result = runBounded(['--test', 'scripts/startup-contract.test.cjs',
      'scripts/readiness-runtime.test.cjs'], process.argv[2]);
    process.stdout.write(result.output);
    console.log(`Bounded child: ${result.reason}; exit=${result.status}`);
    process.exitCode = result.status;
  } catch (error) {
    console.error(`Readiness runner failed: ${error.code || error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { childEnvironment, runBounded, redactSyntheticRoot };
