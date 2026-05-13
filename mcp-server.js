const path = require('path');
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

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: 'list_plans', description: 'List all plans in the TPC system', inputSchema: { type: 'object', properties: { status: { type: 'string', description: 'Filter by status: proposed, in_progress, completed, rejected' } } } },
        { name: 'get_plan', description: 'Get a specific plan by ID', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The plan ID' } }, required: ['id'] } },
        { name: 'create_plan', description: 'Create a new plan', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', default: 'proposed' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'description'] } },
        { name: 'update_plan', description: 'Update an existing plan', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, changelog_entry: { type: 'string' }, thought: { type: 'string' } }, required: ['id'] } },
        { name: 'list_thoughts', description: 'List recent thoughts', inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } } },
        { name: 'create_thought', description: 'Create a new thought', inputSchema: { type: 'object', properties: { content: { type: 'string' }, type: { type: 'string', default: 'observation' } }, required: ['content'] } },
        { name: 'search_thoughts', description: 'Search thoughts by query', inputSchema: { type: 'object', properties: { q: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['q'] } },
        { name: 'get_context', description: 'Get context: incomplete plans + recent thoughts', inputSchema: { type: 'object', properties: {} } },
      ],
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        { uri: 'tpc://plans', name: 'All Plans', description: 'List of all plans in the system', mimeType: 'application/json' },
        { uri: 'tpc://thoughts', name: 'Recent Thoughts', description: 'Recent thoughts from the system', mimeType: 'application/json' },
        { uri: 'tpc://context', name: 'System Context', description: 'Current context: incomplete plans + recent thoughts', mimeType: 'application/json' },
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
          const thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 20').all();
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(thoughts, null, 2) }] };
        }
        if (uri === 'tpc://context') {
          const plans = this.db.prepare("SELECT * FROM plans WHERE status != 'completed' AND status != 'rejected' ORDER BY last_modified_at DESC").all();
          const thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10').all();
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ plans, thoughts }, null, 2) }] };
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
            const plan = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            if (!plan) return { content: [{ type: 'text', text: `Plan not found: ${args.id}` }] };
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }
          case 'create_plan': {
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
            const limit = Number(args.limit) || 10;
            const thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT ?').all(limit);
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }
          case 'create_thought': {
            const nowIso = new Date().toISOString();
            const stmt = this.db.prepare('INSERT INTO thoughts (timestamp, content, plan_id, tags) VALUES (?, ?, ?, ?)');
            const result = stmt.run(nowIso, args.content, null, JSON.stringify(args.type ? [args.type] : []));
            const thought = this.db.prepare('SELECT * FROM thoughts WHERE id = ?').get(result.lastInsertRowid);
            return { content: [{ type: 'text', text: JSON.stringify(thought, null, 2) }] };
          }
          case 'search_thoughts': {
            const limit = Number(args.limit) || 10;
            const thoughts = this.db.prepare('SELECT * FROM thoughts WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?').all(`%${args.q}%`, limit);
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }
          case 'get_context': {
            const plans = this.db.prepare("SELECT * FROM plans WHERE status != 'completed' AND status != 'rejected' ORDER BY last_modified_at DESC").all();
            const thoughts = this.db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10').all();
            return { content: [{ type: 'text', text: JSON.stringify({ plans, thoughts }, null, 2) }] };
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
