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

UI/UX Foundation Phase
v2.8 - Design System Foundation

CSS Variables System:

Define root CSS variables for colors (primary, secondary, success, warning, error, neutral shades)
Spacing scale (--space-xs: 4px, --space-sm: 8px, --space-md: 16px, --space-lg: 24px, --space-xl: 32px, --space-2xl: 48px)
Typography scale (--text-xs: 12px, --text-sm: 14px, --text-base: 16px, --text-lg: 18px, --text-xl: 20px, --text-2xl: 24px)
Border radius (--radius-sm: 4px, --radius-md: 8px, --radius-lg: 12px)
Shadow scale (--shadow-sm, --shadow-md, --shadow-lg)


Light/Dark Mode:

CSS variables for both themes
Toggle button in header
Preference saved to localStorage
prefers-color-scheme media query for default


Typography:

Web-safe font stack or single Google Font (Inter, System UI, or similar)
Base font size 16px
Line height 1.5 for body, 1.2 for headings
Clear hierarchy (h1-h6 with appropriate sizes/weights)


Layout Grid:

CSS Grid for main layout (header, sidebar optional, main content, footer optional)
Flexbox for component-level layouts
Max-width container (1200px) centered
Responsive breakpoints (mobile: <768px, tablet: 768-1024px, desktop: >1024px)



v2.9 - Component Library Basics

Button Components:

Primary, secondary, danger, ghost variants
Sizes: small, medium, large
States: default, hover, active, disabled, loading (with spinner)
Icon support (optional icon-left/icon-right slots)


Card Component:

Container for plans/thoughts
Header, body, footer sections
Optional elevation (shadow depth)
Hover state (subtle lift/shadow increase)


Badge/Pill Components:

Status badges (color-coded: proposed=blue, in_progress=amber, completed=green)
Tag pills (gray with hover, removable with X button)
needs_review indicator badge (red dot or exclamation)


Input Components:

Text input with label, placeholder, error state
Textarea with auto-resize
Select/dropdown styled consistently
Search input with icon and clear button


Loading States:

Spinner component (CSS-only, no images)
Skeleton screens for plan/thought cards (animated pulse)
Loading overlay for full-page operations



v3.0 - Responsive Layout & Navigation

Responsive Grid System:

Plans/thoughts lists:

Mobile: Single column stack
Tablet: Two columns
Desktop: Two columns with sidebar option


Plan detail view: Full width on mobile, 60% centered on desktop with metadata sidebar


Navigation Header:

Logo/title on left
Search bar in center (collapses to icon on mobile)
Actions on right (theme toggle, settings, user menu placeholder)
Sticky header on scroll


Mobile Menu:

Hamburger menu button on mobile
Slide-in drawer with navigation links
Smooth transitions


Breadcrumbs:

