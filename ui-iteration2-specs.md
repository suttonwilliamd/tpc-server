# UI Iteration 2 Technical Specifications

## Overview
This document outlines the technical specifications for enhancing the TPC Server web interface in Iteration 2. The focus is on improving user experience with dedicated creation forms, enhanced detail views, and bulk operations, while maintaining the lightweight vanilla JS approach. These changes build on the existing FastAPI backend, Jinja templates, SQLite models, and session-based navigation (with signature auth for API calls).

Key goals:
- Streamline content creation from context-specific pages.
- Provide richer visualization of relationships (thoughts ↔ plans → changes).
- Enable efficient management of multiple items.
- Ensure compatibility with existing real-time polling and auth.

## 1. High-Level Architecture Diagram

The architecture extends the current MVC pattern (FastAPI routes → Jinja templates → vanilla JS/CSS). New elements include page-specific modals, JS-driven cards/graphs, and bulk API endpoints.

```mermaid
graph TD
    A[User Browser] --> B[Web Pages<br/>(index.html, plans.html, etc.)]
    B --> C[Vanilla JS<br/>(app.js - modals, cards, bulk ops)]
    C --> D[Static CSS<br/>(style.css - styling)]
    C --> E[API Calls<br/>(fetch to /api/*)]
    E --> F[FastAPI Routes<br/>(main.py - auth middleware)]
    F --> G[SQLite DB<br/>(models: Thought, Plan, Change<br/>w/ relationships)]
    F --> H[Real-time Polling<br/>(/api/updates)]
    H --> C
    I[Triggers<br/>(buttons on pages)] --> J[Modals<br/>(base.html + page-specific)]
    J --> C
    subgraph "Frontend"
        A
        B
        C
        D
        I
        J
    end
    subgraph "Backend"
        E
        F
        G
        H
    end
```

Data flow: User interacts via JS-enhanced templates → Authenticated API calls → DB ops → Polling refreshes UI.

## 2. Detailed Specifications for Each Feature

### 2.1 Dedicated Creation Forms
**Description**: Add context-aware buttons on index/plans/thoughts pages to trigger modals for creating thoughts/plans/changes. Enhance existing modals with client-side validation, rich text (simple JS editor for content/description), and relationship selectors (e.g., multi-select for associating thoughts with plans). Forms submit via JS fetch to existing POST endpoints, which handle model relationships.

