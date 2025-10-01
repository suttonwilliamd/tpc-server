# TPC Server

A Node.js/Express API for AI-human collaboration, starting with JSON file storage for thoughts and plans.

### Setup and Usage
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. The server runs on `http://localhost:3000`

## v1.0 - Basic Thought Logger

- Introduced core thought logging. Thoughts stored as objects in data/thoughts.json (migrated to DB). Auto-incrementing IDs from 1.
- POST /thoughts: { "content": "string" } (required, non-empty) -> 201 { id, content, timestamp }.
- Test coverage: v1.0.test.js covers POST creation (valid/invalid, multiple, persistence via GET /thoughts sorted asc), empty state.

## v1.1 - Basic Plan Creator

- Added plan creation in data/plans.json. Plans include title, description, default "proposed" status.
- POST /plans: { "title": "string", "description": "string" } (required, non-empty) -> 201 { id, title, description, status: "proposed", timestamp }.
- Test coverage: v1.1.test.js covers POST plans (valid/invalid, multiple, persistence via GET /plans sorted asc), regression on thoughts.

### Testing
Run `npm test` to execute Jest tests verifying the endpoint functionality.

### Project Structure
- `server.js`: Main Express server.
- `data/thoughts.json`: JSON storage for thoughts (initially empty array; deprecated after v1.7 migration).
- `data/plans.json`: JSON storage for plans (initially empty array; deprecated after v1.7 migration).
- `data/tpc.db`: SQLite database for thoughts and plans (introduced in v1.7).
- `thoughts.test.js`: Unit tests using Supertest.
- `plans.test.js`: Unit tests for plans endpoint using Supertest.
- `v1.0.test.js` through `v1.9.test.js`: Version-specific tests for endpoints, validation, persistence, edges, and regressions.
- `package.json`: Dependencies and scripts.

## v1.2 - Plan Status Updater

- Added status updates for plans (proposed -> in_progress/completed). Temporary single plan retrieval.
- PATCH /plans/:id: { "status": "in_progress" | "completed" } (optional) -> 200 { status }.
- GET /plans/:id: 200 full plan.
- Test coverage: v1.2.test.js covers PATCH updates (valid/invalid statuses, multiple, non-existent), GET single, persistence, regressions.

## v1.3 - Simple Retrieval

- Added list retrieval for thoughts and plans, sorted asc by timestamp; empty [].
- GET /thoughts: 200 array sorted asc.
- GET /plans: 200 array sorted asc.
- Test coverage: v1.3.test.js covers GET retrieval (empty, after create/update, multiple sorted, persistence/integration), regressions.

### Usage
- Retrieve all thoughts: `curl http://localhost:3000/thoughts`
- Retrieve all plans: `curl http://localhost:3000/plans`

## v1.4 - Thought-Plan Linking

### Features
- Optional `plan_id` (string) in POST /thoughts body; stored without validation (invalid/missing allowed for backward compatibility).
- New GET /plans/:id/thoughts: Returns thoughts linked to the plan (filtered by plan_id, sorted ascending by timestamp); returns empty array [] if plan does not exist or no linked thoughts (200 OK, no 404).

### Usage
- Create thought linked to plan: `curl -X POST http://localhost:3000/thoughts -H "Content-Type: application/json" -d '{"content": "Linked thought", "plan_id": "1"}'`
- Retrieve linked thoughts: `curl http://localhost:3000/plans/1/thoughts`
- For non-existent plan: `curl http://localhost:3000/plans/999/thoughts` returns []

- Test coverage: v1.4.test.js covers POST with/without plan_id (persists correctly, invalid allowed), GET /plans/:id/thoughts (sorted asc, filters unlinked, empty for no plan/no thoughts, 200 [] for invalid id), integration (create plan, link/retrieve thoughts), ensures prior endpoints unaffected.

## v1.5 - Plan Changelog

- Audit trail via changelog array in plans (append-only entries with timestamps).
- PATCH /plans/:id/changelog: { "entry": "string" } (required, non-empty) -> 200 full plan with changelog appended.
- Test coverage: v1.5.test.js covers PATCH append (valid/invalid, multiple, non-existent), retrieval includes changelog, integration with status, regressions.

## v1.6 - Context Window

### Features Implemented

