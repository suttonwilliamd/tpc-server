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
  - Modular refactoring: Original monolithic server.js (~1241 lines) refactored into dedicated directories for improved maintainability. server.js (~150 lines) now serves as a thin composition layer, importing and wiring modular components without business logic.
  - **db/database.js**: Handles all database operations including initialization, queries (prepared statements for security), schema migrations (idempotent ALTER TABLE with backfills), and one-time JSON imports (data/plans.json, data/thoughts.json) for bootstrapping.
  - **routes/plans.js, routes/thoughts.js, routes/context.js**: Dedicated Express routers for API handlers. plans.js covers CRUD (POST, GET all/single, PATCH status/changelog, PUT edits), filtering (?status, ?since); thoughts.js handles CRUD and linking (?limit, ?since, /plans/:id/thoughts); context.js aggregates incomplete plans and last 10 thoughts for AI context. Also includes /tpc.db for serving the binary database.
  - **middleware/errorHandler.js**: Centralized error handling middleware for consistent 4xx/5xx JSON responses across all routes, reducing duplication.
  - Middleware stack: express.json() for body parsing, express.static for serving public/ frontend files, custom errorHandler at the end.
  - createApp factory: Exports an app instance configurable for environments (e.g., :memory: DB for isolated Jest tests via NODE_ENV=test, file-based data/tpc.db for production). Supports clean DB teardown in tests with transactions for atomic resets (e.g., sequence handling).
  - Benefits: Adheres to single responsibility principle—DB module for persistence, routes for HTTP handling, middleware for cross-cutting concerns (errors, parsing). Enhances testability (mock/isolate modules), scalability (add new routes/middleware independently), and readability. Functionality preserved (all endpoints, static serving, binary DB access); no new dependencies; tests pass without regressions (npm test, npx playwright test).

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

## Design System

- **Core Principles**
  - **Consistency**: Establishes reusable tokens and components to ensure uniform appearance and behavior across the UI, reducing maintenance and visual debt.
  - **Scalability**: Modular design allows easy extension (e.g., new variants, themes) without refactoring existing code; supports future growth like additional components or breakpoints.
  - **Accessibility**: Adheres to WCAG 2.1 AA guidelines—semantic HTML, sufficient contrast (4.5:1 for text), keyboard navigation, ARIA labels for interactive elements (e.g., buttons, inputs).
  - **Performance**: CSS-only implementations (no JS for basic states); minimal DOM footprint; responsive by default to optimize for various devices.
  - **Developer Experience**: Clear documentation in components (inline comments); utility classes for common patterns; theme-agnostic components that adapt via CSS variables.

- **Design Tokens**
  - Centralized in public/style.css using CSS custom properties (variables) at :root for global access.
  - **Colors**: Semantic palette with light/dark variants—--color-primary (#007bff blue), --color-secondary (#6c757d gray), --color-success (#28a745 green), --color-warning (#ffc107 yellow), --color-error (#dc3545 red), neutral shades (--color-neutral-50 to --color-neutral-900 for grays). Themes override via [theme="dark"] selectors (e.g., --color-background: #ffffff light, #1a1a1a dark).
  - **Typography**: Scales for hierarchy—--font-size-xs (12px) to --font-size-2xl (24px); --font-weight-normal (400), --font-weight-bold (600); --line-height-base (1.5), --line-height-heading (1.2). Font stack: system-ui, -apple-system, sans-serif (web-safe, performant).
  - **Spacing**: Consistent scale for margins/padding—--space-xs (4px) to --space-2xl (48px); utility classes like .p-sm { padding: var(--space-sm); }.
  - **Shadows**: Elevation system—--shadow-sm (0 1px 2px rgba(0,0,0,0.05)), --shadow-md (0 4px 6px rgba(0,0,0,0.1)), --shadow-lg (0 10px 15px rgba(0,0,0,0.1)).
  - **Border Radius**: Rounded aesthetics—--radius-sm (4px), --radius-md (8px), --radius-lg (12px); applied to components for cohesion.
  - Tokens are theme-aware (light/dark) and extensible (e.g., add --color-accent for custom palettes).

- **Components**
  - **Button**: Modular JS class in public/components/Button.js; variants (primary: filled blue, secondary: outlined, ghost: transparent); states (hover: scale 1.02 + color shift, active: inset shadow, disabled: opacity 0.5 + no pointer, loading: spinner overlay). Supports icons (prepend/append SVG), sizes (sm: 32px height, md: 40px, lg: 48px). Usage: new Button({ variant: 'primary', text: 'Save' }).render(container).
  - **Input**: In public/components/Input.js; includes label, placeholder, value binding; states (focus: ring outline, error: red border + message). Supports types (text, search); validation via custom events (e.g., dispatch 'invalid' on bad input). Auto-resizes textarea variant.
  - **Card**: In public/components/Card.js; structure (header/body/footer slots); variants (elevated: --shadow-md, outlined: border); themes adapt colors (e.g., dark mode text inversion). Hover: subtle lift (--shadow-lg + translateY(-1px)). Used for plan/thought displays with dynamic content insertion.

- **Themes**
  - Dual light/dark modes: Applied via <html theme="light|dark"> attribute; CSS selectors override variables (e.g., [theme="dark"] { --color-background: #1a1a1a; --color-text: #ffffff; }).
  - Toggle: Dedicated Button in header (icon: sun/moon); persists via localStorage.setItem('theme', 'dark'); initializes on load with fallback to prefers-color-scheme.
  - Integration: All components/tokens reference variables, ensuring automatic adaptation; no JS required for theme switching (pure CSS).

- **Integration Notes**
  - **Refactoring**: public/style.css reorganized—tokens first, then utilities (e.g., .grid { display: grid; gap: var(--space-md); }), component styles (scoped via classes like .btn-primary), theme blocks. Removed inline styles/duplicates from index.html.
  - **JavaScript Updates**: public/index.js initializes theme on DOMContentLoaded; renders components (e.g., new Card(planData).render(list)); event listeners for toggle (document.querySelector('.theme-toggle').addEventListener('click', switchTheme)).
  - **Layout**: Responsive Grid in main content—grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); media queries for breakpoints (mobile: 1fr, tablet: repeat(2, 1fr), desktop: repeat(3, 1fr)). Flexbox for internal alignments (e.g., card header: justify-content: space-between).
  - **Backward Compatibility**: Existing UI elements updated to use new system without breaking functionality; no API changes.
  - **Testing**: v2.8.test.js covers component rendering, theme switching, responsive states; e2e/v2.8.test.js verifies UI interactions (toggle, input validation, card hovers) across viewports.
  - **Future-Proofing**: Tokens/components designed for v2.9+ (e.g., Badge for tags, easy addition via same pattern); aligns with CHECKLISTS/Phases.md for progressive enhancement.

This design prioritizes rapid iteration, reliability, and clear human-AI interaction in a lightweight package.