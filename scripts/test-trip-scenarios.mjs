import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.NODE_ENV = 'test';
const [{ itineraryQualityTestHooks: quality }, { reconcileItineraryBudget }] = await Promise.all([
  import('../server.ts'),
  import('../src/utils/budgetCalculator.ts'),
]);

const destinations = [
  ['Goa, India', 'Mumbai, India', ['Calangute Beach', 'Fort Aguada', 'Mapusa Market']],
  ['Varanasi, India', 'Mumbai, India', ['Assi Ghat', 'Sarnath', 'Ramnagar Fort']],
  ['Mumbai, India', 'Delhi, India', ['Gateway of India', 'Marine Drive', 'Elephanta Caves']],
  ['Manali, India', 'Mumbai, India', ['Solang Valley', 'Old Manali', 'Hidimba Temple']],
  ['Paris, France', 'Mumbai, India', ['Eiffel Tower', 'Louvre Museum', 'Montmartre']],
  ['Baku, Azerbaijan', 'Mumbai, India', ['Icherisheher', 'Baku Boulevard', 'Gobustan']],
  ['Bali, Indonesia', 'Mumbai, India', ['Ubud Palace', 'Sanur Beach', 'Tanah Lot']],
  ['Dubai, United Arab Emirates', 'Mumbai, India', ['Burj Khalifa', 'Dubai Creek', 'Al Fahidi']],
  ['Nepal', 'Mumbai, India', ['Shivapuri Nagarjun National Park', 'Trisuli River Gorge', 'Boudhanath Stupa']],
];
const travelers = ['Couple', 'Family', 'Solo', 'Senior Citizens', 'Students', 'Group Trip'];
const styles = ['Beach Escape', 'Culture & History', 'Budget', 'Nature & Wildlife', 'Smart Luxury', 'Adventure'];
const money = value => Number(String(value ?? '').replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || 0);
const minutes = value => { const m=String(value||'').toUpperCase().match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/); if(!m)return 0; let h=Number(m[1])%12;if(m[3]==='PM')h+=12;return h*60+Number(m[2]||0); };
const normalize = value => String(value||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

function fixture(destination, origin, placeNames, dayCount, source, budgetMode, scenarioIndex) {
  const places=placeNames.map((name,index)=>({name,description:`Verified visitor context for ${name}.`,bestTimeToVisit:index===0?'Morning':'Daytime',entryFee:index===1?'$12':'Free'}));
  const foods=Array.from({length:8},(_,index)=>({name:`${destination.split(',')[0]} Savory Dish ${index+1}`,description:'A complete savory regional meal with local accompaniments.',type:'veg',mustTryAt:`${destination.split(',')[0]} established restaurant ${index+1}`}));
  const days=Array.from({length:dayCount},(_,index)=>{
    const primary=places[index%places.length];
    const activities=[];
    if(index===0)activities.push({time:'11:00 AM',title:'Arrival Transfer & Hotel Check-in',description:'Arrive and check in.',location:'Old Placeholder Hotel',cost:'Included',visitDuration:'1h'});
    activities.push({time:index===1?'06:15 PM':'09:30 AM',title:index===1?`Unhurried Beach Morning at ${primary.name}`:primary.name,description:primary.description,location:primary.name,cost:primary.entryFee,visitDuration:'1h 30m'});
    if(index===dayCount-1)activities.push({time:'01:15 PM',title:`Guided Visit: ${primary.name}`,description:primary.description,location:primary.name,cost:'Free',visitDuration:'1h'});
    if(index===1)activities.push({time:'04:00 PM',title:`Regional Dinner: ${foods[index].name}`,description:foods[index].description,location:foods[index].mustTryAt,cost:'Free',visitDuration:'1h 15m'});
    if(index===dayCount-1)activities.push({time:'04:00 PM',title:'Departure Transfer to Airport / Station',description:'Leave for the airport.',location:destination,cost:'Included',visitDuration:'45m'});
    return {dayNumber:index+1,theme:`${primary.name} & ${primary.name}`,activities};
  });
  return {destination,origin,travelers:scenarioIndex%4+1,travelerType:travelers[scenarioIndex%travelers.length],travelStyle:styles[scenarioIndex%styles.length],startDate:'2026-10-01',endDate:`2026-10-${String(dayCount).padStart(2,'0')}`,budgetAmount:budgetMode==='recommended'?'USD AI Recommended':'USD 2500',isAiBudgetPlanner:budgetMode==='recommended',generationSource:source,budgetHotelName:`Verified ${destination.split(',')[0]} Hotel`,placesToVisit:places,localFood:foods,days};
}

let scenarios=0;
for(const [destination,origin,placeNames] of destinations){
  for(const dayCount of [3,7])for(const source of ['gemini','curated-fallback'])for(const budgetMode of ['fixed','recommended']){
    const trip=fixture(destination,origin,placeNames,dayCount,source,budgetMode,scenarios);
    const selectedHotel=trip.budgetHotelName;
    quality.alignLodgingLogisticsToBudgetHotel(trip);
    assert.equal(trip.days[0].activities.find(a=>/arrival/i.test(a.title))?.location,selectedHotel,`${destination}: arrival hotel mismatch`);
    quality.repairFinalScheduleCompleteness(trip);
    quality.repairFinalItineraryDiversity(trip);
    quality.finalizeCustomerSpecificity(trip);
    quality.repairBlockingFinalQuality(trip);
    reconcileItineraryBudget(trip);

    assert.equal(trip.days.length,dayCount,`${destination}: duration changed`);
    trip.days.forEach((day,index)=>{
      const departure=day.activities.find(a=>/departure/i.test(a.title));
      const arrival=day.activities.find(a=>/arrival/i.test(a.title));
      const lunch=day.activities.some(a=>/\blunch\b/i.test(a.title));
      const dinner=day.activities.some(a=>/\bdinner\b/i.test(a.title));
      if(!arrival||minutes(arrival.time)<=13*60)assert.ok(lunch,`${destination} day ${index+1}: lunch missing`);
      if((!departure||minutes(departure.time)>=20*60)&&(!arrival||minutes(arrival.time)<=17*60))assert.ok(dinner,`${destination} day ${index+1}: dinner missing`);
      assert.ok(!day.activities.some(a=>/\bmorning\b/i.test(a.title)&&minutes(a.time)>=12*60),`${destination} day ${index+1}: time-of-day label mismatch`);
      const matched=day.activities.map(a=>placeNames.find(name=>normalize(`${a.title} ${a.location}`).includes(normalize(name)))).filter(Boolean);
      assert.equal(new Set(matched).size,matched.length,`${destination} day ${index+1}: duplicate landmark`);
      for(const meal of day.activities.filter(a=>/\blunch\b|\bdinner\b/i.test(a.title)))assert.ok(money(meal.cost)>0,`${destination} day ${index+1}: paid meal shown as free`);
      for(const paid of day.activities.filter(a=>/rafting|kayak|diving|climbing|bike|rental|scenic flight|helicopter|safari|guided tour/i.test(`${a.title} ${a.description}`)))assert.ok(money(paid.cost)>0,`${destination} day ${index+1}: paid experience shown as free`);
      const breakdown=day.dailyCostBreakdown;
      const parts=['accommodation','food','localTransport','activities','miscellaneous'].reduce((sum,key)=>sum+money(breakdown[key]),0);
      assert.equal(parts,money(day.dailyBudget),`${destination} day ${index+1}: daily cost does not reconcile`);
    });
    const destinationSpend=trip.days.reduce((sum,day)=>sum+money(day.dailyBudget),0);
    const expectedDestination=money(trip.realisticEstimatedCost)-money(trip.estimatedBudgetBreakdown.originToDestinationTravel)-money(trip.estimatedBudgetBreakdown.visaAndInsurance);
    assert.equal(destinationSpend,expectedDestination,`${destination}: daily totals do not equal destination spend`);
    assert.deepEqual(quality.blockingFinalQualityErrors(quality.validateFinalUserFacingItinerary(trip)),[],`${destination}: blocking final-quality error remains`);
    scenarios++;
  }
}

{
  const trip=fixture('Nepal','Mumbai, India',['Shivapuri Nagarjun National Park','Trisuli River Gorge','Boudhanath Stupa'],4,'gemini','recommended',0);
  trip.days[0].activities[0].description='Land at Tribhuvan International Airport (KTM), then transfer to the selected hotel.';
  quality.alignLodgingLogisticsToBudgetHotel(trip);
  assert.equal(trip.days.at(-1).activities.find(a=>/departure/i.test(a.title))?.location,'Tribhuvan International Airport (KTM)','country-level departure must use the verified arrival gateway');
}

const pdf=fs.readFileSync(new URL('../src/utils/pdfGenerator.ts',import.meta.url),'utf8');

for(const destination of ['Reykjavik, Iceland','Cusco, Peru','Madagascar']){
  const details=quality.buildResilientDestinationDetails(destination);
  assert.equal(details.places.length,4,`${destination}: global fallback needs four planning anchors`);
  assert.ok(details.food.length>=6,`${destination}: global fallback needs enough meal variety`);
  assert.equal(new Set(details.food.map(item=>normalize(item.name))).size,details.food.length,`${destination}: global fallback foods must be distinct`);
  assert.ok(details.places.every(place=>place.name.startsWith(destination)),`${destination}: fallback anchors must preserve the selected destination`);
  assert.ok(details.places.every(place=>/confirm|choose|use a mapped|begin in/i.test(place.description)),`${destination}: fallback must label confirmation instead of fabricating facts`);
}

assert.doesNotMatch(pdf,/const simulatedRating\s*=/,'PDF must not fabricate food ratings');
assert.doesNotMatch(pdf,/const rating\s*=\s*4\.5/,'PDF must not fabricate attraction ratings');
assert.match(pdf,/finalBlockReserve/,'PDF must keep the last activity with its route/summary panels');
assert.match(pdf,/dailyCostBreakdown/,'PDF must render reconciled daily cost components');

console.log(`Destination scenario regression passed: ${scenarios} behavioral scenarios across ${destinations.length} representative destinations.`);
