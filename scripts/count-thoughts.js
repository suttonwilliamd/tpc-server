const sqlite3 = require('better-sqlite3');
const db = new sqlite3('./data/tpc.db');

const total = db.prepare('SELECT COUNT(*) as cnt FROM thoughts').get();
const df = db.prepare("SELECT COUNT(*) as cnt FROM thoughts WHERE content LIKE '%DF Legends%'").get();

console.log('Total thoughts:', total.cnt);
console.log('DF Legends:', df.cnt);
