[x] ## **v1.0 - Basic Thought Logger**

**Tests:**
```javascript
// Test 1: Can POST a thought
POST /thoughts
Body: {"content": "Test thought"}
Expect: 201 Created, {id: "1", content: "Test thought", timestamp: <current_time>}

 // Test 2: Thought is persisted
GET /thoughts (even though not official yet, test internally)
Expect: [{id: "1", content: "Test thought", timestamp: <time>}]

 // Test 3: Empty content fails
POST /thoughts
Body: {"content": ""}
Expect: 400 Bad Request

 // Test 4: Missing content fails
POST /thoughts
Body: {}
Expect: 400 Bad Request
```

[x] ## **v1.1 - Basic Plan Creator**

**Tests:**
```javascript
// Test 1: Can POST a plan
POST /plans
Body: {"title": "Test Plan", "description": "Do something"}
Expect: 201 Created, {id: "1", title: "Test Plan", description: "Do something", status: "proposed", timestamp: <time>}

 // Test 2: Plan is persisted
GET /plans (internal test)
Expect: [{id: "1", title: "Test Plan", status: "proposed", ...}]

 // Test 3: Missing title fails
POST /plans
Body: {"description": "No title"}
Expect: 400 Bad Request
```

[x] ## **v1.2 - Plan Status Updater**

**Tests:**
```javascript
// Test 1: Can update plan status
PATCH /plans/1
Body: {"status": "in_progress"}
Expect: 200 OK, {status: "in_progress"}

 // Test 2: Status change persists
GET /plans/1
Expect: {status: "in_progress", ...}

 // Test 3: Invalid status fails
PATCH /plans/1
Body: {"status": "invalid_status"}
Expect: 400 Bad Request

 // Test 4: Non-existent plan returns 404
```

[x] ## **v1.3 - Simple Retrieval**

**Tests:**
```javascript
[x] // Test 1: GET /thoughts returns all thoughts
Create 3 thoughts, then:
GET /thoughts
Expect: 200 OK, array with 3 thoughts in chronological order

[x] // Test 2: GET /plans returns all plans
Create 2 plans, then:
GET /plans
Expect: 200 OK, array with 2 plans

[x] // Test 3: Empty arrays when no data
GET /thoughts (with empty DB)
Expect: 200 OK, []
```

[x] ## **v1.4 - Thought-Plan Linking**

**Tests:**
```javascript
// Test 1: POST /thoughts with plan_id (valid/invalid/missing) persists correctly
POST /thoughts {"content": "Linked", "plan_id": "1"} -> 201 includes plan_id
POST /thoughts {"content": "Unlinked"} -> 201 no plan_id
POST /thoughts {"content": "Invalid", "plan_id": "999"} -> 201 includes plan_id "999"

// Test 2: GET /plans/:id/thoughts returns linked thoughts sorted asc by timestamp
Create plan 1, add 2 linked thoughts -> GET /plans/1/thoughts -> 200 array sorted asc, length 2

// Test 3: Filters unlinked thoughts, empty for no linked thoughts
Add unlinked thought -> GET /plans/1/thoughts -> only linked ones

// Test 4: Invalid/non-existent plan_id returns 200 with []
GET /plans/999/thoughts -> 200 []

// Test 5: Orphans (thoughts with invalid plan_id) not returned for that plan
POST thought with plan_id "999" -> GET /plans/999/thoughts -> 200 []

// Test 6: Integration: Create plan, link thoughts, retrieve sorted
// Test 7: Regression: Prior endpoints (POST/GET plans/thoughts) unaffected
```

[x] ## **v1.5 - Plan Changelog**

**Tests:**
```javascript
// Test 1: Can append to changelog
PATCH /plans/1/changelog
Body: {"change": "Added feature X"}
Expect: 200 OK, {changelog: ["Added feature X"]}

 // Test 2: Changelog accumulates
PATCH /plans/1/changelog
Body: {"change": "Fixed bug Y"}
Expect: {changelog: ["Added feature X", "Fixed bug Y"]}

 // Test 3: Changelog appears in GET /plans/1
GET /plans/1
Expect: {changelog: [array of changes], ...}
```

[x] ## **v1.6 - Context Window Simulation**

**Tests:**
```javascript
// Test 1: GET /context returns incomplete plans
Create: plan1 (proposed), plan2 (completed), plan3 (in_progress)
GET /context
Expect: {plans: [plan1, plan3], thoughts: [...]}

 // Test 2: Returns last 10 thoughts
Create 15 thoughts
GET /context
Expect: thoughts array length = 10, with most recent thoughts

 // Test 3: Empty state
GET /context (empty DB)
Expect: {plans: [], thoughts: []}
```

[x] ## **v1.7 - SQLite Migration**

