const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { initGlobalDB, db } = require('./db/database.js');
const plansRouter = require('./routes/plans.js');
const thoughtsRouter = require('./routes/thoughts.js');

class TPCServer {
  constructor() {
    this.server = new Server(
      {
        name: 'tpc-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_plans',
            description: 'List all plans in the TPC system',
            inputSchema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  description: 'Filter by status: proposed, in_progress, completed, rejected',
                },
              },
            },
          },
          {
            name: 'get_plan',
            description: 'Get a specific plan by ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The plan ID',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'create_plan',
            description: 'Create a new plan',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Plan title',
                },
                description: {
                  type: 'string',
                  description: 'Plan description',
                },
                status: {
                  type: 'string',
                  description: 'Plan status: proposed, in_progress',
                  default: 'proposed',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Plan tags',
                },
              },
              required: ['title', 'description'],
            },
          },
          {
            name: 'update_plan',
            description: 'Update an existing plan',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'The plan ID to update',
                },
                status: {
                  type: 'string',
                  description: 'New status: proposed, in_progress, completed, rejected',
                },
                changelog_entry: {
                  type: 'string',
                  description: 'Add a changelog entry (date will be auto-added)',
                },
                thought: {
                  type: 'string',
                  description: 'Add a thought/justification',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'list_thoughts',
            description: 'List recent thoughts',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Number of thoughts to return',
                  default: 10,
                },
              },
            },
          },
          {
            name: 'create_thought',
            description: 'Create a new thought',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Thought content',
                },
                type: {
                  type: 'string',
                  description: 'Thought type: observation, decision, reflection',
                  default: 'observation',
                },
              },
              required: ['content'],
            },
          },
          {
            name: 'search_thoughts',
            description: 'Search thoughts by query',
            inputSchema: {
              type: 'object',
              properties: {
                q: {
                  type: 'string',
                  description: 'Search query',
                },
                limit: {
                  type: 'number',
                  description: 'Max results',
                  default: 10,
                },
              },
              required: ['q'],
            },
          },
          {
            name: 'get_context',
            description: 'Get context: incomplete plans + recent thoughts',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'tpc://plans',
            name: 'All Plans',
            description: 'List of all plans in the system',
            mimeType: 'application/json',
          },
          {
            uri: 'tpc://thoughts',
            name: 'Recent Thoughts',
            description: 'Recent thoughts from the system',
            mimeType: 'application/json',
          },
          {
            uri: 'tpc://context',
            name: 'System Context',
            description: 'Current context: incomplete plans + recent thoughts',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      try {
        if (uri === 'tpc://plans') {
          const plans = db.prepare('SELECT * FROM plans ORDER BY last_modified_at DESC').all();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(plans, null, 2),
              },
            ],
          };
        } else if (uri === 'tpc://thoughts') {
          const thoughts = db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 20').all();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(thoughts, null, 2),
              },
            ],
          };
        } else if (uri === 'tpc://context') {
          const plans = db.prepare("SELECT * FROM plans WHERE status != 'completed' AND status != 'rejected' ORDER BY last_modified_at DESC").all();
          const thoughts = db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10').all();
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ plans, thoughts }, null, 2),
              },
            ],
          };
        }
        
        throw new Error(`Unknown resource: ${uri}`);
      } catch (err) {
        throw new Error(`Failed to read resource: ${err.message}`);
      }
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

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
            const plans = db.prepare(query).all(...params);
            return { content: [{ type: 'text', text: JSON.stringify(plans, null, 2) }] };
          }

          case 'get_plan': {
            const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            if (!plan) return { content: [{ type: 'text', text: `Plan not found: ${args.id}` }] };
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }

          case 'create_plan': {
            const id = require('uuid').v4();
            const now = new Date().toISOString();
            const stmt = db.prepare(`
              INSERT INTO plans (id, title, description, status, timestamp, created_at, last_modified_at, last_modified_by, needs_review)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
              id,
              args.title,
              args.description,
              args.status || 'proposed',
              now,
              now,
              now,
              'mcp',
              0
            );
            
            // Add tags if provided
            if (args.tags && args.tags.length > 0) {
              const tagStmt = db.prepare('INSERT INTO plan_tags (plan_id, tag) VALUES (?, ?)');
              args.tags.forEach(tag => tagStmt.run(id, tag));
            }
            
            const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }

          case 'update_plan': {
            const existing = db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
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
              const thoughts = existing.thoughts ? JSON.parse(existing.thoughts) : [];
              thoughts.push({ date: new Date().toISOString().split('T')[0], content: args.thought });
              updates.push('thoughts = ?');
              params.push(JSON.stringify(thoughts));
            }
            
            updates.push('last_modified_at = ?');
            params.push(new Date().toISOString());
            params.push(args.id);
            
            const stmt = db.prepare(`UPDATE plans SET ${updates.join(', ')} WHERE id = ?`);
            stmt.run(...params);
            
            const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(args.id);
            return { content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }] };
          }

          case 'list_thoughts': {
            const limit = args.limit || 10;
            const thoughts = db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT ?').all(limit);
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }

          case 'create_thought': {
            const id = require('uuid').v4();
            const now = new Date().toISOString();
            const stmt = db.prepare(`
              INSERT INTO thoughts (id, content, type, timestamp, created_at)
              VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(id, args.content, args.type || 'observation', now, now);
            
            const thought = db.prepare('SELECT * FROM thoughts WHERE id = ?').get(id);
            return { content: [{ type: 'text', text: JSON.stringify(thought, null, 2) }] };
          }

          case 'search_thoughts': {
            const limit = args.limit || 10;
            const thoughts = db.prepare(
              "SELECT * FROM thoughts WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?"
            ).all(`%${args.q}%`, limit);
            return { content: [{ type: 'text', text: JSON.stringify(thoughts, null, 2) }] };
          }

          case 'get_context': {
            const plans = db.prepare("SELECT * FROM plans WHERE status != 'completed' AND status != 'rejected' ORDER BY last_modified_at DESC").all();
            const thoughts = db.prepare('SELECT * FROM thoughts ORDER BY timestamp DESC LIMIT 10').all();
            return { content: [{ type: 'text', text: JSON.stringify({ plans, thoughts }, null, 2) }] };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    });
  }

  async start() {
    await initGlobalDB();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('TPC MCP Server running on stdio');
  }
}

// Start if called directly
if (require.main === module) {
  const server = new TPCServer();
  server.start().catch(console.error);
}

module.exports = { TPCServer };
