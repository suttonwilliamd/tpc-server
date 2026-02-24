/**
 * Dwarf Fortress Legends XML - Fixed Importer v5
 * With CORRECT field names for each event type
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== DF Legends Importer v5 (FIXED) ===\n');
console.log('Parsing XML...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true
});

const result = parser.parse(fs.readFileSync(DF_LEGENDS_PATH, 'utf8'));
const world = result.df_world;
const facts = [];

// Build lookup tables
console.log('Building lookups...');
const entityNames = new Map();
const hfNames = new Map();
const siteNames = new Map();

// Entities
if (world.entities?.entity) {
  const arr = Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity];
  for (const e of arr) {
    entityNames.set(String(e.id || e['@_id'] || ''), e.name || `Entity ${e.id}`);
  }
}

// Historical figures - handle nested name objects
if (world.historical_figures?.historical_figure) {
  const arr = Array.isArray(world.historical_figures.historical_figure) 
    ? world.historical_figures.historical_figure 
    : [world.historical_figures.historical_figure];
  for (const hf of arr) {
    const id = String(hf.id || hf['@_id'] || '');
    let name = hf.name;
    if (typeof name === 'object' && name !== null) {
      name = [name.first, name.nickname, name.last].filter(Boolean).join(' ') || `HF ${id}`;
    }
    hfNames.set(id, String(name) || `HF ${id}`);
  }
}

// Sites
if (world.sites?.site) {
  const arr = Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site];
  for (const s of arr) {
    siteNames.set(String(s.id || s['@_id'] || ''), s.name || `Site ${s.id}`);
  }
}

console.log(`  Entities: ${entityNames.size}, HFs: ${hfNames.size}, Sites: ${siteNames.size}`);

// Sample lookups
console.log('  Sample HF 596:', hfNames.get('596'));
console.log('  Sample HF 969:', hfNames.get('969'));
console.log('  Sample Site 90:', siteNames.get('90'));

// Extract events
console.log('\nExtracting events...');
const events = world.historical_events?.historical_event;
if (!events) {
  console.log('No events found!');
  process.exit(1);
}

const eventList = Array.isArray(events) ? events : [events];
console.log(`  Found ${eventList.length} events`);

const LIMIT = 5000;
let counts = {};

const addFact = (content, predicate, tier = 'episodic') => {
  facts.push({
    content: `[DF Legends] ${content}`,
    tags: ['dwarf-fortress', tier, predicate]
  });
  counts[predicate] = (counts[predicate] || 0) + 1;
};

for (const ev of eventList) {
  const evType = ev.type || '';
  const year = ev.year || '?';
  const siteId = String(ev.site_id || '');
  const site = siteNames.get(siteId) || (siteId ? `Site ${siteId}` : 'the wilderness');
  
  if (!evType) continue;
  
  // HF DIED - correct fields: hfid, slayer_hfid, cause
  if (evType === 'hf died') {
    const victim = hfNames.get(String(ev.hfid)) || 'Unknown';
    const killer = hfNames.get(String(ev.slayer_hfid)) || 'Unknown';
    const cause = ev.cause || 'unknown';
    addFact(`${victim} was slain by ${killer} at ${site} in year ${year}. Cause: ${cause}`, 'died');
  }
  
  // HF SIMPLE BATTLE EVENT - correct fields: group_1_hfid, group_2_hfid
  else if (evType === 'hf simple battle event') {
    const fighter1 = hfNames.get(String(ev.group_1_hfid)) || 'Unknown';
    const fighter2 = hfNames.get(String(ev.group_2_hfid)) || 'Unknown';
    const action = ev.subtype || 'fought';
    addFact(`${fighter1} ${action} ${fighter2} at ${site} in year ${year}`, 'occurred');
  }
  
  // ARTIFACT CREATED - correct fields: artifact_id, hist_figure_id
  else if (evType === 'artifact created') {
    const maker = hfNames.get(String(ev.hist_figure_id)) || 'an unknown craftsman';
    const artifactId = ev.artifact_id || '?';
    addFact(`Artifact ${artifactId} was created by ${maker} in year ${year}`, 'created', 'semantic');
  }
  
  // CREATED SITE - correct fields: civ_id, site_civ_id, site_id
  else if (evType === 'created site') {
    const civ = entityNames.get(String(ev.civ_id)) || 'Unknown civilization';
    addFact(`${civ} established ${site} in year ${year}`, 'established', 'semantic');
  }
  
  // ENTITY CREATED - correct fields: entity_id
  else if (evType === 'entity created') {
    const entity = entityNames.get(String(ev.entity_id)) || 'Unknown';
    addFact(`${entity} was founded in year ${year}`, 'founded', 'structural');
  }
  
  // HF ABDUCTED - need to find field names
  else if (evType === 'hf abducted') {
    const target = hfNames.get(String(ev.target_hfid || ev.hfid)) || 'Unknown';
    const abductor = hfNames.get(String(ev.abductor_hfid || ev.abductor)) || 'Unknown';
    addFact(`${target} was abducted by ${abductor} in year ${year}`, 'abducted');
  }
  
  // CREATURE DEVOURED - need fields
  else if (evType === 'creature devoured') {
    addFact(`A creature was devoured at ${site} in year ${year}`, 'devoured');
  }
  
  // FIELD BATTLE
  else if (evType === 'field battle') {
    addFact(`A field battle took place at ${site} in year ${year}`, 'occurred');
  }
  
  if (facts.length >= LIMIT) break;
}

console.log(`
=== Summary ===`);
console.log('Event types found:', Object.keys(counts).map(k => `${k}: ${counts[k]}`).join(', '));
console.log(`Total facts: ${facts.length}`);

console.log('\nSample facts:');
facts.slice(0, 8).forEach(f => console.log(`  - ${f.content.substring(0, 90)}...`));

// Sync to tpc-server
console.log('\nSyncing to tpc-server...');

async function sync() {
  let synced = 0, errors = 0;
  
  for (const fact of facts) {
    try {
      const res = await fetch('http://localhost:3000/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fact)
      });
      if (res.ok) synced++;
      else errors++;
    } catch (e) {
      errors++;
    }
  }
  
  console.log(`Done! Synced ${synced} facts (${errors} errors).`);
}

sync();
