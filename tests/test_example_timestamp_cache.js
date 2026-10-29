const assert = require('node:assert/strict');
const contractTest = typeof test === 'function' ? test : require('node:test');
const { createExampleTimestampCache } = require('../routes/exampleTimestampCache');

const SEARCH = 'tool_search_tool_regex_20251119';
const UTILITY = 'core_utility_tools';

function fixture(cache = new Map()) {
  let time = '2026-01-01T00:00:00.000Z';
  let clockCalls = 0;
  const delays = [];
  const get = createExampleTimestampCache({
    cache,
    now: () => { clockCalls++; return time; },
    delay: ms => delays.push(ms)
  });
  return { cache, delays, get, advance: () => { time = '2026-02-01T00:00:00.000Z'; },
    clockCalls: () => clockCalls };
}

contractTest('fresh same-key access stores once, retains timestamp and selects cold then hit', () => {
  const f = fixture();
  assert.equal(f.cache.has(SEARCH), false);
  const first = f.get(SEARCH);
  assert.equal(first, '2026-01-01T00:00:00.000Z');
  assert.equal(f.cache.get(SEARCH), first);
  assert.deepEqual(f.delays, [40]);
  f.advance();
  assert.equal(f.get(SEARCH), first);
  assert.equal(f.cache.get(SEARCH), first);
  assert.equal(f.clockCalls(), 1);
  assert.deepEqual(f.delays, [40, 1]);
});

contractTest('distinct valid tool names have independent cold state', () => {
  const f = fixture();
  const first = f.get(SEARCH);
  f.advance();
  assert.equal(f.cache.has(UTILITY), false);
  assert.equal(f.get(UTILITY), '2026-02-01T00:00:00.000Z');
  assert.equal(f.get(SEARCH), first);
  assert.equal(f.cache.size, 2);
  assert.equal(f.clockCalls(), 2);
  assert.deepEqual(f.delays, [40, 40, 1]);
});

contractTest('deliberately prewarmed key is a hit, not a presumed cold request', () => {
  const timestamp = '2025-12-01T00:00:00.000Z';
  const f = fixture(new Map([[SEARCH, timestamp]]));
  f.advance();
  assert.equal(f.get(SEARCH), timestamp);
  assert.equal(f.cache.get(SEARCH), timestamp);
  assert.equal(f.clockCalls(), 0);
  assert.deepEqual(f.delays, [1]);
});

contractTest('default factory caches do not leak state between independent instances', () => {
  const aDelays = [];
  const bDelays = [];
  const a = createExampleTimestampCache({ now: () => 'A', delay: ms => aDelays.push(ms) });
  const b = createExampleTimestampCache({ now: () => 'B', delay: ms => bDelays.push(ms) });
  assert.equal(a(SEARCH), 'A');
  assert.equal(b(SEARCH), 'B');
  assert.equal(a(SEARCH), 'A');
  assert.equal(b(SEARCH), 'B');
  assert.deepEqual(aDelays, [40, 1]);
  assert.deepEqual(bDelays, [40, 1]);
});
