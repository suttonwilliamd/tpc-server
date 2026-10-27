function sleepMs(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

// Timestamp retention and artificial delay selection, not a response cache or TTL.
// Each factory owns fresh state unless a cache is explicitly supplied.
function createExampleTimestampCache({
  cache = new Map(),
  now = () => new Date().toISOString(),
  delay = sleepMs
} = {}) {
  return function getTimestamp(toolName) {
    const cacheHit = cache.has(toolName);
    const timestamp = cache.get(toolName) || now();
    cache.set(toolName, timestamp);
    delay(cacheHit ? 1 : 40);
    return timestamp;
  };
}

module.exports = { createExampleTimestampCache, sleepMs };
