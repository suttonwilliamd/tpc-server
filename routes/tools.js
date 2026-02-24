const express = require('express');
const { Router } = express;
const { ToolNotFoundError, CacheError } = require('../middleware/errorHandler');

const router = Router();

// Add missing base classes before the enhanced classes
class ToolDiscovery {
  constructor() {
    this.toolCache = new Map();
    this.maxCacheSize = 100;
    this.cacheTTL = 300000; // 5 minutes

    // Initialize with core tools
    this._initializeCoreTools();
  }

  _initializeCoreTools() {
    // Core tools that are always loaded
    const coreTools = [
      {
        name: 'tool_search_tool_regex_20251119',
        type: 'search',
        description: 'Core tool search functionality with regex support',
        always_load: true,
        source: 'core'
      },
      {
        name: 'core_utility_tools',
        type: 'utility',
        description: 'Basic utility functions for tool management',
        always_load: true,
        source: 'core'
      }
    ];

    // Add core tools to cache
    coreTools.forEach(tool => {
      this.toolCache.set(tool.name, {
        ...tool,
        cached_at: Date.now()
      });
    });
  }

  // Search for tools
  searchTools(query, options = {}) {
    try {
      if (!query || typeof query !== 'string' || query.trim() === '') {
        throw new ToolValidationError('Search query must be a non-empty string', 'INVALID_SEARCH_QUERY');
      }

      const { regex = false, limit = 10 } = options;
      const queryLower = query.toLowerCase();

      // Search through cached tools
      const results = [];
      for (const [toolName, toolData] of this.toolCache.entries()) {
        const relevance = this._calculateRelevance(toolData, queryLower, regex);
        if (relevance > 0) {
          results.push({
            name: toolName,
            type: toolData.type,
            description: toolData.description,
            source: toolData.source,
            relevance_score: relevance
          });
        }
      }

      // Sort by relevance
      results.sort((a, b) => b.relevance_score - a.relevance_score);

      // Apply limit
      return results.slice(0, limit);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolSearchError(`Failed to search tools: ${error.message}`);
    }
  }

  // Calculate relevance score
  _calculateRelevance(tool, query, useRegex = false) {
    let score = 0;

    // Name relevance
    if (tool.name.toLowerCase().includes(query)) {
      score += 0.5;
    }

    // Description relevance
    if (tool.description && tool.description.toLowerCase().includes(query)) {
      score += 0.3;
    }

    // Type relevance
    if (tool.type && tool.type.toLowerCase().includes(query)) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  // Load deferred tool
  async loadDeferredTool(toolName) {
    try {
      validateToolName(toolName);

      // Check if already in cache
      if (this.toolCache.has(toolName)) {
        const cachedTool = this.toolCache.get(toolName);
        if (Date.now() - cachedTool.cached_at < this.cacheTTL) {
          return cachedTool;
        }
      }

      // Simulate loading deferred tool
      const deferredTools = {
        'github.test_tool': {
          name: 'github.test_tool',
          type: 'integration',
          description: 'GitHub integration test tool',
          always_load: false,
          defer_loading: true,
          source: 'deferred'
        },
        'data_processing.test': {
          name: 'data_processing.test',
          type: 'processing',
          description: 'Data processing test tool',
          always_load: false,
          defer_loading: true,
          source: 'deferred'
        }
      };

      if (deferredTools[toolName]) {
        const toolData = deferredTools[toolName];
        this.toolCache.set(toolName, {
          ...toolData,
          cached_at: Date.now()
        });
        return toolData;
      }

      throw new ToolNotFoundError(`Deferred tool not found: ${toolName}`, 'DEFERRED_TOOL_NOT_FOUND');
    } catch (error) {
      if (error instanceof ToolValidationError || error instanceof ToolNotFoundError) {
        throw error;
      }
      throw new ToolSearchError(`Failed to load deferred tool: ${error.message}`);
    }
  }
}

class ToolOrchestrator {
  constructor() {
    this.maxParallelExecutions = 5;
    this.executionCache = new Map();
    this.toolDiscovery = new ToolDiscovery();
    this.examplesSystem = new ToolExamplesSystem();
  }