**Tests:**
```javascript
// All previous v1.0-v1.6 tests should still pass identically
// Test: Data persists after server restart
// Test: Concurrent requests don't corrupt data
```

[x] ## **v1.8 - Basic Filtering**

**Tests:**
```javascript
[x] // Test 1: Filter plans by status
Create: plan1 (proposed), plan2 (in_progress), plan3 (proposed)
GET /plans?status=proposed
Expect: [plan1, plan3]

[x] // Test 2: Limit thoughts
Create 25 thoughts
GET /thoughts?limit=5
Expect: array length = 5, oldest first (asc timestamp)

[x] // Test 3: Invalid parameters handled gracefully
GET /plans?status=invalid
Expect: all plans (ignores invalid status)
```

[x] ## **v1.9 - Timestamp Queries**

**Tests:**
```javascript
[x] // Test 1: Get plans since timestamp
Create plan1, wait 1s, note timestamp, create plan2
GET /plans?since=<timestamp>
Expect: [plan2] only (plans >= date, sorted asc)

[x]  // Test 2: Get thoughts since timestamp
Similar test with thoughts (thoughts >= date, sorted asc)

[x]  // Test 3: Invalid timestamp format
GET /plans?since=not-a-timestamp
Expect: all plans (ignores invalid, returns all)
```

## **v2.0 - Static HTML UI**

**Tests:**
[x] ```javascript
// Test 1: HTML file exists and loads
GET / (or /index.html)
Expect: 200 OK, Content-Type: text/html

  // Test 2: HTML contains expected elements
Inspect response body for:
- <title> containing "TPC Server"
- Elements with ids like "plans-list", "thoughts-list"

  // Test 3: Can load CSS/JS assets
// Test 4: UI loads and displays data from DB via sql.js
// Test 5: /tpc.db route serves binary DB file
// Test 6: No error messages in UI
```

[x] ## **v2.1 - Read-Only API UI**

**Tests:**
```javascript
// Test 1: UI makes API calls
Load UI in browser, check network requests to:
GET /plans, GET /thoughts

  // Test 2: Data displays in UI
Create test data, load UI, verify plans and thoughts appear

  // Test 3: UI handles empty state
Load with empty DB, verify appropriate message
```

[x] ## **v2.2 - Plan Detail Pages**

**Tests:**
```javascript
// Test 1: Clicking plan shows detail view
UI test: Click plan in list, verify detail page loads

 // Test 2: Detail page shows plan data
Verify title, description, status, changelog all display

 // Test 3: Related thoughts appear
Create thought linked to plan, verify it appears on detail page

 // Test 4: Back navigation works
```

## **v2.3 - Plan Editing API**

**Tests:**
```javascript
// Test 1: Can update plan details
PUT /plans/1
Body: {"title": "New title", "description": "New desc"}
Expect: 200 OK, {title: "New title", ...}

 // Test 2: Partial updates work
PUT /plans/1
Body: {"title": "Only title updated"}
Expect: 200 OK, description unchanged

 // Test 3: Invalid data rejected
PUT /plans/1
Body: {"title": ""}
Expect: 400 Bad Request
```

## **v2.4 - The "Dirty Flag" System**

**Tests:**
[x] ```javascript
// Test 1: Schema backfill sets needs_review=0 for existing plans after migration
// Verify migration UPDATE sets 0 where NULL

// Test 2: PUT /plans/:id sets needs_review=1 (human), returns with flag
PUT /plans/1 {"title": "Updated"}
Expect: 200 {needs_review: 1, last_modified_by: "human", ...}

// Test 3: Agent PATCH sets needs_review=0
PATCH /plans/1 {"status": "in_progress"}
GET /plans/1
Expect: needs_review: 0, last_modified_by: "agent"

// Test 4: GET /plans and /plans/:id include needs_review
GET /plans
Expect: array with "needs_review" property each

// Test 5: Integration: Edit plan, verify flag in GET /plans?status=..., /context
PUT /plans/1 (human edit)
GET /plans?status=proposed -> find plan with needs_review: 1
GET /context -> incompletePlans include needs_review: 1

// Test 6: Filters compatible (e.g., ?status, ?since include flag)
GET /plans?status=proposed&since=0
Expect: plans with needs_review
```

Full suite passes: npm test (167 tests) && npx playwright test (8 UI tests, unchanged).

[x] ## **v2.5 - Agent Review System**

**Tests:**
```javascript
[x] // Test 1: Can filter by needs_review (unit tests for filtering)
Create plans with different needs_review values
GET /plans?needs_review=true
Expect: only plans with needs_review=true

[x]  // Test 2: Agent can clear flag (unit tests for PATCH)
PATCH /plans/1
Body: {"needs_review": false}
GET /plans/1
Expect: {needs_review: false}

[x]  // Test 3: Context endpoint includes needs_review plans (unit tests for context)
GET /context
Expect: includes plans with needs_review=true in plans array
```

