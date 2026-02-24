// Add these tests to the existing test file
const { app } = require('./server');
const request = require('supertest');
const { toolOrchestrator } = require('./routes/tools');

describe('Programmatic Tool Calling', () => {
  describe('Tool Orchestrator', () => {
    it('should execute sequential workflow successfully', async () => {
      const workflow = {
        executionMode: 'sequential',
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 5
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.stats.totalTools).toBe(1);
    });

    it('should execute parallel workflow successfully', async () => {
      const workflow = {
        executionMode: 'parallel',
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 3
            }
          },
          {
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(2);
      expect(result.stats.totalTools).toBe(2);
      expect(result.stats.successCount).toBe(2);
    });

    it('should handle tool execution errors gracefully', async () => {
      const workflow = {
        executionMode: 'sequential',
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 5
            }
          },
          {
            toolName: 'nonexistent_tool',
            parameters: {
              some_param: 'value'
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.results.length).toBe(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.stats.errorCount).toBe(1);
    });
  });

  describe('Result Processing', () => {
    it('should filter results correctly', async () => {
      const workflow = {
        executionMode: 'sequential',
        resultHandling: 'filter',
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
            toolName: 'nonexistent_tool',
            parameters: {
              some_param: 'value'
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(1); // Only successful results
    });

    it('should transform results correctly', async () => {
      const workflow = {
        executionMode: 'sequential',
        resultHandling: 'transform',
        tools: [
          {
            toolName: 'tool_search_tool_regex_20251119',
            parameters: {
              query: 'test',
              regex: false,
              limit: 1
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.results[0].status).toBe('success');
      expect(result.results[0].tool).toBe('tool_search_tool_regex_20251119');
      expect(result.results[0].data).toBeDefined();
    });

    it('should aggregate results correctly', async () => {
      const workflow = {
        executionMode: 'parallel',
        resultHandling: 'aggregate',
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
            toolName: 'core_utility_tools',
            parameters: {
              tool_name: 'tool_search_tool_regex_20251119',
              action: 'status'
            }
          },
          {
            toolName: 'nonexistent_tool',
            parameters: {
              some_param: 'value'
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.results.length).toBe(3);
    });
  });

  describe('Sandbox Execution', () => {
    it('should execute deferred tools in sandbox', async () => {
      const workflow = {
        executionMode: 'sequential',
        tools: [
          {
            toolName: 'github.test_tool',
            parameters: {
              api_key: 'test_key',
              endpoint: 'https://api.github.com/test'
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].result.success).toBe(true);
      expect(result.results[0].result.data.tool).toBe('github.test_tool');
    });

    it('should handle sandbox execution errors', async () => {
      const workflow = {
        executionMode: 'sequential',
        tools: [
          {
            toolName: 'data_processing.invalid',
            parameters: {
              // Invalid parameters to trigger error
            }
          }
        ]
      };

      const result = await toolOrchestrator.executeWorkflow(workflow);
      expect(result.success).toBe(true);
      // Should still complete but with error in results
      expect(result.results[0].success).toBe(true); // Sandbox handles errors internally
    });
  });
});

describe('Programmatic Tool Calling API', () => {
  it('should execute workflow via API endpoint', async () => {
    const workflow = {
      executionMode: 'sequential',
      tools: [
        {
          toolName: 'tool_search_tool_regex_20251119',
          parameters: {
            query: 'test',
            regex: false,
            limit: 2
          }
        }
      ]
    };

    const response = await request(app)
      .post('/tools/execute')
      .send(workflow)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results.length).toBe(1);
    expect(response.body.stats.totalTools).toBe(1);
  });

  it('should handle invalid workflow requests', async () => {
    const response = await request(app)
      .post('/tools/execute')
      .send({})
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it('should handle parallel execution via API', async () => {
    const workflow = {
      executionMode: 'parallel',
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
          toolName: 'core_utility_tools',
          parameters: {
            tool_name: 'tool_search_tool_regex_20251119',
            action: 'status'
          }
        }
      ]
    };

    const response = await request(app)
      .post('/tools/execute')
      .send(workflow)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.results.length).toBe(2);
    expect(response.body.stats.successCount).toBe(2);
  });
});