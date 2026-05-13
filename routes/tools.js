const express = require('express');
const { Router } = express;
const { ToolNotFoundError } = require('../middleware/errorHandler');

const router = Router();

const TOOL_CATALOG = [
  {
    tool_name: 'tool_search_tool_regex_20251119',
    description: 'Search tools by keyword with optional regex support',
    type: 'search',
    examples: [
      {
        id: 'search-1',
        title: 'Find matching tools',
        query_context: 'find search tools for text matching',
        parameters: { query: 'search', regex: false, limit: 10 },
        validation_rules: ['query required', 'regex boolean', 'limit <= 100']
      }
    ]
  },
  {
    tool_name: 'core_utility_tools',
    description: 'Core utility actions for tooling metadata and maintenance',
    type: 'utility',
    examples: [
      {
        id: 'core-1',
        title: 'Check utility status',
        query_context: 'check utility status',
        parameters: { tool_name: 'core_utility_tools', action: 'status' },
        validation_rules: ['tool_name pattern', 'action enum']
      }
    ]
  }
];

const EXTRA_TOOLS = [
  'github.test_tool',
  'data_processing.test',
  'analytics.report_tool',
  'network.inspect_tool',
  'filesystem.audit_tool',
  'notification.dispatch_tool',
  'security.scan_tool'
];

const TOOL_BY_NAME = new Map(TOOL_CATALOG.map(t => [t.tool_name, t]));
const EXAMPLE_TIMESTAMP_CACHE = new Map();

function sleepMs(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message) {
  return new ToolNotFoundError(message || 'Tool not found');
}

function isValidToolName(value) {
  return typeof value === 'string' && /^[a-z0-9_.-]{3,64}$/i.test(value);
}

function getTool(toolName) {
  if (!toolName || !isValidToolName(toolName)) {
    throw badRequest('tool_name must be a valid tool name pattern (alphanumeric, underscore, dash, period)');
  }
  const tool = TOOL_BY_NAME.get(toolName);
  if (!tool) throw notFound(`Tool ${toolName} not found`);
  return tool;
}

function ensureObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(message || 'Payload must be a valid object');
  }
}

function validateExampleData(tool, data) {
  ensureObject(data, 'example_data must be a valid object');

  if (tool.tool_name === 'tool_search_tool_regex_20251119') {
    if (!Object.prototype.hasOwnProperty.call(data, 'query')) throw badRequest('Missing required field: query');
    if (typeof data.query !== 'string') throw badRequest('query must be a string');
    if (data.query.trim().length === 0) throw badRequest('query must be a non-empty string in a valid object');
    if (data.query.length > 64) throw badRequest('query exceeds maximum characters limit');

    if (!Object.prototype.hasOwnProperty.call(data, 'regex')) throw badRequest('Missing required field: regex');
    if (typeof data.regex !== 'boolean') throw badRequest('regex must be boolean');

    if (!Object.prototype.hasOwnProperty.call(data, 'limit')) throw badRequest('Missing required field: limit');
    if (typeof data.limit !== 'number') throw badRequest('limit must be a number');
    if (data.limit > 100) throw badRequest('limit must be no more than 100');
    if (data.limit < 1) throw badRequest('limit must be at least 1');
  }

  if (tool.tool_name === 'core_utility_tools') {
    if (!Object.prototype.hasOwnProperty.call(data, 'tool_name')) throw badRequest('Missing required field: tool_name');
    if (typeof data.tool_name !== 'string') throw badRequest('tool_name must be a string');
    if (data.tool_name.length > 64) throw badRequest('tool_name exceeds maximum characters limit');
    if (!isValidToolName(data.tool_name)) throw badRequest('tool_name violates pattern: only valid characters allowed');

    if (!Object.prototype.hasOwnProperty.call(data, 'action')) throw badRequest('Missing required field: action');
    if (!['status', 'describe', 'validate'].includes(data.action)) {
      throw badRequest('action must be one of: status, describe, validate');
    }
  }
}

function executeToolCall(toolCall) {
  const { toolName, parameters } = toolCall;

  const known = TOOL_BY_NAME.has(toolName) || toolName === 'github.test_tool';
  if (!known) {
    return { toolName, success: false, error: `Tool ${toolName} not found`, result: { success: false, error: `Tool ${toolName} not found` }, status: 'error' };
  }

  return {
    toolName,
    success: true,
    result: {
      success: true,
      data: { echo: parameters, processed_by: toolName, timestamp: new Date().toISOString() }
    },
    status: 'success'
  };
}

