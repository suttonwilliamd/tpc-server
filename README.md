# TPC Server
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/227f8599-fa56-4738-bb33-91e8c015d685)

A Node.js/Express API for AI-human collaboration, starting with JSON file storage for thoughts and plans.

### Setup and Usage
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. The server runs on `http://localhost:3001`

## Changelog
See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### Testing
Run `npm test` (or `npm run test:unit`) to execute Jest API/integration tests.
Run `npm run test:e2e` for Playwright UI tests.
Run `npm run smoke:mcp` for deterministic MCP plan/thought/search lifecycle validation against a disposable database (never your normal data).
Run `npm run test:startup-contract` for dependency-free, injected offline startup/readiness tests.

### Production Security
`/tpc.db` download is disabled in production by default.
To explicitly allow it, set `EXPOSE_TPC_DB=true`.

### Operational Endpoints
- `GET /health` returns basic liveness info.
- `GET /ready` returns readiness info and DB path after a successful database query, or 503 when unavailable.

See the [startup/readiness contract](docs/startup-readiness.md) for initialization,
failure behavior, test boundaries, and limitations.

### Data Contract (REST + MCP)
- **IDs**: integer autoincrement IDs from SQLite for plans/thoughts.
- **Timestamps**:
  - `thoughts.timestamp`, `plans.timestamp` = ISO8601 string.
  - `plans.created_at`, `plans.last_modified_at` = epoch milliseconds.
- **Tags**: JSON-encoded string arrays in DB columns.

### Search Contract (REST, MCP, Context and UI)

- `GET /search?q=needle&type=all&tags=ai&tags=urgent&limit=10` searches plan titles/descriptions, thought content, and **decoded tag strings**. `q` is a trimmed, non-empty string of at most 2,000 characters.
- The only filter values are `type=all` (default), `type=plans`, and `type=thoughts`. Result objects still use singular `type: "plan"` / `"thought"` and retain `{type, id, title, content, tags, timestamp}`; a plan's `content` is its description.
- Text is a **literal substring**, not SQL wildcards, FTS tokens, regex, stemming, or Boolean syntax. `%`, `_`, quotes, backslashes, and commas are ordinary characters. Matching folds ASCII case only; non-ASCII letters are case-sensitive (no Unicode normalization).
- Each repeated `tags` parameter is one exact tag. **Every** requested tag must be present, independently of the text match, using ASCII case-insensitive equality. Input tag values are trimmed; substring tags do not satisfy an exact filter. Up to 64 tags of 1–64 characters are accepted. URL-encode values with `URLSearchParams` or `curl --data-urlencode`, including literal commas.
- Ranking adds 3 for a matching plan title, 2 for description, 3 for thought content, and 3 for a matching tag field (once per field, not per occurrence/tag). The combined plan/thought set is ordered by score descending, timestamp instant descending, then plan before thought, then integer ID ascending. Invalid/missing timestamps sort after valid ones at the same score. Ranking metadata is internal.
- `limit` defaults to 10 and must be an integer from 1 to 50. SQL applies one global limit **after** filtering/ranking; malformed values are rejected, not truncated or silently defaulted. Unknown parameters and repeated `q`, `type`, or `limit` return HTTP 400. Repeated `tags` are intentional.
- MCP `search_thoughts` uses the same matching, ranking, and limits for thoughts: `{"q":"needle","tags":["ai","urgent"],"limit":10,"offset":0}`. It preserves normalized thought fields (`id`, `content`, `timestamp`, `tags`, `type`, `plan_id`), accepts integer `offset` from 0 to 1,000,000, and reports malformed input as a tool error. No FTS-dependent fallback changes the meaning of a query.
- `GET /context?search=needle` uses the same literal matching/ranking, returning at most 50 non-completed plans and 10 thoughts while retaining the context response shape. Only `search` is accepted here; empty/repeated/malformed search values return 400. Unfiltered `/context` behavior is unchanged.
- UI text searches call `/search`, show up to 50 globally ranked results, and honor the type dropdown and all selected tag pills, regardless of the active browsing tab. Clearing text restores the active tab's browsing view. Result clicks fetch full CRUD details before opening the modal; stale search responses cannot overwrite a newer query. Detail responses and failures are also fenced: a newer selection, a view/search change (including the input debounce window), or dismissal invalidates pending detail work, so it cannot replace a newer modal, reopen a dismissed one, or overwrite current results with an obsolete error.
- Pressing Enter cancels any queued input-debounce timer before searching immediately, so a leftover duplicate render cannot invalidate a detail selection made from those immediate results.

**Migration:** `/search` no longer accepts singular `type=plan|thought`. Replace CSV search filters `tags=ai,urgent` with `tags=ai&tags=urgent`; the former now means the **single literal tag** `ai,urgent`. MCP callers must use `q`, not the removed `query` alias, and respect the 50-result maximum. The unrelated `/plans` and `/thoughts` list APIs are unchanged: they retain legacy CSV filters (`tags=ai,urgent` means any tag; `tags=all:ai,urgent` requests all). Those legacy list filters are not the search contract.