Show navigation path (Home > Plans > Plan #123)
Clickable ancestors for quick navigation


Footer:

Version info
Link to API docs (if created)
Status indicators (DB connected, last sync time)



v3.1 - Enhanced List Views

Plans List Improvements:

Compact/comfortable/spacious density options (user preference saved)
Show/hide columns toggle (timestamp, changelog count, thought count)
Quick actions on hover/swipe (edit, delete, change status)
Expandable rows (click to see description preview without full navigation)


Thoughts List Improvements:

Group by date (Today, Yesterday, This Week, Earlier)
Show linked plan name as clickable chip
Truncate long content with "Read more" expansion


Empty States:

Custom illustrations or icons
Helpful message ("No plans yet. Create your first plan to get started.")
Primary CTA button (e.g., "Create Plan")
Different empty states for: no data, no search results, no filtered results


List Animations:

Fade-in for new items
Slide-out for deleted items
Smooth height transition for expand/collapse



Interaction & UX Phase
v3.2 - Inline Editing & Forms

Inline Editing:

Click plan title/description to edit in-place
Show edit icon on hover to indicate editability
Save on blur or Enter, cancel on Esc
Debounced auto-save (500ms after last keystroke)
Visual feedback: border highlight during edit, success checkmark on save


Modal/Dialog System:

Generic modal component (overlay + centered card)
Used for: create plan, create thought, edit plan (if not inline), delete confirmations
Accessible (focus trap, Esc to close, click outside to close)
Smooth fade-in animation


Form Validation:

Real-time validation (show errors on blur)
Field-level error messages below inputs
Form-level error summary at top
Disable submit until valid
Clear validation on input change


Rich Text Editor:

Replace plain textarea with simple Markdown editor
Toolbar with common formatting (bold, italic, heading, list, link, code)
Live preview pane or toggle preview mode
Use library like SimpleMDE or EasyMDE (lightweight)



v3.3 - Search & Filter UX

Search Enhancements:

Autocomplete dropdown showing suggestions as user types
Highlight matching terms in results
Recent searches saved in localStorage (max 10)
Quick filter chips below search (e.g., "In Plans", "In Thoughts", "With Tags")
Search history accessible via dropdown or down arrow
Clear search button (X icon)


Advanced Filter Panel:

Collapsible sidebar or modal with filter options
Status checkboxes (multi-select)
Tags multi-select with search
Date range picker (created between X and Y)
"Needs Review" toggle
"Reset All Filters" button
Active filters shown as removable chips above results


Filter Persistence:

Save current filters to URL query params (shareable links)
Restore filters from URL on page load
Save user's last filters to localStorage as "default"


Search Results UI:

Grouped by type (Plans section, Thoughts section)
Each result shows: title/content preview, tags, timestamp, relevance score indicator
Click to navigate to detail view
Total count ("Found 23 results for 'React'")



v3.4 - Keyboard Shortcuts & Accessibility

Global Shortcuts:

/ to focus search
n to create new plan
t to create new thought
Esc to close modals/cancel edits
? to show keyboard shortcuts help modal
Ctrl/Cmd + K for command palette (future expansion)


Navigation Shortcuts:

j/k to navigate up/down in lists (Gmail-style)
Enter to open selected item
e to edit selected plan
d to delete (with confirmation)


Accessibility (WCAG 2.1 AA):

Semantic HTML5 (nav, main, article, aside, footer)
ARIA labels for all interactive elements
ARIA live regions for dynamic content (e.g., "Plan created", search results count)
Focus visible indicators (keyboard navigation outline)
Color contrast ratios: 4.5:1 for text, 3:1 for UI components
Screen reader testing (announce status changes, errors, success messages)
Skip to main content link
Alt text for any icons (or aria-hidden if decorative)


Keyboard Help Modal:

Accessible via ? shortcut or footer link
Lists all available shortcuts grouped by category
Visual keyboard key representation



v3.5 - Notifications & Feedback

Toast Notification System:

Position: Top-right corner, stacked
Types: success (green), error (red), warning (amber), info (blue)
Auto-dismiss after 5s (configurable per toast)
Manual dismiss via X button
Action button support (e.g., "Undo" for delete)
Queue system if multiple toasts triggered
Smooth slide-in/fade-out animations


Confirmation Dialogs:

Destructive actions require confirmation (delete plan, delete thought, bulk delete)
Modal with clear messaging: "Are you sure you want to delete this plan? This action cannot be undone."
Danger button (red) for confirm, secondary for cancel
Focus on cancel by default (prevent accidental confirms)


Optimistic UI Updates:

Update UI immediately on user action (create, edit, delete)
Show subtle loading state (e.g., reduced opacity, spinner overlay)
Rollback and show error toast if server request fails
Retry mechanism for failed requests (with user prompt)


Progress Indicators:

Determinate progress bar for multi-step operations (future: bulk operations)
Indeterminate progress for unknown duration (initial data load)
Progress shown in toast or inline in component



Advanced Features Phase
v3.6 - Sorting, Pagination & Performance

Column Sorting:

Clickable column headers in list views
Sort indicators (↑ ascending, ↓ descending)
Multi-column sort: Shift+click for secondary sort (e.g., status then timestamp)
Default sort: most recent first
Sort preference saved per view (plans sort, thoughts sort)


Pagination:

Server-side pagination for large datasets (>100 items)
Page size options: 20, 50, 100 items per page
Pagination controls: First, Previous, 1 2 3 ... 10, Next, Last
URL includes page number (shareable, bookmarkable)
Show total count ("Showing 21-40 of 237")


Infinite Scroll (Alternative):

Optional infinite scroll mode (user preference)
Load more as user scrolls near bottom
"Load More" button fallback if infinite scroll disabled
Scroll position restoration on back navigation


Performance Optimizations:

Debounced search input (300ms)
Throttled scroll events (for infinite scroll)
Virtual scrolling for very long lists (>500 items) using library like react-window or manual implementation
Lazy load Markdown rendering (only render visible cards)
Image lazy loading (if images added in future)



v3.7 - Bulk Operations

Multi-Select:

Checkbox on each plan/thought card
"Select All" checkbox in header
Visual indication of selection (highlighted border, count badge)
Select across pages (persist selection in memory)


Bulk Actions Toolbar:

Appears when items selected (sticky at top or bottom)
Actions: Change Status, Add Tags, Remove Tags, Delete
Shows selection count ("3 plans selected")
Cancel button to deselect all


Bulk Operations:

Status change: Dropdown to select new status, applies to all selected
Tags: Modal with tag input, add/remove tags from all selected
Delete: Confirmation modal with list of items to be deleted
Progress indicator for bulk operations (e.g., "Deleting 5 of 10 plans...")
Error handling: Show which items succeeded/failed


Keyboard Shortcuts for Bulk:

Ctrl/Cmd + A to select all visible
Shift + Click for range selection
Ctrl/Cmd + Click for individual toggle



v3.8 - Drag & Drop

Plan Reordering:

Drag handle icon on each plan card (six dots or hamburger icon)
Drag to reorder plans in list
Visual feedback: card lifts (shadow), drop zones highlighted
Persist order in DB (add sort_order column to plans table)
Sort order default: manual if set, else by timestamp


Thought Linking via Drag:

Drag thought card onto plan card to link/relink
Visual feedback: drop zone on plan cards highlights on hover
Confirmation toast: "Thought linked to Plan #123"
Drag to unlink area (e.g., "Unlink" dropzone or drag back to thoughts list)


Drag Constraints:

Only works on desktop/tablet (not mobile due to scrolling conflicts)
Disable drag during edit mode
Cancel drag on Esc key


Smooth Animations:

Smooth reordering transition (items shift to make space)
Card follows cursor with slight offset
Drop animation (card settles into position)



v3.9 - Alternative Views

View Switcher:

Toggle buttons in toolbar: List, Timeline, Kanban
Selection saved to localStorage
Smooth transition between views (fade or slide)


Timeline View:

Horizontal timeline with date markers
Plans positioned by creation date (or due date if added)
Zoom controls (day, week, month granularity)
Scroll horizontally to navigate time
Click plan to open detail in sidebar
Color-coded by status


Kanban Board:

Three columns: Proposed, In Progress, Completed
Drag plans between columns to change status
Column headers show count
Compact card design (title, tags, timestamp)
Expand card on click for full details
Add plan directly to column (quick create)


View-Specific Features:

List view: Dense/comfortable/spacious options
Timeline view: Filter by date range, zoom level
Kanban view: Collapse columns, swim lanes by tags (future)



v4.0 - Plan Templates & Presets

Template Management API:

POST /templates with {name, title_template, description_template, default_tags[], default_status}
GET /templates to list
PUT /templates/:id to edit
DELETE /templates/:id
Seed with common templates: "Bug Fix", "Feature Request", "Refactor", "Investigation", "Documentation"


Template UI:

"New Plan" button opens dropdown: "Blank" or template list
Template preview modal (shows what will be created)
Template fields can have variables (e.g., {{bug_id}}) with input prompts
Recently used templates shown first


Template Editor:

Settings page with template management
CRUD operations for templates
Markdown preview for description template
Tag input with autocomplete from existing tags
Set default status


Filter Presets:

Save current filters as named preset ("Urgent Review Needed", "Completed This Week")
Preset dropdown in filter panel
Manage presets in settings (rename, delete)
Share preset via URL



v4.1 - Data Visualization

Dashboard Page:

Overview metrics at top: Total Plans, In Progress, Completed, Needs Review
Charts below metrics
Responsive grid (stack on mobile, 2x2 on desktop)


Charts:

Plans by Status: Pie chart or donut chart
Plans Over Time: Line chart (created per day/week/month)
Thoughts Over Time: Line chart
Tag Cloud: Most used tags with size indicating frequency
Completion Rate: Progress bar or gauge (completed / total)


Chart Library:

Use Chart.js (lightweight, good documentation)
Accessible (ARIA labels, keyboard navigation)
Responsive (resize on window resize)
Theme-aware (colors match light/dark mode)


Interactivity:

Click chart segments to filter (e.g., click "In Progress" in pie chart → filter to those plans)
Hover for tooltips with details
Date range selector for time-based charts


Export Charts:

Download chart as PNG
Export underlying data as CSV



v4.2 - Export & Import

Export UI:

"Export" button in toolbar
Modal with options:

What to export: All Plans, All Thoughts, Current View/Filter, Selected Items
Format: JSON, CSV, Markdown
Include: Timestamps, Changelog, Linked Thoughts


Preview button to see export format
Download button or copy to clipboard


Export Endpoints:

GET /export/plans.json?status=&tags=&since= (filtered export)
GET /export/thoughts.json?plan_id=&since=
GET /export/full-backup.json (complete DB export)
Support CSV format with proper escaping
Markdown export creates formatted document with headers


Import UI:

"Import" button in settings
Upload JSON file (from previous export)
Preview what will be imported (count of plans/thoughts)
Conflict resolution: Skip duplicates, Overwrite, Create as new
Progress bar during import
Success message with import summary


Import Endpoint:

POST /import with multipart form data
Validate JSON structure before import
Transaction-based (rollback on error)
Return summary: {imported: 10, skipped: 2, errors: []}



Real-Time & Collaboration Phase
v4.3 - WebSocket Infrastructure

Server-Side WebSocket:

Add ws library to server
WebSocket endpoint: ws://localhost:3000/ws
Broadcast events: plan_created, plan_updated, plan_deleted, thought_created, thought_deleted
Message format: {type: "plan_updated", data: {id, changes, last_modified_by}}


Client-Side WebSocket:

Connect on page load
Reconnect logic with exponential backoff
Connection status indicator in header (green dot = connected, red = disconnected)
Queue messages during disconnect, send on reconnect


Event Handling:

Listen for relevant events based on current view
Update UI when events received (add, update, or remove items)
Differentiate between own actions and external changes (don't double-update for own actions)


Security:

Authentication token in WebSocket connection (if auth added)
Validate all incoming messages
Rate limiting on WebSocket messages



v4.4 - Live Updates & Optimistic UI

Real-Time UI Updates:

New plan appears automatically when created by agent or another user
Plan updates reflected live (status change, edit, tags)
Deleted plans fade out and remove
Smooth animations for all updates (fade-in, slide, pulse highlight)


Optimistic Updates:

UI updates immediately on user action (before server confirmation)
Show loading state (spinner or reduced opacity)
On success: confirm update, show success toast
On failure: rollback UI change, show error toast with retry option
Retry logic: Exponential backoff up to 3 attempts


Live Indicators:

"Live" badge in header when WebSocket connected
Pulse animation on connection
Toast notification when connection lost/restored
Auto-refresh fallback if WebSocket fails (poll every 30s)


Update Notifications:

Toast when plan updated by agent: "Plan #123 updated by Agent"
Option to dismiss or view changes
Batch notifications if many updates (e.g., "3 plans updated")



v4.5 - Conflict Resolution

Conflict Detection:

Add version field to plans/thoughts (incremented on each update)
Server checks version on update; returns 409 Conflict if mismatch
Client detects conflict and shows resolution UI


Conflict Resolution Modal:

Shows two versions side-by-side: "Your changes" vs "Current version"
Diff view highlighting differences (use library like diff-match-patch)
Options: Keep Yours, Keep Theirs, Merge Manually
Manual merge: Editable textarea with both versions combined, user resolves
Save merged version with new version number


Last-Write-Wins (Simple Alternative):

If conflicts rare, show toast: "Plan was updated by Agent. Your changes saved as version 2."
Maintain change history (changelog with user attribution)
Allow viewing history and reverting


Version History UI:

"History" button on plan detail page
Modal showing all versions with timestamps and authors
Click version to view or restore
Diff view between any two versions



v4.6 - Activity Feed & Presence

Activity Feed:

Right sidebar (collapsible) showing recent activity stream
Events: Plan created, status changed, tags added, thought linked, etc.
Each event: icon, description, timestamp, actor (human/agent)
Grouped by time (Just now, 5 minutes ago, Today, Yesterday)
Click event to navigate to relevant plan/thought
Load more button or infinite scroll for older activity


Activity Endpoint:

GET /activity?limit=50&since=timestamp
Returns array of activity objects: {id, type, actor, target_id, target_type, description, timestamp}
Server tracks all mutations and inserts into activity log table


Presence Indicators:

"Agent Active" indicator in header (green pulse) if agent made changes in last 5 minutes
Tooltip shows last activity: "Agent last active 2 minutes ago"
Future: Show other users if multi-user support added


Activity Preferences:

Settings to control activity feed visibility
Filter activity by type (show only plan updates, hide thought activity)
Desktop notifications option (browser permission required)



Polish & Production Phase
v4.7 - Error Handling & Validation

Centralized Error Handling:

Express error middleware with consistent JSON format: {error: "message", code: "ERROR_CODE", details: {}}
Error codes: VALIDATION_ERROR, NOT_FOUND, CONFLICT, RATE_LIMIT, SERVER_ERROR
Appropriate HTTP status codes (400, 404, 409, 429, 500)


Input Validation:

Use Zod or Joi for schema validation on all POST/PUT/PATCH endpoints
Validate: required fields, data types, string lengths, array sizes, format (e.g., ISO dates)
Return detailed validation errors: {error: "Validation failed", details: [{field: "title", message: "Required"}]}


Rate Limiting:

Add express-rate-limit middleware
Limits: 100 requests/minute per IP for read endpoints, 20/minute for mutations
Return 429 Too Many Requests with Retry-After header
Whitelist localhost for development


Logging:

Add Winston or Pino for structured logging
Log levels: error, warn, info, debug
Log all requests: method, path, status, duration
Log errors with stack traces
Rotate logs daily, keep 7 days
Log to file and console (console only in development)


Health Check:

GET /health endpoint returning {status: "ok", uptime: seconds, database: "connected", websocket: "connected"}
Used by monitoring tools, load balancers
Check DB connection, return degraded if DB down



v4.8 - Settings & Preferences

Settings Page:

Navigation link in header menu
Sections: Appearance, Editor, Notifications, Data, Account (future)


Appearance Settings:

Theme: Light, Dark, Auto (system)
Density: Compact, Comfortable, Spacious
Color scheme: Accent color picker (multiple presets)
Font size: Small, Medium, Large


Editor Settings:

Default plan status (proposed, in_progress)
Auto-save delay (300ms, 500ms, 1s)
Markdown editor: Toolbar position (top, bottom), Preview mode (split, tabs)


Notification Settings:

Enable/disable toast notifications
Auto-dismiss duration (3s, 5s, 10s, never)
Enable desktop notifications (browser permission)
Activity feed: Show/hide, filter types


Data Settings:

Export/import UI (from v4.2)
Clear all data (with confirmation)
Database statistics (total plans, thoughts, disk usage)


Preferences Storage:

Save to localStorage
Sync to server if user accounts added (future)
Reset to defaults button



v4.9 - Documentation & Help

In-App Help:

Help button in header (? icon)
Opens help sidebar or modal
Sections: Getting Started, Features, Keyboard Shortcuts, API Docs, Troubleshooting
Context-sensitive help (different content based on current page)


Onboarding Tour:

First-time user experience
Interactive walkthrough of key features (create plan, link thought, use search)
Skip option, "Don't show again" checkbox
Use library like Shepherd.js or Intro.js


API Documentation:

Auto-generated docs from OpenAPI/Swagger spec
Served at /api-docs
Interactive: Try endpoints directly in browser
Examples for all endpoints
Authentication section (if/when added)


Changelog:

/changelog page showing version history
Each version: version number, date, list of changes
Link to GitHub releases (if applicable)


Tooltips:

Contextual tooltips throughout UI for complex features
Hover icons to see explanations
Keyboard shortcut hints in tooltips (e.g., "Search (/)")



v5.0 - Performance & Optimization

Frontend Optimization:

Minify CSS/JS for production
Bundle splitting (vendor, app code)
Tree shaking to remove unused code
Compress assets (gzip/brotli)
Service worker for offline support (cache static assets)
Progressive Web App (PWA) manifest for install prompt


Backend Optimization:

Database query optimization (EXPLAIN QUERY PLAN)
Add indexes for common queries (status, tags, timestamp, needs_review)
Connection pooling for SQLite (better-sqlite3 options)
Response caching for expensive queries (GET /context with 1s TTL)
Compression middleware (gzip responses)


Performance Monitoring:

Add performance metrics: response times, query durations
Client-side: Navigation timing, render performance
Server-side: Request duration, DB query time
Log slow queries (>100ms)
Dashboard showing metrics (future: integrate Prometheus/Grafana)


Load Testing:

Use Artillery or k6 for load testing
Test: 100 concurrent users, 1000 requests/min
Identify bottlenecks, optimize
Target: <100ms response time for reads, <500ms for writes

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