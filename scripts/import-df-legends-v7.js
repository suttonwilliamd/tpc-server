/**
 * Dwarf Fortress Legends XML - COMPREHENSIVE Importer v7
 * Uses bulk API and proper batching to avoid crashing
 */

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const DF_LEGENDS_PATH = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Dwarf Fortress\\region11-00179-01-01-legends.xml";

console.log('=== DF Legends Importer v7 (BULK) ===\n');
console.log('Parsing XML...');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true
});

const result = parser.parse(fs.readFileSync(DF_LEGENDS_PATH, 'utf8'));
const world = result.df_world;

// Build lookups
console.log('Building lookups...');
const entityNames = new Map();
const hfNames = new Map();
const siteNames = new Map();
const regionNames = new Map();
const artifactNames = new Map();

if (world.entities?.entity) {
  for (const e of Array.isArray(world.entities.entity) ? world.entities.entity : [world.entities.entity]) {
    entityNames.set(String(e.id || e['@_id'] || ''), e.name || `Entity ${e.id}`);
  }
}

if (world.historical_figures?.historical_figure) {
  for (const hf of Array.isArray(world.historical_figures.historical_figure) ? world.historical_figures.historical_figure : [world.historical_figures.historical_figure]) {
    const id = String(hf.id || hf['@_id'] || '');
    let name = hf.name;
    if (typeof name === 'object' && name !== null) {
      name = [name.first, name.nickname, name.last].filter(Boolean).join(' ') || `HF ${id}`;
    }
    hfNames.set(id, String(name) || `HF ${id}`);
  }
}

if (world.sites?.site) {
  for (const s of Array.isArray(world.sites.site) ? world.sites.site : [world.sites.site]) {
    siteNames.set(String(s.id || s['@_id'] || ''), s.name || `Site ${s.id}`);
  }
}

if (world.artifacts?.artifact) {
  for (const a of Array.isArray(world.artifacts.artifact) ? world.artifacts.artifact : [world.artifacts.artifact]) {
    artifactNames.set(String(a.id || a['@_id'] || ''), a.name || `Artifact ${a.id}`);
  }
}

console.log(`  Entities: ${entityNames.size}, HFs: ${hfNames.size}, Sites: ${siteNames.size}, Artifacts: ${artifactNames.size}`);

function getHF(id) { return hfNames.get(String(id)) || `HF ${id}`; }
function getEntity(id) { return entityNames.get(String(id)) || `Entity ${id}`; }
function getSite(id) { return siteNames.get(String(id)) || (String(id) ? `Site ${id}` : 'the wilderness'); }
function getArtifact(id) { return artifactNames.get(String(id)) || `Artifact ${id}`; }

// Process events
console.log('\nProcessing events...');
const events = world.historical_events?.historical_event;
const eventList = Array.isArray(events) ? events : [events];
console.log(`  Total: ${eventList.length}`);

const facts = [];