[x] ## **v2.6 - Rich Text Support**

**Tests:**
```javascript
// Test 1: Markdown in plan descriptions
PUT /plans/1
Body: {"description": "**Bold** and *italic*"}
GET /plans/1
Expect: description contains same markdown

  // Test 2: UI renders markdown as HTML
Load plan detail, verify <strong>Bold</strong> appears

  // Test 3: Plain text still works
Verify non-markdown content displays normally

// Regression: All prior E2E tests (v2.0-v2.5) pass after modular refactoring of server.js
npx playwright test → 11 passed (plans count: 10, thoughts count: 6 from migration)
npm test → All Jest tests (v1.0-v2.6) pass, confirming unit/integration logic intact post-refactoring
```

[x] ## **v2.6 - Rich Text Support**

**Tests:**
```javascript
// Test 1: Markdown in plan descriptions
PUT /plans/1
Body: {"description": "**Bold** and *italic*"}
GET /plans/1
Expect: description contains same markdown

 // Test 2: UI renders markdown as HTML
Load plan detail, verify <strong>Bold</strong> appears

 // Test 3: Plain text still works
Verify non-markdown content displays normally
```

## **v2.7 - Search & Organization**

**Unit Tests (Jest in v2.7.test.js):**
- **Schema Migration:** Verify idempotent addition of `tags` column to plans/thoughts (no error on re-run; existing rows backfilled to `[]`).
- **Tagging Operations:**
  - POST /plans/:id/tags {tags: ["urgent"]} → 200, plan.tags = '["urgent"]'; invalid tags (e.g., uppercase/special chars) normalized or rejected.
  - PATCH /plans/:id/tags {action: "add", tags: ["high-priority"]} → adds without duplicates; {action: "remove", tags: ["urgent"]} → removes if exists.
  - Edge: Empty tags array clears all; non-existent ID → 404; invalid action → 400.
  - Similarly for thoughts.
- **Search Logic (GET /search):**
  - q="React" on plan title/desc/thought content/tags → matches partial/case-insensitive (use LIKE or FTS5); relevance score (e.g., term count + tag exact match bonus).
  - Combined results: {plans: [matched plans sorted by score DESC then timestamp DESC], thoughts: [...], total: N}; ?type=plans → only plans.
  - ?limit=5 → truncates results; empty q → returns top 20 recent (timestamp DESC, no search).
  - No results → {plans: [], thoughts: [], total: 0}; ?tags=urgent → filters to tagged items only.
- **Filtering (GET /plans?tags=):**
  - ?tags=urgent → plans where JSON tags contains "urgent"; ?tags=urgent,high → AND (both tags present).
  - Invalid tags ignored; combined with ?status, ?since.
  - Similarly for thoughts.
- **Context Enhancement (GET /context?search=):**
  - ?search="React" → incomplete plans + last 10 thoughts filtered to matches; no param → full as before.
- **Backward Compatibility:** All pre-v2.7 tests pass (e.g., POST plan without tags succeeds; GET /plans omits tags if not requested).
- **Optimizations:** Verify indexes created in migration; query performance (mock DB, assert no full scans).

**E2E Tests (Playwright in e2e/v2.7.test.js):**
- Load UI, enter search "React" in input → verify /search request, results render in accordions (plans section shows matched plans with tag badges; thoughts section similar).
- Test empty query → shows recent/all; no results → "No matches" message.
- Tag filter: If UI added (e.g., dropdown), select "urgent" → filtered list; click plan detail → shows tags.
- Integration: Create plan via API, add tag, search by tag → appears in UI; markdown in results renders correctly.
- Cross-browser: Test rendering on Chrome/Firefox; no console errors.
- Regression: Existing UI flows (plan list, details, thoughts) unchanged.

Full suite: `npm test` (add ~20 new tests to 167+); `npx playwright test` (add 5-7 new UI tests to 8+). Ensure 100% pass post-v2.7.

[x] ## **v2.8 - Theme System**

**Unit Tests (Jest in v2.8.test.js):**
- 8 tests for theme JS functions: setTheme updates, localStorage mocks, initTheme with preferences, toggle simulation

**E2E Tests (Playwright in e2e/v2.8.test.js):**
- 6 tests: theme attribute changes, viewport-specific layout (mobile 375x667, tablet 768x1024, desktop 1200x800), computed styles for fonts/sizes

Full suite passes: All 214 Jest + 21 Playwright pass; no failures. Coverage increase noted for theme functionality.

## **Testing Strategy Notes:**

- **Each version's tests become regression tests** for subsequent versions
- **API tests** can be automated with Jest/Supertest
- **UI tests** can use Playwright/Cypress from v2.0 onward  
- **Integration tests** verify data flows between AI agent ↔ server ↔ human UI
- **Performance tests** become important around v1.7 (SQLite migration)