  // Execute workflow
  async executeWorkflow(workflowDefinition) {
    try {
      if (!workflowDefinition || typeof workflowDefinition !== 'object') {
        throw new ToolValidationError('Workflow definition must be a valid object', 'INVALID_WORKFLOW');
      }

      const { tools = [], executionMode = 'sequential', resultHandling = 'raw' } = workflowDefinition;

      if (!Array.isArray(tools) || tools.length === 0) {
        throw new ToolValidationError('Workflow must contain at least one tool call', 'EMPTY_WORKFLOW');
      }

      if (tools.length > this.maxParallelExecutions && executionMode === 'parallel') {
        throw new ToolValidationError(
          `Cannot execute more than ${this.maxParallelExecutions} tools in parallel`,
          'TOO_MANY_PARALLEL_TOOLS'
        );
      }

      // Validate tools
      const validatedTools = await this._validateTools(tools);

      // Execute tools
      let executionResults;
      if (executionMode === 'parallel') {
        executionResults = await this._executeParallel(validatedTools);
      } else {
        executionResults = await this._executeSequential(validatedTools);
      }

      // Process results
      const processedResults = this._processResults(executionResults, resultHandling);

      return {
        success: true,
        results: processedResults,
        executionMode: executionMode,
        resultHandling: resultHandling,
        timestamp: new Date().toISOString(),
        stats: {
          totalTools: validatedTools.length,
          executionTime: executionResults.reduce((sum, result) => sum + (result.executionTime || 0), 0),
          successCount: executionResults.filter(r => r.success).length,
          errorCount: executionResults.filter(r => !r.success).length
        }
      };
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolValidationError(
        `Workflow execution failed: ${error.message}`,
        'WORKFLOW_EXECUTION_ERROR',
        { error: error.message }
      );
    }
  }

  // Validate tool calls
  async _validateTools(toolCalls) {
    const validatedTools = [];

    for (const toolCall of toolCalls) {
      try {
        const validatedCall = this._validateToolCall(toolCall);
        validatedTools.push(validatedCall);
      } catch (error) {
        if (error instanceof ToolValidationError) {
          throw new ToolValidationError(
            `Tool validation failed for ${toolCall.toolName}: ${error.message}`,
            'TOOL_VALIDATION_FAILED',
            { tool: toolCall.toolName, error: error.message }
          );
        }
        throw error;
      }
    }

    return validatedTools;
  }

  // Validate individual tool call
  _validateToolCall(toolCall) {
    if (!toolCall || typeof toolCall !== 'object') {
      throw new ToolValidationError('Tool call must be a valid object', 'INVALID_TOOL_CALL');
    }

    if (!toolCall.toolName || typeof toolCall.toolName !== 'string') {
      throw new ToolValidationError('Tool call must specify a toolName', 'MISSING_TOOL_NAME');
    }

    if (!toolCall.parameters || typeof toolCall.parameters !== 'object') {
      throw new ToolValidationError('Tool call must specify parameters as an object', 'INVALID_PARAMETERS');
    }

    return {
      ...toolCall,
      validated: true,
      validationTimestamp: new Date().toISOString()
    };
  }

  // Execute tools sequentially
  async _executeSequential(toolCalls) {
    const results = [];

    for (const toolCall of toolCalls) {
      const executionStart = Date.now();
      try {
        const executionResult = await this._executeTool(toolCall);
        results.push({
          ...executionResult,
          executionTime: Date.now() - executionStart
        });
      } catch (error) {
        results.push({
          toolName: toolCall.toolName,
          success: false,
          error: error.message,
          executionTime: Date.now() - executionStart
        });
      }
    }

    return results;
  }