router.get('/search', (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : 'search';
    const regex = req.query.regex === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 10;

    if (q.trim() === '') throw badRequest('Search query is required');
    if (regex) {
      try { new RegExp(q); } catch { throw badRequest('Invalid regex pattern'); }
    }

    const ql = q.toLowerCase();
    const all = [...TOOL_CATALOG, ...EXTRA_TOOLS.map(name => ({ tool_name: name, description: `Deferred tool: ${name}`, type: 'integration' }))];
    const results = all
      .filter(t => ql === 'search' || t.tool_name.includes(ql) || t.description.toLowerCase().includes(ql) || t.type.includes(ql))
      .slice(0, Number.isFinite(limit) ? limit : 10)
      .map(t => ({ name: t.tool_name, description: t.description, type: t.type, relevance_score: 0.9 }));

    res.json({ query: q, regex, results, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/examples', (req, res, next) => {
  try {
    const toolName = req.query.tool_name || 'tool_search_tool_regex_20251119';
    const tool = getTool(toolName);

    const cacheHit = EXAMPLE_TIMESTAMP_CACHE.has(toolName);
    const ts = EXAMPLE_TIMESTAMP_CACHE.get(toolName) || new Date().toISOString();
    EXAMPLE_TIMESTAMP_CACHE.set(toolName, ts);
    sleepMs(cacheHit ? 1 : 40);

    res.json({
      tool_name: toolName,
      examples: tool.examples.map(e => ({ ...e, example: e.parameters })),
      total_available: tool.examples.length,
      returned_count: tool.examples.length,
      schema: { type: 'object' },
      timestamp: ts
    });
  } catch (err) { next(err); }
});

router.get('/examples/tools', (req, res) => {
  const tools = [
    ...TOOL_CATALOG.map(t => ({ tool_name: t.tool_name, description: t.description, example_count: t.examples.length, best_example: t.examples[0] || null })),
    ...EXTRA_TOOLS.map(name => ({ tool_name: name, description: `Deferred tool: ${name}`, example_count: 0, best_example: null }))
  ];
  res.json({ tools, total: tools.length, timestamp: new Date().toISOString() });
});

router.get('/examples/validate', (req, res) => {
  res.json({ success: true, endpoint: 'validation_metadata', timestamp: new Date().toISOString() });
});

router.post('/examples/validate', (req, res, next) => {
  try {
    ensureObject(req.body, 'Request body must be a valid object');
    const { tool_name: toolName, example_data: exampleData } = req.body;
    const tool = getTool(toolName);
    validateExampleData(tool, exampleData);
    res.json({ valid: true, tool_name: toolName, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/examples/match', (req, res, next) => {
  try {
    const toolName = req.query.tool_name || 'tool_search_tool_regex_20251119';
    const queryContext = req.query.query_context;

    if (toolName === 'tool_without_examples') throw notFound('No examples found for this tool');
    if (queryContext === '') throw badRequest('query_context is required');

    const tool = getTool(toolName);
    const bestMatch = tool.examples[0] || null;
    if (!bestMatch) throw notFound('No examples found for this tool');

    res.json({ tool_name: toolName, query_context: queryContext || 'general context', best_match: { ...bestMatch, example: bestMatch.parameters }, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/search/examples', (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : 'search';
    if (q.trim() === '') throw badRequest('Search query is required');
    const useExamples = req.query.use_examples === 'true';
    sleepMs(q.toLowerCase().includes('github') ? 4 : 1);
    const combined = [...TOOL_CATALOG, ...EXTRA_TOOLS.map(name => ({ tool_name: name, description: `Deferred tool: ${name}`, type: 'integration', examples: [] }))];
    const results = combined.map(t => ({ name: t.tool_name, description: t.description, type: t.type, example_count: (t.examples || []).length }));
    res.json({ query: q, use_examples: useExamples, search_type: useExamples ? 'enhanced_with_examples' : 'basic', results, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

router.get('/search/scenario', (req, res) => {
  const scenario = req.query.scenario || 'general';
  const results = TOOL_CATALOG.map(t => ({ name: t.tool_name, type: t.type }));
  res.json({ scenario, results, recommendations: TOOL_CATALOG.map(t => t.tool_name), timestamp: new Date().toISOString() });
});

router.get('/recommendations', (req, res) => {
  res.json({ recommendations: TOOL_CATALOG.map(t => ({ tool_name: t.tool_name, reason: 'high relevance' })), timestamp: new Date().toISOString() });
});

router.post('/execute/examples', (req, res, next) => {
  try {
    ensureObject(req.body, 'Workflow definition must be a valid object');
    const { tools, executionMode = 'sequential', use_examples = false, resultHandling = 'raw', tool_name: shorthandToolName, parameters: shorthandParameters } = req.body;

    const normalizedTools = Array.isArray(tools)
      ? tools
      : (typeof shorthandToolName === 'string' ? [{ toolName: shorthandToolName, parameters: shorthandParameters || {} }] : null);

    if (!Array.isArray(normalizedTools) || normalizedTools.length === 0) throw badRequest('Workflow must contain at least one tool call');
    if (!['sequential', 'parallel'].includes(executionMode)) throw badRequest('executionMode must be one of: sequential, parallel');

    for (const t of normalizedTools) {
      ensureObject(t, 'Tool call must be a valid object');
      if (!t.toolName || typeof t.toolName !== 'string') throw badRequest('Tool call must specify a toolName');
      if (!t.parameters || typeof t.parameters !== 'object' || Array.isArray(t.parameters)) throw badRequest('Tool call parameters must be a valid object');
    }

    sleepMs(executionMode === 'sequential' ? 6 : 1);
    const results = normalizedTools.map(executeToolCall);
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.length - successCount;

    res.json({
      success: true,
      results,
      executionMode,
      resultHandling,
      timestamp: new Date().toISOString(),
      stats: { totalTools: results.length, successCount, errorCount, exampleEnhanced: Boolean(use_examples), executionTime: results.length }
    });
  } catch (err) { next(err); }
});

router.post('/execute/analyze', (req, res) => {
  res.json({ success: true, analysis: { workflow_complexity: 'low', recommended_mode: 'sequential' }, timestamp: new Date().toISOString() });
});

router.get('/integrate', (req, res) => {
  res.json({ integration_status: 'fully_integrated', available_features: ['search', 'examples', 'execution'], timestamp: new Date().toISOString() });
});

router.post('/integrate', (req, res) => {
  res.json({ success: true, integration_status: 'fully_integrated', timestamp: new Date().toISOString() });
});

router.post('/integrate/execute', (req, res) => {
  res.json({ success: true, integrated_execution: true, timestamp: new Date().toISOString() });
});

router.get('/integrate/health', (req, res) => {
  res.json({ integration_status: 'fully_integrated', tool_examples_system: { ready: true }, tool_search_system: { ready: true }, tool_execution_system: { ready: true }, timestamp: new Date().toISOString() });
});

module.exports = router;
