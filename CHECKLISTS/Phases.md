## Version 1-17: The Micro-Step Roadmap

### **Foundation Phase**

[x] **v1.0 - Basic Thought Logger**
- Single `POST /thoughts` endpoint
- Stores thoughts in a JSON file
- Returns thought ID
- No retrieval, just logging

[x] **v1.1 - Basic Plan Creator** 
- Single `POST /plans` endpoint
- Stores plans in separate JSON file
- Plan: `id, title, status: "proposed"`

[x] **v1.2 - Plan Status Updater**
- `PATCH /plans/:id` to update status
- Can mark plans as `in_progress` or `completed`

[x] **v1.3 - Simple Retrieval**
- `GET /thoughts` and `GET /plans`
- Returns all entries (no filtering yet)

### **Linking Phase**

[x] **v1.4 - Thought-Plan Linking**
- Thoughts can reference plan IDs
- `GET /plans/:id/thoughts` to see related thoughts

[x] **v1.5 - Plan Changelog**
- Add `changelog` array to plans
- `PATCH /plans/:id/changelog` to append change entries

[x] **v1.6 - Context Window Simulation**
- `GET /context` endpoint that returns:
  - All incomplete plans
  - Last 10 thoughts
  - This becomes the AI's "memory"

### **Data Management Phase**

[x] **v1.7 - SQLite Migration**
- Move from JSON files to SQLite database
- Same API surface, just better data handling

[x] **v1.8 - Basic Filtering**
- `GET /plans?status=in_progress`
- `GET /thoughts?limit=20`

[x] **v1.9 - Timestamp Queries**
- `GET /plans?since=timestamp`
- `GET /thoughts?since=timestamp`
- Helps AI get "what's new"

### **Human Interface Phase**

[x] **v2.0 - Static HTML UI**
- Single HTML file that reads from SQLite directly
- Shows plans and thoughts in simple lists
- No interactivity, just viewing

[x] **v2.1 - Read-Only API UI**
- Simple Express server serving basic HTML + fetch API
- Can view data through web interface

[x] **v2.2 - Plan Detail Pages**
- Click a plan to see its full description and changelog
- See linked thoughts

### **Collaboration Phase**

**v2.3 - Plan Editing API**
[x] `PUT /plans/:id` to update title/description
[x] Add `last_modified_by: "human" | "agent"` field

**v2.4 - The "Dirty Flag" System**
[x] `needs_review` INTEGER column (0/1, default 0) on plans
[x] PUT /plans/:id (human) sets needs_review=1
[x] Agent endpoints (POST/PATCH) set needs_review=0
[x] GET responses include needs_review
[x] Schema migration and backfill to 0

[x] **v2.5 - Agent Review System**
[x] `GET /plans?needs_review=true` filtering
[x] `PATCH /plans/:id` for `needs_review=false/true` (agent clearing flag)
[x] `GET /context` including `needs_review` visibility (context integration)

### **Polish Phase**

[x] **v2.6 - Rich Text Support**
- Implemented Markdown in descriptions: API stores/retrieves raw Markdown via PUT/GET /plans/:id
- UI renders Markdown as HTML in detail view using marked.js

[x] **v2.7 - Search & Organization**
- **Data Model Updates:** Idempotent SQLite schema migration adds `tags TEXT DEFAULT '[]'` (JSON array of strings) to both `plans` and `thoughts` tables. Backfill existing rows with empty array `[]`. No breaking changes; existing data unaffected.
- **Tagging System:**
  - `POST /plans/:id/tags` and `POST /thoughts/:id/tags`: Set/replace all tags (body: `{tags: ["tag1", "tag2"]}`).
  - `PATCH /plans/:id/tags` and `PATCH /thoughts/:id/tags`: Add/remove specific tags (body: `{action: "add"|"remove", tags: ["tag1"]}`; supports multiple tags).
  - Validation: Tags are lowercase, alphanumeric + hyphens, max 10 per item, no duplicates.
  - Backward compatible: Existing endpoints (e.g., POST/PUT plans) ignore tags if not provided.
- **Search Endpoint:** New `GET /search?q=query` (searches title/description/content/tags across plans and thoughts).
  - Returns `{plans: [...], thoughts: [...], total: N}` sorted by relevance score (simple term frequency + tag bonus) then timestamp DESC.
  - Params: `?q=term` (required, full-text via SQLite FTS5 or LIKE; case-insensitive, partial matches), `?limit=10` (default 20), `?type=plans|thoughts|all` (default all), `?tags=tag1` (filter by tags, AND logic for multiple).
  - Edge cases: Empty q returns recent items (top 20 by timestamp); no results: empty arrays.
  - Integrates with existing routes: Mount at root level in server.js.
- **Filtering Enhancements:** Update `GET /plans?tags=tag1` and `GET /thoughts?tags=tag1` to filter where tags array contains the value (JSON query or array_contains helper). Support comma-separated for AND: `?tags=urgent,high-priority`.
- **Context Enhancement:** `GET /context?search=query` filters incomplete plans and last 10 thoughts to include only relevant matches, aiding AI history retrieval. Falls back to full context if no search param.
- **DB Optimizations:** Add indexes: `CREATE INDEX IF NOT EXISTS idx_plans_tags ON plans(tags);` `CREATE INDEX IF NOT EXISTS idx_thoughts_tags ON thoughts(tags);` `CREATE INDEX IF NOT EXISTS idx_plans_search ON plans(title, description);` `CREATE INDEX IF NOT EXISTS idx_thoughts_search ON thoughts(content);`. Run idempotently in migration.
- **UI Integration:** Add search input bar to `public/index.html` (above lists). `public/index.js` fetches `/search?q=userInput`, renders combined results in expandable accordions (plans section, thoughts section) with tag badges and relevance highlights.
- **Backward Compatibility:** All existing APIs unchanged (e.g., no required tags, search optional). Schema additive only.
- **Testing:** Jest unit tests in `v2.7.test.js` (search logic, tagging, schema, edges); Playwright E2E in `e2e/v2.7.test.js` (UI search flow, rendering).

**v2.8 - The "Endgame"**
- Real-time updates in UI (WebSockets)
- Plan templates
- Export capabilities
- Proper error handling and validation

---

## Key Development Principles for This Approach:

1. **Each version should take 1-3 days max**
2. **Never break backward compatibility** for the AI agent
3. **The AI's core workflow (POST thought, POST plan, PATCH plan) remains unchanged from v1**
4. **Database schema changes are additive only**
5. **At any point, you have a working system**

## What This Prevents:

- **v1-3**: Prevents getting stuck on database design before proving the concept
- **v4-6**: Prevents building complex UIs before establishing the data relationships  
- **v7-9**: Prevents scalability concerns from blocking basic functionality
- **v10-12**: Prevents interactive features before establishing reliable viewing
- **v13-15**: Prevents over-engineering the human-AI collaboration loop
- **v16-17**: The "nice to haves" that don't block core functionality

The beauty is that **versions 1-6 already deliver your core value proposition**: AI has context storage, humans have audit trail. Everything after that is enhancement.