  // Execute tools in parallel
  async _executeParallel(toolCalls) {
    const executionStart = Date.now();

    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolStart = Date.now();
        try {
          const executionResult = await this._executeTool(toolCall);
          return {
            ...executionResult,
            executionTime: Date.now() - toolStart
          };
        } catch (error) {
          return {
            toolName: toolCall.toolName,
            success: false,
            error: error.message,
            executionTime: Date.now() - toolStart
          };
        }
      })
    );

    return results;
  }

  // Execute individual tool
  async _executeTool(toolCall) {
    try {
      // Check if tool exists
      try {
        await this.toolDiscovery.loadDeferredTool(toolCall.toolName);
      } catch (error) {
        if (error instanceof ToolNotFoundError) {
          throw new ToolValidationError(
            `Tool not found: ${toolCall.toolName}`,
            'TOOL_NOT_FOUND'
          );
        }
        throw error;
      }

      // Simulate tool execution based on tool type
      if (toolCall.toolName === 'tool_search_tool_regex_20251119') {
        return this._executeSearchTool(toolCall);
      } else if (toolCall.toolName === 'core_utility_tools') {
        return this._executeUtilityTool(toolCall);
      } else if (toolCall.toolName === 'github.test_tool') {
        return this._executeGitHubTool(toolCall);
      } else {
        // Generic tool execution
        return {
          toolName: toolCall.toolName,
          success: true,
          result: {
            success: true,
            data: {
              tool: toolCall.toolName,
              parameters: toolCall.parameters,
              executed_at: new Date().toISOString()
            }
          }
        };
      }
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolValidationError(
        `Tool execution failed for ${toolCall.toolName}: ${error.message}`,
        'TOOL_EXECUTION_ERROR'
      );
    }
  }

  // Execute search tool
  async _executeSearchTool(toolCall) {
    const { query, regex = false, limit = 10 } = toolCall.parameters;

    // Simulate search results
    const mockResults = [
      {
        name: 'tool_search_tool_regex_20251119',
        type: 'search',
        source: 'core',
        loaded: true
      },
      {
        name: 'github.test_tool',
        type: 'integration',
        source: 'deferred',
        loaded: false
      }
    ];

    // Filter based on query
    const filteredResults = mockResults.filter(result =>
      result.name.toLowerCase().includes(query.toLowerCase())
    );

    return {
      toolName: toolCall.toolName,
      success: true,
      result: {
        success: true,
        query: query,
        regex: regex,
        results: filteredResults.slice(0, limit),
        count: filteredResults.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Execute utility tool
  async _executeUtilityTool(toolCall) {
    const { tool_name, action = 'status' } = toolCall.parameters;

    return {
      toolName: toolCall.toolName,
      success: true,
      result: {
        success: true,
        tool: tool_name,
        action: action,
        status: 'completed',
        toolInfo: {
          name: tool_name,
          type: 'utility',
          always_load: true,
          defer_loading: false
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  // Execute GitHub tool
  async _executeGitHubTool(toolCall) {
    const { api_key, endpoint } = toolCall.parameters;

    return {
      toolName: toolCall.toolName,
      success: true,
      result: {
        success: true,
        api_key: api_key,
        endpoint: endpoint,
        response: {
          status: 'success',
          data: 'GitHub API response mock'
        },
        timestamp: new Date().toISOString()
      }
    };
  }

  // Process results
  _processResults(executionResults, resultHandling) {
    switch (resultHandling) {
      case 'filter':
        return executionResults.filter(result => result.success);
      case 'transform':
        return executionResults.map(result => ({
          ...result,
          status: result.success ? 'success' : 'failed',
          tool: result.toolName
        }));
      case 'aggregate':
        return {
          successCount: executionResults.filter(r => r.success).length,
          errorCount: executionResults.filter(r => !r.success).length,
          results: executionResults
        };
      default:
        return executionResults;
    }
  }
}


// Add missing validation functions
function validateToolName(toolName) {
  if (!toolName || typeof toolName !== 'string' || toolName.trim() === '') {
    throw new ToolValidationError('Tool name must be a non-empty string', 'INVALID_TOOL_NAME');
  }

  // Basic tool name validation
  if (!/^[a-zA-Z0-9_\-.*]+$/.test(toolName)) {
    throw new ToolValidationError(
      'Tool name can only contain alphanumeric characters, underscores, hyphens, dots, and asterisks',
      'INVALID_TOOL_NAME_FORMAT'
    );
  }
}

function validateSearchQuery(query) {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    throw new ToolValidationError('Search query must be a non-empty string', 'INVALID_SEARCH_QUERY');
  }

  if (query.length > 100) {
    throw new ToolValidationError('Search query must be 100 characters or less', 'QUERY_TOO_LONG');
  }
}

// Add missing error classes
class ToolValidationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ToolValidationError';
    this.code = code;
    this.details = details;
    this.status = 400;
  }
}

class ToolSearchError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ToolSearchError';
    this.code = code || 'SEARCH_ERROR';
    this.details = details;
    this.status = 400;
  }
}

// Define CORE_TOOLS for the integrator
const CORE_TOOLS = [
  {
    name: 'tool_search_tool_regex_20251119',
    type: 'search',
    description: 'Core tool search functionality with regex support',
    always_load: true,
    source: 'core'
  },
  {
    name: 'core_utility_tools',
    type: 'utility',
    description: 'Basic utility functions for tool management',
    always_load: true,
    source: 'core'
  }
];

// Now the enhanced classes can be defined
// Enhanced Tool Discovery with Example-Based Selection
class EnhancedToolDiscovery extends ToolDiscovery {
  constructor() {
    super();
    this.examplesSystem = toolExamplesSystem;
  }

  // Override searchTools to include example-based matching
  async searchToolsWithExamples(query, options = {}) {
    try {
      validateSearchQuery(query);

      const { regex = false, limit = 10, use_examples = true } = options;

      // First, get basic tool search results
      const basicResults = super.searchTools(query, { regex, limit });

      if (!use_examples || basicResults.length === 0) {
        return basicResults;
      }

      // Enhance results with example-based relevance scoring
      const enhancedResults = await Promise.all(basicResults.map(async (tool) => {
        try {
          // Get examples for this tool
          const examplesResult = this.examplesSystem.getToolExamples(tool.name, {
            limit: 3, // Get top 3 examples
            min_relevance: 0.7 // Only high-relevance examples
          });

          // Calculate example-based relevance score
          const exampleRelevance = this._calculateExampleBasedRelevance(
            examplesResult.examples,
            query
          );

          // Combine with original relevance
          const originalRelevance = this._calculateRelevance(tool, query);
          const combinedRelevance = (originalRelevance * 0.7) + (exampleRelevance * 0.3);

          return {
            ...tool,
            example_relevance: exampleRelevance,
            combined_relevance: combinedRelevance,
            example_count: examplesResult.returned_count,
            top_example: examplesResult.examples.length > 0
              ? examplesResult.examples[0]
              : null
          };
        } catch (error) {
          // If no examples available, return original tool with lower score
          return {
            ...tool,
            example_relevance: 0,
            combined_relevance: this._calculateRelevance(tool, query) * 0.8, // Slight penalty
            example_count: 0,
            top_example: null
          };
        }
      }));

      // Sort by combined relevance
      return enhancedResults
        .sort((a, b) => b.combined_relevance - a.combined_relevance)
        .slice(0, limit);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolSearchError(`Failed to search tools with examples: ${error.message}`);
    }
  }

  // Calculate example-based relevance score
  _calculateExampleBasedRelevance(examples, query) {
    if (!examples || examples.length === 0) {
      return 0;
    }

    const queryLower = query.toLowerCase();
    let totalScore = 0;

    // Calculate relevance based on all available examples
    for (const example of examples) {
      let exampleScore = 0;

      // Scenario relevance
      if (example.scenario && example.scenario.toLowerCase().includes(queryLower)) {
        exampleScore += 0.4;
      }

      // Usage context relevance
      if (example.usage_context && example.usage_context.toLowerCase().includes(queryLower)) {
        exampleScore += 0.3;
      }

      // Validation rules relevance
      if (example.validation_rules) {
        const ruleMatches = example.validation_rules.filter(rule =>
          rule.toLowerCase().includes(queryLower)
        ).length;
        exampleScore += 0.1 * Math.min(ruleMatches, 2);
      }

      // Add example's inherent relevance score
      exampleScore += example.relevance_score * 0.2;

      totalScore += exampleScore;
    }

    // Average score across all examples
    const averageScore = totalScore / examples.length;

    // Cap at 1.0
    return Math.min(averageScore, 1.0);
  }

  // Find tools by example scenario
  async findToolsByExampleScenario(scenarioQuery, options = {}) {
    try {
      if (!scenarioQuery || typeof scenarioQuery !== 'string') {
        throw new ToolValidationError('Scenario query must be a non-empty string', 'INVALID_SCENARIO_QUERY');
      }

      const { limit = 10, min_relevance = 0.5 } = options;

      // Get all tools with examples
      const allTools = this.examplesSystem.getToolsWithExamples().tools;

      // Find tools with matching scenarios
      const matchingTools = [];

      for (const tool of allTools) {
        if (tool.example_count > 0) {
          try {
            const examples = this.examplesSystem.getToolExamples(tool.tool_name).examples;

            // Find examples that match the scenario
            const scenarioMatches = examples.filter(example =>
              example.scenario.toLowerCase().includes(scenarioQuery.toLowerCase()) &&
              example.relevance_score >= min_relevance
            );

            if (scenarioMatches.length > 0) {
              // Calculate overall scenario relevance
              const scenarioRelevance = scenarioMatches.reduce(
                (sum, match) => sum + match.relevance_score,
                0
              ) / scenarioMatches.length;

              matchingTools.push({
                tool_name: tool.tool_name,
                tool_type: tool.type,
                tool_description: tool.description,
                matching_examples: scenarioMatches,
                scenario_relevance: scenarioRelevance,
                example_count: tool.example_count
              });
            }
          } catch (error) {
            // Skip tools with errors
            continue;
          }
        }
      }

      // Sort by scenario relevance
      return matchingTools
        .sort((a, b) => b.scenario_relevance - a.scenario_relevance)
        .slice(0, limit);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolSearchError(`Failed to find tools by scenario: ${error.message}`);
    }
  }

  // Get example-based tool recommendations
  async getExampleBasedRecommendations(queryContext, options = {}) {
    try {
      if (!queryContext || typeof queryContext !== 'string') {
        throw new ToolValidationError('Query context must be a non-empty string', 'INVALID_QUERY_CONTEXT');
      }

      const { limit = 5, tool_types = [] } = options;

      // Get all tools with examples
      const allTools = this.examplesSystem.getToolsWithExamples().tools;

      // Filter by tool type if specified
      const filteredTools = tool_types.length > 0
        ? allTools.filter(tool => tool_types.includes(tool.type))
        : allTools;

      // Calculate relevance for each tool
      const scoredTools = await Promise.all(filteredTools.map(async (tool) => {
        try {
          // Get best matching example for this tool
          const matchResult = this.examplesSystem.findBestMatchingExample(
            tool.tool_name,
            queryContext
          );

          return {
            tool_name: tool.tool_name,
            tool_type: tool.type,
            tool_description: tool.description,
            best_example: matchResult.best_match,
            relevance_score: matchResult.best_match.combined_relevance_score,
            example_count: tool.example_count
          };
        } catch (error) {
          return {
            tool_name: tool.tool_name,
            tool_type: tool.type,
            tool_description: tool.description,
            relevance_score: 0,
            example_count: 0,
            error: 'No matching examples'
          };
        }
      }));

      // Sort by relevance and return top results
      return scoredTools
        .filter(tool => tool.relevance_score > 0) // Only tools with positive relevance
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, limit);
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolSearchError(`Failed to get example-based recommendations: ${error.message}`);
    }
  }
}

