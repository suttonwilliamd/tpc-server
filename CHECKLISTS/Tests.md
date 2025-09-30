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

## **v1.4 - Thought-Plan Linking**

**Tests:**
```javascript
// Test 1: Thought can link to plan
POST /thoughts
Body: {"content": "About plan 1", "plan_id": "1"}
Expect: 201, {plan_id: "1", ...}

// Test 2: Get thoughts for a plan
GET /plans/1/thoughts
Expect: 200 OK, [{content: "About plan 1", ...}]

// Test 3: Invalid plan_id returns empty
GET /plans/999/thoughts
Expect: 200 OK, []

// Test 4: Thoughts without plan_id work normally
```

## **v1.5 - Plan Changelog**

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

## **v1.6 - Context Window Simulation**

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

## **v1.7 - SQLite Migration**

**Tests:**
```javascript
// All previous v1.0-v1.6 tests should still pass identically
// Test: Data persists after server restart
// Test: Concurrent requests don't corrupt data
```

## **v1.8 - Basic Filtering**

**Tests:**
```javascript
// Test 1: Filter plans by status
Create: plan1 (proposed), plan2 (in_progress), plan3 (proposed)
GET /plans?status=proposed
Expect: [plan1, plan3]

// Test 2: Limit thoughts
Create 25 thoughts
GET /thoughts?limit=5
Expect: array length = 5, most recent first

// Test 3: Invalid parameters handled gracefully
GET /plans?status=invalid
Expect: 400 Bad Request
```

## **v1.9 - Timestamp Queries**

**Tests:**
```javascript
// Test 1: Get plans since timestamp
Create plan1, wait 1s, note timestamp, create plan2
GET /plans?since=<timestamp>
Expect: [plan2] only

// Test 2: Get thoughts since timestamp
Similar test with thoughts

// Test 3: Invalid timestamp format
GET /plans?since=not-a-timestamp
Expect: 400 Bad Request
```

## **v2.0 - Static HTML UI**

**Tests:**
```javascript
// Test 1: HTML file exists and loads
GET / (or /index.html)
Expect: 200 OK, Content-Type: text/html

// Test 2: HTML contains expected elements
Inspect response body for:
- <title> containing "TPC Server"
- Elements with ids like "plans-list", "thoughts-list"

// Test 3: Can load CSS/JS assets
```

## **v2.1 - Read-Only API UI**

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

## **v2.2 - Plan Detail Pages**

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
```javascript
// Test 1: Human edit sets needs_review
PUT /plans/1 (human edit)
Check response: {needs_review: true, ...}

// Test 2: Agent updates don't set flag
PATCH /plans/1 (agent update)
Check response: {needs_review: false, ...}

// Test 3: Flag persists in GET
GET /plans/1
Expect: {needs_review: true, ...}
```

## **v2.5 - Agent Review System**

**Tests:**
```javascript
// Test 1: Can filter by needs_review
Create plans with different needs_review values
GET /plans?needs_review=true
Expect: only plans with needs_review=true

// Test 2: Agent can clear flag
PATCH /plans/1
Body: {"needs_review": false}
GET /plans/1
Expect: {needs_review: false}

// Test 3: Context endpoint includes needs_review plans
GET /context
Expect: includes plans with needs_review=true in plans array
```

## **v2.6 - Rich Text Support**

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

**Tests:**
```javascript
// Test 1: Full-text search finds content
Create thought: "We should use React for the frontend"
GET /thoughts?q=React
Expect: array containing the thought

// Test 2: Search across plans and thoughts
GET /search?q=React
Expect: {thoughts: [...], plans: [...]}

// Test 3: Tag filtering
GET /plans?tags=urgent
Expect: only plans with "urgent" tag
```

## **v2.8 - The "Endgame"**

**Tests:**
```javascript
// Test 1: Real-time updates
Open two UI windows, edit plan in one, verify other updates automatically

// Test 2: Plan templates work
POST /plans/templates/bugfix
Expect: creates plan with pre-filled bugfix template

// Test 3: Export functionality
GET /export/plans.json
Expect: 200 OK, JSON file with all plan data

// Test 4: Error handling
Test various error conditions, verify graceful degradation
```

## **Testing Strategy Notes:**

- **Each version's tests become regression tests** for subsequent versions
- **API tests** can be automated with Jest/Supertest
- **UI tests** can use Playwright/Cypress from v2.0 onward  
- **Integration tests** verify data flows between AI agent ↔ server ↔ human UI
- **Performance tests** become important around v1.7 (SQLite migration)