**File Changes Needed**:
- `templates/index.html`, `templates/plans.html`, `templates/thoughts.html`: Add trigger buttons (e.g., `<button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createThoughtModal">New Thought</button>`) in page-specific sections (e.g., sidebar or header). Pre-populate selectors based on page context (e.g., on plans.html, default to current plan in change modal).
- `templates/base.html`: Extend existing modals (#createThoughtModal, etc.) with rich text areas (add `<div contenteditable="true" class="rich-text"></div>` for content/description) and validation attributes (e.g., `required`, `minlength="10"`). Include JS hooks for relationship selects.
- `static/js/app.js`: Enhance creation functions (e.g., `createThought()`) with:
  - Validation: Check required fields, content length (>10 chars), relationship selections.
  - Rich text: Basic JS editor (bold/italic via execCommand, or simple toolbar).
  - Context: On modal show, filter/load relevant options (e.g., load current page's plans/thoughts via existing `loadPlansForSelection()`).
  - Auth: Add `Authorization: agent_id:signature` header (simulate via prompt or stored session; integrate with auth.py's signature verification).
- `static/css/style.css`: Add `.rich-text { border: 1px solid #ccc; min-height: 100px; padding: 10px; }` and modal button styles.

**New API Endpoints**: None required. Use existing:
- POST `/api/thoughts` (with `plan_ids` for relationships).
- POST `/api/plans` (with `thought_ids`).
- POST `/api/changes` (with `plan_id`).
Data flow: Button click → Modal open (load context via GET /api/plans or /api/thoughts) → User input/validation → JS POST with auth → Backend creates records w/ associations → Polling refreshes lists.

**Data Flow**:
1. Page load: JS fetches lists for selectors.
2. Trigger: Button opens modal, pre-fills (e.g., plan_id from URL).
3. Submit: Validate → POST JSON → Response ID → Close modal, refresh via polling.

### 2.2 Enhanced Detail Views
**Description**: Transform detail/list pages into interactive cards. For `plan_detail.html`: Expandable cards for plan/thoughts/changes with metadata (timestamp, agent, status). Add relationship visualizations (simple tree: plan → changes; graph for thoughts ↔ plans using CSS lines or JS canvas). For `thoughts.html`/`changes.html`: Convert lists to card grids with expand/collapse for full content. Use vanilla JS for toggles and basic graph rendering (no libs).

**File Changes Needed**:
- `templates/plan_detail.html`: Restructure to `<div class="card expandable">` for each entity. Add metadata sections (`<small>Created: {{ plan.created_at }}</small>`). For relationships: `<div class="relationship-tree">Plan → Changes (list cards); Thoughts (linked cards w/ lines)</div>`.
- `templates/thoughts.html`, `templates/changes.html`: Replace `<ul>` lists with `<div class="row">` of cards (`<div class="col-md-6"><div class="card"><div class="card-header">{{ thought.content[:50] }}...</div><div class="card-body collapsed">{{ full content }}</div></div></div>`). Add expand button.
- `static/js/app.js`: Add event listeners for expand/collapse (`document.querySelectorAll('.expandable').forEach(card => card.addEventListener('click', toggleContent));`). For graphs: Simple function to draw lines (`const canvas = document.createElement('canvas'); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);`) or CSS pseudo-elements for trees.
- `static/css/style.css`: `.card.expandable { cursor: pointer; } .collapsed { display: none; } .relationship-tree { position: relative; } .tree-line { position: absolute; border-left: 1px solid #ccc; height: 100%; }`.

**New API Endpoints**: Optional GET `/api/relationships/{entity_type}/{id}` to fetch graph data (e.g., return JSON {nodes: [...], edges: [...]}) if complex queries needed beyond existing detail fetches. Use existing GET `/api/plans/{id}` (includes thoughts/changes).
Data flow: Page render (Jinja passes data) → JS initializes cards/graphs on DOM load → User click expands (toggle class, fetch more if needed via /api) → Polling updates card data.

**Data Flow**:
1. Route fetches data (e.g., plan + joined thoughts/changes).
2. Template renders cards/tree skeleton.
3. JS: On load, draw relationships; on expand, show full content/metadata.

### 2.3 Bulk Operations UI
**Description**: On list views (`plans.html`, `thoughts.html`, `changes.html`), add checkboxes per item and action buttons (Delete Selected, Export Selected, Assign Selected). JS handles selection, confirms actions, calls bulk APIs. Export: Download JSON/CSV. Assign: For thoughts/changes, link to selected plans.

**File Changes Needed**:
- `templates/plans.html`, `templates/thoughts.html`, `templates/changes.html`: In list/cards, add `<input type="checkbox" class="bulk-select" value="{{ plan.id }}">`. Add footer: `<div class="bulk-actions"><button class="btn btn-danger" id="bulkDelete">Delete Selected</button><button class="btn btn-success" id="bulkExport">Export</button><button class="btn btn-info" id="bulkAssign">Assign</button></div>`.
- `static/js/app.js`: Add selection logic (`let selected = []; document.querySelectorAll('.bulk-select').forEach(cb => cb.addEventListener('change', updateSelected));`). For actions:
  - Delete: Confirm → POST `/api/plans/bulk-delete` with {ids: selected}.
  - Export: Fetch data → JS generate Blob/download (JSON or CSV via simple stringify).
  - Assign: Open sub-modal for target (e.g., select plans) → POST bulk associate.
- `static/css/style.css`: `.bulk-actions { position: sticky; bottom: 0; background: white; padding: 10px; border-top: 1px solid #ccc; } .bulk-select { margin-right: 10px; }`.

**New API Endpoints**:
- POST `/api/plans/bulk-delete` {ids: [str]}: Delete plans + cascades (changes); remove associations.
- POST `/api/thoughts/bulk-associate` {thought_ids: [str], plan_ids: [str]}: Create associations.
- POST `/api/changes/bulk-export` {ids: [str], format: 'json'|'csv'}: Return file content (use FastAPI FileResponse).
Similar for thoughts/changes. Implement in main.py with loops over AsyncSession, auth via Depends.
Data flow: JS collect IDs → POST bulk → Response success → Refresh list via polling or manual reload.

**Data Flow**:
1. User checks boxes → JS tracks selected.
2. Button click → Confirm → API call with array → Backend batch ops → UI clear selections, update counts.

## 3. Integration Plan
- **Auth (Signature-based)**: Web GETs are public (middleware skips). For POSTs (creation/bulk), JS must include `Authorization` header. Solution: Add login modal or env var for agent_id/secret; compute HMAC signature in JS (polyfill crypto.subtle). Integrate with auth.py verification. Fallback: Server-side forms if JS auth complex.
- **Real-time Polling**: Leverage existing RealTimeUpdater (polls /api/updates every 5s). After bulk/create, trigger manual poll (`updater.pollUpdates()`) to refresh lists/cards without full reload. For details, add page-specific polling if open.
- **Overall**: No DB schema changes (use existing relationships). Test integration: Run uvicorn, verify modals submit w/ auth, polling updates UI, bulk ops cascade correctly. Deploy: Update requirements.txt if new deps (none planned).

## 4. Potential Risks and Mitigations
- **JS Compatibility**: Vanilla JS ensures broad support, but canvas graphs may vary. Mitigation: Fallback to CSS trees; test on Chrome/Firefox/Edge (no IE).
- **Performance on Large Lists**: Bulk selects/polling on 1000+ items. Mitigation: Add pagination to lists (new query params in routes, e.g., ?page=1&limit=50); lazy-load graphs; limit bulk to 100 items w/ warning.
- **Auth in JS**: Signature computation client-side exposes secrets. Mitigation: Use short-lived tokens or proxy via signed cookies; for MVP, prompt for agent_id and use fixed secret.
- **DB Integrity**: Bulk delete may orphan associations. Mitigation: Use SQLAlchemy cascades or explicit queries to remove links first; add transactions.
- **Rich Text Security**: Contenteditable allows HTML. Mitigation: Sanitize on backend (e.g., bleach lib) before DB insert; limit to basic tags.
- **Visualization Complexity**: Graphs for deep relationships. Mitigation: Limit depth (e.g., 1-level tree); use simple lines, not full D3.

## Conclusion
These specs address MVP limitations by making the UI more interactive and efficient, without heavy dependencies. Total effort: ~20-30 hours (templates/JS 60%, APIs 20%, testing 20%). Next: Implement in Code mode, starting with bulk APIs.