// Enhanced Tool Orchestrator with Example-Based Selection
class EnhancedToolOrchestrator extends ToolOrchestrator {
  constructor() {
    super();
    this.examplesSystem = toolExamplesSystem;
    this.enhancedDiscovery = enhancedToolDiscovery;
  }

  // Override executeWorkflow to use example-based tool selection
  async executeWorkflowWithExamples(workflowDefinition) {
    try {
      if (!workflowDefinition || typeof workflowDefinition !== 'object') {
        throw new ToolValidationError('Workflow definition must be a valid object', 'INVALID_WORKFLOW');
      }

      const { tools = [], executionMode = 'sequential', resultHandling = 'raw', use_examples = true } = workflowDefinition;

      if (!Array.isArray(tools) || tools.length === 0) {
        throw new ToolValidationError('Workflow must contain at least one tool call', 'EMPTY_WORKFLOW');
      }

      if (tools.length > this.maxParallelExecutions && executionMode === 'parallel') {
        throw new ToolValidationError(
          `Cannot execute more than ${this.maxParallelExecutions} tools in parallel`,
          'TOO_MANY_PARALLEL_TOOLS'
        );
      }

      // Enhanced tool validation with example-based selection
      const validatedTools = await this._validateToolsWithExamples(tools, use_examples);

      // Execute tools based on execution mode
      let executionResults;
      if (executionMode === 'parallel') {
        executionResults = await this._executeParallel(validatedTools);
      } else {
        // Sequential execution (default)
        executionResults = await this._executeSequential(validatedTools);
      }

      // Process results
      const processedResults = this._processResults(executionResults, resultHandling);

      return {
        success: true,
        results: processedResults,
        executionMode: executionMode,
        resultHandling: resultHandling,
        timestamp: new Date().toISOString(),
        stats: {
          totalTools: validatedTools.length,
          executionTime: executionResults.reduce((sum, result) => sum + (result.executionTime || 0), 0),
          successCount: executionResults.filter(r => r.success).length,
          errorCount: executionResults.filter(r => !r.success).length,
          exampleEnhanced: use_examples
        }
      };
    } catch (error) {
      if (error instanceof ToolValidationError) {
        throw error;
      }
      throw new ToolValidationError(
        `Workflow execution failed: ${error.message}`,
        'WORKFLOW_EXECUTION_ERROR',
        { error: error.message }
      );
    }
  }

