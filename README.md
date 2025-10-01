# TPC Server

A Node.js/Express API for AI-human collaboration, starting with JSON file storage for thoughts and plans.

## v1.0 - Basic Thought Logger

### Setup and Usage
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. The server runs on `http://localhost:3000`

### Endpoints
- **POST /thoughts**
  - **Description**: Creates a new thought entry.
  - **Request Body**: `{ "content": "string" }` (required, non-empty)
  - **Response**: 201 Created, `{ "id": "number", "content": "string", "timestamp": "ISO string" }`
  - **Errors**:
    - 400 Bad Request if content is missing or empty.
  - **Persistence**: Thoughts are appended to `data/thoughts.json` with auto-incrementing IDs starting from 1.
  - **Notes**: Duplicate content is allowed. No retrieval endpoint in v1.0 (internal testing uses temporary GET).

## v1.1 - Basic Plan Creator

### Endpoints
- **POST /plans**
  - **Description**: Creates a new plan entry.
  - **Request Body**: `{ "title": "string" (required, non-empty), "description": "string" (required, non-empty) }`
  - **Response**: 201 Created, `{ "id": number, "title": "string", "description": "string", "status": "proposed" }`
  - **Errors**:
    - 400 Bad Request if title or description is missing or empty.
  - **Persistence**: Plans are appended to `data/plans.json` with auto-incrementing IDs starting from 1 and a timestamp.
  - **Notes**: Duplicate titles are allowed. Status is set to "proposed". No retrieval endpoint in v1.1 (internal testing uses fs reads). v1.0 /thoughts endpoint remains unchanged.

### Testing
Run `npm test` to execute Jest tests verifying the endpoint functionality.

### Project Structure
- `server.js`: Main Express server.
- `data/thoughts.json`: JSON storage for thoughts (initially empty array; deprecated after v1.7 migration).
- `data/plans.json`: JSON storage for plans (initially empty array; deprecated after v1.7 migration).
- `data/tpc.db`: SQLite database for thoughts and plans (introduced in v1.7).
- `thoughts.test.js`: Unit tests using Supertest.
- `plans.test.js`: Unit tests for plans endpoint using Supertest.
- `v1.6.test.js`: Integration tests for v1.6 features.
- `v1.7.test.js`: Regression tests for v1.7 migration and all APIs.
- `package.json`: Dependencies and scripts.

Future versions will add plans, retrieval, and more features without breaking v1.0 compatibility.

## v1.2 - Plan Status Updater

### Endpoints

- **PATCH /plans/:id**
  - **Description**: Updates the status of an existing plan.
  - **Request Body**: `{ "status": "in_progress" | "completed" }` (optional; if omitted, no change)
  - **Response**: 200 OK, `{ "status": "updated_status" }`
  - **Errors**:
    - 400 Bad Request if status is invalid (must be "proposed", "in_progress", or "completed").
    - 404 Not Found if plan ID does not exist.
  - **Persistence**: Updates the status in `data/plans.json`.
  - **Notes**: Status defaults to "proposed" on creation. This endpoint only updates status; other fields unchanged.

- **GET /plans/:id** (Temporary for testing)
  - **Description**: Retrieves a single plan by ID.
  - **Response**: 200 OK, full plan object.
  - **Errors**: 404 Not Found if plan ID does not exist.
  - **Notes**: Will be replaced by full list retrieval in v1.3. v1.0 /thoughts and v1.1 /plans endpoints remain unchanged.

## v1.3 - Simple Retrieval

### Features Implemented

- **GET /thoughts**
  - **Description**: Retrieves all thoughts as an array, sorted ascending by timestamp.
  - **Response**: 200 OK, `[{ "id": number, "content": "string", "timestamp": "ISO string" }, ...]` (empty `[]` if none).
  - **Notes**: Thoughts are loaded from `data/thoughts.json` and sorted by timestamp. No request body or parameters. Builds on v1.0 POST /thoughts.

