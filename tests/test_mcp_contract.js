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
});
