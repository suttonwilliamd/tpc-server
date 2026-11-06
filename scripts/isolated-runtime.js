const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// Copy executable modules, never tracked databases or user JSON. Each caller owns cleanup.
async function createIsolatedRuntime() {
  const source = path.resolve(__dirname, '..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tpc-runtime-'));
  try {
    for (const entry of ['server.js', 'mcp-server.js', 'db', 'routes', 'middleware', 'public']) {
      await fs.cp(path.join(source, entry), path.join(root, entry), { recursive: true });
    }
    await fs.symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'), 'junction');
    await fs.mkdir(path.join(root, 'data'));
    await fs.writeFile(path.join(root, 'data/plans.json'), '[]');
    await fs.writeFile(path.join(root, 'data/thoughts.json'), '[]');
    return { root, close: () => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { createIsolatedRuntime };