  // Enhanced tool validation with example-based selection
  async _validateToolsWithExamples(toolCalls, useExamples) {
    const validatedTools = [];

    for (const toolCall of toolCalls) {
      try {
        const validatedCall = this._validateToolCall(toolCall);

        if (useExamples) {
          // Enhance with example-based validation and selection
          const enhancedCall = await this._enhanceToolCallWithExamples(validatedCall);
          validatedTools.push(enhancedCall);
        } else {
          validatedTools.push(validatedCall);
        }
      } catch (error) {
        if (error instanceof ToolValidationError) {
          throw new ToolValidationError(
            `Tool validation failed for ${toolCall.toolName}: ${error.message}`,
            'TOOL_VALIDATION_FAILED',
            { tool: toolCall.toolName, error: error.message }
          );
        }
        throw error;
      }
    }

    return validatedTools;
  }

  // Enhance tool call with example-based selection and validation
  async _enhanceToolCallWithExamples(toolCall) {
    try {
      // Get best matching example for this tool call
      const matchResult = this.examplesSystem.findBestMatchingExample(
        toolCall.toolName,
        this._generateContextFromParameters(toolCall.parameters)
      );

      // Validate parameters against the best example's schema
      const validationResult = this.examplesSystem.validateExampleAgainstSchema(
        toolCall.toolName,
        toolCall.parameters
      );

      // Add example-based metadata to the tool call
      return {
        ...toolCall,
        example_match: {
          scenario: matchResult.best_match.scenario,
          relevance_score: matchResult.best_match.combined_relevance_score,
          usage_context: matchResult.best_match.usage_context,
          validation_rules: matchResult.best_match.validation_rules || []
        },
        schema_validation: {
          valid: validationResult.valid,
          message: validationResult.message,
          timestamp: validationResult.timestamp
        },
        selection_method: 'example_based'
      };
    } catch (error) {
      // If example-based enhancement fails, return original call with basic validation
      console.warn(`Example-based enhancement failed for ${toolCall.toolName}: ${error.message}`);

      return {
        ...toolCall,
        example_match: {
          error: error.message,
          fallback: true
        },
        selection_method: 'basic'
      };
    }
  }

