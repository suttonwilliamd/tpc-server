# Startup and readiness contract

Run the dependency-free offline contract suite with Node's built-in test runner:

```sh
node --test scripts/startup-contract.test.cjs
# equivalent: npm run test:startup-contract
```

These tests execute the actual `server.js` source in a fresh VM context, injecting
Express, routers and the database boundary. They do not open sockets, load SQLite,
read application data, run MCP, or use external services. They are not an Express,
SQLite, HTTP integration, or Windows qualification test. The normal Jest suite
remains separate (`npm test`) and requires installed dependencies.

## Initialization

- Importing `server.js` constructs and exports the global Express app but does not
  initialize its database or call `listen`.
- Running it as the main module awaits `initGlobalDB()` before `listen(PORT)`.
  The promise represents backup preparation, opening SQLite and completion of
  `performMigration`, not merely opening the file. Schema creation, alterations,
  indexes, FTS triggers/rebuild, and baseline migration bookkeeping are awaited.
- Historical JSON imports are **best effort**: their errors are caught and logged
  inside `performMigration`. Initialization resolving does not certify all legacy
  JSON was imported. `skipMigration=true` skips JSON import, not schema setup.
- `getDB()` throws until global initialization has installed the handle.
- Initialization rejection is logged and prevents the main module from listening.
  This is **not** a clean shutdown guarantee: the current entry point does not set
  a nonzero exit status, and migration failure after opening SQLite does not close
  that handle. Those boundaries are not changed by the readiness repair.

## Health versus readiness

- `/health` is liveness only and returns 200 without a database check.
- `/ready` returns 200 with `{ ready: true, db: <path> }` only after `getDB()`
  succeeds and SQLite completes `SELECT 1` successfully. Missing initialization,
  a closed database, or another query error returns 503 with `ready: false` and
  the existing error-message field. Each request checks again; readiness is not
  latched after first success.
- This is point-in-time **connection/query readiness**, not proof of schema
  integrity, writeability, imported records, or future query success. There is no
  timeout: a query whose callback never arrives leaves the request pending.
- The isolated `createApp()` factory waits for its own database before returning
  and injects it on requests, but does not mount `/health` or `/ready`. These
  endpoints describe the exported global app only.

## Regression and scope

Previously `/ready` only joined a path and returned success, even before global
initialization or after a database query failure. The offline regression suite
reproduces that behavior on the original source and checks the repaired result,
including waiting for the query callback. Startup ordering and rejection tests
also preserve the existing no-listen-before-initialization behavior.

No bind address, port default, database permissions, schema, authentication,
startup failure handling or production configuration was changed. Do not run the
application against real data to exercise this suite. Revert the isolated commit
to roll back; no data migration or runtime cleanup is needed for these tests.
