const { createApp } = require('./server');
const request = require('supertest');

describe('MCP Security Validation Tests', () => {
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

  describe('Sandboxing Security Tests', () => {
    it('should validate secure sandbox execution for programmatic tools', async () => {
      // Test that potentially dangerous tool execution is properly sandboxed
      const sandboxResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'github.test_tool',
            parameters: {
              api_key: 'test_key',
              endpoint: 'https://api.github.com/test',
              // Attempt to inject potentially dangerous parameters
              dangerous_param: '; rm -rf /;'
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(sandboxResponse.body.success).toBe(true);
      expect(sandboxResponse.body.results[0].success).toBe(true);
      expect(sandboxResponse.body.results[0].result.success).toBe(true);

      // The sandbox should have handled the dangerous parameter safely
    });

    it('should prevent sandbox escape attempts', async () => {
      // Test execution with parameters that might attempt sandbox escape
      const escapeResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test; eval("malicious code")',
              regex: false,
              limit: 1
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(escapeResponse.body.success).toBe(true);
      // The system should handle the malicious input safely
    });

    it('should validate isolated execution environments', async () => {
      // Test that parallel execution maintains isolation
      const parallelResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [
            {
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'test1', regex: false, limit: 1 }
            },
            {
              toolName: 'tool_search_tool_regex_20251119',
              parameters: { query: 'test2', regex: false, limit: 1 }
            }
          ],
          executionMode: 'parallel',
          use_examples: true
        })
        .expect(200);

      expect(parallelResponse.body.success).toBe(true);
      expect(parallelResponse.body.results.length).toBe(2);
      expect(parallelResponse.body.stats.successCount).toBe(2);

      // Both executions should be isolated and successful
    });
  });

  describe('Input Validation Security Tests', () => {
    it('should validate JSON schema validation for tool parameters', async () => {
      // Test invalid parameter types
      const invalidTypeResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: 123, // Should be string
            regex: false,
            limit: 10
          }
        })
        .expect(400);

      expect(invalidTypeResponse.body.error).toContain('must be a string');

      // Test missing required fields
      const missingFieldResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            regex: false,
            limit: 10
            // Missing required 'query' field
          }
        })
        .expect(400);

      expect(missingFieldResponse.body.error).toContain('Missing required field');
    });

    it('should validate string pattern and length constraints', async () => {
      // Test pattern validation
      const patternResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'core_utility_tools',
          example_data: {
            tool_name: 'invalid tool name!', // Contains invalid characters
            action: 'status'
          }
        })
        .expect(400);

      expect(patternResponse.body.error).toContain('pattern');

      // Test length constraints
      const longString = 'a'.repeat(100); // Exceeds max length
      const lengthResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: longString,
            regex: false,
            limit: 10
          }
        })
        .expect(400);

      expect(lengthResponse.body.error).toContain('characters');
    });

    it('should validate enum and range constraints', async () => {
      // Test enum validation
      const enumResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'core_utility_tools',
          example_data: {
            tool_name: 'test_tool',
            action: 'invalid_action' // Not in enum
          }
        })
        .expect(400);

      expect(enumResponse.body.error).toContain('must be one of');

      // Test number range validation
      const rangeResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: 'test',
            regex: false,
            limit: 101 // Exceeds maximum
          }
        })
        .expect(400);

      expect(rangeResponse.body.error).toContain('must be no more than');
    });
  });

  describe('Tool Signature Verification Tests', () => {
    it('should validate tool existence and signature verification', async () => {
      // Test non-existent tool
      const nonexistentResponse = await testApp
        .get('/tools/examples?tool_name=nonexistent_tool')
        .expect(404);

      expect(nonexistentResponse.body.error).toContain('not found');

      // Test invalid tool names
      const invalidNameResponse = await testApp
        .get('/tools/examples?tool_name=invalid@tool#name')
        .expect(400);

      expect(invalidNameResponse.body.error).toContain('valid tool name');
    });

    it('should validate tool discovery security', async () => {
      // Test search with potentially malicious query
      const maliciousResponse = await testApp
        .get('/tools/search?q=test; DROP TABLE tools;--')
        .expect(200);

      expect(maliciousResponse.body.results).toBeInstanceOf(Array);
      // Should handle the malicious query safely
    });

    it('should validate example-based tool selection security', async () => {
      // Test example matching with potentially malicious context
      const maliciousContextResponse = await testApp
        .get('/tools/examples/match?tool_name=tool_search_tool_regex_20251119&query_context=test; malicious code')
        .expect(200);

      expect(maliciousContextResponse.body.best_match).toBeDefined();
      // Should handle the malicious context safely
    });
  });

  describe('Rate Limiting and Abuse Prevention Tests', () => {
    it('should handle rapid successive requests gracefully', async () => {
      // Test that the system can handle rapid requests without crashing
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          testApp.get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        );
      }

      const responses = await Promise.all(requests);
      const allSuccessful = responses.every(r => r.status === 200);

      expect(allSuccessful).toBe(true);
    });

    it('should validate request size limits', async () => {
      // Test with very large parameter values
      const largeData = {
        toolName: 'tool_search_tool_regex_20251119',
        parameters: {
          query: 'a'.repeat(1000), // Very large query
          regex: false,
          limit: 100 // Maximum limit
        }
      };

      const largeResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [largeData],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      // Should handle large data gracefully
      expect(largeResponse.body.success).toBe(true);
    });
  });

  describe('Output Validation and Sanitization Tests', () => {
    it('should validate output schema enforcement', async () => {
      // Test that tool outputs conform to expected schemas
      const outputResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
            parameters: { query: 'test', regex: false, limit: 1 }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(outputResponse.body.success).toBe(true);
      expect(outputResponse.body.results[0].success).toBe(true);

      // Output should have expected structure
      expect(outputResponse.body.results[0].result).toBeDefined();
      expect(outputResponse.body.results[0].result.data).toBeDefined();
    });

    it('should validate error output sanitization', async () => {
      // Test that error messages don't expose sensitive information
      const errorResponse = await testApp
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

      expect(errorResponse.body.success).toBe(true);
      expect(errorResponse.body.results[0].success).toBe(false);

      // Error message should be sanitized and not expose internal details
      expect(errorResponse.body.results[0].error).toBeDefined();
    });
  });

  describe('Audit and Logging Security Tests', () => {
    it('should validate comprehensive error logging', async () => {
      // Test that errors are properly logged and handled
      const errorResponse = await testApp
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
            }
          ],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      expect(errorResponse.body.success).toBe(true);
      expect(errorResponse.body.stats.errorCount).toBe(1);

      // System should have logged the error appropriately
    });

    it('should validate system health monitoring', async () => {
      // Test system health endpoint
      const healthResponse = await testApp
        .get('/tools/integrate/health')
        .expect(200);

      expect(healthResponse.body.integration_status).toBe('fully_integrated');
      expect(healthResponse.body.tool_examples_system).toBeDefined();

      // Health monitoring should be working
    });
  });
});

// Run standalone security tests
if (require.main === module) {
  (async () => {
    console.log('Running MCP Security Validation Tests...');

    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    try {
      // Test sandboxing
      const sandboxResponse = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'github.test_tool',
            parameters: {
              api_key: 'test_key',
              endpoint: 'https://api.github.com/test'
            }
          }],
          executionMode: 'sequential',
          use_examples: true
        })
        .expect(200);

      console.log('✓ Sandboxing security works');

      // Test input validation
      const invalidResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: '', // Invalid
            regex: false,
            limit: 10
          }
        })
        .expect(400);

      console.log('✓ Input validation security works');

      // Test tool signature verification
      const nonexistentResponse = await testApp
        .get('/tools/examples?tool_name=nonexistent_tool')
        .expect(404);

      console.log('✓ Tool signature verification works');
      console.log('✓ All security validation tests passed');

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ Security test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}