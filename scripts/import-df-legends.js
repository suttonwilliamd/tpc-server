/**
 * Dwarf Fortress Legends XML → CortexPool Importer
 * 
 * Parses a DF legends.xml and extracts entities/facts for CortexPool
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('Parsing DF Legends XML...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_"
});

const xml = fs.readFileSync(DF_LEGENDS_PATH, 'utf8');
const result = parser.parse(xml);

const world = result.df_world;

// Helper to extract facts
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
    confidence: 0.9,
    source: 'dwarf-fortress-legends'
  });
}

// Extract regions
console.log('Extracting regions...');
if (world.regions?.region) {
  const regions = Array.isArray(world.regions.region) ? world.regions.region : [world.regions.region];
  console.log(`  Found ${regions.length} regions`);
  for (const r of regions.slice(0, 50)) { // Limit to first 50
    addFact(
      `region_${r.id}`,
      'is_a',
      'region',
      `${r.name} (${r.type})`,
      'episodic'
    );
  }
}

// Extract underground regions
console.log('Extracting underground regions...');
if (world.underground_regions?.underground_region) {
  const ugRegions = Array.isArray(world.underground_regions.underground_region) 
    ? world.underground_regions.underground_region 
    : [world.underground_regions.underground_region];
  console.log(`  Found ${ugRegions.length} underground regions`);
  for (const r of ugRegions.slice(0, 30)) {
    addFact(
      `ugregion_${r.id}`,
      'is_a',
      'underground_region',
      r.name || `Underground region ${r.id}`,
      'episodic'
    );
  }
}

// Extract sites
console.log('Extracting sites...');
if (world.sites?.site) {
  const sites = Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site];
  console.log(`  Found ${sites.length} sites`);
  for (const s of sites.slice(0, 100)) {
    addFact(
      `site_${s.id}`,
      'is_a',
      'site',
      `${s.name} (type: ${s.type})`,
      'episodic'
    );
    if (s.creator) {
      addFact(`site_${s.id}`, 'created_by', `entity_${s.creator}`, `${s.name} was created by civilization ${s.creator}`, 'semantic');
    }
  }
}

// Extract entities (civilizations)
console.log('Extracting entities...');
if (world.entities?.entity) {
  const entities = Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity];
  console.log(`  Found ${entities.length} entities`);
  for (const e of entities) {
    const entityId = e.id || e["@_id"];
    addFact(
      `entity_${entityId}`,
      'is_a',
      'civilization',
      `${e.name || 'Unknown'} (type: ${e.type})`,
      'structural'
    );
    if (e.race) {
      addFact(`entity_${entityId}`, 'has_race', null, `Race: ${e.race}`, 'semantic');
    }
  }
}

// Extract historical figures
console.log('Extracting historical figures...');
if (world.historical_figures?.historical_figure) {
  const hfs = Array.isArray(world.historical_figures.historical_figure) 
    ? world.historical_figures.historical_figure 
    : [world.historical_figures.historical_figure];
  console.log(`  Found ${hfs.length} historical figures`);
  for (const hf of hfs.slice(0, 200)) {
    const hfId = hf.id || hf["@_id"];
    const name = hf.name || `HF ${hfId}`;
    addFact(
      `hf_${hfId}`,
      'is_a',
      'historical_figure',
      name,
      'episodic'
    );
    if (hf.race) {
      addFact(`hf_${hfId}`, 'has_race', null, `Race: ${hf.race}`, 'semantic');
    }
    if (hf.caste) {
      addFact(`hf_${hfId}`, 'has_caste', null, `Caste: ${hf.caste}`, 'semantic');
    }
    if (hf.profession) {
      addFact(`hf_${hfId}`, 'profession_is', null, `Profession: ${hf.profession}`, 'semantic');
    }
  }
}

// Extract historical events (sample)
console.log('Extracting historical events...');
if (world.historical_events?.historical_event) {
  const events = Array.isArray(world.historical_events.historical_event) 
    ? world.historical_events.historical_event 
    : [world.historical_events.historical_event];
  console.log(`  Found ${events.length} historical events`);
  
  // Just sample first 100 events
  for (const ev of events.slice(0, 100)) {
    const evType = ev["@_type"] || ev.type || 'unknown';
    const evId = ev.id || ev["@_id"];
    addFact(
      `event_${evId}`,
      'is_a',
      'historical_event',
      `Event type: ${evType}, ID: ${evId}`,
      'episodic'
    );
  }
}

// Extract artifacts
console.log('Extracting artifacts...');
if (world.artifacts?.artifact) {
  const artifacts = Array.isArray(world.artifacts.artifact) ? world.artifacts.artifact : [world.artifacts.artifact];
  console.log(`  Found ${artifacts.length} artifacts`);
  for (const a of artifacts.slice(0, 50)) {
    const aId = a.id || a["@_id"];
    addFact(
      `artifact_${aId}`,
      'is_a',
      'artifact',
      a.name || `Artifact ${aId}`,
      'semantic'
    );
  }
}

console.log(`\nTotal facts extracted: ${facts.length}`);

// Now sync to tpc-server
console.log('\nSyncing to tpc-server...');

async function syncToTPC() {
  const batchSize = 50;
  let synced = 0;
  
  for (let i = 0; i < facts.length; i += batchSize) {
    const batch = facts.slice(i, i + batchSize);
    
    for (const fact of batch) {
      try {
        const response = await fetch('http://localhost:3000/thoughts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `[DF Legends] ${fact.subject} ${fact.predicate} ${fact.object || ''}: ${fact.content}`,
            tags: ['dwarf-fortress', fact.tier, fact.predicate]
          })
        });
        
        if (response.ok) {
          synced++;
        }
      } catch (e) {
        // Skip errors
      }
    }
    
    if ((i + batchSize) % 500 === 0) {
      console.log(`  Synced ${i + batchSize}/${facts.length}...`);
    }
  }
  
  console.log(`\nDone! Synced ${synced} facts to tpc-server.`);
}

syncToTPC();
