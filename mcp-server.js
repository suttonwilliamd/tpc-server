const path = require('path');
const fs = require('fs').promises;
const BetterSqlite3 = require('better-sqlite3');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { initGlobalDB } = require('./db/database.js');

class TPCServer {
  constructor() {
    this.db = null;
    this.server = new Server(
      { name: 'tpc-server', version: '1.0.1' },
      { capabilities: { tools: {}, resources: {} } }
    );
    this.setupHandlers();
  }

  async fileExists(targetPath) {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  defaultHandoffRoots() {
    return [
      path.join(__dirname, 'handoff.md'),
      path.join(__dirname, 'docs', 'handoff.md'),
      path.join(__dirname, '..', 'hermes-workspace', 'memory', 'goals'),
      path.join(__dirname, 'memory', 'goals'),
    ];
  }

  async collectHandoffDocs() {
    const maxDocs = Number.parseInt(process.env.TPC_HANDOFF_MAX_DOCS || '8', 10);
    const maxBytes = Number.parseInt(process.env.TPC_HANDOFF_MAX_BYTES || '4000', 10);
    const roots = this.defaultHandoffRoots();
    const docs = [];

    for (const root of roots) {
      if (!(await this.fileExists(root))) continue;
      const stat = await fs.stat(root);

      if (stat.isFile() && /handoff\.md$/i.test(root)) {
        const content = await fs.readFile(root, 'utf8');
        docs.push({ path: root, content, mtimeMs: stat.mtimeMs });
      }

      if (!stat.isDirectory()) continue;
      const entries = await fs.readdir(root, { withFileTypes: true });

      for (const entry of entries) {
        if (docs.length >= maxDocs * 2) break;
        const direct = path.join(root, entry.name);

        if (entry.isFile() && /handoff\.md$/i.test(entry.name)) {
          const fileStat = await fs.stat(direct);
          const content = await fs.readFile(direct, 'utf8');
          docs.push({ path: direct, content, mtimeMs: fileStat.mtimeMs });
          continue;
        }

        if (entry.isDirectory()) {
          const nested = path.join(direct, 'handoff.md');
          if (await this.fileExists(nested)) {
            const fileStat = await fs.stat(nested);
            const content = await fs.readFile(nested, 'utf8');
            docs.push({ path: nested, content, mtimeMs: fileStat.mtimeMs });
          }
        }
      }
    }

    const unique = new Map();
    for (const d of docs) {
      if (!unique.has(d.path) || unique.get(d.path).mtimeMs < d.mtimeMs) unique.set(d.path, d);
    }

    return [...unique.values()]
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, maxDocs)
      .map((doc) => ({
        path: doc.path,
        modified_at: new Date(doc.mtimeMs).toISOString(),
        excerpt: (doc.content || '').slice(0, maxBytes),
      }));
  }

