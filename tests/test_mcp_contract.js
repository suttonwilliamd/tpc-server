/** @jest-environment node */
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

describe('MCP contract tests', () => {
  let client;
  let transport;

  beforeAll(async () => {
    client = new Client({ name: 'tpc-contract-test', version: '1.0.0' }, { capabilities: {} });
    transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(__dirname, '..', 'mcp-server.js')],
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  it('exposes expected MCP tools', async () => {
    const res = await client.listTools();
    const names = new Set(res.tools.map((t) => t.name));
    const expected = [
      'list_plans',
      'get_plan',
      'create_plan',
      'update_plan',
      'list_thoughts',
      'create_thought',
      'search_thoughts',
      'get_context',
      'get_compaction_bundle',
    ];

    expected.forEach((name) => expect(names.has(name)).toBe(true));
  });

  it('create_thought and list_thoughts contract works end-to-end', async () => {
    const marker = `contract-${Date.now()}`;

    const createResult = await client.callTool({
      name: 'create_thought',
      arguments: { content: marker, type: 'observation' },
    });

    expect(createResult.isError).not.toBe(true);
    expect(Array.isArray(createResult.content)).toBe(true);

    const created = JSON.parse(createResult.content[0].text);
    expect(created).toHaveProperty('id');
    expect(created.content).toBe(marker);

    const listResult = await client.callTool({
      name: 'list_thoughts',
      arguments: { limit: 20 },
    });

    expect(listResult.isError).not.toBe(true);
    const thoughts = JSON.parse(listResult.content[0].text);
    const found = thoughts.some((t) => t.id === created.id && t.content === marker);
    expect(found).toBe(true);
  });

  it('persists thought plan_id/tags and returns normalized context shape', async () => {
    const planTitle = `contract-plan-${Date.now()}`;
    const planRes = await client.callTool({
      name: 'create_plan',
      arguments: {
        title: planTitle,
        description: 'contract plan for thought linkage',
      },
    });

    expect(planRes.isError).not.toBe(true);
    const plan = JSON.parse(planRes.content[0].text);

    const thoughtRes = await client.callTool({
      name: 'create_thought',
      arguments: {
        content: `linked-thought-${Date.now()}`,
        plan_id: String(plan.id),
        type: 'decision',
        tags: ['mcp-contract'],
      },
    });

    expect(thoughtRes.isError).not.toBe(true);
    const thought = JSON.parse(thoughtRes.content[0].text);
    expect(thought.plan_id).toBe(String(plan.id));
    expect(Array.isArray(thought.tags)).toBe(true);
    expect(thought.tags).toEqual(expect.arrayContaining(['decision', 'mcp-contract']));
    expect(thought.type).toBe('decision');

    const searchRes = await client.callTool({
      name: 'search_thoughts',
      arguments: { query: 'linked-thought', limit: 10 },
    });
    expect(searchRes.isError).not.toBe(true);
    const matched = JSON.parse(searchRes.content[0].text);
    expect(matched.some((t) => t.id === thought.id)).toBe(true);

    const contextRes = await client.callTool({
      name: 'get_context',
      arguments: {},
    });
    expect(contextRes.isError).not.toBe(true);
    const ctx = JSON.parse(contextRes.content[0].text);
    expect(Array.isArray(ctx.plans)).toBe(true);
    expect(Array.isArray(ctx.recent_thoughts)).toBe(true);
    expect(Array.isArray(ctx.handoff_docs)).toBe(true);
    expect(Array.isArray(ctx.compaction_anchors)).toBe(true);
    expect(['A', 'B']).toContain(ctx.compaction_strategy);
    expect(ctx.compaction_ab_test).toBeDefined();
    expect(ctx.compaction_ab_test.A).toBeDefined();
    expect(ctx.compaction_ab_test.B).toBeDefined();
    expect(ctx.counts).toBeDefined();
    expect(typeof ctx.counts.plans).toBe('number');
    expect(typeof ctx.counts.recent_thoughts).toBe('number');
    expect(typeof ctx.counts.handoff_docs).toBe('number');
    expect(typeof ctx.counts.compaction_anchors).toBe('number');

    const bundleRes = await client.callTool({
      name: 'get_compaction_bundle',
      arguments: {},
    });
    expect(bundleRes.isError).not.toBe(true);
    const bundle = JSON.parse(bundleRes.content[0].text);
    expect(bundle.source).toBe('handoff-first');
    expect(Array.isArray(bundle.handoff_docs)).toBe(true);
    expect(Array.isArray(bundle.compaction_anchors)).toBe(true);
    expect(['A', 'B']).toContain(bundle.compaction_strategy);
    expect(bundle.compaction_ab_test).toBeDefined();
    expect(bundle.compaction_ab_test.A).toBeDefined();
    expect(bundle.compaction_ab_test.B).toBeDefined();
    expect(Array.isArray(bundle.recent_thoughts)).toBe(true);
    expect(Array.isArray(bundle.open_plan_ids)).toBe(true);
    expect(bundle.counts).toBeDefined();
    expect(typeof bundle.generated_at).toBe('string');
  });

  it('rejects malformed payloads with explicit validation errors', async () => {
    const badLimit = await client.callTool({
      name: 'list_thoughts',
      arguments: { limit: 'a lot' },
    });
    expect(badLimit.isError).toBe(true);
    expect(badLimit.content[0].text).toContain('limit must be a positive integer');

    const badThoughtType = await client.callTool({
      name: 'create_thought',
      arguments: { content: 'x', type: 42 },
    });
    expect(badThoughtType.isError).toBe(true);
    expect(badThoughtType.content[0].text).toContain('type must be a string');

    const tooLongThought = await client.callTool({
      name: 'create_thought',
      arguments: { content: 'x'.repeat(5001) },
    });
    expect(tooLongThought.isError).toBe(true);
    expect(tooLongThought.content[0].text).toContain('content exceeds max length');

    const badSearch = await client.callTool({
      name: 'search_thoughts',
      arguments: { query: 123 },
    });
    expect(badSearch.isError).toBe(true);
    expect(badSearch.content[0].text).toContain('query must be a string');

    const badPlan = await client.callTool({
      name: 'create_plan',
      arguments: { title: 'ok', description: 'd'.repeat(20001) },
    });
    expect(badPlan.isError).toBe(true);
    expect(badPlan.content[0].text).toContain('description exceeds max length');
  });
});