- New **GET /context** endpoint: Aggregates and returns a context window combining incomplete plans and recent thoughts.
  - **Description**: Retrieves incomplete plans and the last 10 thoughts (or all if fewer than 10).
  - **Response**: 200 OK, `{ "incompletePlans": [...], "last10Thoughts": [...] }`
    - `incompletePlans`: Array of plans where `status !== 'completed'`, sorted ascending by `timestamp`. Empty `[]` if no incomplete plans.
    - `last10Thoughts`: Last 10 thoughts (or all if <10), sorted descending by `timestamp`. Empty `[]` if no thoughts.
  - **Example Response**:
    ```
    {
      "incompletePlans": [
        {
          "id": 1,
          "title": "Sample Plan",
          "description": "Description",
          "status": "proposed",
          "timestamp": "2025-09-30T22:00:00.000Z",
          "changelog": []
        }
      ],
      "last10Thoughts": [
        {
          "id": 5,
          "content": "Recent thought",
          "timestamp": "2025-09-30T23:00:00.000Z",
          "plan_id": null
        },
        {
          "id": 4,
          "content": "Another recent thought",
          "timestamp": "2025-09-30T22:50:00.000Z",
          "plan_id": "1"
        }
      ]
    }
    ```
  - **Logic**:
    - Aggregates from `data/plans.json` and `data/thoughts.json`.
    - Filtering: `incompletePlans` excludes plans with `status: 'completed'`.
    - Sorting: `incompletePlans` ascending by `timestamp`; `last10Thoughts` descending by `timestamp`.
    - Limiting: `last10Thoughts` limited to 10 most recent.
  - **Edge Cases**:
    - Empty JSON files: Returns `{ "incompletePlans": [], "last10Thoughts": [] }`.
    - No incomplete plans: `incompletePlans` is `[]`.
    - Fewer than 10 thoughts: Returns all thoughts.
    - All plans completed: `incompletePlans` is `[]`.
    - No thoughts: `last10Thoughts` is `[]`.
  - **Notes**: No request body or parameters. Builds on v1.3 retrieval logic without modifying existing endpoints.

### Usage Instructions

- Start the server: `node server.js` (runs on `http://localhost:3000`).

- Retrieve context window: `curl http://localhost:3000/context`

- Notes:
  - `incompletePlans` filters on `status !== 'completed'` and sorts ascending by `timestamp`.
  - `last10Thoughts` selects the 10 most recent thoughts (descending by `timestamp`), or all if fewer.

### Notable Changes

- Added context aggregation endpoint (`GET /context`) for retrieving incomplete plans and recent thoughts in a single response.
- No breaking changes to existing endpoints (v1.0-v1.5 functionality preserved).
- Builds on v1.5 with 32 passing tests, including a separate `v1.6.test.js` (3 tests: response structure, edge cases like empty data, and integration with plans/thoughts aggregation).

## v1.7 - SQLite Migration

### Features Implemented

- Switched persistence from JSON files (`data/thoughts.json` and `data/plans.json`) to a single SQLite database (`data/tpc.db`).
- Database table schemas:
  - `thoughts`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `content` (TEXT NOT NULL), `timestamp` (TEXT NOT NULL), `plan_id` (TEXT)
  - `plans`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `title` (TEXT NOT NULL), `description` (TEXT NOT NULL), `status` (TEXT NOT NULL DEFAULT 'proposed'), `timestamp` (TEXT NOT NULL), `changelog` (TEXT DEFAULT '[]')  // changelog stored as JSON string
- On first server run, automatically migrates existing data from JSON files to SQLite tables (idempotent process: checks for existing data to avoid duplicates; preserves original JSON files but they are no longer actively used).
- All read and write operations updated to use SQL queries with prepared statements for security and async promises for non-blocking I/O.
- APIs remain fully unchanged: same endpoints, request bodies, response formats, and behaviors as in v1.6.
- Added separate `v1.7.test.js` file with comprehensive regression tests covering all APIs, migration logic, and edge cases; full test suite passes (32+ tests total).

### Usage Instructions

- No changes to API usage: All endpoints from v1.0-v1.6 function identically (e.g., POST /thoughts, GET /plans, etc.).
- Database location: `data/tpc.db` (SQLite file created automatically in the `data/` directory).
- Migration: Handled automatically and idempotently on the first server start; no manual intervention required. If JSON files exist, data is imported once; subsequent runs use only the database.
- Setup: Run `npm install` to ensure the new `sqlite3` dependency is installed (added in v1.7 for database operations).
- Start the server: `node server.js` (runs on `http://localhost:3000`); migration occurs transparently if needed.

### Notable Changes

- Persistence upgraded to SQLite for improved scalability, better handling of concurrent access, and efficient querying compared to JSON files.
- `sqlite3` dependency added to `package.json`; install via `npm install`.
- No breaking changes to any APIs or external interfaces.
- Full regression test suite (including v1.7-specific migration tests) passes, verifying data integrity post-migration and API consistency.

## v1.8 - Basic Filtering

### Features Implemented

- Updated **GET /plans** endpoint to support optional `?status=string` query parameter for exact match filtering.
  - **Description**: Filters plans by exact status match ('proposed', 'in_progress', 'completed'). Ignores invalid statuses, returns empty array `[]` if no matches or invalid status provided. Always sorts results ascending by `timestamp`.
  - **Response**: 200 OK, filtered array of plans (empty `[]` if no matches).
  - **Notes**: Builds on v1.3 retrieval; preserves sorting. Invalid or missing `status` returns all plans sorted ascending by `timestamp`. No request body.