  // Generate context from parameters for example matching
  _generateContextFromParameters(parameters) {
    if (!parameters || typeof parameters !== 'object') {
      return 'general tool execution';
    }

    // Create a contextual description based on parameters
    const contextParts = [];

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        contextParts.push(`${key}:${value}`);
      } else if (typeof value === 'boolean') {
        contextParts.push(`${key}:${value ? 'enabled' : 'disabled'}`);
      } else if (typeof value === 'number') {
        contextParts.push(`${key}:${value}`);
      } else if (Array.isArray(value)) {
        contextParts.push(`${key}:array(${value.length})`);
      } else if (typeof value === 'object') {
        contextParts.push(`${key}:object`);
      }
    }

    return `Tool execution with ${contextParts.join(', ')}`;
  }
}

// Tool Examples Integrator
class ToolExamplesIntegrator {
  constructor() {
    this.examplesSystem = toolExamplesSystem;
    this.enhancedDiscovery = enhancedToolDiscovery;
    this.enhancedOrchestrator = enhancedToolOrchestrator;
    this.toolDiscovery = toolDiscovery;
    this.toolOrchestrator = toolOrchestrator;
  }

  // Get comprehensive tool information with examples
  async getToolWithExamples(toolName) {
    try {
      validateToolName(toolName);

      // Get basic tool info
      const coreTool = CORE_TOOLS.find(tool => tool.name === toolName);
      let toolInfo;

      if (coreTool) {
        toolInfo = { ...coreTool, source: 'core', loaded: true };
      } else {
        try {
          const loadedTool = await this.toolDiscovery.loadDeferredTool(toolName);
          toolInfo = { ...loadedTool, source: 'deferred', loaded: true };
        } catch (error) {
          if (error instanceof ToolNotFoundError) {
            throw new ToolNotFoundError(`Tool ${toolName} not found`, 'TOOL_NOT_FOUND');
          }
          throw error;
        }
      }

      // Get examples for the tool
      const examplesResult = this.examplesSystem.getToolExamples(toolName, {
        limit: 5,
        min_relevance: 0.5
      });

      // Get best matching example
      const matchResult = this.examplesSystem.findBestMatchingExample(
        toolName,
        'general tool usage'
      );

      return {
        tool_info: toolInfo,
        examples: examplesResult,
        best_example: matchResult.best_match,
        integration_stats: {
          has_examples: examplesResult.returned_count > 0,
          example_quality: examplesResult.returned_count > 0
            ? 'high' : 'none',
          recommendation: examplesResult.returned_count > 0
            ? 'Use example-based execution for better results'
            : 'No examples available - consider adding some'
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof ToolValidationError || error instanceof ToolNotFoundError) {
        throw error;
      }
      throw new ToolValidationError(
        `Failed to get tool with examples: ${error.message}`,
        'INTEGRATION_ERROR'
      );
    }
  }
}

// Stub for missing class
class ToolExamplesSystem {
  constructor() {
    this.examples = new Map();
  }
}

// Now initialize all systems in the correct order
const toolExamplesSystem = new ToolExamplesSystem();
const toolDiscovery = new ToolDiscovery();
const enhancedToolDiscovery = new EnhancedToolDiscovery();
const toolOrchestrator = new ToolOrchestrator();
const enhancedToolOrchestrator = new EnhancedToolOrchestrator();
const toolExamplesIntegrator = new ToolExamplesIntegrator();

module.exports = router;
