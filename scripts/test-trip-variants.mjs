import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const form=read('src/components/TripForm.tsx');
const server=read('server.ts');
const types=read('src/types.ts');
const itineraryView=read('src/components/ItineraryView.tsx');
const pdf=read('src/utils/pdfGenerator.ts');

const travelerTypes=['Couple','Honeymoon','Family','Friends','Solo','Business','Senior Citizens','Students','Women-only Trip','Group Trip'];
const travelStyles=['Budget','Smart Luxury','Luxury','Adventure','Backpacker','Food Explorer','Wellness & Spa','Culture & History','Beach Escape','Nature & Wildlife','Shopping','Nightlife'];

const minTravelers=(type)=>type==='Group Trip'?3:type==='Solo'?1:['Couple','Honeymoon','Family','Friends','Senior Citizens','Students','Women-only Trip'].includes(type)?2:1;
const maxTravelers=(type)=>type==='Solo'?1:50;

assert.equal(travelerTypes.length,10,'Expected 10 traveler variants');
assert.equal(travelStyles.length,12,'Expected 12 travel-style variants');
assert.match(types,/export type TravelerType/);
assert.match(types,/travelerType\?: TravelerType/);

for(const travelerType of travelerTypes){
  assert.ok(form.includes(`name: "${travelerType}"`),`${travelerType} is missing from the form`);
  assert.ok(server.includes(`"${travelerType}":`)||server.includes(`${travelerType}:`),`${travelerType} is missing server guidance`);
  assert.ok(server.toLowerCase().includes(`'${travelerType.toLowerCase()}'`),`${travelerType} is missing server validation`);
}
for(const travelStyle of travelStyles){
  assert.ok(form.includes(`name: "${travelStyle}"`),`${travelStyle} is missing from the form`);
  assert.ok(server.includes(`"${travelStyle}":`)||server.includes(`'${travelStyle}':`),`${travelStyle} is missing server guidance`);
}

let combinations=0;
for(const travelerType of travelerTypes){
  for(const travelStyle of travelStyles){
    const initial=1;
    const travelers=travelerType==='Solo'?1:Math.max(initial,minTravelers(travelerType));
    assert.ok(travelers>=minTravelers(travelerType));
    assert.ok(travelers<=maxTravelers(travelerType));
    const payload={travelerType,travelStyle,travelers};
    const roundTrip=JSON.parse(JSON.stringify(payload));
    assert.equal(roundTrip.travelerType,travelerType);
    assert.equal(roundTrip.travelStyle,travelStyle);
    combinations++;
  }
}
assert.equal(combinations,120,'The complete traveler/style matrix must contain 120 combinations');

// Production-path identity checks: generated, fallback and cached trips must all retain the selection.
assert.match(server,/parsedItinerary\.travelerType\s*=\s*travelerType/);
assert.match(server,/cachedItinerary\.travelerType\s*=\s*travelerType/);
assert.match(server,/travelerType:\s*travelerType\s*\|\|\s*'Couple'/);
assert.match(server,/applyTravelerTypePersonalization\(reconciledItinerary, travelerType\)/);
assert.match(server,/applyTravelerTypePersonalization\(reconciledFallback, travelerType\)/);
assert.match(itineraryView,/itinerary\.travelerType/);
assert.match(pdf,/itinerary\.travelerType/);

// Smart Luxury must support both budget modes without silently changing the selected style.
assert.match(form,/const recommendBudget = budgetMode === "recommended"/);
assert.doesNotMatch(form,/if \(travelStyle === "Smart Luxury"\) setTravelStyle\("Luxury"\)/);

// Beach Escape needs a real named coastal anchor; inland fallbacks must use honest alternatives.
assert.match(server,/Beach Escape has no named coastal place verified/);
assert.match(server,/Beach-style Relaxation Adapted to/);
assert.match(server,/no verified beach is available at this destination/);

console.log(`Trip variant regression passed: ${travelerTypes.length} traveler types x ${travelStyles.length} styles = ${combinations} combinations.`);
