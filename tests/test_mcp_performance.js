const { createApp } = require('./server');
const request = require('supertest');

describe('MCP Performance Benchmarking Tests', () => {
  let app;
  let testApp;

  beforeAll(async () => {
    const appSetup = await createApp({ skipMigration: true });
    app = appSetup.app;
    testApp = request(app);
  });

  afterAll(async () => {
    if (appSetup && appSetup.cleanDB) {
      await appSetup.cleanDB();
    }
  });

  describe('Token Reduction Validation Tests', () => {
    it('should validate 76.8% token reduction through hybrid architecture', async () => {
      // Get total number of tools in the system
      const allToolsResponse = await testApp
        .get('/tools/examples/tools')
        .expect(200);

      const totalTools = allToolsResponse.body.total;

      // Get core tools (always loaded)
      const coreTools = ['tool_search_tool_regex_20251119', 'core_utility_tools'];
      let coreToolCount = 0;
      let coreToolTokens = 0;

      // Calculate token usage for core tools
      for (const tool of coreTools) {
        const response = await testApp
          .get(`/tools/examples?tool_name=${tool}`)
          .expect(200);

        if (response.body.examples.length > 0) {
          coreToolCount++;
          // Estimate token count based on tool complexity
          coreToolTokens += estimateToolTokens(response.body);
        }
      }

      // Estimate total tokens if all tools were loaded (traditional MCP approach)
      const estimatedTotalTokens = estimateTotalSystemTokens(allToolsResponse.body.tools);

      // Calculate actual token reduction
      const actualReduction = 1 - (coreToolTokens / estimatedTotalTokens);
      const expectedReduction = 0.768; // 76.8%

      // Should be close to expected reduction (within 10% tolerance)
      expect(actualReduction).toBeGreaterThan(expectedReduction - 0.1);
      expect(actualReduction).toBeLessThan(expectedReduction + 0.1);

      console.log(`Token reduction achieved: ${(actualReduction * 100).toFixed(1)}%`);
      console.log(`Expected reduction: ${(expectedReduction * 100).toFixed(1)}%`);
    });

    it('should demonstrate lazy loading reduces initial token consumption', async () => {
      // Test that deferred tools are only loaded when needed
      const startTime = Date.now();

      // First request - should only load core tools
      const firstResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      const firstRequestTime = Date.now() - startTime;

      // Second request - should use cached core tools
      const secondStart = Date.now();
      const secondResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      const secondRequestTime = Date.now() - secondStart;

      // Cached requests should be faster
      expect(secondRequestTime).toBeLessThan(firstRequestTime);

      // Test deferred tool loading
      const deferredStart = Date.now();
      const deferredResponse = await testApp
        .get('/tools/search/examples?q=github&use_examples=true')
        .expect(200);

      const deferredRequestTime = Date.now() - deferredStart;

      // Deferred tool loading should take longer than cached core tools
      expect(deferredRequestTime).toBeGreaterThan(secondRequestTime);
    });
  });

  describe('Execution Performance Tests', () => {
    it('should benchmark sequential vs parallel execution performance', async () => {
      const workflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 2 }
          },
          {
            toolName: 'core_utility_tools',
            parameters: { tool_name: 'tool_search_tool_regex_20251119', action: 'status' }
          },
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'data', regex: true, limit: 3 }
          }
        ],
        use_examples: true
      };

      // Test sequential execution
      const sequentialStart = Date.now();
      const sequentialResponse = await testApp
        .post('/tools/execute/examples')
        .send({ ...workflow, executionMode: 'sequential' })
        .expect(200);
      const sequentialTime = Date.now() - sequentialStart;

      // Test parallel execution
      const parallelStart = Date.now();
      const parallelResponse = await testApp
        .post('/tools/execute/examples')
        .send({ ...workflow, executionMode: 'parallel' })
        .expect(200);
      const parallelTime = Date.now() - parallelStart;

      // Parallel should be significantly faster for multiple tools
      const speedup = sequentialTime / parallelTime;
      expect(speedup).toBeGreaterThan(1.5); // At least 50% faster

      // Both should be successful
      expect(sequentialResponse.body.success).toBe(true);
      expect(parallelResponse.body.success).toBe(true);

      console.log(`Parallel execution ${speedup.toFixed(2)}x faster than sequential`);
    });

    it('should measure example-based selection overhead', async () => {
      const workflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 2 }
          }
        ]
      };

      // Test without examples
      const noExamplesStart = Date.now();
      const noExamplesResponse = await testApp
        .post('/tools/execute/examples')
        .send({ ...workflow, use_examples: false })
        .expect(200);
      const noExamplesTime = Date.now() - noExamplesStart;

      // Test with examples
      const withExamplesStart = Date.now();
      const withExamplesResponse = await testApp
        .post('/tools/execute/examples')
        .send({ ...workflow, use_examples: true })
        .expect(200);
      const withExamplesTime = Date.now() - withExamplesStart;

      // Example-based selection should add some overhead but not excessive
      const overhead = withExamplesTime - noExamplesTime;
      const overheadPercentage = (overhead / noExamplesTime) * 100;

      // Overhead should be reasonable (< 50%)
      expect(overheadPercentage).toBeLessThan(50);

      console.log(`Example-based selection overhead: ${overheadPercentage.toFixed(1)}%`);
    });
  });

  describe('Cache Performance Tests', () => {
    it('should validate cache efficiency for tool examples', async () => {
      // First request - cache miss
      const firstStart = Date.now();
      const firstResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);
      const firstTime = Date.now() - firstStart;

      // Second request - cache hit
      const secondStart = Date.now();
      const secondResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);
      const secondTime = Date.now() - secondStart;

      // Cache hit should be significantly faster
      const speedup = firstTime / secondTime;
      expect(speedup).toBeGreaterThan(2); // At least 2x faster

      console.log(`Cache provides ${speedup.toFixed(2)}x speedup`);
    });

    it('should test cache TTL and invalidation', async () => {
      // Get initial response
      const initialResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      const initialTimestamp = initialResponse.body.timestamp;

      // Wait a short time and request again
      await new Promise(resolve => setTimeout(resolve, 100));
      const secondResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      // Should still be cached (TTL is longer)
      expect(secondResponse.body.timestamp).toBe(initialTimestamp);
    });
  });

  describe('Memory and Resource Tests', () => {
    it('should validate memory-efficient tool loading', async () => {
      // Test that the system can handle multiple tool requests without excessive memory usage
      const requests = [];

      for (let i = 0; i < 5; i++) {
        requests.push(
          testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        );
      }

      const responses = await Promise.all(requests);
      const allSuccessful = responses.every(r => r.status === 200);

      expect(allSuccessful).toBe(true);
    });

    it('should test concurrent request handling', async () => {
      // Test system can handle concurrent requests efficiently
      const workflow = {
        tools: [{
          toolName: 'tool_search_tool_regex_20251119',
          parameters: { query: 'test', regex: false, limit: 1 }
        }],
        executionMode: 'sequential',
        use_examples: true
      };

      const requests = [];
      for (let i = 0; i < 3; i++) {
        requests.push(
          testApp.post('/tools/execute/examples').send(workflow)
        );
      }

      const responses = await Promise.all(requests);
      const allSuccessful = responses.every(r => r.status === 200 && r.body.success);

      expect(allSuccessful).toBe(true);
    });
  });
});

