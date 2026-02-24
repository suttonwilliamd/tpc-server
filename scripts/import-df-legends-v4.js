/**
 * Dwarf Fortress Legends XML - Fixed Rich Event Importer v4
 * With CORRECT event type names
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== DF Legends Importer v4 ===\n');
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
      // DF names can have first, last, nickname, etc.
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
let battleCount = 0, deathCount = 0, artifactCount = 0, otherCount = 0;

for (const ev of eventList) {
  const evType = ev['@_type'] || ev.type || '';
  const evId = ev.id || ev['@_id'] || '?';
  const year = ev.year || '?';
  
  if (!evType) continue;
  
  const addFact = (content, predicate, tier = 'episodic') => {
    facts.push({
      content: `[DF Legends] ${content}`,
      tags: ['dwarf-fortress', tier, predicate]
    });
  };
  
  // HF DIED
  if (evType === 'hf died') {
    deathCount++;
    const hfId = String(ev.hf || ev.hf_id || ev['@_hf'] || '');
    const killerId = String(ev.killer || ev.killer_hf || '');
    const victim = hfNames.get(hfId) || `historical figure`;
    const killer = hfNames.get(killerId) || (killerId ? `HF ${killerId}` : 'unknown');
    const cause = ev.cause || 'unknown';
    addFact(`DEATH: ${victim} was killed by ${killer} in year ${year}. Cause: ${cause}`, 'died');
  }
  
  // HF SIMPLE BATTLE EVENT
  else if (evType === 'hf simple battle event') {
    battleCount++;
    const siteId = String(ev.site || ev.site_id || '');
    const site = siteNames.get(siteId) || `location`;
    const attacker = hfNames.get(String(ev.attacker || '')) || 'Unknown';
    const defender = hfNames.get(String(ev.defender || '')) || 'Unknown';
    addFact(`BATTLE: ${attacker} fought ${defender} at ${site} in year ${year}`, 'occurred');
  }
  
  // FIELD BATTLE
  else if (evType === 'field battle') {
    battleCount++;
    const siteId = String(ev.site || ev.site_id || '');
    const site = siteNames.get(siteId) || `location`;
    addFact(`FIELD BATTLE at ${site} in year ${year}`, 'occurred');
  }
  
  // ARTIFACT CREATED
  else if (evType === 'artifact created') {
    artifactCount++;
    const name = ev.artifact_name || `Artifact`;
    const makerId = String(ev.maker || ev.maker_hf || '');
    const maker = hfNames.get(makerId) || (makerId ? `HF ${makerId}` : 'an unknown craftsman');
    addFact(`ARTIFACT: "${name}" was created by ${maker} in year ${year}`, 'created', 'semantic');
  }
  
  // ENTITY CREATED
  else if (evType === 'entity created') {
    const entityId = String(ev.entity || ev.entity_id || '');
    const entity = entityNames.get(entityId) || `civilization`;
    addFact(`${entity} was founded in year ${year}`, 'founded', 'structural');
  }
  
  // HF ABDUCTED
  else if (evType === 'hf abducted') {
    const hfId = String(ev.target || ev.target_hf || '');
    const victim = hfNames.get(hfId) || `HF`;
    const abductorId = String(ev.abductor || ev.abductor_hf || '');
    const abductor = hfNames.get(abductorId) || `HF`;
    addFact(`ABDUCTION: ${victim} was abducted by ${abductor} in year ${year}`, 'occurred');
  }
  
  // CREATURE DEVOURED
  else if (evType === 'creature devoured') {
    const victim = ev.victim || 'a creature';
    const predator = ev.predator || 'a beast';
    addFact(`DEVOURED: ${victim} was eaten by ${predator} in year ${year}`, 'occurred');
  }
  
  else {
    otherCount++;
  }
  
  if (facts.length >= LIMIT) break;
}

console.log(`
=== Summary ===
Battles: ${battleCount}
Deaths: ${deathCount}
Artifacts: ${artifactCount}
Other: ${otherCount}
Total facts: ${facts.length}
`);

console.log('Sample facts:');
facts.slice(0, 5).forEach(f => console.log(`  - ${f.content.substring(0, 80)}...`));

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
