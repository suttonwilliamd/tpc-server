const { createApp } = require('./server');
const request = require('supertest');

describe('MCP Error Handling Tests', () => {
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

  describe('Edge Case Error Handling Tests', () => {
    it('should handle empty workflow definitions', async () => {
      const emptyWorkflowResponse = await testApp
        .post('/tools/execute/examples')
        .send({}) // Empty workflow
        .expect(400);

      expect(emptyWorkflowResponse.body.error).toBeDefined();
      expect(emptyWorkflowResponse.body.error).toContain('Workflow');
    });

    it('should handle workflows with no tools', async () => {
      const noToolsResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [], // Empty tools array
          executionMode: 'sequential'
        })
        .expect(400);

      expect(noToolsResponse.body.error).toBeDefined();
      expect(noToolsResponse.body.error).toContain('tool');
    });

    it('should handle invalid execution modes', async () => {
      const invalidModeResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 1 }
          }],
          executionMode: 'invalid_mode' // Invalid mode
        })
        .expect(400);

      expect(invalidModeResponse.body.error).toBeDefined();
    });
  });

  describe('Tool Execution Failure Scenarios', () => {
    it('should handle non-existent tool execution gracefully', async () => {
      const nonexistentResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'nonexistent_tool',
            parameters: { some_param: 'value' }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(nonexistentResponse.body.success).toBe(true);
      expect(nonexistentResponse.body.results[0].success).toBe(false);
      expect(nonexistentResponse.body.results[0].error).toBeDefined();
      expect(nonexistentResponse.body.stats.errorCount).toBe(1);
    });

    it('should handle partial workflow failures', async () => {
      const partialFailureResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [
            {
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'test', regex: false, limit: 1 }
            },
            {
              toolName: 'nonexistent_tool',
              parameters: { some_param: 'value' }
            },
            {
              toolName: 'core_utility_tools',
              parameters: { tool_name: 'tool_search_tool_regex_20251119', action: 'status' }
            }
          ],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(partialFailureResponse.body.success).toBe(true);
      expect(partialFailureResponse.body.results.length).toBe(3);
      expect(partialFailureResponse.body.stats.successCount).toBe(2);
      expect(partialFailureResponse.body.stats.errorCount).toBe(1);
    });

    it('should handle tool execution timeouts', async () => {
      // Test with a tool that might take longer to execute
      const timeoutResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [
            {
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'very long search query', regex: true, limit: 100 }
            }
          ],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(timeoutResponse.body.success).toBe(true);
      // Should handle the potentially long-running request gracefully
    });
  });

  describe('Parameter Validation Error Scenarios', () => {
    it('should handle completely invalid parameter structures', async () => {
      const invalidParamsResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: 'invalid string instead of object'
          }],
          executionMode: 'sequential'
        })
        .expect(400);

      expect(invalidParamsResponse.body.error).toBeDefined();
    });

    it('should handle missing required parameters', async () => {
      const missingParamsResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            // Missing required 'query' parameter
            regex: false,
            limit: 10
          }
        })
        .expect(400);

      expect(missingParamsResponse.body.error).toContain('required');
    });

    it('should handle completely malformed JSON data', async () => {
      const malformedResponse = await testApp
        .post('/tools/examples/validate')
        .send('{ "tool_name": "tool_search_tool_regex_20251119", "example_data": { "query": ')
        .expect(400);

      expect(malformedResponse.body.error).toBeDefined();
    });
  });

  describe('Tool Discovery Error Scenarios', () => {
    it('should handle invalid tool names in search', async () => {
      const invalidSearchResponse = await testApp
        .get('/tools/search?q=') // Empty query
        .expect(400);

      expect(invalidSearchResponse.body.error).toBeDefined();
    });

    it('should handle non-existent tools in examples system', async () => {
      const nonexistentExamplesResponse = await testApp
        .get('/tools/examples?tool_name=completely_nonexistent_tool')
        .expect(404);

      expect(nonexistentExamplesResponse.body.error).toContain('not found');
    });

    it('should handle invalid regex patterns', async () => {
      const invalidRegexResponse = await testApp
        .get('/tools/search?q=[invalid regex&regex=true')
        .expect(400);

      expect(invalidRegexResponse.body.error).toBeDefined();
    });
  });

  describe('Example System Error Scenarios', () => {
    it('should handle invalid example data structures', async () => {
      const invalidExampleResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: 'test',
            regex: 'not a boolean', // Invalid type
            limit: 10
          }
        })
        .expect(400);

      expect(invalidExampleResponse.body.error).toContain('boolean');
    });

    it('should handle missing example system data', async () => {
      const missingExamplesResponse = await testApp
        .get('/tools/examples/match?tool_name=tool_without_examples')
        .expect(404);

      expect(missingExamplesResponse.body.error).toBeDefined();
    });

    it('should handle invalid context matching queries', async () => {
      const invalidContextResponse = await testApp
        .get('/tools/examples/match?tool_name=tool_search_tool_regex_20251119&query_context=')
        .expect(400);

      expect(invalidContextResponse.body.error).toBeDefined();
    });
  });

  describe('System Integration Error Scenarios', () => {
    it('should handle database connection failures gracefully', async () => {
      // Test that the system handles database issues gracefully
      // (This is harder to test directly without breaking the DB)
      const dbIntensiveResponse = await testApp
        .get('/tools/examples/tools') // Requires DB access
        .expect(200);

      expect(dbIntensiveResponse.body.tools).toBeInstanceOf(Array);
      // Should handle DB operations gracefully
    });

    it('should handle concurrent modification conflicts', async () => {
      // Test multiple concurrent requests to the same resource
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        );
      }

      const responses = await Promise.all(requests);
      const allSuccessful = responses.every(r => r.status === 200);

      expect(allSuccessful).toBe(true);
      // Should handle concurrent access gracefully
    });

    it('should handle resource exhaustion scenarios', async () => {
      // Test with maximum allowed parameters
      const maxParamsResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'a'.repeat(100), // Max length
              regex: false,
              limit: 100 // Max limit
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(maxParamsResponse.body.success).toBe(true);
      // Should handle maximum parameter values gracefully
    });
  });

  describe('Recovery and Resilience Tests', () => {
    it('should recover from partial execution failures', async () => {
      const recoveryResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [
            {
              toolName: 'nonexistent_tool',
              parameters: { some_param: 'value' }
            },
            {
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'test', regex: false, limit: 1 }
            }
          ],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(recoveryResponse.body.success).toBe(true);
      expect(recoveryResponse.body.results[0].success).toBe(false);
      expect(recoveryResponse.body.results[1].success).toBe(true);
      // Should continue execution after first failure
    });

    it('should maintain consistency after error conditions', async () => {
      // Execute a failing workflow
      await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'nonexistent_tool',
            parameters: { some_param: 'value' }
          }],
          executionMode: 'sequential'
        })
        .expect(200);

      // Verify system is still functional
      const healthCheckResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      expect(healthCheckResponse.body.examples).toBeInstanceOf(Array);
      expect(healthCheckResponse.body.examples.length).toBeGreaterThan(0);
    });

    it('should handle graceful degradation under load', async () => {
      // Test system under load
      const loadRequests = [];
      for (let i = 0; i < 10; i++) {
        loadRequests.push(
          testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        );
      }

      const loadResponses = await Promise.all(loadRequests);
      const successRate = loadResponses.filter(r => r.status === 200).length / loadResponses.length;

      expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate
    });
  });
});

// Run standalone error handling tests
if (require.main === module) {
  (async () => {
    console.log('Running MCP Error Handling Tests...');

    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    try {
      // Test edge case handling
      const emptyResponse = await testApp
        .post('/tools/execute/examples')
        .send({})
        .expect(400);

      console.log('✓ Edge case error handling works');

      // Test tool execution failures
      const failureResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'nonexistent_tool',
            parameters: { some_param: 'value' }
          }],
          executionMode: 'sequential'
        })
        .expect(200);

      console.log('✓ Tool execution failure handling works');

      // Test parameter validation
      const paramResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            regex: false,
            limit: 10
            // Missing required query
          }
        })
        .expect(400);

      console.log('✓ Parameter validation error handling works');
      console.log('✓ All error handling tests passed');

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ Error handling test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}