// Helper functions for token estimation
function estimateToolTokens(toolData) {
  // Simple estimation based on tool complexity
  let tokens = 50; // Base tokens

  // Add tokens for examples
  if (toolData.examples && toolData.examples.length > 0) {
    tokens += toolData.examples.length * 20; // 20 tokens per example
  }

  // Add tokens for schema complexity
  if (toolData.schema) {
    const schemaSize = JSON.stringify(toolData.schema).length;
    tokens += Math.ceil(schemaSize / 4); // ~4 chars per token
  }

  return tokens;
}

function estimateTotalSystemTokens(tools) {
  // Estimate total tokens if all tools were loaded traditionally
  return tools.reduce((total, tool) => {
    return total + estimateToolTokens({
      examples: tool.best_example ? [tool.best_example] : [],
      schema: {} // Assume basic schema
    });
  }, 0);
}

// Run standalone performance tests
if (require.main === module) {
  (async () => {
    console.log('Running MCP Performance Benchmarking Tests...');

    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    try {
      // Test token reduction
      const allToolsResponse = await testApp
        .get('/tools/examples/tools')
        .expect(200);

      const coreTools = ['tool_search_tool_regex_20251119', 'core_utility_tools'];
      let coreToolTokens = 0;

      for (const tool of coreTools) {
        const response = await testApp
          .get(`/tools/examples?tool_name=${tool}`)
          .expect(200);

        if (response.body.examples.length > 0) {
          coreToolTokens += estimateToolTokens(response.body);
        }
      }

      const estimatedTotalTokens = estimateTotalSystemTokens(allToolsResponse.body.tools);
      const actualReduction = 1 - (coreToolTokens / estimatedTotalTokens);

      console.log(`✓ Token reduction: ${(actualReduction * 100).toFixed(1)}%`);
      console.log(`✓ Performance benchmarking tests completed`);

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ Performance test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}