**Proof and limitations:** `tests/test_search.js` runs real isolated SQLite regressions for field matches, tag bypass/AND, escaped JSON/literal punctuation, types, relevance/ties/limits, malformed parameters and context. `tests/test_search_lifecycle.js` exercises actual loopback HTTP and stdio MCP against one disposable file, including CRUD/search parity. `e2e/v2.7.test.js` has twelve real Chromium tests using synthetic data and its own loopback server, including delayed genuine detail responses/errors for selection, dismissal and search-change races, plus clock-controlled Enter/debounce coverage. Run it with `npx playwright test e2e/v2.7.test.js --workers=1`; install Chromium first if necessary. These checks and the owned-browser search/modal smoke were exercised on Windows. Other historical UI suites were not qualified by this milestone. Literal substring/JSON queries scan rows; output/input bounds do not promise indexed search or a latency bound on large databases.

### Project Structure
- `server.js`: Main Express server with modular structure (db/, routes/, middleware/).
- `mcp-server.js`: MCP server for AI clients (stdio transport). Run with `npm run mcp`.
- `data/tpc.db`: SQLite database for persistent storage of thoughts and plans.
- `tests/`: Test files (Jest unit tests, MCP tests).
- `public/`: Static single-page UI.

### Usage Examples
#### REST API
- Retrieve all thoughts: `curl http://localhost:3001/thoughts`
- Retrieve all plans: `curl http://localhost:3001/plans`
- Create a thought: `curl -X POST http://localhost:3001/thoughts -H "Content-Type: application/json" -d '{"content": "My thought"}'`
- Create a plan: `curl -X POST http://localhost:3001/plans -H "Content-Type: application/json" -d '{"title": "My Plan", "description": "Plan details"}'`
- Update plan status: `curl -X PATCH http://localhost:3001/plans/1 -H "Content-Type: application/json" -d '{"status": "in_progress"}'`
- Search across plans/thoughts: `curl "http://localhost:3001/search?q=AI&type=plans&tags=urgent&limit=5"`
- Add tags to a plan: `curl -X PATCH http://localhost:3001/plans/1/tags -H "Content-Type: application/json" -d '{"tag": "ai"}'` (appends) or `{"tags": ["ai", "urgent"]}` (replaces)
- Filter plans by tags: `curl "http://localhost:3001/plans?tags=ai,urgent"`
- View UI: Visit http://localhost:3001/index.html after starting the server.

#### MCP Server
- Start MCP server: `npm run mcp`
- Connects via stdio — configure your MCP client to use this
- Available tools: list_plans, get_plan, create_plan, update_plan, list_thoughts, create_thought, search_thoughts, get_context
- Available resources: tpc://plans, tpc://thoughts, tpc://context

## Features
- **MCP Server**: Full MCP protocol implementation for AI clients. Run with `npm run mcp` (stdio transport).
- Modular server architecture: Organized into db/, routes/, and middleware/ for maintainable API development.
- SQLite persistence: Single `data/tpc.db` for thoughts and plans with idempotent schema migrations.
- Comprehensive testing: Jest for unit tests (endpoints, validation, integrations) and Playwright for E2E UI tests (rendering, interactions).
- AI collaboration focus: Endpoints like `/context` aggregate data for agent memory; supports human edits with review flags.
- Rich text support: Plan descriptions accept and display Markdown formatting (bold, lists, etc.) in the UI using marked.js.
- Search and organization: Literal substring search API (`/search?q=`) with type/tags/limit filters; UI search input and tag-based filtering.
- Tagging system: Add/edit/filter tags on plans/thoughts via API/UI for better categorization (e.g., ['ai', 'urgent']).

## v2.7 - Search and Organization

### Features Implemented
- Literal search endpoint (`GET /search?q=<query>`) with optional `type=all|plans|thoughts`, repeated `tags=tag1&tags=tag2`, and `limit=N`. See the current search contract above.
- Tagging system: `tags` column (JSON array) on plans/thoughts tables; manage via `POST/PUT/PATCH /plans/:id/tags` (and for thoughts).
- Search tag filters use exact AND logic. List endpoints retain their separate legacy CSV format, including `tags=all:ai,urgent` for all-tag filtering.
- Enhanced `/context` with `?search=<query>` to filter aggregated data.
- UI: Global search input, tag editing in details, tag filtering dropdowns in lists.

### Usage
- API search: `curl "http://localhost:3001/search?q=collaboration&type=plans&tags=ai"`
- Tag a plan: `curl -X PATCH http://localhost:3001/plans/1/tags -H "Content-Type: application/json" -d '{"tags": ["ai", "urgent"]}'` (replace) or `{"tag": "new"}` (append).
- Filter by tags: `curl "http://localhost:3001/plans?tags=ai,urgent"`
- UI: Enter query in search box; click tags to edit/filter in plan/thought views.

### Notable Changes
- Schema addition: `tags` TEXT column (default '[]') to plans/thoughts tables; backward compatible migration with backfill.
- New route: `/search` for unified querying.
- Builds on v2.6 Markdown support and modular structure.
