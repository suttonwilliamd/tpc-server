/**
 * Dwarf Fortress Legends XML - Rich Event Importer
 * 
 * Extracts actual narrative events: wars, battles, deaths, artifact claims, etc.
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== Rich DF Legends Importer ===\n');
console.log('Parsing XML (this may take a while for 240MB)...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true
});

const xml = fs.readFileSync(DF_LEGENDS_PATH, 'utf8');
console.log('Parsing XML structure...');
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

// Build lookup tables for IDs to names
console.log('Building entity lookups...');
const entityNames = new Map();
const hfNames = new Map();
const siteNames = new Map();
const regionNames = new Map();

// Load entities
if (world.entities?.entity) {
  const entities = Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity];
  for (const e of entities) {
    const id = e.id?.toString() || e["@_id"]?.toString();
    const name = e.name || e["neme"] || `Entity ${id}`;
    entityNames.set(id, name);
  }
  console.log(`  Loaded ${entityNames.size} entities`);
}

// Load historical figures
if (world.historical_figures?.historical_figure) {
  const hfs = Array.isArray(world.historical_figures.historical_figure) 
    ? world.historical_figures.historical_figure 
    : [world.historical_figures.historical_figure];
  for (const hf of hfs) {
    const id = hf.id?.toString() || hf["@_id"]?.toString();
    const name = hf.name || `HF ${id}`;
    const race = hf.race || '';
    const profession = hf.profession || '';
    hfNames.set(id, { name, race, profession });
  }
  console.log(`  Loaded ${hfNames.size} historical figures`);
}

// Load sites
if (world.sites?.site) {
  const sites = Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site];
  for (const s of sites) {
    const id = s.id?.toString() || s["@_id"]?.toString();
    const name = s.name || `Site ${id}`;
    const type = s.type || '';
    siteNames.set(id, { name, type });
  }
  console.log(`  Loaded ${siteNames.size} sites`);
}

// Load regions
if (world.regions?.region) {
  const regions = Array.isArray(world.regions.region) ? world.regions.region : [world.regions.region];
  for (const r of regions) {
    const id = r.id?.toString() || r["@_id"]?.toString();
    const name = r.name || `Region ${id}`;
    const type = r.type || '';
    regionNames.set(id, { name, type });
  }
  console.log(`  Loaded ${regionNames.size} regions`);
}

// Now extract RICH events
console.log('\nExtracting narrative events...\n');

let eventCount = 0;
let warCount = 0;
let battleCount = 0;
let deathCount = 0;
let artifactCount = 0;

// Helper to format event descriptions
function fmt(s) {
  return s ? String(s).substring(0, 200) : '';
}

// Check for historical events - may have different key names
const eventsData = world.historical_events?.historical_event || world.historical_events?.historical_events;

if (eventsData) {
  const events = Array.isArray(eventsData) ? eventsData : [eventsData];
  
  console.log(`  Processing ${events.length} events...`);
  
  for (const ev of events) {
    const evType = ev["@_type"] || ev.type;
    const evId = ev.id || ev["@_id"];
    eventCount++;
    
    // Skip if no type
    if (!evType) continue;
    
    const shortType = evType.toLowerCase().replace(/[^a-z]/g, '_').substring(0, 40);
    
    // WAR EVENTS
    if (evType.includes('war')) {
      warCount++;
      const aggressor = entityNames.get(String(ev.aggressor_entity_id)) || `Entity ${ev.aggressor_entity_id}`;
      const defender = entityNames.get(String(ev.defender_entity_id)) || `Entity ${ev.defender_entity_id}`;
      const year = ev.year || 'unknown';
      
      if (evType.includes('started')) {
        addFact(
          `war_${evId}`,
          'started',
          'war',
          `WAR BEGAN: ${aggressor} declared war on ${defender} in year ${year}`,
          'episodic'
        );
      } else if (evType.includes('ended')) {
        addFact(
          `war_${evId}`,
          'ended',
          'war',
          `WAR ENDED: Conflict between ${aggressor} and ${defender} ended in year ${year}`,
          'episodic'
        );
      }
    }
    
    // BATTLE EVENTS  
    else if (evType.includes('battle') || evType.includes('combat')) {
      battleCount++;
      const site = siteNames.get(String(ev.site_id)) || `Site ${ev.site_id}`;
      const year = ev.year || 'unknown';
      
      let narrative = `BATTLE at ${site} (${year}): `;
      if (ev.attacker_civ_id) {
        const att = entityNames.get(String(ev.attacker_civ_id)) || `civ ${ev.attacker_civ_id}`;
        narrative += `${att} attacked `;
      }
      if (ev.defender_civ_id) {
        const def = entityNames.get(String(ev.defender_civ_id)) || `civ ${ev.defender_civ_id}`;
        narrative += `${def}`;
      }
      
      addFact(
        `battle_${evId}`,
        'occurred',
        'battle',
        narrative.substring(0, 200),
        'episodic'
      );
    }
    
    // DEATH EVENTS
    else if (evType.includes('death') || evType.includes('died')) {
      deathCount++;
      const victim = hfNames.get(String(ev.historical_figure_id)) || `HF ${ev.historical_figure_id}`;
      const killer = hfNames.get(String(ev.killer_hf_id)) || (ev.killer_hf_id ? `HF ${ev.killer_hf_id}` : 'unknown');
      const year = ev.year || 'unknown';
      const cause = ev.cause || 'unknown';
      
      addFact(
        `death_${evId}`,
        'died',
        'historical_figure',
        `DEATH: ${victim.name || victim} (${victim.race || ''}) was killed by ${killer.name || killer} in year ${year}. Cause: ${cause}`,
        'episodic'
      );
    }
    
    // ARTIFACT EVENTS
    else if (evType.includes('artifact')) {
      artifactCount++;
      const artifact = ev.artifact_name || `Artifact ${ev.artifact_id}`;
      const maker = hfNames.get(String(ev.maker_hf_id)) || (ev.maker_hf_id ? `HF ${ev.maker_hf_id}` : 'unknown');
      const year = ev.year || 'unknown';
      
      if (evType.includes('created')) {
        addFact(
          `artifact_${ev.artifact_id}`,
          'created',
          'artifact',
          `ARTIFACT: ${artifact} was created by ${maker.name || maker} in year ${year}`,
          'semantic'
        );
      } else if (evType.includes('stolen') || evType.includes('claim')) {
        addFact(
          `artifact_${ev.artifact_id}`,
          'stolen',
          'artifact',
          `ARTIFACT EVENT: ${artifact} was ${evType.includes('stolen') ? 'stolen' : 'claimed'} in year ${year}`,
          'episodic'
        );
      }
    }
    
    // ENTITY FOUNDED
    else if (evType.includes('entity')) {
      const entity = entityNames.get(String(ev.entity_id)) || `Entity ${ev.entity_id}`;
      const year = ev.year || 'unknown';
      
      addFact(
        `entity_event_${evId}`,
        'founded',
        'civilization',
        `${entity} was founded/established in year ${year}`,
        'structural'
      );
    }
    
    // OCCASION / CELEBRATION
    else if (evType.includes('occasion') || evType.includes('celebration')) {
      const entity = entityNames.get(String(ev.entity_id)) || `Entity ${ev.entity_id}`;
      const year = ev.year || 'unknown';
      
      addFact(
        `occasion_${evId}`,
        'occurred',
        'event',
        `${entity} held a celebration/occasion in year ${year}: ${fmt(ev.occasion_name || ev.celebration_name || 'unnamed')}`,
        'episodic'
      );
    }
    
    // ABSTRACT UI
    if (facts.length >= 3000) {
      console.log(`  Reached 3000 facts limit, stopping event extraction`);
      break;
    }
  }
}

console.log(`
=== Extraction Summary ===
Events processed: ${eventCount}
Wars: ${warCount}
Battles: ${battleCount}
Deaths: ${deathCount}
Artifacts: ${artifactCount}
Total facts: ${facts.length}
`);

// Now sync to tpc-server
console.log('Syncing to tpc-server...');

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
        
        if (response.ok) {
          synced++;
        } else {
          errors++;
        }
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