- **GET /plans**
  - **Description**: Retrieves all plans as an array, sorted ascending by timestamp.
  - **Response**: 200 OK, `[{ "id": number, "title": "string", "description": "string", "status": "string", "timestamp": "ISO string" }, ...]` (empty `[]` if none).
  - **Notes**: Plans are loaded from `data/plans.json` and sorted by timestamp. No request body or parameters. Replaces temporary GET /plans/:id for public use; single retrieval remains internal for testing. Builds on v1.1 POST /plans and v1.2 PATCH /plans/:id.

### Usage Instructions

- Start the server: `node server.js` (runs on `http://localhost:3000`).

- Retrieve all thoughts: `curl http://localhost:3000/thoughts`

- Retrieve all plans: `curl http://localhost:3000/plans`

### Notable Changes

- Added simple retrieval APIs for thoughts and plans, including sorting by timestamp and handling empty responses.
- No breaking changes to existing endpoints (v1.0-v1.2 functionality preserved).
- All tests pass (21 total, including new integration tests for retrieval after create/update operations).
- Persistence remains in JSON files (`data/thoughts.json`, `data/plans.json`).

## v1.4 - Thought-Plan Linking

### Features Implemented

- Added optional `plan_id` (string) field to the thought schema. This allows thoughts to be associated with a specific plan.
- The `POST /thoughts` endpoint now accepts an optional `plan_id` in the request body and stores it if provided. If not provided, the field is omitted.
- New `GET /plans/:id/thoughts` endpoint: Retrieves all thoughts linked to the specified plan ID, filtered by `plan_id`, sorted ascending by timestamp. Returns an empty array `[]` for a valid plan ID with no linked thoughts. Returns 404 Not Found if the plan ID does not exist.

### Usage Instructions

- Create a thought linked to a plan:  
  `curl -X POST http://localhost:3000/thoughts -H "Content-Type: application/json" -d '{"content": "My linked thought", "plan_id": "123"}'`

- Retrieve thoughts for a specific plan:  
  `curl http://localhost:3000/plans/123/thoughts`

- Note: For a valid plan ID with no linked thoughts, the response is `[]`. If the plan ID does not exist, the endpoint returns 404 Not Found.

### Notable Changes

- Enhanced linking between plans and thoughts to support organized retrieval and association.
- No breaking changes to existing endpoints (v1.0-v1.3 functionality preserved).
- Builds on v1.3 with 24 passing tests, including new integration tests for linking, filtering, and edge cases (e.g., empty results, invalid IDs).

## v1.5 - Plan Changelog

### Features Implemented

- Added `changelog` array to the plan schema, initialized as an empty array. Each entry is an object with `timestamp` (ISO string) and `entry` (string).
- New **PATCH /plans/:id/changelog** endpoint: Appends a new timestamped entry to the plan's changelog. 
  - **Request Body**: `{ "entry": "string" }` (required, non-empty).
  - **Response**: 200 OK, the full updated plan object (including the new changelog entry).
  - **Errors**:
    - 400 Bad Request if `entry` is missing or empty.
    - 404 Not Found if the plan ID does not exist.
  - **Behavior**: If the plan does not exist, it is not created (unlike POST /plans). The changelog is initialized as `[]` if absent. Builds on existing plan retrieval and update logic.
  - **Persistence**: Updates are saved to `data/plans.json`.

### Usage Instructions

- Append to a plan's changelog:  
  `curl -X PATCH http://localhost:3000/plans/123/changelog -H "Content-Type: application/json" -d '{"entry": "New update"}'`
  
- Response includes the full updated plan, e.g., `{ "id": 123, ..., "changelog": [{ "timestamp": "2025-09-30T22:56:00.000Z", "entry": "New update" }] }`.

- Edge cases:
  - Empty entry: Returns 400 Bad Request.
  - Invalid plan ID: Returns 404 Not Found.
  - Multiple appends: Each adds a new timestamped entry to the array.

### Notable Changes

- Introduced changelog tracking for plans to log updates over time.
- No breaking changes to existing endpoints (v1.0-v1.4 functionality preserved).
- Builds on v1.4 with 29 passing tests, including new tests for append operations, multiple entries, 400/404 error handling, and integration with GET /plans.

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