- Updated **GET /thoughts** endpoint to support optional `?limit=number` query parameter for result limiting.
  - **Description**: Limits results to the first N thoughts after sorting ascending by `timestamp`. Returns empty array `[]` if limit <= 0; returns all if limit > total or invalid (non-number); ignores non-numeric values.
  - **Response**: 200 OK, limited array of thoughts (empty `[]` if limit <= 0).
  - **Notes**: Builds on v1.3 retrieval; preserves sorting. Invalid or missing `limit` returns all thoughts sorted ascending by `timestamp`. No request body.

- All other endpoints (v1.0-v1.7) remain unchanged.
- Added separate `v1.8.test.js` file with 11 targeted tests covering filtering, limiting, edge cases (e.g., invalid params, no matches, empty results), and integration; full test suite passes (62 tests total).

### Usage Instructions

- Start the server: `node server.js` (runs on `http://localhost:3000`).

- Retrieve in-progress plans only: `curl "http://localhost:3000/plans?status=in_progress"`

- Retrieve first 5 thoughts: `curl "http://localhost:3000/thoughts?limit=5"`

- Retrieve all plans (invalid status ignored): `curl "http://localhost:3000/plans?status=invalid"`

- Retrieve no thoughts (limit <= 0): `curl "http://localhost:3000/thoughts?limit=0"`

- Notes: Invalid query parameters are ignored (e.g., non-numeric `limit` or invalid `status` behaves as if absent). Sorting (ascending by `timestamp`) is always preserved. Empty results return `[]`.

### Notable Changes

- Introduced basic query parameter filtering for plans (`?status`) and thoughts (`?limit`), enabling targeted retrieval without breaking existing behaviors.
- No breaking changes to any APIs or external interfaces (previous endpoints and default behaviors preserved).
- Builds on v1.7 with 62 passing tests, including dedicated `v1.8.test.js` for new features, edge cases, and full integration.

## v1.9 - Timestamp Queries

### Features Implemented

- Updated **GET /plans** endpoint to support optional `?since=ISO string` query parameter for timestamp-based filtering.
  - **Description**: Filters plans where `timestamp >=` the parsed ISO date (if valid). Returns all plans if no parameter or invalid date provided. Results are always sorted ascending by `timestamp`. Empty array `[]` if no matches.
  - **Response**: 200 OK, filtered array of plans (empty `[]` if no matches).
  - **Notes**: Builds on v1.3 and v1.8 retrieval/filtering. Invalid dates (e.g., malformed ISO) or future dates (no matches) return all plans. No request body.

- Updated **GET /thoughts** endpoint to support optional `?since=ISO string` query parameter for timestamp-based filtering.
  - **Description**: Filters thoughts where `timestamp >=` the parsed ISO date (if valid). Returns all thoughts if no parameter or invalid date provided. Results are always sorted ascending by `timestamp`. Empty array `[]` if no matches.
  - **Response**: 200 OK, filtered array of thoughts (empty `[]` if no matches).
  - **Notes**: Builds on v1.3 and v1.8 retrieval/limiting. Invalid dates or future dates (no matches) return all thoughts. No request body.

- Parameter combinations:
  - For plans: `?since` applied first (timestamp filter), then `?status` (if provided), then sort ascending by `timestamp`.
  - For thoughts: `?since` applied first (timestamp filter), then `?limit` (if provided), then sort ascending by `timestamp`.
  - Multiple params can be combined (e.g., `?since=...&status=...` for plans); filters applied in order: since, then status/limit, then sort. Invalid params ignored individually.

- All other endpoints (v1.0-v1.8) remain unchanged.
- Added separate `v1.9.test.js` file with 11 targeted tests covering timestamp filtering, combinations with existing params, edge cases (e.g., invalid dates, future dates, no matches), and integration; full test suite passes (73 tests total).

### Usage Instructions

- Start the server: `node server.js` (runs on `http://localhost:3000`).

- Retrieve plans since a specific date: `curl "http://localhost:3000/plans?since=2023-01-01T00:00:00.000Z"`

- Retrieve thoughts since a specific date, limited to 5: `curl "http://localhost:3000/thoughts?since=2023-01-01T00:00:00.000Z&limit=5"`

- Retrieve in-progress plans since a date: `curl "http://localhost:3000/plans?since=2023-01-01T00:00:00.000Z&status=in_progress"`

- Notes: Invalid date (e.g., `?since=invalid`) returns all items (as if no param). Future dates or no matches return `[]`. Sorting (ascending by `timestamp`) is always preserved. Empty results return `[]`.

### Notable Changes

- Introduced timestamp-based filtering (`?since=ISO string`) for both plans and thoughts, enabling retrieval of items created after a specific date while preserving combinations with existing params (`?status` for plans, `?limit` for thoughts) and sorting.
- No breaking changes to any APIs or external interfaces (previous endpoints and default behaviors preserved; invalid/no `?since` returns all as before).
- Builds on v1.8 with 73 passing tests, including dedicated `v1.9.test.js` for new features, edge cases, and full integration.