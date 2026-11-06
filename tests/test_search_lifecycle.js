/** @jest-environment node */
const path = require('node:path');
const { once } = require('node:events');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createIsolatedRuntime } = require('../scripts/isolated-runtime');

// Actual loopback HTTP and stdio MCP processes share only a disposable SQLite file.
describe('HTTP/MCP search lifecycle parity', () => {
  let runtime;
  let server;
  let db;
  let client;
  let base;
  let database;
  beforeAll(async () => {
    runtime = await createIsolatedRuntime();
    database = require(path.join(runtime.root, 'db/database.js'));
    await database.initGlobalDB(true);
    db = database.getDB();
    const { app } = require(path.join(runtime.root, 'server.js'));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
    client = new Client({ name: 'search-lifecycle-test', version: '1.0.0' }, { capabilities: {} });
    await client.connect(new StdioClientTransport({ command: 'node', args: [path.join(runtime.root, 'mcp-server.js')] }));
  });
  afterAll(async () => {
    try { if (client) await client.close(); }
    finally {
      try {
        if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      } finally {
        try { if (db) await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); }
        finally { if (runtime) await runtime.close(); }
      }
    }
  });

  async function http(route, options) {
    const response = await fetch(`${base}${route}`, options);
    expect(response.status).toBe(options?.method === 'POST' ? 201 : 200);
    return response.json();
  }
  async function tool(name, args) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).not.toBe(true);
    return JSON.parse(result.content[0].text);
  }
  async function restSearch(q, tags = [], limit = 50) {
    const params = new URLSearchParams({ q, type: 'thoughts', limit: String(limit) });
    tags.forEach(tag => params.append('tags', tag));
    return http(`/search?${params}`);
  }

  it('exercises CRUD/search through HTTP and MCP with identical literal matches, tag AND, rank and limits', async () => {
    const special = 'quote"slash\\percent%_comma,';
    const plan = await tool('create_plan', { title: 'lifecycle plan', description: 'needle plan', tags: ['first', 'second'] });
    const first = await tool('create_thought', { content: 'needle highest needle', plan_id: String(plan.id), tags: ['needle', 'First', 'SECOND', special] });
    const second = await http('/thoughts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'a needle substring', tags: ['first', 'second', special] }) });
    const tagOnly = await tool('create_thought', { content: 'unrelated', tags: ['needle', 'first'] });
    await tool('create_thought', { content: 'unrelated', tags: ['unrelated'] });
    // Force deterministic time/ID ties independently of machine clock resolution.
    await database.runSql(db, "UPDATE thoughts SET timestamp = '2026-01-01T00:00:00Z'");
    for (const [q, tags] of [['needle', []], ['eed', []], ['needle', ['FIRST', 'second']], ['needle', [special]], ['%', []], ['_', []], ['"', []], ['\\', []], [',', []], ['[', []], ['needle OR unrelated', []]]) {
      const rest = await restSearch(q, tags);
      const mcp = await tool('search_thoughts', { q, tags, limit: 50 });
      expect(mcp.map(t => t.id)).toEqual(rest.map(t => t.id));
      expect(mcp.map(t => t.content)).toEqual(rest.map(t => t.content));
      expect(mcp.map(t => t.tags)).toEqual(rest.map(t => t.tags));
      for (const row of mcp) {
        expect(row).toHaveProperty('plan_id');
        expect(row).toHaveProperty('type');
        expect(row).not.toHaveProperty('relevance_score');
        expect(row).not.toHaveProperty('result_type');
      }
    }
    const expected = [Number(first.id), Number(second.id), Number(tagOnly.id)];
    expect((await restSearch('needle')).map(t => t.id)).toEqual(expected);
    expect((await tool('search_thoughts', { q: 'needle', limit: 1 })).map(t => t.id)).toEqual(expected.slice(0, 1));
    expect((await tool('search_thoughts', { q: 'needle', limit: 1, offset: 1 })).map(t => t.id)).toEqual(expected.slice(1, 2));
    expect((await tool('search_thoughts', { q: 'needle', offset: 1000000 }))).toEqual([]);
    const linked = (await tool('search_thoughts', { q: 'needle', tags: ['second'] }))[0];
    expect(linked.plan_id).toBe(String(plan.id));
    await http(`/plans/${plan.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) });
    expect((await tool('get_plan', { id: String(plan.id) })).status).toBe('in_progress');
    expect((await http('/ready')).ready).toBe(true);
  });

  it('publishes the canonical MCP schema and rejects malformed or obsolete inputs without fallback', async () => {
    const { tools } = await client.listTools();
    const schema = tools.find(t => t.name === 'search_thoughts').inputSchema;
    expect(schema.required).toEqual(['q']);
    expect(schema.properties.query).toBeUndefined();
    for (const args of [{}, { query: 'needle' }, { q: ' ' }, { q: ['needle'] }, { q: 42 }, { q: 'x'.repeat(2001) }, { q: 'needle', limit: 0 }, { q: 'needle', limit: 51 }, { q: 'needle', limit: 1.2 }, { q: 'needle', limit: '2' }, { q: 'needle', offset: -1 }, { q: 'needle', offset: 1000001 }, { q: 'needle', offset: 1.5 }, { q: 'needle', tags: 'first' }, { q: 'needle', tags: [''] }, { q: 'needle', tags: [2] }, { q: 'needle', tags: Array(65).fill('t') }, { q: 'needle', type: 'plans' }]) {
      const response = await client.callTool({ name: 'search_thoughts', arguments: args });
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toMatch(/Error:/);
    }
  });
});
