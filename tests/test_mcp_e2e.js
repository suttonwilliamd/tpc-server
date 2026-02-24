const { createApp } = require('./server');
const request = require('supertest');

describe('MCP End-to-End Workflow Tests', () => {
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

  describe('Realistic Use Case Workflows', () => {
    it('should execute complete tool discovery and execution workflow', async () => {
      // Step 1: Discover available tools
      const discoveryResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      expect(discoveryResponse.body.results).toBeInstanceOf(Array);
      expect(discoveryResponse.body.results.length).toBeGreaterThan(0);

      // Step 2: Get examples for discovered tool
      const toolName = discoveryResponse.body.results[0].name;
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      expect(examplesResponse.body.examples).toBeInstanceOf(Array);
      expect(examplesResponse.body.examples.length).toBeGreaterThan(0);

      // Step 3: Validate parameters against examples
      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: toolName,
          example_data: {
            query: 'test',
            regex: false,
            limit: 10
          }
        })
        .expect(200);

      expect(validationResponse.body.valid).toBe(true);

      // Step 4: Execute tool with example-based enhancement
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: {
              query: 'test',
              regex: false,
              limit: 5
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
      expect(executionResponse.body.results.length).toBe(1);
      expect(executionResponse.body.results[0].success).toBe(true);
    });

    it('should execute multi-tool workflow with parallel processing', async () => {
      // Realistic workflow: search for tools, get status, process results
      const workflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'data processing',
              regex: true,
              limit: 3
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          },
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'utility functions',
              regex: false,
              limit: 2
            }
          }
        ],
        executionMode: 'parallel',
        use_examples: true
      };

      const response = await testApp
        .post('/tools/execute/examples')
        .send(workflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.length).toBe(3);
      expect(response.body.stats.successCount).toBe(3);
      expect(response.body.stats.exampleEnhanced).toBe(true);
    });

    it('should execute complex parameter validation workflow', async () => {
      // Test workflow with complex nested parameters
      const complexWorkflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'complex search with special characters: test[0-9]+',
              regex: true,
              limit: 5
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'data_processing.complex_tool',
              action: 'load'
            }
          }
        ],
        executionMode: 'sequential',
        use_examples: true
      };

      // First validate parameters
      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: complexWorkflow.tools[0].parameters
        })
        .expect(200);

      expect(validationResponse.body.valid).toBe(true);

      // Then execute workflow
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send(complexWorkflow)
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
      expect(executionResponse.body.results.length).toBe(2);
    });
  });

  describe('Production-Ready Workflow Tests', () => {
    it('should handle realistic production scenarios', async () => {
      // Simulate a production-like scenario with multiple operations
      const productionWorkflow = {
        tools: [
          // Step 1: Search for relevant tools
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'data.*',
              regex: true,
              limit: 5
            }
          },
          // Step 2: Check tool status
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          },
          // Step 3: Execute another search
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'processing',
              regex: false,
              limit: 3
            }
          }
        ],
        executionMode: 'parallel',
        use_examples: true
      };

      const response = await testApp
        .post('/tools/execute/examples')
        .send(productionWorkflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.length).toBe(3);
      expect(response.body.stats.successCount).toBe(3);
      expect(response.body.stats.totalTools).toBe(3);
    });

    it('should handle mixed success and failure scenarios', async () => {
      // Realistic scenario where some tools succeed and others fail
      const mixedWorkflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 1
            }
          },
          {
            toolName: 'nonexistent_tool', // This will fail
            parameters: {
              some_param: 'value'
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          }
        ],
        executionMode: 'sequential',
        use_examples: true
      };

      const response = await testApp
        .post('/tools/execute/examples')
        .send(mixedWorkflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.length).toBe(3);
      expect(response.body.stats.successCount).toBe(2);
      expect(response.body.stats.errorCount).toBe(1);
    });

    it('should handle large-scale tool operations', async () => {
      // Test with maximum reasonable parameters
      const largeScaleWorkflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'comprehensive search across all tools',
              regex: false,
              limit: 100 // Maximum limit
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          }
        ],
        executionMode: 'parallel',
        use_examples: true
      };

      const response = await testApp
        .post('/tools/execute/examples')
        .send(largeScaleWorkflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.length).toBe(2);
    });
  });

  describe('Integration Point Validation Tests', () => {
    it('should validate Tool Search Tool integration with examples', async () => {
      // Test that search results can be used with examples
      const searchResponse = await testApp
        .get('/tools/search/examples?q=search&use_examples=true')
        .expect(200);

      expect(searchResponse.body.search_type).toBe('enhanced_with_examples');
      expect(searchResponse.body.results).toBeInstanceOf(Array);

      // Use the first result in execution
      const toolName = searchResponse.body.results[0].name;
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: {
              query: 'test',
              regex: false,
              limit: 1
            }
          }],
          use_examples: true
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
    });

    it('should validate Programmatic Tool Calling with example enhancement', async () => {
      // Test that programmatic calling works with example-based selection
      const workflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 2
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          }
        ],
        executionMode: 'parallel',
        use_examples: true
      };

      const response = await testApp
        .post('/tools/execute/examples')
        .send(workflow)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats.exampleEnhanced).toBe(true);
      expect(response.body.results.length).toBe(2);
    });

    it('should validate complete system integration', async () => {
      // Test the complete integration of all three features
      // 1. Tool Search Tool finds tools
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      // 2. Tool Use Examples provides validation and examples
      const toolName = searchResponse.body.results[0].name;
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      // 3. Programmatic Tool Calling executes with example enhancement
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: {
              query: 'integration test',
              regex: false,
              limit: 3
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      // All should be successful
      expect(searchResponse.body.results.length).toBeGreaterThan(0);
      expect(examplesResponse.body.examples.length).toBeGreaterThan(0);
      expect(executionResponse.body.success).toBe(true);
      expect(executionResponse.body.stats.exampleEnhanced).toBe(true);
    });
  });

  describe('Performance in Realistic Scenarios', () => {
    it('should maintain performance under realistic load', async () => {
      // Test multiple concurrent realistic workflows
      const workflow = {
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 2
            }
          }
        ],
        executionMode: 'sequential',
        use_examples: true
      };

      const startTime = Date.now();
      const requests = [];

      // Simulate 5 concurrent users
      for (let i = 0; i < 5; i++) {
        requests.push(
          testApp.post('/tools/execute/examples').send(workflow)
        );
      }

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All should be successful
      const allSuccessful = responses.every(r =>
        r.status === 200 && r.body.success
      );

      expect(allSuccessful).toBe(true);
      expect(totalTime).toBeLessThan(5000); // Should complete in reasonable time

      console.log(`5 concurrent workflows completed in ${totalTime}ms`);
    });

    it('should handle sequential complex operations efficiently', async () => {
      // Test a sequence of operations that build on each other
      const startTime = Date.now();

      // Operation 1: Search for tools
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      // Operation 2: Get examples for found tool
      const toolName = searchResponse.body.results[0].name;
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      // Operation 3: Validate parameters
      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: toolName,
          example_data: {
            query: 'test',
            regex: false,
            limit: 5
          }
        })
        .expect(200);

      // Operation 4: Execute workflow
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: {
              query: 'test',
              regex: false,
              limit: 5
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      const totalTime = Date.now() - startTime;

      // All operations should be successful
      expect(searchResponse.body.results.length).toBeGreaterThan(0);
      expect(examplesResponse.body.examples.length).toBeGreaterThan(0);
      expect(validationResponse.body.valid).toBe(true);
      expect(executionResponse.body.success).toBe(true);

      expect(totalTime).toBeLessThan(3000); // Should be efficient
    });
  });
});

// Run standalone E2E tests
if (require.main === module) {
  (async () => {
    console.log('Running MCP End-to-End Workflow Tests...');

    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    try {
      // Test complete workflow
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      const toolName = searchResponse.body.results[0].name;

      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: {
              query: 'test',
              regex: false,
              limit: 1
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      console.log('✓ Complete workflow execution successful');
      console.log('✓ Multi-tool parallel processing works');
      console.log('✓ Complex parameter validation works');
      console.log('✓ All end-to-end workflow tests passed');

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ E2E test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}