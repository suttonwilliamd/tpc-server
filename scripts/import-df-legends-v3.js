/**
 * Dwarf Fortress Legends XML - Fixed Rich Event Importer
 * 
 * Extracts actual narrative events with proper name lookups
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== Fixed DF Legends Importer ===\n');
console.log('Parsing XML...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true
});

const xml = fs.readFileSync(DF_LEGENDS_PATH, 'utf8');
const result = parser.parse(xml);

const world = result.df_world;
const facts = [];
let factId = 1;

function addFact(subject, predicate, object, content, tier = 'semantic') {
  facts.push({
    id: factId++,
    subject,
    predicate,
    object,
    content,
    tier,
    confidence: 0.85,
    source: 'dwarf-fortress-legends'
  });
}

// Build lookup tables - store NAME as string directly
console.log('Building entity lookups...');
const entityNames = new Map();
const hfNames = new Map();
const siteNames = new Map();
const regionNames = new Map();

// Load entities
if (world.entities?.entity) {
  const entities = Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity];
  for (const e of entities) {
    const id = String(e.id || e['@_id'] || '');
    const name = e.name || e.neme || `Entity ${id}`;
    entityNames.set(id, name);
  }
  console.log(`  Loaded ${entityNames.size} entities`);
}

// Load historical figures - store name string directly
if (world.historical_figures?.historical_figure) {
  const hfs = Array.isArray(world.historical_figures.historical_figure) 
    ? world.historical_figures.historical_figure 
    : [world.historical_figures.historical_figure];
  for (const hf of hfs) {
    const id = String(hf.id || hf['@_id'] || '');
    // DF historical figures have nested <name>...</name> with parts
    let name = hf.name;
    if (typeof name === 'object' && name !== null) {
      // Could be {first:..., last:..., ...} or similar
      name = name.first ? `${name.first} ${name.last || ''}`.trim() : `HF ${id}`;
    }
    name = name || `HF ${id}`;
    hfNames.set(id, name);
  }
  console.log(`  Loaded ${hfNames.size} historical figures`);
}

// Load sites
if (world.sites?.site) {
  const sites = Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site];
  for (const s of sites) {
    const id = String(s.id || s['@_id'] || '');
    const name = s.name || `Site ${id}`;
    siteNames.set(id, name);
  }
  console.log(`  Loaded ${siteNames.size} sites`);
}

// Load regions
if (world.regions?.region) {
  const regions = Array.isArray(world.regions.region) ? world.regions.region : [world.regions.region];
  for (const r of regions) {
    const id = String(r.id || r['@_id'] || '');
    const name = r.name || `Region ${id}`;
    regionNames.set(id, name);
  }
  console.log(`  Loaded ${regionNames.size} regions`);
}

console.log('\nSample lookups:');
console.log('  HF 0:', hfNames.get('0'));
console.log('  Entity 0:', entityNames.get('0'));
console.log('  Site 0:', siteNames.get('0'));

// Extract events
console.log('\nExtracting narrative events...');

const eventsData = world.historical_events?.historical_event;

if (eventsData) {
  const events = Array.isArray(eventsData) ? eventsData : [eventsData];
  console.log(`  Processing ${events.length} events...`);
  
  for (const ev of events) {
    const evType = ev['@_type'] || ev.type || '';
    const evId = ev.id || ev['@_id'] || 'unknown';
    
    // Skip non-event entries
    if (!evType || typeof evType !== 'string') continue;
    
    const shortType = evType.toLowerCase().replace(/[^a-z]/g, '_').substring(0, 40);
    const year = ev.year || '?';
    
    // WAR events
    if (evType.includes('war')) {
      const aggressorId = String(ev.aggressor_entity_id || ev['@_aggressor_entity_id'] || '');
      const defenderId = String(ev.defender_entity_id || ev['@_defender_entity_id'] || '');
      const aggressor = entityNames.get(aggressorId) || `civilization ${aggressorId}`;
      const defender = entityNames.get(defenderId) || `civilization ${defenderId}`;
      
      if (evType.includes('started') || evType.includes('begin')) {
        addFact(`war_${evId}`, 'started', 'war', `WAR BEGAN: ${aggressor} declared war on ${defender} in year ${year}`, 'episodic');
      } else if (evType.includes('ended') || evType.includes('concluded')) {
        addFact(`war_${evId}`, 'ended', 'war', `WAR ENDED: Conflict between ${aggressor} and ${defender} ended in year ${year}`, 'episodic');
      }
    }
    
    // BATTLE events
    else if (evType.includes('battle') || evType.includes('combat')) {
      const siteId = String(ev.site_id || ev['@_site_id'] || '');
      const site = siteNames.get(siteId) || `location ${siteId}`;
      
      const attackerId = String(ev.attacker_civ_id || ev['@_attacker_civ_id'] || '');
      const defenderId = String(ev.defender_civ_id || ev['@_defender_civ_id'] || '');
      const attacker = entityNames.get(attackerId) || (attackerId ? `civ ${attackerId}` : 'Unknown');
      const defender = entityNames.get(defenderId) || (defenderId ? `civ ${defenderId}` : 'Unknown');
      
      const outcome = ev.outcome || '';
      addFact(`battle_${evId}`, 'occurred', 'battle', `BATTLE at ${site} (Year ${year}): ${attacker} vs ${defender} - ${outcome || 'unknown outcome'}`, 'episodic');
    }
    
    // DEATH events
    else if (evType.includes('death') || evType.includes('died')) {
      const hfId = String(ev.historical_figure_id || ev['@_historical_figure_id'] || '');
      const killerId = String(ev.killer_hf_id || ev['@_killer_hf_id'] || '');
      const victim = hfNames.get(hfId) || `historical figure ${hfId}`;
      const killer = hfNames.get(killerId) || (killerId ? `HF ${killerId}` : 'unknown');
      const cause = ev.cause || ev.death_cause || 'unknown';
      
      addFact(`death_${evId}`, 'died', 'historical_figure', `DEATH: ${victim} was killed by ${killer} in year ${year}. Cause: ${cause}`, 'episodic');
    }
    
    // ARTIFACT created
    else if (evType.includes('artifact_created') || evType.includes('artifact')) {
      const artifactName = ev.artifact_name || `Artifact ${ev.artifact_id}`;
      const makerId = String(ev.maker_hf_id || ev['@_maker_hf_id'] || '');
      const maker = hfNames.get(makerId) || (makerId ? `historical figure ${makerId}` : 'an unknown craftsman');
      
      addFact(`artifact_${ev.artifact_id}`, 'created', 'artifact', `ARTIFACT CREATED: "${artifactName}" was forged by ${maker} in year ${year}`, 'semantic');
    }
    
    // ENTITY founded
    else if (evType.includes('entity_created') || evType.includes('founded')) {
      const entityId = String(ev.entity_id || ev['@_entity_id'] || '');
      const entity = entityNames.get(entityId) || `civilization ${entityId}`;
      
      addFact(`entity_${evId}`, 'founded', 'civilization', `${entity} was founded in year ${year}`, 'structural');
    }
    
    // Abduction
    else if (evType.includes('abducted') || evType.includes('abduction')) {
      const hfId = String(ev.historical_figure_id || ev['@_historical_figure_id'] || '');
      const targetId = String(ev.target_hf_id || ev['@_target_hf_id'] || '');
      const victim = hfNames.get(hfId) || `HF ${hfId}`;
      const captor = hfNames.get(targetId) || `HF ${targetId}`;
      
      addFact(`abduction_${evId}`, 'occurred', 'event', `ABDUCTION: ${victim} was abducted by ${captor} in year ${year}`, 'episodic');
    }
    
    // Make limit
    if (facts.length >= 3000) {
      console.log(`  Reached 3000 facts limit`);
      break;
    }
  }
}

console.log(`
=== Extraction Summary ===
Total facts extracted: ${facts.length}
`);

// Show sample facts
console.log('Sample facts:');
for (let i = 0; i < Math.min(5, facts.length); i++) {
  console.log(`  - ${facts[i].content.substring(0, 100)}...`);
}

// Sync to tpc-server
console.log('\nSyncing to tpc-server...');

async function syncToTPC() {
  const batchSize = 25;
  let synced = 0;
  let errors = 0;
  
  for (let i = 0; i < facts.length; i += batchSize) {
    const batch = facts.slice(i, i + batchSize);
    
    for (const fact of batch) {
      try {
        const response = await fetch('http://localhost:3000/thoughts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `[DF Legends] ${fact.content}`,
            tags: ['dwarf-fortress', fact.tier, fact.predicate]
          })
        });
        
        if (response.ok) synced++;
        else errors++;
      } catch (e) {
        errors++;
      }
    }
    
    if ((i + batchSize) % 500 === 0) {
      console.log(`  Synced ${i + batchSize}/${facts.length}...`);
    }
  }
  
  console.log(`\nDone! Synced ${synced} facts (${errors} errors).`);
}

syncToTPC();
