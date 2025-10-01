# TPC Server Design Decisions

## Technology Stack Choices

- **Backend: Node.js with Express.js**
  - Chosen for its lightweight, event-driven nature suitable for a simple API server handling asynchronous operations like database queries and file I/O.
  - Express provides a minimal framework for routing and middleware, keeping the server lean without unnecessary abstractions.
  - Version: Express ^5.1.0 for modern async/await support and improved performance.

- **Database: SQLite via sqlite3**
  - Selected for embedded, file-based storage that requires no separate server process, ideal for a single-user or development-focused application.
  - Handles relational data (plans and thoughts) with ACID compliance, supporting the project's need for data integrity in plan changelogs and linkages.
  - Version: sqlite3 ^5.1.7 for compatibility with Node.js and better async handling.

- **Frontend: Vanilla JavaScript with HTML/CSS**
  - Opted for no frameworks (e.g., no React/Vue) to maintain simplicity and reduce bundle size, as the UI is read-only with basic interactions (lists, details).
  - Static files served directly by Express, enabling quick prototyping and easy deployment without build tools.
  - Uses Fetch API for client-side requests to the backend, keeping it lightweight.

- **Utilities: UUID for IDs (though AUTOINCREMENT used), fs/promises for file ops**
  - UUID included but not heavily used; AUTOINCREMENT preferred for simplicity in SQLite.
  - Native Node.js modules (fs, path) for file handling during migrations.

- **Testing: Jest for unit/integration, Playwright for e2e**
  - Jest (^30.2.0) for fast, parallel API testing with Supertest for HTTP mocks.
  - Playwright (^1.55.1) for browser automation in UI tests, supporting Chromium for cross-browser simulation.
  - Cross-env for environment consistency in tests.

## Architecture

- **RESTful API Design**
  - Core endpoints: POST/GET/PATCH/PUT for /plans and /thoughts, with sub-resources like /plans/:id/thoughts and /plans/:id/changelog.
  - Stateless design allows easy scaling or testing; no sessions or auth, focusing on data CRUD for AI/human collaboration.
  - Context endpoint (/context) simulates AI "memory" by returning incomplete plans and recent thoughts, central to the human-AI workflow.

- **Server Structure**
  - Single server.js file handles both production (global DB) and testing (in-memory via createApp factory), promoting code reuse.
  - Middleware: express.json() for body parsing, express.static for frontend serving.
  - Separate init/clean functions for DB setup/teardown, with transactions for atomic operations (e.g., resetting sequences).

- **Environment Handling**
  - NODE_ENV=test uses :memory: DB for isolated, fast tests; production uses data/tpc.db.
  - Migration logic imports from JSON seeds only if tables are empty, ensuring idempotency and easy bootstrapping.

- **Frontend Integration**
  - Static public/ directory with index.html/js/css; JS uses async fetches on load for dynamic rendering.
  - Detail view toggles visibility for plan specifics, maintaining single-page simplicity without routing libraries.

## Data Modeling

- **Plans Table**
  - Fields: id (AUTOINCREMENT PK), title/description (required TEXT), status (ENUM-like: proposed/in_progress/completed), changelog (TEXT as JSON array for flexible audit logs), timestamp/created_at/last_modified_at (TEXT/INTEGER for ISO/Unix), last_modified_by (TEXT: 'agent'/'human'), needs_review (INTEGER flag: 0/1).
  - Changelog as JSON allows easy appending without schema changes; status drives workflow (e.g., incomplete plans in context).
  - Incremental additions (e.g., ALTER TABLE for new columns) with backfill queries to maintain data integrity during evolution.

- **Thoughts Table**
  - Fields: id (AUTOINCREMENT PK), timestamp (TEXT ISO), content (TEXT required), plan_id (TEXT optional FK reference to plans.id).
  - Loose coupling: No foreign key constraints to allow orphan thoughts (e.g., standalone AI musings); queries filter by plan_id for linkage.
  - Sorted by timestamp ASC for chronological retrieval, supporting "since" filtering for incremental updates.

- **JSON vs. Database Usage**
  - Initial seeds in data/plans.json (array of {title, description, status, changelog[], timestamp}) and thoughts.json ({content, timestamp, plan_id?}) for easy manual data entry.
  - One-time migration to SQLite on init if empty, preserving JSON as fallback/source; DB preferred for queries, relations, and concurrency.
  - Hybrid approach: JSON for simplicity in early prototypes, DB for production scalability and querying (e.g., status filters, joins).

- **ID Strategy**
  - SQLite AUTOINCREMENT for sequential, predictable IDs; UUID dependency present but unused, possibly for future distributed needs.

## Testing Approach

- **Unit/Integration Tests with Jest**
  - Versioned files (e.g., v1.4.test.js) test incremental features, becoming regression suite (167+ tests total).
  - Uses Supertest for API mocking; covers happy paths, errors (400/404/500), persistence, and edge cases (empty content, invalid status).
  - Config: jest.config.js ignores /e2e/, runs in-band for DB consistency; cross-env sets NODE_ENV=test for in-memory DB.
  - Strategy: Each version adds tests without breaking prior ones; focuses on API contracts for AI compatibility.

- **End-to-End Tests with Playwright**
  - Directory: /e2e with versioned files (e2e/v2.0.test.js etc., 8+ tests); simulates browser interactions (load UI, click plans, verify details).
  - Config: playwright.config.js sets baseURL localhost:3000, Chromium project, HTML reporter, retries in CI.
  - Covers UI rendering, data display, navigation (e.g., plan details, back button); runs post-Jest in npm test script.
  - Incremental: v2.x tests validate frontend against API, ensuring human-AI loop (view/edit plans).

- **Overall Strategy**
  - Phased per development checklist: API tests first (v1.x), UI later (v2.x); full suite: npm test && npx playwright test.
  - Emphasizes regression (prior versions unchanged), integration (data flow AI→server→UI), and isolation (clean DB per test).
  - No mocks for DB in integration tests; real SQLite for fidelity.

## Other Rationale: Structure, Separation of Concerns, Simplicity

- **Incremental Micro-Versions (v1.0-v2.8)**
  - Development guided by CHECKLISTS/Phases.md: 1-3 days per version, building foundation (logging) → linking → data mgmt → UI → collab → polish.
  - Ensures working system at every step; prevents over-engineering (e.g., DB before concept proof, UI before data relations).
  - Backward compatibility: AI workflow (POST thought/plan, PATCH status) unchanged from v1.0.

- **Separation of Concerns**
  - API layer for data ops (AI/human programmatic access); UI for visualization/editing.
  - DB queries abstracted (getAll/getOne/runSql) for reusability across test/prod.
  - Human-AI collab: 'last_modified_by' tracks changes; 'needs_review' flag signals human edits for AI review (cleared by agent actions).

- **Simplicity and Focus**
  - No authentication/authorization: Assumes trusted environment (local dev/AI agent).
  - Minimal dependencies (no ORMs like Sequelize; raw sqlite3 for control); no build tools (vanilla JS).
  - Error handling: Basic 4xx/5xx with JSON; logging via console for dev.
  - Scalability deferred: Single file DB/UI fine for prototype; context limits (last 10 thoughts) prevent overload.
  - Rationale from checklists: Core value (AI context storage, human audit) delivered early; enhancements (search, real-time) as "nice-to-haves."

This design prioritizes rapid iteration, reliability, and clear human-AI interaction in a lightweight package.