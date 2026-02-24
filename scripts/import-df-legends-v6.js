/**
 * Dwarf Fortress Legends XML - COMPREHENSIVE Importer v6
 * NO LIMITS - Extract EVERYTHING from the XML
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== DF Legends Importer v6 (COMPREHENSIVE) ===\n');
console.log('Parsing XML (this takes a while for 240MB)...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true
});

const result = parser.parse(fs.readFileSync(DF_LEGENDS_PATH, 'utf8'));
const world = result.df_world;
const facts = [];

// Build comprehensive lookup tables
console.log('Building comprehensive lookups...');

// Entities
const entityNames = new Map();
if (world.entities?.entity) {
  const arr = Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity];
  for (const e of arr) {
    const id = String(e.id || e['@_id'] || '');
    const name = e.name || `Entity ${id}`;
    entityNames.set(id, name);
  }
}

// Historical figures
const hfNames = new Map();
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
const siteNames = new Map();
if (world.sites?.site) {
  const arr = Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site];
  for (const s of arr) {
    const id = String(s.id || s['@_id'] || '');
    siteNames.set(id, s.name || `Site ${id}`);
  }
}

// Regions
const regionNames = new Map();
if (world.regions?.region) {
  const arr = Array.isArray(world.regions.region) ? world.regions.region : [world.regions.region];
  for (const r of arr) {
    const id = String(r.id || r['@_id'] || '');
    regionNames.set(id, r.name || `Region ${id}`);
  }
}

// Artifacts
const artifactNames = new Map();
if (world.artifacts?.artifact) {
  const arr = Array.isArray(world.artifacts.artifact) ? world.artifacts.artifact : [world.artifacts.artifact];
  for (const a of arr) {
    const id = String(a.id || a['@_id'] || '');
    artifactNames.set(id, a.name || `Artifact ${id}`);
  }
}

console.log(`  Entities: ${entityNames.size}`);
console.log(`  Historical Figures: ${hfNames.size}`);
console.log(`  Sites: ${siteNames.size}`);
console.log(`  Regions: ${regionNames.size}`);
console.log(`  Artifacts: ${artifactNames.size}`);

// Helper functions
function getHF(id) { return hfNames.get(String(id)) || `HF ${id}`; }
function getEntity(id) { return entityNames.get(String(id)) || `Entity ${id}`; }
function getSite(id) { return siteNames.get(String(id)) || `Site ${id}`; }
function getRegion(id) { return regionNames.get(String(id)) || `Region ${id}`; }
function getArtifact(id) { return artifactNames.get(String(id)) || `Artifact ${id}`; }

const addFact = (content, predicate, tier = 'episodic') => {
  facts.push({ content: `[DF Legends] ${content}`, tags: ['dwarf-fortress', tier, predicate] });
};

// Process ALL events
console.log('\nProcessing ALL events...');
const events = world.historical_events?.historical_event;
if (!events) { console.log('No events!'); process.exit(1); }
const eventList = Array.isArray(events) ? events : [events];
console.log(`  Total events: ${eventList.length}`);

const eventTypeCounts = {};

for (const ev of eventList) {
  const evType = ev.type || '';
  const year = ev.year || '?';
  if (!evType) continue;
  
  eventTypeCounts[evType] = (eventTypeCounts[evType] || 0) + 1;
  
  const siteId = String(ev.site_id || '');
  const site = siteNames.get(siteId) || (siteId ? `Site ${siteId}` : 'the wilderness');
  
  // COMPREHENSIVE event handling - EVERY type gets processed
  
  // === DEATHS ===
  if (evType === 'hf died') {
    const victim = getHF(ev.hfid);
    const killer = getHF(ev.slayer_hfid);
    const cause = ev.cause || 'unknown';
    const killerRace = ev.slayer_race || '';
    addFact(`${victim} was slain by ${killer} ${killerRace ? `(${killerRace})` : ''} at ${site} in year ${year}. Cause: ${cause}`, 'died');
  }
  
  // === BATTLES ===
  else if (evType === 'hf simple battle event') {
    const fighter1 = getHF(ev.group_1_hfid);
    const fighter2 = getHF(ev.group_2_hfid);
    const action = ev.subtype || 'fought';
    addFact(`${fighter1} ${action} ${fighter2} at ${site} in year ${year}`, 'battle');
  }
  
  else if (evType === 'field battle') {
    const attacker = getEntity(ev.attacker_civ_id);
    const defender = getEntity(ev.defender_civ_id);
    addFact(`Field battle: ${attacker} vs ${defender} at ${site} in year ${year}`, 'battle');
  }
  
  // === ABDUCTIONS ===
  else if (evType === 'hf abducted') {
    const target = getHF(ev.target_hfid);
    const abductor = getHF(ev.abductor_hfid);
    addFact(`${target} was abducted by ${abductor} at ${site} in year ${year}`, 'abducted');
  }
  
  // === ARTIFACTS ===
  else if (evType === 'artifact created') {
    const maker = getHF(ev.hist_figure_id);
    const artifact = getArtifact(ev.artifact_id);
    addFact(`Artifact "${artifact}" was created by ${maker} in year ${year}`, 'created', 'semantic');
  }
  
  else if (evType === 'artifact stored') {
    const artifact = getArtifact(ev.artifact_id);
    const entity = getEntity(ev.entity_id);
    addFact(`Artifact "${artifact}" was stored by ${entity} in year ${year}`, 'stored', 'semantic');
  }
  
  else if (evType === 'artifact possessed') {
    const artifact = getArtifact(ev.artifact_id);
    const hf = getHF(ev.hist_figure_id);
    addFact(`Artifact "${artifact}" came into possession of ${hf} in year ${year}`, 'possessed', 'semantic');
  }
  
  else if (evType === 'item stolen') {
    const item = ev.item_type || 'an item';
    const thief = getHF(ev.thief_hfid);
    const victim = getEntity(ev.entity_id);
    addFact(`${thief} stole ${item} from ${victim} in year ${year}`, 'stolen');
  }
  
  // === SITES ===
  else if (evType === 'created site') {
    const civ = getEntity(ev.civ_id);
    addFact(`${civ} established ${site} in year ${year}`, 'established', 'semantic');
  }
  
  else if (evType === 'reclaim site') {
    const entity = getEntity(ev.entity_id);
    addFact(`${entity} reclaimed ${site} in year ${year}`, 'reclaimed', 'semantic');
  }
  
  else if (evType === 'site dispute') {
    const side1 = getEntity(ev.entity_id);
    const side2 = getEntity(ev.site_civ_id);
    addFact(`Site dispute at ${site}: ${side1} vs ${side2} in year ${year}`, 'dispute');
  }
  
  else if (evType === 'attacked site') {
    const attacker = getEntity(ev.attacker_civ_id);
    const defender = getEntity(ev.defender_civ_id);
    addFact(`${attacker} attacked ${site} (defended by ${defender}) in year ${year}`, 'attacked');
  }
  
  else if (evType === 'plundered site') {
    const attacker = getEntity(ev.attacker_civ_id);
    addFact(`${attacker} plundered ${site} in year ${year}`, 'plundered');
  }
  
  else if (evType === 'hf attacked site') {
    const hf = getHF(ev.attacker_hfid);
    const defender = getEntity(ev.defender_civ_id);
    addFact(`${hf} attacked ${site} (defended by ${defender}) in year ${year}`, 'attacked');
  }
  
  else if (evType === 'hf destroyed site') {
    const hf = getHF(ev.attacker_hfid);
    addFact(`${hf} destroyed ${site} in year ${year}`, 'destroyed');
  }
  
  // === ENTITIES ===
  else if (evType === 'entity created') {
    const entity = getEntity(ev.entity_id);
    addFact(`${entity} was founded in year ${year}`, 'founded', 'structural');
  }
  
  else if (evType === 'entity relocate') {
    const entity = getEntity(ev.entity_id);
    addFact(`${entity} relocated in year ${year}`, 'relocated', 'structural');
  }
  
  else if (evType === 'entity alliance formed') {
    const entity1 = getEntity(ev.source_civ_id);
    const entity2 = getEntity(ev.target_civ_id);
    addFact(`Alliance formed: ${entity1} and ${entity2} in year ${year}`, 'alliance', 'structural');
  }
  
  else if (evType === 'entity primary criminals') {
    const entity = getEntity(ev.entity_id);
    addFact(`${entity} became a criminal organization in year ${year}`, 'criminal', 'structural');
  }
  
  else if (evType === 'regionpop incorporated into entity') {
    const entity = getEntity(ev.entity_id);
    addFact(`A region population was incorporated into ${entity} in year ${year}`, 'incorporated', 'structural');
  }
  
  // === WARS / PEACE ===
  else if (evType.includes('war') && evType.includes('war')) {
    const aggressor = getEntity(ev.aggressor_entity_id);
    const defender = getEntity(ev.defender_entity_id);
    if (evType.includes('started') || evType.includes('begin')) {
      addFact(`WAR: ${aggressor} declared war on ${defender} in year ${year}`, 'war_started');
    } else if (evType.includes('ended') || evType.includes('concluded')) {
      addFact(`PEACE: War between ${aggressor} and ${defender} ended in year ${year}`, 'war_ended');
    }
  }
  
  else if (evType === 'peace accepted') {
    const entity1 = getEntity(ev.source_civ_id);
    const entity2 = getEntity(ev.target_civ_id);
    addFact(`Peace treaty: ${entity1} and ${entity2} in year ${year}`, 'peace', 'structural');
  }
  
  else if (evType === 'peace rejected') {
    const entity1 = getEntity(ev.source_civ_id);
    const entity2 = getEntity(ev.target_civ_id);
    addFact(`Peace rejected: ${entity1} rejected treaty with ${entity2} in year ${year}`, 'peace_rejected', 'structural');
  }
  
  // === CREATURES ===
  else if (evType === 'creature devoured') {
    const victim = ev.victim || 'a creature';
    const predator = ev.predator || 'a beast';
    addFact(`${victim} was devoured by ${predator} at ${site} in year ${year}`, 'devoured');
  }
  
  else if (evType === 'changed creature type') {
    const creature = ev.creature || 'a creature';
    addFact(`${creature} changed type in year ${year}`, 'transformed');
  }
  
  else if (evType === 'hf new pet') {
    const owner = getHF(ev.owner_hfid);
    const pet = ev.pet_type || 'a creature';
    addFact(`${owner} tamed ${pet} as a pet in year ${year}`, 'tamed');
  }
  
  // === HISTORICAL FIGURE EVENTS ===
  else if (evType === 'change hf state') {
    const hf = getHF(ev.hfid);
    const state = ev.new_state || 'unknown';
    addFact(`${hf} changed state to ${state} in year ${year}`, 'state_changed');
  }
  
  else if (evType === 'change hf job') {
    const hf = getHF(ev.hfid);
    const job = ev.new_job || 'unknown';
    addFact(`${hf} became a ${job} in year ${year}`, 'job_changed');
  }
  
  else if (evType === 'change hf body state') {
    const hf = getHF(ev.hfid);
    const state = ev.body_state || 'unknown';
    addFact(`${hf}'s body state: ${state} in year ${year}`, 'body_state');
  }
  
  else if (evType === 'hf gains secret goal') {
    const hf = getHF(ev.hfid);
    const goal = ev.secret_goal || 'unknown';
    addFact(`${hf} gained secret goal: ${goal} in year ${year}`, 'secret_goal');
  }
  
  else if (evType === 'hf learns secret') {
    const hf = getHF(ev.hfid);
    addFact(`${hf} learned a secret in year ${year}`, 'learned_secret');
  }
  
  else if (evType === 'assume identity') {
    const hf = getHF(ev.hfid);
    const identity = ev.assumed_identity || 'unknown';
    addFact(`${hf} assumed identity: ${identity} in year ${year}`, 'identity');
  }
  
  else if (evType === 'hf convicted') {
    const hf = getHF(ev.hfid);
    const crime = ev.crime_type || 'a crime';
    addFact(`${hf} was convicted of ${crime} in year ${year}`, 'convicted');
  }
  
  else if (evType === 'hf reunion') {
    const hf1 = getHF(ev.hfid);
    const hf2 = getHF(ev.target_hfid);
    addFact(`${hf1} reunited with ${hf2} in year ${year}`, 'reunion');
  }
  
  else if (evType === 'hfs formed reputation relationship') {
    const hf1 = getHF(ev.hfid);
    const hf2 = getHF(ev.target_hfid);
    const relType = ev.reputation_type || 'relationship';
    addFact(`${hf1} and ${hf2} formed ${relType} in year ${year}`, 'relationship');
  }
  
  else if (evType === 'add hf entity link') {
    const hf = getHF(ev.hfid);
    const entity = getEntity(ev.entity_id);
    const linkType = ev.link_type || 'member';
    addFact(`${hf} became ${linkType} of ${entity} in year ${year}`, 'entity_link');
  }
  
  else if (evType === 'remove hf entity link') {
    const hf = getHF(ev.hfid);
    const entity = getEntity(ev.entity_id);
    const linkType = ev.link_type || 'member';
    addFact(`${hf} left ${entity} (${linkType}) in year ${year}`, 'entity_unlink');
  }
  
  else if (evType === 'add hf site link') {
    const hf = getHF(ev.hfid);
    const linkType = ev.link_type || 'associated';
    addFact(`${hf} is ${linkType} with ${site} in year ${year}`, 'site_link');
  }
  
  else if (evType === 'remove hf site link') {
    const hf = getHF(ev.hfid);
    addFact(`${hf} left ${site} in year ${year}`, 'site_unlink');
  }
  
  else if (evType === 'add hf hf link') {
    const hf1 = getHF(ev.hfid);
    const hf2 = getHF(ev.target_hfid);
    const linkType = ev.link_type || 'related';
    addFact(`${hf1} and ${hf2} became ${linkType} in year ${year}`, 'hf_link');
  }
  
  else if (evType === 'remove hf hf link') {
    const hf1 = getHF(ev.hfid);
    const hf2 = getHF(ev.target_hfid);
    addFact(`${hf1} and ${hf2} separated in year ${year}`, 'hf_unlink');
  }
  
  else if (evType === 'hf travel') {
    const hf = getHF(ev.hfid);
    const toRegion = getRegion(ev.subregion_id);
    addFact(`${hf} traveled to ${toRegion} in year ${year}`, 'travel');
  }
  
  else if (evType === 'hf equipment purchase') {
    const hf = getHF(ev.hfid);
    const item = ev.item_type || 'equipment';
    addFact(`${hf} purchased ${item} in year ${year}`, 'equipment');
  }
  
  // === PERFORMANCES / CEREMONIES ===
  else if (evType === 'performance') {
    const performers = ev.performing_hfid || 'performers';
    const perfType = ev.performance_type || 'performance';
    addFact(`${perfType} at ${site} in year ${year}`, 'performance');
  }
  
  else if (evType === 'ceremony') {
    const entity = getEntity(ev.entity_id);
    const occasion = ev.occasion_name || 'ceremony';
    addFact(`${entity} held ${occasion} in year ${year}`, 'ceremony');
  }
  
  else if (evType === 'competition') {
    const compType = ev.competition_type || 'competition';
    const winner = getHF(ev.winner_hfid);
    addFact(`${winner} won ${compType} at ${site} in year ${year}`, 'competition');
  }
  
  else if (evType === 'procession') {
    const entity = getEntity(ev.entity_id);
    addFact(`${entity} held a procession in year ${year}`, 'procession');
  }
  
  // === WRITTEN CONTENT ===
  else if (evType === 'written content composed') {
    const author = getHF(ev.author_hfid);
    const contentType = ev.content_type || 'written content';
    addFact(`${author} composed ${contentType} in year ${year}`, 'written');
  }
  
  // === AGREEMENTS ===
  else if (evType === 'agreement formed') {
    const parties = ev.agreement_type || 'agreement';
    addFact(`Agreement formed: ${parties} in year ${year}`, 'agreement');
  }
  
  // === ENTITY POSITIONS ===
  else if (evType === 'create entity position') {
    const entity = getEntity(ev.entity_id);
    const position = ev.position_name || 'position';
    addFact(`${entity} created position: ${position} in year ${year}`, 'position');
  }
  
  // === INTRIGUE ===
  else if (evType === 'failed intrigue corruption') {
    const hf = getHF(ev.corrupter_hfid);
    const target = getHF(ev.target_hfid);
    addFact(`Intrigue: ${hf} failed to corrupt ${target} in year ${year}`, 'intrigue');
  }
  
  // === BODY ABUSE ===
  else if (evType === 'body abused') {
    const hf = getHF(ev.victim_hfid);
    const abuser = getHF(ev.abuser_hfid);
    addFact(`Body abuse: ${abuser} abused ${hf} at ${site} in year ${year}`, 'abuse');
  }
  
  // === WOUNDED ===
  else if (evType === 'hf wounded') {
    const hf = getHF(ev.hfid);
    const woundType = ev.wound_type || 'wounded';
    addFact(`${hf} was ${woundType} at ${site} in year ${year}`, 'wounded');
  }
}

console.log(`
=== Event Type Summary ===`);
Object.keys(eventTypeCounts).sort((a,b) => eventTypeCounts[b] - eventTypeCounts[a]).forEach(type => {
  console.log(`  ${type}: ${eventTypeCounts[type]}`);
});

console.log(`
=== Import Summary ===`);
console.log(`Total events processed: ${eventList.length}`);
console.log(`Total facts extracted: ${facts.length}`);

console.log('\nSample facts (first 15):');
facts.slice(0, 15).forEach(f => console.log(`  - ${f.content.substring(0, 100)}...`));

// Sync ALL to tpc-server
console.log(`\nSyncing ALL ${facts.length} facts to tpc-server...`);

async function sync() {
  let synced = 0, errors = 0;
  const batchSize = 50;
  
  for (let i = 0; i < facts.length; i += batchSize) {
    const batch = facts.slice(i, i + batchSize);
    
    for (const fact of batch) {
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
    
    if ((i / batchSize) % 100 === 0) {
      console.log(`  Progress: ${i + batchSize}/${facts.length}...`);
    }
  }
  
  console.log(`\nDONE! Synced ${synced} facts (${errors} errors).`);
}

sync();