for (const ev of eventList) {
  const evType = ev.type || '';
  const year = ev.year || '?';
  if (!evType) continue;
  
  const siteId = String(ev.site_id || '');
  const site = getSite(siteId);
  
  const add = (content, predicate, tier = 'episodic') => {
    facts.push({ content: `[DF Legends] ${content}`, tags: ['dwarf-fortress', tier, predicate] });
  };
  
  // Handle each event type
  if (evType === 'hf died') {
    const victim = getHF(ev.hfid);
    const killer = getHF(ev.slayer_hfid);
    const race = ev.slayer_race || '';
    add(`${victim} was slain by ${killer} ${race ? `(${race})` : ''} at ${site} in year ${year}. Cause: ${ev.cause || 'unknown'}`, 'died');
  }
  else if (evType === 'hf simple battle event') {
    add(`${getHF(ev.group_1_hfid)} ${ev.subtype || 'fought'} ${getHF(ev.group_2_hfid)} at ${site} in year ${year}`, 'battle');
  }
  else if (evType === 'field battle') {
    add(`Field battle: ${getEntity(ev.attacker_civ_id)} vs ${getEntity(ev.defender_civ_id)} at ${site} in year ${year}`, 'battle');
  }
  else if (evType === 'hf abducted') {
    add(`${getHF(ev.target_hfid)} was abducted by ${getHF(ev.abductor_hfid)} at ${site} in year ${year}`, 'abducted');
  }
  else if (evType === 'artifact created') {
    add(`Artifact "${getArtifact(ev.artifact_id)}" was created by ${getHF(ev.hist_figure_id)} in year ${year}`, 'created', 'semantic');
  }
  else if (evType === 'artifact stored') {
    add(`Artifact "${getArtifact(ev.artifact_id)}" was stored by ${getEntity(ev.entity_id)} in year ${year}`, 'stored', 'semantic');
  }
  else if (evType === 'item stolen') {
    add(`${getHF(ev.thief_hfid)} stole ${ev.item_type || 'an item'} from ${getEntity(ev.entity_id)} in year ${year}`, 'stolen');
  }
  else if (evType === 'created site') {
    add(`${getEntity(ev.civ_id)} established ${site} in year ${year}`, 'established', 'semantic');
  }
  else if (evType === 'attacked site') {
    add(`${getEntity(ev.attacker_civ_id)} attacked ${site} in year ${year}`, 'attacked');
  }
  else if (evType === 'plundered site') {
    add(`${getEntity(ev.attacker_civ_id)} plundered ${site} in year ${year}`, 'plundered');
  }
  else if (evType === 'entity created') {
    add(`${getEntity(ev.entity_id)} was founded in year ${year}`, 'founded', 'structural');
  }
  else if (evType === 'entity alliance formed') {
    add(`Alliance: ${getEntity(ev.source_civ_id)} and ${getEntity(ev.target_civ_id)} in year ${year}`, 'alliance', 'structural');
  }
  else if (evType === 'peace accepted') {
    add(`Peace: ${getEntity(ev.source_civ_id)} and ${getEntity(ev.target_civ_id)} in year ${year}`, 'peace', 'structural');
  }
  else if (evType === 'creature devoured') {
    add(`${ev.victim || 'a creature'} was devoured by ${ev.predator || 'a beast'} at ${site} in year ${year}`, 'devoured');
  }
  else if (evType === 'hf new pet') {
    add(`${getHF(ev.owner_hfid)} tamed ${ev.pet_type || 'a creature'} in year ${year}`, 'tamed');
  }
  else if (evType === 'change hf state') {
    add(`${getHF(ev.hfid)} changed state to ${ev.new_state || 'unknown'} in year ${year}`, 'state_changed');
  }
  else if (evType === 'change hf job') {
    add(`${getHF(ev.hfid)} became a ${ev.new_job || 'unknown'} in year ${year}`, 'job_changed');
  }
  else if (evType === 'assume identity') {
    add(`${getHF(ev.hfid)} assumed identity: ${ev.assumed_identity || 'unknown'} in year ${year}`, 'identity');
  }
  else if (evType === 'hf gains secret goal') {
    add(`${getHF(ev.hfid)} gained secret goal: ${ev.secret_goal || 'unknown'} in year ${year}`, 'secret_goal');
  }
  else if (evType === 'written content composed') {
    add(`${getHF(ev.author_hfid)} composed ${ev.content_type || 'written content'} in year ${year}`, 'written');
  }
  else if (evType === 'performance') {
    add(`Performance at ${site} in year ${year}`, 'performance');
  }
  else if (evType === 'ceremony') {
    add(`${getEntity(ev.entity_id)} held ${ev.occasion_name || 'ceremony'} in year ${year}`, 'ceremony');
  }
  else if (evType === 'competition') {
    add(`${getHF(ev.winner_hfid)} won ${ev.competition_type || 'competition'} at ${site} in year ${year}`, 'competition');
  }
  else if (evType === 'add hf entity link') {
    add(`${getHF(ev.hfid)} became ${ev.link_type || 'member'} of ${getEntity(ev.entity_id)} in year ${year}`, 'entity_link');
  }
  else if (evType === 'remove hf entity link') {
    add(`${getHF(ev.hfid)} left ${getEntity(ev.entity_id)} in year ${year}`, 'entity_unlink');
  }
  else if (evType === 'add hf hf link') {
    add(`${getHF(ev.hfid)} and ${getHF(ev.target_hfid)} became ${ev.link_type || 'related'} in year ${year}`, 'hf_link');
  }
  else if (evType === 'hf travel') {
    add(`${getHF(ev.hfid)} traveled to region ${ev.subregion_id} in year ${year}`, 'travel');
  }
  else if (evType === 'reclaim site') {
    add(`${getEntity(ev.entity_id)} reclaimed ${site} in year ${year}`, 'reclaimed');
  }
  else if (evType === 'site dispute') {
    add(`Site dispute at ${site}: ${getEntity(ev.entity_id)} vs ${getEntity(ev.site_civ_id)} in year ${year}`, 'dispute');
  }
  else if (evType === 'body abused') {
    add(`Body abuse at ${site} in year ${year}`, 'abuse');
  }
  else if (evType === 'entity persecuted') {
    add(`${getEntity(ev.entity_id)} was persecuted in year ${year}`, 'persecuted', 'structural');
  }
  else if (evType === 'entity overthrown') {
    add(`${getEntity(ev.entity_id)} was overthrown in year ${year}`, 'overthrown', 'structural');
  }
}

console.log(`\nExtracted ${facts.length} facts`);

// Sync using bulk API
console.log('\nSyncing to tpc-server using bulk API...');

async function syncBulk() {
  const batchSize = 500;
  let synced = 0;
  let errors = 0;
  
  for (let i = 0; i < facts.length; i += batchSize) {
    const batch = facts.slice(i, i + batchSize);
    
    try {
      const res = await fetch('http://localhost:3000/thoughts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thoughts: batch })
      });
      
      if (res.ok) {
        const data = await res.json();
        synced += data.inserted || 0;
      } else {
        errors += batch.length;
        console.log(`  Batch ${i}-${i+batchSize} failed: ${res.status}`);
      }
    } catch (e) {
      errors += batch.length;
      console.log(`  Error: ${e.message}`);
    }
    
    if ((i / batchSize) % 50 === 0) {
      console.log(`  Progress: ${Math.min(i + batchSize, facts.length)}/${facts.length}...`);
    }
  }
  
  console.log(`\nDone! Synced ${synced} facts (${errors} errors).`);
}

syncBulk();