  extractCompactionAnchors(handoffDocs = []) {
    const anchors = [];

    for (const doc of handoffDocs) {
      const lines = String(doc.excerpt || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!/^([#*-]|\d+\.)\s+/.test(line)) continue;
        const clean = line
          .replace(/^#+\s*/, '')
          .replace(/^[-*]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .trim();
        if (!clean) continue;
        anchors.push({ source: doc.path, text: clean });
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const key = anchor.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(anchor);
      if (dedup.length >= 30) break;
    }

    return dedup;
  }

  async buildContextPayload() {
    const plans = this.db.prepare("SELECT * FROM plans WHERE status != 'completed' AND status != 'rejected' ORDER BY last_modified_at DESC").all();
    const recent_thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10').all().map((t) => this.normalizeThoughtRow(t));
    const handoff_docs = await this.collectHandoffDocs();
    const compaction_anchors = this.extractCompactionAnchors(handoff_docs);

    return {
      plans,
      recent_thoughts,
      thoughts: recent_thoughts,
      handoff_docs,
      compaction_anchors,
      counts: {
        plans: plans.length,
        recent_thoughts: recent_thoughts.length,
        handoff_docs: handoff_docs.length,
        compaction_anchors: compaction_anchors.length,
      },
    };
  }

  validationError(message) {
    const err = new Error(message);
    err.code = 'VALIDATION_ERROR';
    return err;
  }

  assertString(value, field, { required = false, maxLength } = {}) {
    if (value == null || value === '') {
      if (required) throw this.validationError(`${field} is required`);
      return;
    }
    if (typeof value !== 'string') throw this.validationError(`${field} must be a string`);
    if (maxLength && value.length > maxLength) throw this.validationError(`${field} exceeds max length (${maxLength})`);
  }

  assertPositiveInt(value, field, { required = false, max = 1000 } = {}) {
    if (value == null || value === '') {
      if (required) throw this.validationError(`${field} is required`);
      return;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw this.validationError(`${field} must be a positive integer`);
    if (n > max) throw this.validationError(`${field} exceeds max allowed value (${max})`);
  }

  assertStringArray(value, field, { maxItems = 32, maxItemLength = 64 } = {}) {
    if (value == null) return;
    if (!Array.isArray(value)) throw this.validationError(`${field} must be an array of strings`);
    if (value.length > maxItems) throw this.validationError(`${field} exceeds max items (${maxItems})`);
    for (const item of value) {
      if (typeof item !== 'string') throw this.validationError(`${field} must contain only strings`);
      if (item.length > maxItemLength) throw this.validationError(`${field} item exceeds max length (${maxItemLength})`);
    }
  }

  normalizeThoughtRow(row) {
    if (!row) return row;
    let tags = [];
    try {
      const parsed = JSON.parse(row.tags || '[]');
      tags = Array.isArray(parsed) ? parsed : [];
    } catch {
      tags = [];
    }
    const [type = 'observation'] = tags;
    const normalizedPlanId = row.plan_id == null ? null : String(Number.parseInt(String(row.plan_id), 10));
    return {
      ...row,
      tags,
      type,
      plan_id: normalizedPlanId,
    };
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'list_plans', description: 'List all plans in the TPC system', inputSchema: { type: 'object', properties: { status: { type: 'string', description: 'Filter by status: proposed, in_progress, completed, rejected' } } } },
        { name: 'get_plan', description: 'Get a specific plan by ID', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The plan ID' } }, required: ['id'] } },
        { name: 'create_plan', description: 'Create a new plan', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', default: 'proposed' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'description'] } },
        { name: 'update_plan', description: 'Update an existing plan', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, changelog_entry: { type: 'string' }, thought: { type: 'string' } }, required: ['id'] } },
        { name: 'list_thoughts', description: 'List recent thoughts', inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } } },
        { name: 'create_thought', description: 'Create a new thought', inputSchema: { type: 'object', properties: { content: { type: 'string' }, type: { type: 'string', default: 'observation' }, plan_id: { type: 'string', description: 'Optional plan ID to associate this thought with' }, tags: { type: 'array', items: { type: 'string' }, description: 'Optional extra tags' } }, required: ['content'] } },
        { name: 'search_thoughts', description: 'Search thoughts by query', inputSchema: { type: 'object', properties: { q: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: [] } },
        { name: 'get_context', description: 'Get context: incomplete plans + recent thoughts', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_compaction_bundle', description: 'Get pre-compaction bundle with handoff docs and protected anchors', inputSchema: { type: 'object', properties: {} } },
      ],
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        { uri: 'tpc://plans', name: 'All Plans', description: 'List of all plans in the system', mimeType: 'application/json' },
        { uri: 'tpc://thoughts', name: 'Recent Thoughts', description: 'Recent thoughts from the system', mimeType: 'application/json' },
        { uri: 'tpc://context', name: 'System Context', description: 'Current context: incomplete plans + recent thoughts', mimeType: 'application/json' },
        { uri: 'tpc://compaction-bundle', name: 'Pre-compaction Bundle', description: 'Handoff-first compaction payload with protected anchors', mimeType: 'application/json' },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      try {
        if (uri === 'tpc://plans') {
          const plans = this.db.prepare('SELECT * FROM plans ORDER BY last_modified_at DESC').all();
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(plans, null, 2) }] };
        }
        if (uri === 'tpc://thoughts') {
          const thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 20').all().map((t) => this.normalizeThoughtRow(t));
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(thoughts, null, 2) }] };
        }
        if (uri === 'tpc://context') {
          const contextPayload = await this.buildContextPayload();
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(contextPayload, null, 2) }] };
        }
        if (uri === 'tpc://compaction-bundle') {
          const contextPayload = await this.buildContextPayload();
          const bundle = {
            generated_at: new Date().toISOString(),
            source: 'handoff-first',
            handoff_docs: contextPayload.handoff_docs,
            compaction_anchors: contextPayload.compaction_anchors,
            recent_thoughts: contextPayload.recent_thoughts,
            open_plan_ids: contextPayload.plans.map((p) => p.id),
            counts: contextPayload.counts,
          };
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(bundle, null, 2) }] };
        }
        throw new Error(`Unknown resource: ${uri}`);
      } catch (err) {
        throw new Error(`Failed to read resource: ${err.message}`);
      }
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      try {
        switch (name) {
          case 'list_plans': {
            let query = 'SELECT * FROM plans';
            const params = [];
            if (args.status) {
              query += ' WHERE status = ?';
              params.push(args.status);
            }
            query += ' ORDER BY last_modified_at DESC';
            const plans = this.db.prepare(query).all(...params);
            return { content: [{ type: 'text', text: JSON.stringify(plans, null, 2) }] };
          }
          case 'get_plan': {
            this.assertPositiveInt(args.id, 'id', { required: true, max: 2147483647 });
            const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            if (!plan) return { content: [{ type: 'text', text: `Plan not found: ${args.id}` }] };
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }
          case 'create_plan': {
            this.assertString(args.title, 'title', { required: true, maxLength: 200 });
            this.assertString(args.description, 'description', { required: true, maxLength: 20000 });
            this.assertString(args.status, 'status', { maxLength: 64 });
            this.assertStringArray(args.tags, 'tags', { maxItems: 64, maxItemLength: 64 });
            const nowIso = new Date().toISOString();
            const nowMs = Date.now();
            const stmt = this.db.prepare(`
              INSERT INTO plans (title, description, status, changelog, timestamp, created_at, last_modified_by, last_modified_at, tags, needs_review)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(
              args.title,
              args.description,
              args.status || 'proposed',
              JSON.stringify([]),
              nowIso,
              nowMs,
              'mcp',
              nowMs,
              JSON.stringify(Array.isArray(args.tags) ? args.tags : []),
              0
            );
            const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(result.lastInsertRowid);
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }
          case 'update_plan': {
            this.assertPositiveInt(args.id, 'id', { required: true, max: 2147483647 });
            this.assertString(args.status, 'status', { maxLength: 64 });
            this.assertString(args.changelog_entry, 'changelog_entry', { maxLength: 2000 });
            this.assertString(args.thought, 'thought', { maxLength: 2000 });
            const existing = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            if (!existing) return { content: [{ type: 'text', text: `Plan not found: ${args.id}` }] };

            const updates = [];
            const params = [];
            if (args.status) {
              updates.push('status = ?');
              params.push(args.status);
            }
            if (args.changelog_entry) {
              const changelog = existing.changelog ? JSON.parse(existing.changelog) : [];
              changelog.push({ date: new Date().toISOString().split('T')[0], content: args.changelog_entry });
              updates.push('changelog = ?');
              params.push(JSON.stringify(changelog));
            }
            if (args.thought) {
              const thoughtEntry = `${new Date().toISOString().split('T')[0]}: ${args.thought}`;
              updates.push('description = ?');
              params.push(`${existing.description}\n\n${thoughtEntry}`);
            }
            updates.push('last_modified_at = ?');
            params.push(Date.now());
            params.push(args.id);
            this.db.prepare(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`).run(...params);

            const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }
          case 'list_thoughts': {
            this.assertPositiveInt(args.limit, 'limit', { max: 200 });
            this.assertPositiveInt(args.plan_id, 'plan_id', { max: 2147483647 });
            const limit = Number(args.limit) || 10;
            let thoughts;
            if (args.plan_id) {
              thoughts = this.db.prepare('SELECT * FROM thoughts WHERE plan_id = ? ORDER BY timestamp DESC LIMIT ?').all(Number(args.plan_id), limit);
            } else {
              thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT ?').all(limit);
            }
            thoughts = thoughts.map((t) => this.normalizeThoughtRow(t));
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }
          case 'create_thought': {
            this.assertString(args.content, 'content', { required: true, maxLength: 5000 });
            this.assertString(args.type, 'type', { maxLength: 64 });
            this.assertPositiveInt(args.plan_id, 'plan_id', { max: 2147483647 });
            this.assertStringArray(args.tags, 'tags', { maxItems: 64, maxItemLength: 64 });
            const nowIso = new Date().toISOString();
            const planId = args.plan_id == null || args.plan_id === '' ? null : Number(args.plan_id);
            const tags = [];
            if (args.type) tags.push(String(args.type));
            if (Array.isArray(args.tags)) {
              for (const tag of args.tags) {
                if (typeof tag === 'string' && !tags.includes(tag)) tags.push(tag);
              }
            }
            const stmt = this.db.prepare('INSERT INTO thoughts (timestamp, content, plan_id, tags) VALUES (?, ?, ?, ?)');
            const result = stmt.run(nowIso, args.content, planId, JSON.stringify(tags));
            const thought = this.normalizeThoughtRow(this.db.prepare('SELECT * FROM thoughts WHERE id = ?').get(result.lastInsertRowid));
            return { content: [{ type: 'text', text: JSON.stringify(thought, null, 2) }] };
          }
          case 'search_thoughts': {
            this.assertString(args.q, 'q', { maxLength: 2000 });
            this.assertString(args.query, 'query', { maxLength: 2000 });
            this.assertPositiveInt(args.limit, 'limit', { max: 200 });
            const q = args.q || args.query;
            if (!q) return { content: [{ type: 'text', text: 'Error: q or query is required' }], isError: true };
            const limit = Number(args.limit) || 10;
            const thoughts = this.db.prepare('SELECT * FROM thoughts WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?').all(`%${q}%`, limit).map((t) => this.normalizeThoughtRow(t));
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }
          case 'get_context': {
            const contextPayload = await this.buildContextPayload();
            return { content: [{ type: 'text', text: JSON.stringify(contextPayload, null, 2) }] };
          }
          case 'get_compaction_bundle': {
            const contextPayload = await this.buildContextPayload();
            const bundle = {
              generated_at: new Date().toISOString(),
              source: 'handoff-first',
              handoff_docs: contextPayload.handoff_docs,
              compaction_anchors: contextPayload.compaction_anchors,
              recent_thoughts: contextPayload.recent_thoughts,
              open_plan_ids: contextPayload.plans.map((p) => p.id),
              counts: contextPayload.counts,
            };
            return { content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }] };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    });
  }

  async start() {
    await initGlobalDB();
    const dbPath = path.join(__dirname, 'data', 'tpc.db');
    this.db = new BetterSqlite3(dbPath);
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('TPC MCP Server running on stdio');
  }
}

if (require.main === module) {
  const server = new TPCServer();
  server.start().catch(console.error);
}

module.exports = { TPCServer };
