# TPC Server
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/227f8599-fa56-4738-bb33-91e8c015d685)

A Node.js/Express API for AI-human collaboration, starting with JSON file storage for thoughts and plans.

### Setup and Usage
1. Install dependencies: `npm install`
2. Start the server: `node server.js`
3. The server runs on `http://localhost:3000`

## Changelog
See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### Testing
Run `npm test` to execute Jest tests verifying the endpoint functionality.
Run `npx playwright test` for E2E UI tests.

### Project Structure
- `server.js`: Main Express server with modular structure (db/, routes/, middleware/).
- `mcp-server.js`: MCP server for AI clients (stdio transport). Run with `npm run mcp`.
- `data/tpc.db`: SQLite database for persistent storage of thoughts and plans.
- `tests/`: Test files (Jest unit tests, MCP tests).
- `public/`: Static single-page UI.

### Usage Examples
#### REST API
- Retrieve all thoughts: `curl http://localhost:3000/thoughts`
- Retrieve all plans: `curl http://localhost:3000/plans`
- Create a thought: `curl -X POST http://localhost:3000/thoughts -H "Content-Type: application/json" -d '{"content": "My thought"}'`
- Create a plan: `curl -X POST http://localhost:3000/plans -H "Content-Type: application/json" -d '{"title": "My Plan", "description": "Plan details"}'`
- Update plan status: `curl -X PATCH http://localhost:3000/plans/1 -H "Content-Type: application/json" -d '{"status": "in_progress"}'`
- Search across plans/thoughts: `curl "http://localhost:3000/search?q=AI&type=plans&tags=urgent&limit=5"`
- Add tags to a plan: `curl -X PATCH http://localhost:3000/plans/1/tags -H "Content-Type: application/json" -d '{"tag": "ai"}'` (appends) or `{"tags": ["ai", "urgent"]}` (replaces)
- Filter plans by tags: `curl "http://localhost:3000/plans?tags=ai,urgent"`
- View UI: Visit http://localhost:3000/index.html after starting the server.

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
- Search and organization: Full-text search API (`/search?q=`) with type/tags/limit filters; UI search input and tag-based filtering/editing.
- Tagging system: Add/edit/filter tags on plans/thoughts via API/UI for better categorization (e.g., ['ai', 'urgent']).

## v2.7 - Search and Organization

### Features Implemented
- Full-text search endpoint (`GET /search?q=<query>`) with optional `?type=plans|thoughts`, `?tags=tag1,tag2`, `?limit=N` for targeted results.
- Tagging system: `tags` column (JSON array) on plans/thoughts tables; manage via `POST/PUT/PATCH /plans/:id/tags` (and for thoughts).
- Tag filtering: `?tags=ai,urgent` (AND logic) on list endpoints (`/plans`, `/thoughts`, `/search`).
- Enhanced `/context` with `?search=<query>` to filter aggregated data.
- UI: Global search input, tag editing in details, tag filtering dropdowns in lists.

### Usage
- API search: `curl "http://localhost:3000/search?q=collaboration&type=plans&tags=ai"`
- Tag a plan: `curl -X PATCH http://localhost:3000/plans/1/tags -H "Content-Type: application/json" -d '{"tags": ["ai", "urgent"]}'` (replace) or `{"tag": "new"}` (append).
- Filter by tags: `curl "http://localhost:3000/plans?tags=ai,urgent"`
- UI: Enter query in search box; click tags to edit/filter in plan/thought views.

### Notable Changes
- Schema addition: `tags` TEXT column (default '[]') to plans/thoughts tables; backward compatible migration with backfill.
- New route: `/search` for unified querying.
- Builds on v2.6 Markdown support and modular structure.
