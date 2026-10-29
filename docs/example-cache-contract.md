# Tool example timestamp-cache contract

`/tools/examples` validates the tool name before accessing a module-wide cache
keyed by the exact tool name. It retains the first timestamp for that key; it
still constructs the examples response on every request. There is no TTL,
expiry, invalidation or whole-response caching guarantee.

`routes/exampleTimestampCache.js` extracts the existing behavior into a factory
with injectable cache, timestamp clock and delay. Production retains one
module-wide instance (including across `createApp` calls), the same ISO timestamp
payload and the existing artificial blocking delay: 40 ms on a miss, 1 ms on a
hit. Separate factory calls have independent default maps. This is a testability
seam, not a cache redesign or delay optimization.

The previous cache ratio test ran after earlier tests had requested the same
key, so its purported cold/hot comparison was normally hit/hit. Two tiny
wall-clock HTTP samples cannot establish cache correctness or real-world speed.
The isolated contracts in `tests/test_example_timestamp_cache.js` instead assert
storage, timestamp retention as controlled time advances, distinct-key isolation,
prewarmed hits, factory isolation and exact delay-branch selection. Run without
dependencies using:

```sh
node --test tests/test_example_timestamp_cache.js
```

These contracts also run under the existing Jest test discovery. The performance
suite retains HTTP timestamp-retention coverage; it makes no TTL claim. Other
performance assertions are unchanged. Deterministic branch tests do not measure
or promise real-world speed, throughput or latency. Any such requirement needs
a separately defined controlled benchmark, not a relaxed ratio threshold.
