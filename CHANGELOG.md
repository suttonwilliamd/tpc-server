# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Design system foundation with CSS variables for colors, spacing, typography scales, borders, and shadows in public/style.css.
- Light and dark mode support with toggle button, localStorage persistence, and media query fallback.
- Typography updates with Inter/System UI font stack, base 16px font size, line heights, and h1-h6 hierarchy.
- Responsive layout using CSS Grid for main structure, Flexbox for components, 1200px max-width container, and breakpoints (mobile <768px, tablet 768-1024px, desktop >1024px).

### Changed
- Updated public/style.css for typography and layout improvements as part of the design system foundation.
- Refactored server.js into modular db/, routes/, middleware/ directories. Extracted DB logic to db/database.js, API routes to routes/plans.js, routes/thoughts.js, routes/context.js, error handling to middleware/errorHandler.js. Preserved all endpoints, static serving, test compatibility. No breaking changes. Reduced server.js to ~150 lines with createApp factory.
## [2.6.0] - 2025-10-02

### Added
- Added Markdown storage in plan descriptions via PUT /plans/:id (raw Markdown stored and returned on GETs).
- UI renders Markdown in detail view using marked.js (supports bold, lists, etc.).
- New unit tests in v2.6.test.js for API storage/retrieval.
- New E2E tests in e2e/v2.6.test.js for UI rendering.

## [2.7.0] - 2025-10-02

### Added
- Full-text search endpoint (`GET /search?q=<query>`) with optional parameters `?type=plans|thoughts`, `?tags=tag1,tag2`, `?limit=N` for filtering results across plans and thoughts.
- Tagging system: Added `tags` column (TEXT, JSON array string, default '[]') to both plans and thoughts tables, with idempotent schema migration and backfill for existing records.
- Tag management endpoints: `POST /plans/:id/tags`, `PUT /plans/:id/tags`, `PATCH /plans/:id/tags` (and equivalents for thoughts) to set, replace, or append tags (e.g., body `{ "tags": ["ai", "urgent"] }` or `{ "tag": "new" }` for append).
- Tag filtering: Support `?tags=ai,urgent` (comma-separated) on `GET /plans`, `GET /thoughts`, `GET /search` using AND logic.
- Enhanced `GET /context` with optional `?search=<query>` parameter to apply search filtering to incomplete plans and recent thoughts.
- UI improvements: Added global search input field, tag editing interface in detail views (add/remove tags), and tag filtering dropdowns in plan/thought lists.
- New tests: Unit tests in `v2.7.test.js` covering search, tagging, filtering, schema migration, and endpoint integrations; E2E tests in `e2e/v2.7.test.js` for UI search, tag editing, and filtering interactions.

## [2.4.0] - 2025-10-01

### Added
- `needs_review` INTEGER column (0=false, 1=true, default 0) to plans table to flag plans requiring review after human edits.
- Human edits via `PUT /plans/:id` set `needs_review=1` when `last_modified_by='human'`.
- Agent modifications (e.g., `POST /plans`, `PATCH /plans/:id` for status or changelog) set `needs_review=0` when `last_modified_by='agent'`.
- `needs_review` field included in responses from `GET /plans`, `GET /plans/:id`, and `GET /context` endpoints.
- Schema migration to add the column if missing and backfill existing plans to 0.

## [2.3.0] - 2025-09-25

### Added
- `PUT /plans/:id` endpoint for human editing of plan title and/or description (supports partial updates).
- New schema fields on plans table: `last_modified_by` (TEXT, default 'agent') and `last_modified_at` (INTEGER milliseconds).
- Human edits set `last_modified_by='human'` and update `last_modified_at=Date.now()`.
- Agent updates (e.g., `POST /plans`, `PATCH /plans/:id` status, `PATCH /plans/:id/changelog`) set `last_modified_by='agent'` and update `last_modified_at`.
- `created_at`, `last_modified_at`, and `last_modified_by` fields included in responses from all relevant GET endpoints (`/plans`, `/plans/:id`, `/context`).
- Schema migration to add columns if missing, with backfill for existing plans (set `last_modified_by='agent'`, `last_modified_at=created_at`).
- Validation for `PUT /plans/:id`: 400 for empty title/description or no fields provided; 404 if plan not found.

