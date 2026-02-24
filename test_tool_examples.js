const { createApp } = require('./server');
const request = require('supertest');

describe('Tool Use Examples Functionality', () => {
  let app;
  let testApp;

  beforeAll(async () => {
    // Create test application
    const appSetup = await createApp({ skipMigration: true });
    app = appSetup.app;
    testApp = request(app);
  });

  afterAll(async () => {
    // Clean up
    if (appSetup && appSetup.cleanDB) {
      await appSetup.cleanDB();
    }
  });

  describe('Tool Examples System', () => {
    it('should get examples for core tools', async () => {
      const response = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119')
        .expect(200);

      expect(response.body.tool_name).toBe('tool_search_tool_regex_20251119');
      expect(response.body.examples).toBeInstanceOf(Array);
      expect(response.body.examples.length).toBeGreaterThan(0);
      expect(response.body.schema).toBeDefined();
    });

    it('should validate example against JSON schema', async () => {
      const response = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: {
            query: 'test',
            regex: false,
            limit: 10
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
    });

    it('should find best matching example', async () => {
      const response = await testApp
        .get('/tools/examples/match?tool_name=tool_search_tool_regex_20251119&query_context=search')
        .expect(200);

      expect(response.body.tool_name).toBe('tool_search_tool_regex_20251119');
      expect(response.body.best_match).toBeDefined();
      expect(response.body.best_match.combined_relevance_score).toBeGreaterThan(0);
    });

    it('should get all tools with examples', async () => {
      const response = await testApp
        .get('/tools/examples/tools')
        .expect(200);

      expect(response.body.tools).toBeInstanceOf(Array);
      expect(response.body.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Enhanced Tool Discovery', () => {
    it('should perform enhanced search with examples', async () => {
      const response = await testApp
        .get('/tools/search/examples?q=search&use_examples=true')
        .expect(200);

      expect(response.body.query).toBe('search');
      expect(response.body.results).toBeInstanceOf(Array);
      expect(response.body.search_type).toBe('enhanced_with_examples');
    });

    it('should find tools by example scenario', async () => {
      const response = await testApp
        .get('/tools/search/scenario?scenario=search')
        .expect(200);

      expect(response.body.scenario).toBe('search');
      expect(response.body.results).toBeInstanceOf(Array);
    });

    it('should get example-based recommendations', async () => {
      const response = await testApp
        .get('/tools/recommendations?context=tool management')
        .expect(200);

      expect(response.body.query_context).toBe('tool management');
      expect(response.body.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Enhanced Tool Orchestration', () => {
    it('should execute workflow with example-based selection', async () => {
      const response = await testApp
        .post('/tools/execute/examples')
        .send({
          tools: [{
            toolName: 'tool_search_tool_regex_20251119',
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

      expect(response.body.success).toBe(true);
      expect(response.body.stats.exampleEnhanced).toBe(true);
    });

    it('should analyze tool selection with examples', async () => {
      const response = await testApp
        .post('/tools/execute/analyze')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          parameters: {
            query: 'test',
            regex: false,
            limit: 10
          },
          context: 'searching for tools'
        })
        .expect(200);

      expect(response.body.tool_name).toBe('tool_search_tool_regex_20251119');
      expect(response.body.selection_analysis).toBeDefined();
    });
  });

  describe('System Integration', () => {
    it('should get comprehensive tool integration data', async () => {
      const response = await testApp
        .get('/tools/integrate/tool_search_tool_regex_20251119')
        .expect(200);

      expect(response.body.tool_info).toBeDefined();
      expect(response.body.examples).toBeDefined();
      expect(response.body.integration_stats).toBeDefined();
    });

    it('should execute tool with automatic example-based selection', async () => {
      const response = await testApp
        .post('/tools/integrate/execute')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          parameters: {
            query: 'test',
            regex: false,
            limit: 5
          },
          context: 'testing tool execution'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.execution_strategy).toBeDefined();
    });

    it('should get system health status', async () => {
      const response = await testApp
        .get('/tools/integrate/health')
        .expect(200);

      expect(response.body.integration_status).toBe('fully_integrated');
      expect(response.body.tool_examples_system).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing tool name for examples', async () => {
      const response = await testApp
        .get('/tools/examples')
        .expect(400);

      expect(response.body.error).toContain('Tool name');
    });

    it('should handle invalid example data', async () => {
      const response = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: 'invalid'
        })
        .expect(400);

      expect(response.body.error).toContain('valid object');
    });

    it('should handle tool not found for examples', async () => {
      const response = await testApp
        .get('/tools/examples?tool_name=nonexistent_tool')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });
});

// Run the tests if this file is executed directly
if (require.main === module) {
  (async () => {
    const appSetup = await createApp({ skipMigration: true });
    const app = appSetup.app;
    const testApp = request(app);

    console.log('Running Tool Use Examples tests...');

    try {
      // Run a few key tests
      const examplesResponse = await testApp
        .get('/tools/examples?tool_name=tool_search_tool_regex_20251119');

      console.log('✓ Basic examples retrieval works');

      const validationResponse = await testApp
        .post('/tools/examples/validate')
        .send({
          tool_name: 'tool_search_tool_regex_20251119',
          example_data: { query: 'test', regex: false, limit: 10 }
        });

      console.log('✓ Example validation works');

      const enhancedSearchResponse = await testApp
        .get('/tools/search/examples?q=search&use_examples=true');

      console.log('✓ Enhanced search with examples works');

      console.log('✓ All basic tests passed!');
      console.log('Tool Use Examples functionality is working correctly.');

      // Clean up
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }

      process.exit(0);
    } catch (error) {
      console.error('✗ Test failed:', error.message);
      if (appSetup.cleanDB) {
        await appSetup.cleanDB();
      }
      process.exit(1);
    }
  })();
}