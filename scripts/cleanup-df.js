// Clean up buggy DF Legends entries
const sqlite3 = require('better-sqlite3');
const db = new sqlite3('./data/tpc.db');

// Get counts before
const before = db.prepare("SELECT COUNT(*) as cnt FROM thoughts WHERE content LIKE '%DF Legends%'").get();
console.log('Before:', before.cnt, 'DF entries');

// Delete entries with the buggy timestamps (from v1-v5 imports)
// These have timestamps around 2026-02-22T14:47 and 15:06
const buggyTimestamps = [
  '2026-02-22T14:47',  // v1-v2 imports  
  '2026-02-22T15:06',  // v4-v5 imports
  '2026-02-22T15:16'   // some v4 entries
];

for (const ts of buggyTimestamps) {
  const result = db.prepare("DELETE FROM thoughts WHERE content LIKE '%DF Legends%' AND timestamp LIKE ?").run(ts + '%');
  console.log(`Deleted ${result.changes} entries with timestamp starting ${ts}`);
}

// Get count after
const after = db.prepare("SELECT COUNT(*) as cnt FROM thoughts WHERE content LIKE '%DF Legends%'").get();
console.log('After:', after.cnt, 'DF entries remaining');

// Also verify we still have v7 data (around 15:42)
const v7Count = db.prepare("SELECT COUNT(*) as cnt FROM thoughts WHERE content LIKE '%DF Legends%' AND timestamp LIKE '2026-02-22T15:42%'").get();
console.log('v7 entries (good):', v7Count.cnt);

db.close();