### Changed
- Updated schema to include `created_at` (INTEGER milliseconds) for plans, backfilled from `timestamp` (ISO string converted to millis).

## [2.2.0] - 2025-09-20

### Added
- Plan detail pages in the UI: Clickable plans in the list to view full details (title, description, status, changelog as timestamped list, linked thoughts as list with content and timestamps).
- Dynamic single-page rendering using DOM manipulation: Hides main lists, shows detail panel on click.
- Fetches `/plans/:id` and `/plans/:id/thoughts` for detail content.
- Loading states, error handling, empty changelog/thoughts states, and "Back to Plans" button to return to main view.

## [2.1.0] - 2025-09-15

### Changed
- UI now uses fetch API for dynamic read-only rendering of plans and thoughts lists from server endpoints (`/plans`, `/thoughts`).
- Parallel fetches with loading indicators, error handling, and empty state messages.

### Added
- Backward compatibility: Retained static sql.js UI functionality via `/tpc.db` route for v2.0 compatibility.
- Network request verification in E2E tests.

## [2.0.0] - 2025-09-10

### Added
- Static HTML UI served at `/index.html` for viewing plans and thoughts.
- Client-side querying of SQLite database using sql.js (loads `/tpc.db` binary).
- View-only lists: Plans display title and status; thoughts display content, timestamp, and optional plan ID.
- Basic inline CSS for readability.
- Route `/tpc.db` to serve database binary for client-side access.
- Playwright E2E tests for UI loading, elements, and list rendering.

## [1.9.0] - 2025-09-05

### Added
- Optional `?since=number` (Unix milliseconds timestamp) query parameter on `GET /plans` and `GET /thoughts` to filter items created at or after the timestamp.
- Filters combine with existing parameters (`?status` for plans, `?limit` for thoughts).
- Sorting remains ascending by creation time (`created_at` for plans, `timestamp` for thoughts).
- Invalid or missing `?since` returns all items; empty array `[]` if no matches (200 OK).
- Schema idempotent update to ensure `created_at` (INTEGER millis) on plans table, backfilled from `timestamp`.
- Tests for filtering, combinations, invalid params, and integration.

## [1.8.0] - 2025-08-31

### Added
- Optional `?status=string` query parameter on `GET /plans` for exact match filtering ('proposed', 'in_progress', 'completed').
- Optional `?limit=number` query parameter on `GET /thoughts` to limit results to first N after sorting ascending by timestamp.
- Invalid parameters ignored: Invalid status returns all plans; invalid limit (<=0 or non-number) returns all thoughts.
- Sorting: Plans by `id` ASC; thoughts by `timestamp` ASC.
- Empty results return `[]` (200 OK).
- Tests for filtering, limiting, edges (invalid params, no matches), and integration.

## [1.7.0] - 2025-08-26

### Changed
- Migrated persistence from JSON files (`data/thoughts.json`, `data/plans.json`) to single SQLite database (`data/tpc.db`).
- Updated all read/write operations to use SQL queries with prepared statements and async promises.
- `changelog` stored as JSON string in database.

### Added
- Database schemas: `thoughts` table (id AUTOINCREMENT, content TEXT NOT NULL, timestamp TEXT NOT NULL, plan_id TEXT); `plans` table (id AUTOINCREMENT, title/description/status/timestamp TEXT NOT NULL, changelog TEXT DEFAULT '[]').
- Automatic idempotent migration on first server run: Imports data from JSON files if present, avoids duplicates.
- `sqlite3` dependency for database operations.
- Route `/tpc.db` to serve database binary (for future UI use).
- Comprehensive regression tests for migration, all APIs, and edge cases.

