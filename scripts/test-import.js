/**
 * Dwarf Fortress Legends - Quick Test Import
 * Just does 10 facts to verify it works
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('Parsing...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true
});

const result = parser.parse(fs.readFileSync(DF_LEGENDS_PATH, 'utf8'));
const world = result.df_world;

// Build HF lookup
const hfNames = new Map();
if (world.historical_figures?.historical_figure) {
  const hfs = Array.isArray(world.historical_figures.historical_figure) 
    ? world.historical_figures.historical_figure 
    : [world.historical_figures.historical_figure];
  for (const hf of hfs.slice(0, 1000)) {
    const id = String(hf.id || hf['@_id'] || '');
    let name = hf.name;
    if (typeof name === 'object' && name !== null) {
      name = name.first ? `${name.first} ${name.last || ''}`.trim() : `HF ${id}`;
    }
    hfNames.set(id, name || `HF ${id}`);
  }
}

console.log('HF lookup sample:', hfNames.get('0'), hfNames.get('1'), hfNames.get('2'));

// Get a few events
const events = world.historical_events?.historical_event;
if (!events) {
  console.log('No events found');
  process.exit(1);
}

const eventList = Array.isArray(events) ? events : [events];
console.log(`Found ${eventList.length} events`);

// Find first few death events
const facts = [];
for (const ev of eventList) {
  const type = ev['@_type'] || ev.type || '';
  const year = ev.year || '?';
  
  if (type.includes('death') && facts.length < 10) {
    const hfId = String(ev.historical_figure_id || ev['@_historical_figure_id'] || '');
    const killerId = String(ev.killer_hf_id || ev['@_killer_hf_id'] || '');
    const victim = hfNames.get(hfId) || `HF ${hfId}`;
    const killer = hfNames.get(killerId) || (killerId ? `HF ${killerId}` : 'unknown');
    const cause = ev.cause || 'unknown';
    
    facts.push({
      content: `[DF Legends] DEATH: ${victim} was killed by ${killer} in year ${year}. Cause: ${cause}`,
      tags: ['dwarf-fortress', 'episodic', 'death']
    });
  }
  
  if (facts.length >= 10) break;
}

console.log('\nFacts to sync:');
facts.forEach((f, i) => console.log(`${i+1}. ${f.content.substring(0, 80)}...`));

// Sync one by one
async function sync() {
  for (const fact of facts) {
    try {
      const res = await fetch('http://localhost:3000/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fact)
      });
      const data = await res.json();
      console.log(`Synced: ${data.id} - ${fact.content.substring(0, 40)}...`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }
  console.log('\nDone!');
}

sync();
