/**
 * Debug: Find event types in DF legends
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('Parsing...');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const result = parser.parse(fs.readFileSync(DF_LEGENDS_PATH, 'utf8'));

const events = result.df_world.historical_events?.historical_event;
if (!events) {
  console.log('No events');
  process.exit(1);
}

const eventList = Array.isArray(events) ? events : [events];
console.log(`Found ${eventList.length} events`);

// Collect event types
const types = new Set();
for (const ev of eventList.slice(0, 5000)) {
  const t = ev['@_type'] || ev.type;
  if (t) types.add(t);
}

console.log('\nEvent types found:');
types.forEach(t => console.log(`  - ${t}`));