## [1.6.0] - 2025-08-21

### Added
- `GET /context` endpoint aggregating incomplete plans and recent thoughts for AI "memory".
- Response: `{ "incompletePlans": [plans with status !== 'completed', sorted ASC by timestamp], "last10Thoughts": [last 10 thoughts or all if fewer, sorted DESC by timestamp] }`.
- Edge cases: Empty arrays for no data, all completed plans, or no thoughts.
- Builds on existing retrieval without modifying other endpoints.

## [1.5.0] - 2025-08-16

### Added
- `changelog: []` array on plan creation (backward compatible: POST response excludes it).
- `GET /plans/:id` endpoint returning full plan object including changelog (200 OK, 404 if not found).
- `PATCH /plans/:id/changelog` endpoint: Appends `{ timestamp: Date.now() (number), change: "string" }` to changelog (requires non-empty change; 200 updated plan, 400 empty, 404 not found).
- Separate from existing `PATCH /plans/:id` (status updates).
- Tests for initialization, retrieval, appending, accumulation, errors, and integration.

## [1.4.0] - 2025-08-11

### Added
- Optional `plan_id` (string) in `POST /thoughts` body; stored without validation (invalid/missing allowed for compatibility).
- `GET /plans/:id/thoughts` endpoint: Returns thoughts filtered by `plan_id`, sorted ASC by timestamp; empty `[]` if no plan or no thoughts (200 OK, no 404).
- Tests for linking, retrieval, filtering, empty cases, and integration with prior endpoints.

## [1.3.0] - 2025-08-06

### Added
- `GET /thoughts` endpoint: Returns all thoughts sorted ASC by timestamp (empty `[]` if none).
- `GET /plans` endpoint: Returns all plans sorted ASC by timestamp (empty `[]` if none).
- Tests for retrieval, sorting, empty states, persistence, and integration.

## [1.2.0] - 2025-08-01

### Added
- `PATCH /plans/:id` endpoint: Updates plan status to 'in_progress' or 'completed' (optional body; 200 updated status, 404 not found).
- Temporary `GET /plans/:id` for single plan retrieval (full object, 200 OK, 404 not found).
- Tests for updates, invalid statuses, non-existent IDs, persistence, and regressions.

## [1.1.0] - 2025-07-27

### Added
- `POST /plans` endpoint: Creates plan with `{ title: "string", description: "string" }` (required, non-empty); returns 201 `{ id, title, description, status: "proposed", timestamp }`.
- Storage in `data/plans.json` (empty array initially).
- Tests for creation, validation, multiple plans, persistence via GET, and regressions on thoughts.

## [1.0.0] - 2025-07-22

### Added
- `POST /thoughts` endpoint: Logs thought with `{ content: "string" }` (required, non-empty); returns 201 `{ id, content, timestamp }` (auto-increment ID from 1).
- Storage in `data/thoughts.json` (empty array initially).
- Tests for creation, validation, multiple thoughts, empty state, and persistence.

[2.4.0]: https://github.com/bitFlipper/tpc-server/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/bitFlipper/tpc-server/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/bitFlipper/tpc-server/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/bitFlipper/tpc-server/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/bitFlipper/tpc-server/compare/v1.9.0...v2.0.0
[1.9.0]: https://github.com/bitFlipper/tpc-server/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/bitFlipper/tpc-server/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/bitFlipper/tpc-server/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/bitFlipper/tpc-server/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/bitFlipper/tpc-server/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/bitFlipper/tpc-server/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/bitFlipper/tpc-server/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/bitFlipper/tpc-server/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/bitFlipper/tpc-server/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bitFlipper/tpc-server/releases/tag/v1.0.0

[2.6.0]: https://github.com/bitFlipper/tpc-server/compare/v2.5.0...v2.6.0
[2.7.0]: https://github.com/bitFlipper/tpc-server/compare/v2.6.0...v2.7.0