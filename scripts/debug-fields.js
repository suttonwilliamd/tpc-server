/**
 * Debug: Find correct field names for different event types
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

// Sample a few of each event type to find their field names
const typesToCheck = ['hf died', 'hf simple battle event', 'artifact created', 'created site', 'entity created'];

const samples = {};

for (const ev of eventList) {
  const type = ev['@_type'] || ev.type;
  if (typesToCheck.includes(type) && !samples[type]) {
    samples[type] = ev;
    console.log(`\n=== ${type} ===`);
    // Print all keys except nested objects
    for (const [key, val] of Object.entries(ev)) {
      if (key !== 'name') {
        console.log(`  ${key}: ${typeof val === 'object' ? JSON.stringify(val)?.substring(0,50) : val}`);
      }
    }
  }
  
  if (Object.keys(samples).length >= typesToCheck.length) break;
}
