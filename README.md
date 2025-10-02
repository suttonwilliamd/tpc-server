# TPC Server

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
- `server.js`: Main Express server.
- `data/tpc.db`: SQLite database for thoughts and plans.
- `thoughts.test.js` and `plans.test.js`: Unit tests using Supertest.
- `v1.0.test.js` through `v2.4.test.js`: Version-specific unit tests for endpoints, validation, persistence, and regressions.
- `e2e/v2.0.test.js` through `e2e/v2.2.test.js`: Playwright E2E tests for UI functionality.
- `package.json`: Dependencies and scripts (includes `sqlite3` for database operations).
- `public/index.html`, `public/index.js`, `public/style.css`: Static UI files for viewing plans and thoughts.

### Usage Examples
- Retrieve all thoughts: `curl http://localhost:3000/thoughts`
- Retrieve all plans: `curl http://localhost:3000/plans`
- Create a thought: `curl -X POST http://localhost:3000/thoughts -H "Content-Type: application/json" -d '{"content": "My thought"}'`
- Create a plan: `curl -X POST http://localhost:3000/plans -H "Content-Type: application/json" -d '{"title": "My Plan", "description": "Plan details"}'`
- Update plan status: `curl -X PATCH http://localhost:3000/plans/1 -H "Content-Type: application/json" -d '{"status": "in_progress"}'`
- View UI: Visit http://localhost:3000/index.html after starting the server.

When editing plans, use Markdown syntax in descriptions for formatting (e.g., **bold** text).

## Features
- Rich text support: Plan descriptions accept and display Markdown formatting (bold, lists, etc.) in the UI.

## v2.5 - Agent Review System

### Features Implemented
- `GET /plans?needs_review=true`: Filters plans that require review.
- `PATCH /plans/:id` with body `{"needs_review": false}`: Clears the review flag (sets `needs_review` to 0).
- `GET /context`: Now includes the `needs_review` field for incomplete plans.

### Usage
- Retrieve plans needing review: `curl "http://localhost:3000/plans?needs_review=true"`
- Clear review flag for a plan: `curl -X PATCH http://localhost:3000/plans/1 -H "Content-Type: application/json" -d '{"needs_review": false}'`

### Notable Changes
- No database schema changes.
- Builds directly on v2.4 functionality.