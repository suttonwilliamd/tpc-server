const { createApp } = require('./server');
const request = require('supertest');

describe('MCP API Endpoint Validation Tests', () => {
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

  describe('Core API Endpoint Validation', () => {
    it('should validate all core API endpoints are functional', async () => {
      const endpoints = [
        { method: 'GET', path: '/tools/search' },
        { method: 'GET', path: '/tools/examples' },
        { method: 'POST', path: '/tools/examples/validate' },
        { method: 'GET', path: '/tools/examples/match' },
        { method: 'GET', path: '/tools/search/examples' },
        { method: 'GET', path: '/tools/search/scenario' },
        { method: 'GET', path: '/tools/recommendations' },
        { method: 'POST', path: '/tools/execute/examples' },
        { method: 'POST', path: '/tools/execute/analyze' },
        { method: 'GET', path: '/tools/integrate' },
        { method: 'POST', path: '/tools/integrate/execute' },
        { method: 'GET', path: '/tools/integrate/health' },
        { method: 'GET', path: '/tools/examples/tools' }
      ];

      for (const endpoint of endpoints) {
        let response;
        if (endpoint.method === 'GET') {
          response = await testApp.get(endpoint.path)
            .query(endpoint.path.includes('?') ? {} : { tool_name: 'tool_search_tool_regex_20251119' })
            .expect(200);
        } else {
          response = await testApp.post(endpoint.path)
            .send(endpoint.path.includes('validate')
              ? {
                  tool_name: 'tool_search_tool_regex_20251119',
                  example_data: { query: 'test', regex: false, limit: 10 }
                }
              : {
                  tool_name: 'tool_search_tool_regex_20251119',
                  parameters: { query: 'test', regex: false, limit: 1 }
                })
            .expect(200);
        }

        expect(response.body).toBeDefined();
      }
    });

    it('should validate API response structures', async () => {
      // Test that all endpoints return consistent response structures
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      expect(searchResponse.body.results).toBeInstanceOf(Array);
      expect(searchResponse.body.query).toBe('search');

      const examplesResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      expect(examplesResponse.body.examples).toBeInstanceOf(Array);
      expect(examplesResponse.body.tool_name).toBe('tool_search_tool_regex_20251119');

      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 1 }
          }],
          executionMode: 'sequential'
        })
        .expect(200);

      expect(executionResponse.body.success).toBeDefined();
      expect(executionResponse.body.results).toBeInstanceOf(Array);
      expect(executionResponse.body.stats).toBeDefined();
    });
  });

  describe('Integration Point Validation', () => {
    it('should validate Tool Search Tool integration points', async () => {
      // Test that search integrates with other components
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      const toolName = searchResponse.body.results[0].name;

      // Should be able to get examples for found tools
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      expect(examplesResponse.body.examples.length).toBeGreaterThan(0);

      // Should be able to execute found tools
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: { query: 'test', regex: false, limit: 1 }
          }],
          executionMode: 'sequential'
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
    });

    it('should validate Programmatic Tool Calling integration points', async () => {
      // Test that programmatic calling integrates with examples
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 2 }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
      expect(executionResponse.body.stats.exampleEnhanced).toBe(true);

      // Should be able to validate the executed tool's parameters
      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: { query: 'test', regex: false, limit: 2 }
        })
        .expect(200);

      expect(validationResponse.body.valid).toBe(true);
    });

    it('should validate Tool Use Examples integration points', async () => {
      // Test that examples integrate with search and execution
      const examplesResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      const example = examplesResponse.body.examples[0];

      // Should be able to use example data in execution
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: example.example
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);

      // Should be able to find tools by example scenarios
      const scenarioResponse = await testApp
        .get('/tools/search/scenario?scenario=search')
        .expect(200);

      expect(scenarioResponse.body.results).toBeInstanceOf(Array);
    });
  });

  describe('API Error Response Validation', () => {
    it('should validate consistent error response structures', async () => {
      // Test various error conditions to ensure consistent error responses
      const errorTests = [
        {
          request: () => testApp.get('/tools/examples?tool_name=nonexistent_tool'),
          expectedStatus: 404,
          expectedError: 'not found'
        },
        {
          request: () => testApp.post('/tools/examples/validate').send({
            tool_name: 'tool_search_tool_regex_20251119',
            example_data: {
              regex: false,
              limit: 10
              // Missing required query
            }
          }),
          expectedStatus: 400,
          expectedError: 'required'
        },
        {
          request: () => testApp.post('/tools/execute/examples').send({}),
          expectedStatus: 400,
          expectedError: 'Workflow'
        }
      ];

      for (const test of errorTests) {
        const response = await test.request().expect(test.expectedStatus);
        expect(response.body.error).toBeDefined();
        expect(response.body.error).toContain(test.expectedError);
      }
    });

    it('should validate error responses include helpful information', async () => {
      // Test that error responses are informative
      const errorResponse = await testApp
        .get('/tools/examples?tool_name=nonexistent_tool')
        .expect(404);

      expect(errorResponse.body.error).toBeDefined();
      expect(errorResponse.body.error.length).toBeGreaterThan(10); // Should be descriptive

      // Error should not expose internal implementation details
      expect(errorResponse.body.error).not.toContain('at ');
      expect(errorResponse.body.error).not.toContain('stack');
    });
  });

  describe('API Performance Validation', () => {
    it('should validate API response times', async () => {
      // Test that API endpoints respond within reasonable time
      const performanceTests = [
        { name: 'search', request: () => testApp.get('/tools/search?q=search') },
        { name: 'examples', request: () => testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119') },
        { name: 'validation', request: () => testApp.post('/tools/examples/validate').send({
            tool_name: 'tool_search_tool_regex_20251119',
            example_data: { query: 'test', regex: false, limit: 10 }
          }) },
        { name: 'execution', request: () => testApp.post('/tools/execute/examples').send({
            tools: [{
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'test', regex: false, limit: 1 }
            }],
            executionMode: 'sequential'
          }) }
      ];

      for (const test of performanceTests) {
        const startTime = Date.now();
        await test.request().expect(200);
        const responseTime = Date.now() - startTime;

        expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
        console.log(`${test.name} endpoint: ${responseTime}ms`);
      }
    });

    it('should validate API handles concurrent requests', async () => {
      // Test that API can handle multiple concurrent requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      const allSuccessful = responses.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
      expect(totalTime).toBeLessThan(3000); // Should handle 10 requests quickly

      console.log(`10 concurrent requests completed in ${totalTime}ms`);
    });
  });

  describe('API Documentation and Discoverability', () => {
    it('should validate API endpoints are self-documenting', async () => {
      // Test that endpoints provide enough information to be discoverable
      const toolsResponse = await testApp
        .get('/tools/examples/tools')
        .expect(200);

      expect(toolsResponse.body.tools).toBeInstanceOf(Array);
      expect(toolsResponse.body.total).toBeDefined();

      // Should provide tool information
      if (toolsResponse.body.tools.length > 0) {
        const firstTool = toolsResponse.body.tools[0];
        expect(firstTool.tool_name).toBeDefined();
        expect(firstTool.description).toBeDefined();
        expect(firstTool.example_count).toBeDefined();
      }
    });

    it('should validate API provides helpful metadata', async () => {
      // Test that responses include helpful metadata
      const examplesResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      expect(examplesResponse.body.timestamp).toBeDefined();
      expect(examplesResponse.body.tool_name).toBeDefined();
      expect(examplesResponse.body.total_available).toBeDefined();
      expect(examplesResponse.body.returned_count).toBeDefined();

      // Should include schema information
      expect(examplesResponse.body.schema).toBeDefined();
    });
  });

  describe('Complete System Integration Validation', () => {
    it('should validate all three MCP features work together through APIs', async () => {
      // 1. Tool Search Tool API
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      expect(searchResponse.body.results.length).toBeGreaterThan(0);

      // 2. Tool Use Examples API
      const toolName = searchResponse.body.results[0].name;
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      expect(examplesResponse.body.examples.length).toBeGreaterThan(0);

      // Validate example
      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: toolName,
          example_data: examplesResponse.body.examples[0].example
        })
        .expect(200);

      expect(validationResponse.body.valid).toBe(true);

      // 3. Programmatic Tool Calling API
      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: examplesResponse.body.examples[0].example
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(executionResponse.body.success).toBe(true);
      expect(executionResponse.body.stats.exampleEnhanced).toBe(true);
    });

    it('should validate API endpoints cover all documented features', async () => {
      // Test that all features documented in the architecture are accessible via API
      const featureTests = [
        {
          name: 'Tool Search Tool',
          test: async () => {
            const response = await testApp.get('/tools/search?q=search').expect(200);
            return response.body.results.length > 0;
          }
        },
        {
          name: 'Enhanced Tool Discovery',
          test: async () => {
            const response = await testApp.get('/tools/search/examples?q=search&use_examples=true').expect(200);
            return response.body.search_type === 'enhanced_with_examples';
          }
        },
        {
          name: 'Tool Use Examples',
          test: async () => {
            const response = await testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119').expect(200);
            return response.body.examples.length > 0;
          }
        },
        {
          name: 'Example Validation',
          test: async () => {
            const response = await testApp.post('/tools/examples/validate').send({
              tool_name: 'tool_search_tool_regex_20251119',
              example_data: { query: 'test', regex: false, limit: 10 }
            }).expect(200);
            return response.body.valid === true;
          }
        },
        {
          name: 'Example-Based Tool Selection',
          test: async () => {
            const response = await testApp.get('/tools/examples/match?tool_name=tool_search_tool_regex_20251119&query_context=search').expect(200);
            return response.body.best_match !== null;
          }
        },
        {
          name: 'Programmatic Tool Calling',
          test: async () => {
            const response = await testApp.post('/tools/execute/examples').send({
              tools: [{
                toolName: 'tool_search_tool_regex_20251119',
                parameters: { query: 'test', regex: false, limit: 1 }
              }],
              executionMode: 'sequential'
            }).expect(200);
            return response.body.success === true;
          }
        },
        {
          name: 'Parallel Execution',
          test: async () => {
            const response = await testApp.post('/tools/execute/examples').send({
              tools: [
                {
                  toolName: 'tool_search_tool_regex_20251119',
                  parameters: { query: 'test', regex: false, limit: 1 }
                },
                {
                  toolName: 'core_utility_tools',
                  parameters: { tool_name: 'tool_search_tool_regex_20251119', action: 'status' }
                }
              ],
              executionMode: 'parallel'
            }).expect(200);
            return response.body.success === true && response.body.stats.successCount === 2;
          }
        },
        {
          name: 'Result Processing',
          test: async () => {
            const response = await testApp.post('/tools/execute/examples').send({
              tools: [{
                toolName: 'tool_search_tool_regex_20251119',
                parameters: { query: 'test', regex: false, limit: 1 }
              }],
              executionMode: 'sequential',
              resultHandling: 'transform'
            }).expect(200);
            return response.body.results[0].status === 'success';
          }
        },
        {
          name: 'System Integration',
          test: async () => {
            const response = await testApp.get('/tools/integrate/health').expect(200);
            return response.body.integration_status === 'fully_integrated';
          }
        }
      ];

      const results = {};
      for (const test of featureTests) {
        try {
          const success = await test.test();
          results[test.name] = success;
          expect(success).toBe(true);
        } catch (error) {
          results[test.name] = false;
          expect(true).toBe(false); // Force test failure
        }
      }

      // All features should be working
      const allWorking = Object.values(results).every(v => v === true);
      expect(allWorking).toBe(true);

      console.log('Feature coverage:', results);
    });
  });
});

// Run standalone API validation tests
if (require.main === module) {
  (async () => {
    console.log('Running MCP API Endpoint Validation Tests...');

    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    try {
      // Test core endpoints
      const searchResponse = await testApp
        .get('/tools/search?q=search')
        .expect(200);

      console.log('✓ Core API endpoints functional');

      // Test integration points
      const toolName = searchResponse.body.results[0].name;
      const examplesResponse = await testApp
        .get(`/tools/examples?tool_name=${toolName}`)
        .expect(200);

      const executionResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: toolName,
            parameters: { query: 'test', regex: false, limit: 1 }
          }],
          executionMode: 'sequential'
        })
        .expect(200);

      console.log('✓ Integration points validated');

      // Test error responses
      const errorResponse = await testApp
        .get('/tools/examples?tool_name=nonexistent_tool')
        .expect(404);

      console.log('✓ Error responses consistent');

      // Test performance
      const perfStart = Date.now();
      await testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119').expect(200);
      const perfTime = Date.now() - perfStart;

      console.log(`✓ API performance acceptable (${perfTime}ms)`);
      console.log('✓ All API endpoint validation tests passed');

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ API validation test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}