# Offline readiness runtime validation

This complements (does not replace) the six injected-boundary startup contract tests.
It uses actual Express routing, the actual database module/migrations and native
sqlite3 callback API. It never runs the default main entry point or calls providers.
No production module or app API changes are needed.

## Run

Install the locked dependencies with lifecycle scripts disabled, then provision only
sqlite3's inspected native binding (package-supported N-API prebuilt or a bounded
source build). Do not run broad dependency lifecycle scripts. Use Node 22 or later
compatible with the lockfile. Other native optional dependencies are not needed.

Choose private, synthetic absolute output paths and run in an isolated environment:

```sh
env -i PATH="/path/to/node/bin:/usr/bin:/bin" \
  HOME="$OUTPUT/home" TMPDIR="$OUTPUT/tmp" npm_config_cache="$OUTPUT/cache" \
  NODE_ENV=test TPC_RUNTIME_FIXTURE_ROOT="$OUTPUT/fixtures" \
  timeout 30 node --test scripts/readiness-runtime.test.cjs scripts/startup-contract.test.cjs
```

Create home/tmp/cache first. `TPC_RUNTIME_FIXTURE_ROOT` is a **test harness** setting,
not a production database override. The database module has no supported data/path
environment override. `initGlobalDB` uses its module-relative `data/tpc.db`; `initDB`
only publishes the global handle when passed that exact path. Therefore the test
copies only server.js, db/, routes/ and middleware/ byte-for-byte into a fresh
fixture under the specified output, with a dependency symlink to this checkout's
node_modules. It does not copy existing data, user JSON, tracked DBs or public assets.
The copied server is required, never executed as main. Route imports create routers
but do not initialize DBs, contact providers, or start listeners.

`initGlobalDB(true)` performs real schema/index/FTS migration while skipping JSON
imports. NODE_ENV=test suppresses backup creation. The test uses a real synthetic
on-disk DB, not a mock or a misleading `:memory:` global handle. It checks:

- uninitialized `/ready`: 503 with existing error shape;
- `/health` before initialization: independent 200;
- migrated database and real SELECT 1 callback: 200 with existing path response;
- closed native handle: real SQLITE_MISUSE callback yields 503, health still 200.

The only listener binds **127.0.0.1, ephemeral port 0** and is closed in finally;
requests have a two-second timeout. The DB is closed, the fixture recursively removed,
and removal asserted even after test failures. Use an outer finite process timeout
as shown for protection against native initialization stalls. Run separate processes
to obtain fresh module-global DB state.

The existing default Jest suites are not claimed here. They use Supertest's default
app binding (not this explicit loopback listener), and the stdio MCP contract spawns
a separate MCP process. Running those unchanged exceeds this validation's listener/
MCP containment. Playwright/e2e and performance/provider coverage are also excluded.
No Windows or hosted CI evidence is implied. Authorized root should arrange independent
review of the exact committed test diff and, if accepted, public-repository Windows
Actions execution under existing ownership/approval gates. No remote write is needed
for this local validation leaf.
