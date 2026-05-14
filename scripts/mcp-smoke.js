const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function run() {
  const client = new Client({ name: 'tpc-smoke', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '..', 'mcp-server.js')],
  });

  await client.connect(transport);

  try {
    const tools = await client.listTools();
    const required = new Set([
      'get_context',
      'create_plan',
      'update_plan',
      'create_thought',
      'list_thoughts',
    ]);
    const found = new Set(tools.tools.map((t) => t.name));
    for (const name of required) {
      if (!found.has(name)) {
        throw new Error(`Missing required MCP tool: ${name}`);
      }
    }

    const marker = `smoke-${Date.now()}`;

    const createdPlan = await client.callTool({
      name: 'create_plan',
      arguments: {
        title: marker,
        description: 'MCP smoke workflow plan',
        status: 'proposed',
      },
    });

    if (createdPlan.isError) throw new Error(`create_plan failed: ${JSON.stringify(createdPlan)}`);
    const plan = JSON.parse(createdPlan.content[0].text);

    const updatedPlan = await client.callTool({
      name: 'update_plan',
      arguments: {
        id: plan.id,
        status: 'in_progress',
        changelog: [{ at: Date.now(), action: 'smoke-transition', by: 'smoke-test' }],
      },
    });
    if (updatedPlan.isError) throw new Error(`update_plan failed: ${JSON.stringify(updatedPlan)}`);

    const thought = await client.callTool({
      name: 'create_thought',
      arguments: {
        content: `smoke thought for ${marker}`,
        plan_id: String(plan.id),
        type: 'verification',
      },
    });
    if (thought.isError) throw new Error(`create_thought failed: ${JSON.stringify(thought)}`);
    const createdThought = JSON.parse(thought.content[0].text);

    const thoughts = await client.callTool({
      name: 'list_thoughts',
      arguments: { limit: 20 },
    });
    if (thoughts.isError) throw new Error(`list_thoughts failed: ${JSON.stringify(thoughts)}`);
    const thoughtList = JSON.parse(thoughts.content[0].text);

    const context = await client.callTool({
      name: 'get_context',
      arguments: {},
    });
    if (context.isError) throw new Error(`get_context failed: ${JSON.stringify(context)}`);
    const ctx = JSON.parse(context.content[0].text);

    const foundThought = thoughtList.some((t) => t.id === createdThought.id);
    if (!foundThought) throw new Error('Created thought not visible in list_thoughts response');

    const result = {
      ok: true,
      plan_id: plan.id,
      thought_id: createdThought.id,
      open_plans: Array.isArray(ctx.plans) ? ctx.plans.length : -1,
      recent_thoughts: Array.isArray(ctx.recent_thoughts) ? ctx.recent_thoughts.length : -1,
    };

    console.log(JSON.stringify(result));
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
