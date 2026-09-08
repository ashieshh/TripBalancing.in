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

// A resilient generic planning profile may help internal repair logic, but the
// production endpoint must never return it as a completed Premium Guide.
const serverSource=fs.readFileSync(new URL('../server.ts',import.meta.url),'utf8');
assert.match(serverSource,/GLOBAL_FALLBACK_REJECTED/,'generic fallback must be rejected before customer delivery');
assert.match(serverSource,/DESTINATION_CONTENT_UNAVAILABLE/,'generic fallback rejection must return a stable retry code');
assert.match(serverSource,/trip allowance has not been used/,'generic fallback rejection must protect the customer trip allowance');
assert.match(serverSource,/recoverDestinationSpecificDetails/,'failed full itineraries must attempt a compact destination-specific recovery before rejection');
assert.match(serverSource,/DESTINATION_RECOVERY_SUCCESS/,'validated destination recovery must be observable in production logs');
assert.match(serverSource,/GEMINI_RECOVERY_MODEL\|\|'gemini-3\.6-flash'/,'recovery must use the currently supported independent fast model');
assert.match(serverSource,/GEMINI_ITINERARY_MODEL[\s\S]{0,120}gemini-3\.6-flash/,'the main itinerary path must default to the currently supported model');
assert.doesNotMatch(serverSource,/GEMINI_(?:RECOVERY|ITINERARY)_MODEL[^\n]*gemini-2\.5-flash/,'customer itinerary paths must not default to the retired Gemini 2.5 Flash model');
assert.match(serverSource,/controller\.abort\(\)/,'timed-out Gemini requests must be aborted rather than left running beside recovery');
assert.match(serverSource,/dubai:\s*\{[\s\S]*Burj Khalifa and Downtown Dubai[\s\S]*Dubai Creek and Gold Souk/,'Dubai must have a provider-independent verified destination profile');

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

// Regression for the Bali/Nepal PDFs: boundary anchors must survive, arrival-day
// lunch must stay in a lunch window, sparse full days must be filled honestly,
// meal roles must not duplicate, and active paid services must not display Free.
{
  const trip=fixture('Bali, Indonesia','Mumbai, India',['Tanah Lot Temple','Uluwatu Temple','Tegallalang Rice Terraces'],6,'gemini','recommended',0);
  const arrival=trip.days[0].activities.find(a=>/arrival/i.test(a.title));
  arrival.time='11:00 AM';
  trip.days[0].activities.push({time:'12:15 PM',title:'Early Nature / Wildlife Excursion',description:'Guided rafting and bicycle rental experience.',location:trip.budgetHotelName,cost:'Free / verify',visitDuration:'2–4 hours'});
  trip.days[0].activities.push({time:'04:45 PM',title:'Local Lunch: Bali Savory Dish 1',description:'A complete savory regional meal.',location:'Local restaurant',cost:'$10',visitDuration:'1h 15m'});
  trip.days[3].activities=[];
  trip.days[4].activities=[];
  trip.days.at(-1).theme='Arrival & Settling In';
  quality.repairFinalScheduleCompleteness(trip);
  quality.finalizeCustomerSpecificity(trip);
  quality.repairFinalItineraryDiversity(trip);
  quality.repairBlockingFinalQuality(trip);
  reconcileItineraryBudget(trip);
  assert.ok(trip.days[0].activities.some(a=>/arrival/i.test(a.title)),'arrival anchor must survive final transfer de-duplication');
  assert.ok(minutes(trip.days[0].activities.find(a=>/\blunch\b/i.test(a.title))?.time)<=15*60,'arrival-day lunch must remain in a realistic lunch window');
  const retainedRafting=trip.days[0].activities.find(a=>/rafting/i.test(`${a.title} ${a.description}`));
  if(retainedRafting)assert.ok(money(retainedRafting.cost)>0,'a retained paid active service must not remain Free');
  for(const index of [3,4])assert.ok(trip.days[index].activities.filter(a=>!/lunch|dinner/i.test(a.title)).length>=2,`sparse full day ${index+1} must receive meaningful planning blocks`);
  for(const day of trip.days){
    assert.ok(day.activities.filter(a=>/\blunch\b/i.test(a.title)).length<=1,'day must not contain two lunches');
    assert.ok(day.activities.filter(a=>/\bdinner\b/i.test(a.title)).length<=1,'day must not contain two dinners');
  }
  assert.equal(trip.days.at(-1).theme,'Departure Day','final-day theme must match its departure anchor');
  const breakfastAsLunch={name:'Regional Breakfast Selection',description:'Choose a savory breakfast.',type:'both',mustTryAt:'Breakfast venue'};
  trip.localFood.unshift(breakfastAsLunch);
  trip.days[1].activities[0]={time:'12:30 PM',title:'Regional Lunch: Regional Breakfast Selection',description:breakfastAsLunch.description,location:breakfastAsLunch.mustTryAt,cost:'$10'};
  quality.repairFinalItineraryDiversity(trip);
  assert.ok(!/breakfast/i.test(`${trip.days[1].activities[0].title} ${trip.days[1].activities[0].description}`),'breakfast-labelled food must not survive in a lunch slot');

  const crossedMeals={
    destination:'Dubai Emirate, United Arab Emirates',
    localFood:[
      {name:'Regional Lunch Selection',description:'A complete regional lunch.',mustTryAt:'Lunch venue'},
      {name:'Seasonal Local Lunch Menu',description:'A different complete seasonal lunch.',mustTryAt:'Lunch venue two'},
      {name:'Regional Dinner Selection',description:'A complete regional dinner.',mustTryAt:'Dinner venue'},
      {name:'Seasonal Local Dinner Menu',description:'A distinct evening dinner.',mustTryAt:'Dinner venue two'}
    ],
    placesToVisit:[],
    days:[{activities:[
      {time:'12:30 PM',title:'Lunch: Regional Lunch Selection',description:'A complete regional lunch.',location:'Lunch venue'},
      {time:'07:30 PM',title:'Regional Dinner: Seasonal Local Lunch Menu',description:'A different complete seasonal lunch.',location:'Lunch venue two'}
    ]},{activities:[
      {time:'12:30 PM',title:'Upscale Regional Lunch: Regional Dinner Selection',description:'A complete regional dinner.',location:'Dinner venue'},
      {time:'07:30 PM',title:'Regional Dinner: Seasonal Local Dinner Menu',description:'A distinct evening dinner.',location:'Dinner venue two'}
    ]}]
  };
  quality.repairFinalItineraryDiversity(crossedMeals);
  for(const day of crossedMeals.days){
    const lunch=day.activities.find(a=>/\blunch\b/i.test(a.title));
    const dinner=day.activities.find(a=>/\bdinner\b/i.test(a.title));
    assert.doesNotMatch(`${lunch.title} ${lunch.description}`,/\bdinner\b/i,'a lunch replacement must never reuse dinner-labelled food');
    assert.doesNotMatch(`${dinner.title} ${dinner.description}`,/\blunch\b/i,'a dinner replacement must never reuse lunch-labelled food');
  }

  crossedMeals.travelStyle='Shopping';
  crossedMeals.days[0].activities.unshift({time:'11:00 AM',title:'Arrival Transfer & Hotel Check-in',description:'Arrive and check in.',location:'Hotel'});
  crossedMeals.days[0].activities.splice(3,0,
    {time:'04:45 PM',title:'Local Market / Artisan District',description:'Browse local products.',location:'Market'},
    {time:'07:00 PM',title:'Public Scenic Viewpoint',description:'Visit a public viewpoint.',location:'Viewpoint'}
  );
  quality.repairBlockingFinalQuality(crossedMeals);
  assert.ok(crossedMeals.days[0].activities.length<=4,'a post-10 AM arrival day must fit arrival, lunch, one experience and dinner');
  assert.ok(crossedMeals.days[0].activities.some(a=>/market|shopping|artisan/i.test(`${a.title} ${a.description}`)),'Shopping arrival day should retain the most style-relevant experience');
}

{
  const trip=fixture('Dubai Emirate, United Arab Emirates','Mumbai, India',['Central Orientation District','Heritage or Museum Visit','Established Public Market'],4,'curated-fallback','recommended',0);
  trip.localFood=[
    {name:'Regional Lunch Selection',description:'Complete regional lunch.',type:'both',mustTryAt:'Local restaurant'},
    {name:'Regional Dinner Selection',description:'Complete regional dinner.',type:'both',mustTryAt:'Dinner venue'},
    {name:'Seasonal Local Dinner Menu',description:'Savory evening meal.',type:'both',mustTryAt:'Central restaurant'}
  ];
  trip.days[1].activities=[{time:'12:30 PM',title:'Regional Lunch: Regional Dinner Selection',description:'Complete regional dinner.',location:'Dinner venue',cost:'$10'}];
  trip.days[2].activities=[{time:'04:30 PM',title:'Guided Visit: Heritage or Museum Visit',description:'Confirm official access.',location:'Heritage or Museum Visit',cost:'$10'}];
  quality.repairFinalItineraryDiversity(trip);
  quality.repairFinalScheduleCompleteness(trip);
  quality.alignLodgingLogisticsToBudgetHotel(trip);
  const lunch=trip.days[1].activities.find(a=>/\blunch\b/i.test(a.title));
  assert.ok(!/dinner/i.test(`${lunch?.title} ${lunch?.description}`),'dinner-labelled food must not survive in a lunch slot');
  assert.ok(trip.days[1].activities.some(a=>/^.*\bdinner\b/i.test(a.title)&&!/\blunch\b/i.test(a.title)),'embedded dinner word in lunch must not suppress the real dinner slot');
  assert.ok(trip.days[2].activities.some(a=>minutes(a.time)<=11*60),'full non-boundary day must begin with a morning activity');
  assert.match(trip.days.at(-1).activities.find(a=>/departure/i.test(a.title))?.location||'',/confirmed departure airport \/ station/i,'unnamed departure gateway must not point back to the hotel');
}

assert.doesNotMatch(pdf,/const simulatedRating\s*=/,'PDF must not fabricate food ratings');
assert.doesNotMatch(pdf,/const rating\s*=\s*4\.5/,'PDF must not fabricate attraction ratings');
assert.match(pdf,/finalBlockReserve/,'PDF must keep the last activity with its route/summary panels');
assert.match(pdf,/dailyCostBreakdown/,'PDF must render reconciled daily cost components');

console.log(`Destination scenario regression passed: ${scenarios} behavioral scenarios across ${destinations.length} representative destinations.`);
