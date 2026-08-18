// Real-World Mathematical Travel Budget Calculator and Reconciler

export interface BudgetFactorsInput {
  destination: string;
  origin?: string;
  travelers: number;
  days: number;
  travelStyle: string; // Budget, Mid-range, Premium, Luxury, Family, Solo, Adventure
  userBudgetInput?: string | number; // User entered budget string or number
}

export interface CalculatedCategoryBreakdown {
  flight: number;
  hotel: number;
  food: number;
  localTransport: number;
  sightseeing: number;
  visaAndInsurance: number;
  miscellaneous: number;
  grandTotal: number;
  formatted: {
    flight: string;
    hotel: string;
    food: string;
    localTransport: string;
    sightseeing: string;
    visaAndInsurance: string;
    miscellaneous: string;
    grandTotal: string;
    expectedRange: string;
    averageDailyBudget: string;
  };
  expectedMin: number;
  expectedMax: number;
  averageDailyBudgetNum: number;
  currencySymbol: string;
  isBudgetTooLow: boolean;
  warningMessage?: string;
}

export interface BudgetFeasibilityResult {
  feasible: boolean;
  userBudget: number;
  minimumBudget: number;
  recommendedBudget: number;
  comfortableBudget: number;
  shortfall: number;
  budgetCoveragePercent: number;
  status: "no_budget" | "insufficient" | "tight" | "comfortable";
  estimate: CalculatedCategoryBreakdown;
}

// Central trip-currency helpers. All budget baselines in this module are stored in INR.
// Conversion happens only after the INR amount has been calculated.
export type TripCurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED" | "JPY";

// Fallback USD-based FX rates. These are used only until the app/server loads
// the same live rates that power /api/exchange-rates and CurrencyConverter.
let LIVE_USD_RATES: Record<string, number> = {
  USD: 1, INR: 85, EUR: 0.92, GBP: 0.78, AED: 3.67, JPY: 161.2,
};

export const setLiveUsdRates = (rates?: Record<string, unknown> | null): void => {
  if (!rates) return;
  const cleaned: Record<string, number> = {};
  for (const [code, raw] of Object.entries(rates)) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) cleaned[code.toUpperCase()] = value;
  }
  if (cleaned.USD && cleaned.INR) LIVE_USD_RATES = { ...LIVE_USD_RATES, ...cleaned };
};

export const getLiveCrossRate = (from: string, to: string): number => {
  const fromRate = LIVE_USD_RATES[from.toUpperCase()];
  const toRate = LIVE_USD_RATES[to.toUpperCase()];
  if (!fromRate || !toRate) return 1;
  return toRate / fromRate;
};

const CURRENCY_SYMBOLS: Record<TripCurrencyCode, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", JPY: "¥",
};

export const detectCurrencyCode = (str?: string | number, destination?: string): TripCurrencyCode => {
  if (typeof str === "string") {
    const v = str.toUpperCase();
    if (v.includes("AED")) return "AED";
    if (v.includes("INR") || v.includes("₹") || /\bRS\.?\s*/i.test(str)) return "INR";
    if (v.includes("USD") || str.includes("$")) return "USD";
    if (v.includes("EUR") || str.includes("€")) return "EUR";
    if (v.includes("GBP") || str.includes("£")) return "GBP";
    if (v.includes("JPY") || str.includes("¥")) return "JPY";
  }
  // The current trip form explicitly sends ₹ or $. This fallback is only for legacy data.
  const dest = (destination || "").toLowerCase();
  if (dest.includes("india")) return "INR";
  return "INR";
};

export const currencySymbolFor = (code: TripCurrencyCode): string => CURRENCY_SYMBOLS[code];
export const convertInrToTripCurrency = (amountInr: number, code: TripCurrencyCode): number =>
  amountInr * getLiveCrossRate("INR", code);
export const formatTripCurrency = (amount: number, code: TripCurrencyCode): string =>
  `${currencySymbolFor(code)}${Math.round(amount).toLocaleString()}`;

// Detect currency symbol from input string or default
export const detectCurrencySymbol = (str?: string | number, destination?: string): string =>
  currencySymbolFor(detectCurrencyCode(str, destination));

// Clean numeric parser
export const parseNumericValue = (val?: string | number | null): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : Math.abs(val);
  
  // Extract digits and decimal point
  const cleaned = String(val).replace(/,/g, "").replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};


const normalizePlaceName = (value?: string): string =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9, ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const placeCore = (value?: string): string =>
  normalizePlaceName(value).split(",")[0].trim();

/** True only when the entered origin and destination clearly represent the same locality. */
export const isSamePlaceTrip = (origin?: string, destination?: string): boolean => {
  const a = normalizePlaceName(origin);
  const b = normalizePlaceName(destination);
  if (!a || !b) return false;
  if (a === b) return true;
  const aCore = placeCore(a);
  const bCore = placeCore(b);
  return Boolean(aCore && bCore && aCore === bCore);
};

// Determine destination cost tier (Tier 1: High, Tier 2: Mid, Tier 3: Low)
const getDestinationTier = (destination: string): { tier: 1 | 2 | 3; isInternational: boolean } => {
  const d = destination.toLowerCase().trim();
  
  const tier1Keywords = [
    "paris", "france", "london", "uk", "england", "tokyo", "japan", "new york", "usa", "switzerland",
    "zurich", "geneva", "rome", "italy", "venice", "amsterdam", "oslo", "norway", "reykjavik", "iceland",
    "sydney", "australia", "singapore", "dubai", "uae", "hawaii", "maldives", "los angeles", "san francisco",
    "barcelona", "spain", "vienna", "austria"
  ];

  const tier2Keywords = [
    "bangkok", "thailand", "phuket", "bali", "indonesia", "istanbul", "turkey", "prague", "czech",
    "budapest", "hungary", "athens", "greece", "lisbon", "portugal", "kuala lumpur", "malaysia",
    "vietnam", "hanoi", "ho chi minh", "seoul", "korea", "goa", "kerala", "udaipur", "jaipur"
  ];

  const isInternationalKeywords = [
    "paris", "france", "london", "uk", "tokyo", "japan", "new york", "usa", "switzerland", "rome",
    "italy", "singapore", "dubai", "uae", "maldives", "thailand", "bali", "indonesia", "turkey",
    "prague", "greece", "portugal", "vietnam", "korea", "australia", "spain", "germany", "egypt"
  ];

  const isInternational = isInternationalKeywords.some(k => d.includes(k));

  if (tier1Keywords.some(k => d.includes(k))) {
    return { tier: 1, isInternational };
  }
  if (tier2Keywords.some(k => d.includes(k))) {
    return { tier: 2, isInternational };
  }

  return { tier: 3, isInternational };
};

// Calculate realistic, mathematically consistent travel budget
export const calculateRealWorldBudget = (input: BudgetFactorsInput): CalculatedCategoryBreakdown => {
  const travelers = Math.max(1, input.travelers || 1);
  const days = Math.max(1, input.days || 1);
  // A 1-day trip has no overnight stay unless the itinerary explicitly adds one.
  const nights = Math.max(0, days - 1);
  const rooms = Math.ceil(travelers / 2);
  const styleRaw = (input.travelStyle || "Mid-range").toLowerCase();

  let style: "budget" | "mid" | "luxury" = "mid";
  // Smart Luxury is deliberately best-value premium travel, not ultra-luxury.
  if (styleRaw.includes("smart luxury")) {
    style = "mid";
  } else if (styleRaw.includes("budget") || styleRaw.includes("solo") || styleRaw.includes("backpacker")) {
    style = "budget";
  } else if (styleRaw.includes("luxury") || styleRaw.includes("premium") || styleRaw.includes("vip")) {
    style = "luxury";
  }

  const destinationInfo = getDestinationTier(input.destination);
  const originInfo = getDestinationTier(input.origin || "");
  const tier = destinationInfo.tier;
  const hasOrigin = Boolean(input.origin && input.origin.trim() !== "");

  // Route pricing must depend on the route, not on how expensive either city is.
  // The previous Math.min(tier) rule incorrectly treated routes such as Dubai -> Baku
  // as long-haul simply because Dubai is a Tier-1 destination.
  const countryOf = (place?: string): string => {
    const p = normalizePlaceName(place);
    const rules: Array<[string, string]> = [
      ["united arab emirates", "AE"], ["uae", "AE"], ["dubai", "AE"], ["abu dhabi", "AE"],
      ["azerbaijan", "AZ"], ["baku", "AZ"],
      ["india", "IN"], ["mumbai", "IN"], ["delhi", "IN"], ["new delhi", "IN"], ["goa", "IN"], ["jaipur", "IN"], ["kerala", "IN"],
      ["united kingdom", "GB"], ["england", "GB"], ["london", "GB"],
      ["united states", "US"], ["usa", "US"], ["new york", "US"], ["los angeles", "US"], ["san francisco", "US"],
      ["france", "FR"], ["paris", "FR"], ["japan", "JP"], ["tokyo", "JP"],
      ["singapore", "SG"], ["thailand", "TH"], ["bangkok", "TH"], ["phuket", "TH"],
      ["indonesia", "ID"], ["bali", "ID"], ["turkey", "TR"], ["istanbul", "TR"],
      ["italy", "IT"], ["rome", "IT"], ["venice", "IT"], ["spain", "ES"], ["barcelona", "ES"],
      ["germany", "DE"], ["portugal", "PT"], ["lisbon", "PT"], ["greece", "GR"], ["athens", "GR"],
      ["switzerland", "CH"], ["austria", "AT"], ["vienna", "AT"], ["netherlands", "NL"], ["amsterdam", "NL"],
      ["australia", "AU"], ["sydney", "AU"], ["malaysia", "MY"], ["kuala lumpur", "MY"],
      ["vietnam", "VN"], ["south korea", "KR"], ["korea", "KR"], ["seoul", "KR"],
      ["egypt", "EG"], ["maldives", "MV"], ["iceland", "IS"], ["norway", "NO"]
    ];
    for (const [token, code] of rules) if (p.includes(token)) return code;
    return "";
  };

  const regionOf = (country: string): string => {
    if (["AE", "AZ", "TR", "EG"].includes(country)) return "WEST_ASIA";
    if (["IN", "MV"].includes(country)) return "SOUTH_ASIA";
    if (["TH", "SG", "MY", "ID", "VN"].includes(country)) return "SE_ASIA";
    if (["JP", "KR"].includes(country)) return "EAST_ASIA";
    if (["GB", "FR", "IT", "ES", "DE", "PT", "GR", "CH", "AT", "NL", "NO", "IS"].includes(country)) return "EUROPE";
    if (["US"].includes(country)) return "N_AMERICA";
    if (["AU"].includes(country)) return "OCEANIA";
    return "";
  };

  const originCountry = countryOf(input.origin);
  const destinationCountry = countryOf(input.destination);
  const countriesKnown = Boolean(originCountry && destinationCountry);
  const isInternational = hasOrigin
    ? (countriesKnown ? originCountry !== destinationCountry : (destinationInfo.isInternational || originInfo.isInternational))
    : destinationInfo.isInternational;

  type RouteBand = "domestic" | "short" | "medium" | "long";
  let routeBand: RouteBand = "domestic";
  if (isInternational) {
    const oRegion = regionOf(originCountry);
    const dRegion = regionOf(destinationCountry);
    if (oRegion && dRegion && oRegion === dRegion) routeBand = "short";
    else if (oRegion && dRegion && (
      (oRegion === "SOUTH_ASIA" && ["WEST_ASIA", "SE_ASIA"].includes(dRegion)) ||
      (dRegion === "SOUTH_ASIA" && ["WEST_ASIA", "SE_ASIA"].includes(oRegion)) ||
      (oRegion === "WEST_ASIA" && ["EUROPE", "SOUTH_ASIA"].includes(dRegion)) ||
      (dRegion === "WEST_ASIA" && ["EUROPE", "SOUTH_ASIA"].includes(oRegion)) ||
      (oRegion === "SE_ASIA" && ["EAST_ASIA", "SOUTH_ASIA"].includes(dRegion)) ||
      (dRegion === "SE_ASIA" && ["EAST_ASIA", "SOUTH_ASIA"].includes(oRegion))
    )) routeBand = "medium";
    else routeBand = "long";
  }
  const samePlaceTrip = hasOrigin && isSamePlaceTrip(input.origin, input.destination);
  const currencyCode = detectCurrencyCode(input.userBudgetInput, input.destination);
  const currencySymbol = currencySymbolFor(currencyCode);
  const fromInr = (amountInr: number) => convertInrToTripCurrency(amountInr, currencyCode);

  // 1. Flight / Transit Cost per traveler (Roundtrip)
  let flightCostPerPerson = 0;
  if (samePlaceTrip) {
    // Same-city/local trips must never be charged intercity flight/train transit.
    flightCostPerPerson = 0;
  } else if (hasOrigin || isInternational) {
    if (isInternational) {
      // Round-trip, per traveler. Route distance band controls the baseline; travel
      // style controls cabin/flexibility. This avoids destination-cost tier inflating airfare.
      if (routeBand === "short") {
        flightCostPerPerson = style === "budget" ? 18000 : style === "mid" ? 28000 : 65000;
      } else if (routeBand === "medium") {
        flightCostPerPerson = style === "budget" ? 35000 : style === "mid" ? 55000 : 110000;
      } else {
        flightCostPerPerson = style === "budget" ? 55000 : style === "mid" ? 85000 : 220000;
      }
    } else { // Same-country flight/train
      flightCostPerPerson = style === "budget" ? 4000 : style === "mid" ? 7500 : 16000;
    }
  } else {
    // Arrival local transfer baseline
    flightCostPerPerson = style === "budget" ? 1500 : style === "mid" ? 3000 : 8000;
  }

  // 2. Hotel / Accommodation Cost per night per room
  let hotelNightRate = 0;
  if (style === "budget") {
    hotelNightRate = tier === 1 ? 7500 : tier === 2 ? 3500 : 1800;
  } else if (style === "mid") {
    hotelNightRate = tier === 1 ? 22000 : tier === 2 ? 9500 : 4800;
  } else { // Luxury
    hotelNightRate = tier === 1 ? 75000 : tier === 2 ? 38000 : 22000;
  }

  // 3. Daily Food Cost per traveler per day
  let dailyFoodRate = 0;
  if (style === "budget") {
    dailyFoodRate = tier === 1 ? 2400 : tier === 2 ? 1200 : 650;
  } else if (style === "mid") {
    dailyFoodRate = tier === 1 ? 6500 : tier === 2 ? 3200 : 1600;
  } else { // Luxury
    dailyFoodRate = tier === 1 ? 20000 : tier === 2 ? 9500 : 4800;
  }

  // 4. Daily Local Transport per traveler per day
  let dailyTransportRate = 0;
  if (style === "budget") {
    dailyTransportRate = tier === 1 ? 1200 : tier === 2 ? 600 : 350;
  } else if (style === "mid") {
    dailyTransportRate = tier === 1 ? 3500 : tier === 2 ? 1600 : 850;
  } else { // Luxury
    dailyTransportRate = tier === 1 ? 14000 : tier === 2 ? 6500 : 3800;
  }

  // 5. Daily Sightseeing / Attractions per traveler per day
  let dailySightseeingRate = 0;
  if (style === "budget") {
    dailySightseeingRate = tier === 1 ? 1500 : tier === 2 ? 800 : 450;
  } else if (style === "mid") {
    dailySightseeingRate = tier === 1 ? 4800 : tier === 2 ? 2400 : 1200;
  } else { // Luxury
    dailySightseeingRate = tier === 1 ? 15000 : tier === 2 ? 8000 : 4200;
  }

  // 6. Visa & Travel Insurance per traveler (One-time)
  let visaInsurancePerPerson = 0;
  if (samePlaceTrip) {
    visaInsurancePerPerson = 0;
  } else if (isInternational) {
    // Do not guess passport/nationality-specific visa fees. Keep only a modest
    // generic travel-protection/admin allowance so the estimate is not dominated by documents.
    visaInsurancePerPerson = 1200;
  } else {
    visaInsurancePerPerson = 600; // Basic trip insurance/pass for non-local domestic travel
  }

  // Compute the economic trip cost ONCE in canonical INR.
  // The selected currency is display-only and must never change the underlying trip price.
  // This intentionally has no passport/nationality-specific price adjustment.
  const flightTotalInr = Math.round(flightCostPerPerson * travelers);
  const hotelTotalInr = Math.round(hotelNightRate * nights * rooms);
  const foodTotalInr = Math.round(dailyFoodRate * days * travelers);
  const localTransportTotalInr = Math.round(dailyTransportRate * days * travelers);
  const sightseeingTotalInr = Math.round(dailySightseeingRate * days * travelers);
  const visaAndInsuranceTotalInr = Math.round(visaInsurancePerPerson * travelers);

  // 7. Miscellaneous & Taxes (6% of the same canonical subtotal)
  const subtotalInr = hotelTotalInr + foodTotalInr + localTransportTotalInr + sightseeingTotalInr;
  const miscellaneousTotalInr = Math.round(subtotalInr * 0.06);

  // Convert only after every base cost has been calculated. This guarantees that
  // identical trip inputs have the same economic value in INR/AED/USD/EUR/GBP/JPY.
  const flightTotal = Math.round(fromInr(flightTotalInr));
  const hotelTotal = Math.round(fromInr(hotelTotalInr));
  const foodTotal = Math.round(fromInr(foodTotalInr));
  const localTransportTotal = Math.round(fromInr(localTransportTotalInr));
  const sightseeingTotal = Math.round(fromInr(sightseeingTotalInr));
  const visaAndInsuranceTotal = Math.round(fromInr(visaAndInsuranceTotalInr));
  const miscellaneousTotal = Math.round(fromInr(miscellaneousTotalInr));

  // Exact visible Grand Total: always equals the displayed category sum.
  const grandTotal = flightTotal + hotelTotal + foodTotal + localTransportTotal + sightseeingTotal + visaAndInsuranceTotal + miscellaneousTotal;

  // Expected Range (+/- 8% to 10%)
  const expectedMin = Math.round(grandTotal * 0.92);
  const expectedMax = Math.round(grandTotal * 1.08);

  // Average Daily Budget
  const averageDailyBudgetNum = Math.round(grandTotal / days);

  // Check if user budget input is too low
  const userNum = parseNumericValue(input.userBudgetInput);
  let isBudgetTooLow = false;
  let warningMessage: string | undefined = undefined;

  if (userNum > 0 && userNum < expectedMin) {
    isBudgetTooLow = true;
    const travelStyleLabel = input.travelStyle || (style === "luxury" ? "Luxury" : style === "budget" ? "Budget" : "Mid-range");
    warningMessage = `Your selected budget (${currencySymbol}${userNum.toLocaleString()}) is lower than the realistic estimated cost for a ${travelStyleLabel} trip to ${input.destination} (${currencySymbol}${grandTotal.toLocaleString()}). Consider increasing your budget or choosing a more economical travel style.`;
  }

  const fmt = (num: number) => `${currencySymbol}${num.toLocaleString()}`;

  return {
    flight: flightTotal,
    hotel: hotelTotal,
    food: foodTotal,
    localTransport: localTransportTotal,
    sightseeing: sightseeingTotal,
    visaAndInsurance: visaAndInsuranceTotal,
    miscellaneous: miscellaneousTotal,
    grandTotal,
    expectedMin,
    expectedMax,
    averageDailyBudgetNum,
    currencySymbol,
    isBudgetTooLow,
    warningMessage,
    formatted: {
      flight: fmt(flightTotal),
      hotel: fmt(hotelTotal),
      food: fmt(foodTotal),
      localTransport: fmt(localTransportTotal),
      sightseeing: fmt(sightseeingTotal),
      visaAndInsurance: fmt(visaAndInsuranceTotal),
      miscellaneous: fmt(miscellaneousTotal),
      grandTotal: fmt(grandTotal),
      expectedRange: `${fmt(expectedMin)} – ${fmt(expectedMax)}`,
      averageDailyBudget: fmt(averageDailyBudgetNum)
    }
  };
};

/**
 * Gate itinerary generation when a fixed user budget cannot realistically cover
 * the selected destination, duration, traveler count and travel style.
 *
 * The minimum is the lower edge of the realistic estimate range; the user is
 * never allowed to generate an impossible fixed-budget itinerary below it.
 */
export const evaluateBudgetFeasibility = (input: BudgetFactorsInput): BudgetFeasibilityResult => {
  const estimate = calculateRealWorldBudget(input);
  const userBudget = parseNumericValue(input.userBudgetInput);
  const minimumBudget = estimate.expectedMin;
  const recommendedBudget = estimate.grandTotal;
  const comfortableBudget = estimate.expectedMax;
  const shortfall = userBudget > 0 ? Math.max(0, minimumBudget - userBudget) : 0;
  const budgetCoveragePercent = minimumBudget > 0 && userBudget > 0
    ? Math.min(999, Math.round((userBudget / minimumBudget) * 100))
    : 0;

  let status: BudgetFeasibilityResult["status"] = "no_budget";
  if (userBudget > 0 && userBudget < minimumBudget) status = "insufficient";
  else if (userBudget > 0 && userBudget < recommendedBudget) status = "tight";
  else if (userBudget > 0) status = "comfortable";

  return {
    feasible: userBudget <= 0 || userBudget >= minimumBudget,
    userBudget,
    minimumBudget,
    recommendedBudget,
    comfortableBudget,
    shortfall,
    budgetCoveragePercent,
    status,
    estimate,
  };
};

// Reconcile and synchronize any itinerary object so that all budget sections are 100% mathematically consistent
export const reconcileItineraryBudget = (itinerary: any): any => {
  if (!itinerary || typeof itinerary !== "object") return itinerary;

  const destination = itinerary.destination || "Destination";
  const origin = itinerary.origin || "";
  const travelers = Math.max(1, parseInt(itinerary.travelers) || 1);
  const days = Math.max(1, (itinerary.days && itinerary.days.length) || 1);
  const travelStyle = itinerary.travelStyle || "Mid-range";
  const userBudgetInput = itinerary.budgetAmount;

  // Calculate strict baseline
  const calculated = calculateRealWorldBudget({
    destination,
    origin,
    travelers,
    days,
    travelStyle,
    userBudgetInput
  });

  const currencySym = calculated.currencySymbol;
  const grandTotalNum = calculated.grandTotal;
  const plannedBudgetNum = parseNumericValue(userBudgetInput);
  const plannedBudgetFormatted = plannedBudgetNum > 0
    ? `${currencySym}${plannedBudgetNum.toLocaleString()}`
    : calculated.formatted.grandTotal;

  // Keep the user's entered amount separate from the realistic calculated cost.
  // budgetAmount remains the planned budget for backward-compatible UI display.
  itinerary.plannedBudget = plannedBudgetFormatted;
  itinerary.budgetAmount = plannedBudgetFormatted;
  itinerary.realisticEstimatedCost = calculated.formatted.grandTotal;
  itinerary.expectedRange = calculated.formatted.expectedRange;
  itinerary.averageDailyBudget = calculated.formatted.averageDailyBudget;
  itinerary.budgetShortfall = plannedBudgetNum > 0 && grandTotalNum > plannedBudgetNum
    ? `${currencySym}${Math.round(grandTotalNum - plannedBudgetNum).toLocaleString()}`
    : `${currencySym}0`;
  const remainingNum = plannedBudgetNum > 0 ? Math.max(0, plannedBudgetNum - grandTotalNum) : 0;
  itinerary.remainingBudget = plannedBudgetNum > 0
    ? `${currencySym}${Math.round(remainingNum).toLocaleString()}`
    : "N/A";

  // AI prose must never invent a second cost range. It is overwritten from the same
  // calculator that powers feasibility, the PDF and all budget breakdowns.
  if (plannedBudgetNum > 0) {
    if (grandTotalNum > plannedBudgetNum) {
      itinerary.aiBudgetSummary = `Estimated trip cost is ${calculated.formatted.grandTotal} against your planned budget of ${plannedBudgetFormatted}. Estimated shortfall: ${currencySym}${Math.round(grandTotalNum - plannedBudgetNum).toLocaleString()}.`;
    } else {
      itinerary.aiBudgetSummary = `Estimated trip cost is ${calculated.formatted.grandTotal} against your planned budget of ${plannedBudgetFormatted}. Estimated remaining budget: ${currencySym}${Math.round(remainingNum).toLocaleString()}.`;
    }
  } else {
    itinerary.aiBudgetSummary = `Recommended realistic trip estimate: ${calculated.formatted.grandTotal} (${calculated.formatted.expectedRange}).`;
  }

  if (isSamePlaceTrip(origin, destination)) {
    itinerary.originToDestinationDuration = "N/A (Local trip within destination)";
  }

  if (calculated.isBudgetTooLow) {
    itinerary.budgetWarning = calculated.warningMessage;
  } else {
    delete itinerary.budgetWarning;
  }

  // Update estimatedBudgetBreakdown
  itinerary.estimatedBudgetBreakdown = {
    accommodation: calculated.formatted.hotel,
    food: calculated.formatted.food,
    activities: calculated.formatted.sightseeing,
    transport: calculated.formatted.localTransport,
    miscellaneous: calculated.formatted.miscellaneous,
    originToDestinationTravel: calculated.formatted.flight,
    visaAndInsurance: calculated.formatted.visaAndInsurance,
    total: calculated.formatted.grandTotal
  };

  // Update detailedBudgetSummary
  itinerary.detailedBudgetSummary = {
    accommodationTotal: calculated.formatted.hotel,
    foodTotal: calculated.formatted.food,
    attractionTotal: calculated.formatted.sightseeing,
    localTransportTotal: calculated.formatted.localTransport,
    miscellaneousExpenses: calculated.formatted.miscellaneous,
    originToDestinationCost: calculated.formatted.flight,
    visaAndInsurance: calculated.formatted.visaAndInsurance,
    grandTotal: calculated.formatted.grandTotal
  };

  // Reconcile day-by-day ON-TRIP spend. Long-distance travel and travel
  // protection are trip-level costs and stay in the trip summary; they must not
  // make Day 1 look artificially expensive.
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    const dayCount = itinerary.days.length;
    const parseMoney = (value: any): number => {
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const activitySubtotals = itinerary.days.map((day: any) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      return activities.reduce((sum: number, activity: any) => sum + parseMoney(activity.cost), 0);
    });
    const allActivitySubtotal = activitySubtotals.reduce((sum: number, value: number) => sum + value, 0);
    const destinationSpendTotal = calculated.hotel + calculated.food + calculated.localTransport + calculated.sightseeing + calculated.miscellaneous;
    const sharedDaily = (calculated.hotel + calculated.food + calculated.localTransport + calculated.miscellaneous) / dayCount;
    let allocatedSoFar = 0;

    itinerary.days.forEach((day: any, idx: number) => {
      const allocatedActivities = allActivitySubtotal > 0
        ? calculated.sightseeing * activitySubtotals[idx] / allActivitySubtotal
        : calculated.sightseeing / dayCount;
      const rawDayTotal = sharedDaily + allocatedActivities;
      const isLastDay = idx === dayCount - 1;
      const dayAlloc = isLastDay
        ? Math.max(0, Math.round(destinationSpendTotal - allocatedSoFar))
        : Math.max(0, Math.round(rawDayTotal));
      allocatedSoFar += dayAlloc;
      const formattedDay = `${currencySym}${dayAlloc.toLocaleString()}`;
      day.dailyBudget = formattedDay;
      day.estimatedTotalSpend = formattedDay;
    });
  }



  // GLOBAL CURRENCY NORMALIZATION
  // The deterministic calculator is authoritative for every monetary display.
  // AI may suggest names/descriptions, but it must not control currency or raw price scale.
  const fmtMoney = (value: number) => `${currencySym}${Math.max(0, Math.round(value)).toLocaleString()}`;

  // Day activity line items MUST use the same reconciled trip currency as the
  // grand total.  AI/fallback activity strings can contain INR-looking values
  // (for example "₹150 - ₹500").  Merely replacing the symbol caused the same
  // numeric value to appear as AED 150 and INR 150.  Instead, use the original
  // numbers only as RELATIVE WEIGHTS and allocate the authoritative sightseeing
  // pool across the paid activities.  This keeps every displayed line item
  // economically identical when the user switches currency.
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    const activityRows: Array<{ activity: any; weight: number }> = [];
    const firstMoneyNumber = (value: any): number => {
      if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
      const text = String(value ?? "").replace(/,/g, "");
      if (/\bfree\b|included/i.test(text)) return 0;
      const match = text.match(/[0-9]+(?:\.[0-9]+)?/);
      if (!match) return 0;
      const n = Number(match[0]);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    };

    itinerary.days.forEach((day: any) => {
      const activities = Array.isArray(day?.activities) ? day.activities : [];
      activities.forEach((activity: any) => {
        const raw = String(activity?.cost ?? "");
        if (/\bfree\b|included/i.test(raw) || firstMoneyNumber(raw) <= 0) {
          if (!raw.trim() || /\bfree\b|included/i.test(raw)) activity.cost = "Free";
          return;
        }
        activityRows.push({ activity, weight: firstMoneyNumber(raw) });
      });
    });

    if (activityRows.length > 0) {
      const totalWeight = activityRows.reduce((sum, row) => sum + row.weight, 0) || activityRows.length;
      let allocated = 0;
      activityRows.forEach((row, index) => {
        const isLast = index === activityRows.length - 1;
        const amount = isLast
          ? Math.max(0, Math.round(calculated.sightseeing - allocated))
          : Math.max(0, Math.round(calculated.sightseeing * row.weight / totalWeight));
        allocated += amount;
        row.activity.cost = amount > 0 ? fmtMoney(amount) : "Free / Included";
      });
    }
  }
  const dayCountForRates = Math.max(1, days);
  const nightsForRates = Math.max(1, days - 1);
  const roomsForRates = Math.max(1, Math.ceil(travelers / 2));

  // Hotel cards: retain hotel names/ratings, replace prices with consistent trip-currency rates.
  if (itinerary.hotelRecommendations) {
    const baseNight = calculated.hotel > 0
      ? calculated.hotel / nightsForRates / roomsForRates
      : 0;
    const setHotelTier = (list: any[] | undefined, factor: number) => {
      if (!Array.isArray(list)) return;
      list.forEach((h: any) => { h.pricePerNight = `${fmtMoney(baseNight * factor)}/night`; });
    };
    setHotelTier(itinerary.hotelRecommendations.budget, 0.75);
    setHotelTier(itinerary.hotelRecommendations.midRange, 1.35);
    setHotelTier(itinerary.hotelRecommendations.luxury, 3.25);
  }

  // Food daily guide: derive from the reconciled food category, never from AI currency strings.
  const perPersonFoodDay = calculated.food / dayCountForRates / travelers;
  itinerary.foodBudgetDaily = {
    budget: `${fmtMoney(perPersonFoodDay * 0.75)}/day`,
    midRange: `${fmtMoney(perPersonFoodDay * 1.35)}/day`,
    luxury: `${fmtMoney(perPersonFoodDay * 2.6)}/day`,
  };

  // Transport guide: deterministic representative fares in the same trip currency.
  const perPersonTransportDay = calculated.localTransport / dayCountForRates / travelers;
  itinerary.detailedTransportationCosts = {
    taxiStart: fmtMoney(perPersonTransportDay * 0.35),
    taxiPerKm: fmtMoney(Math.max(1, perPersonTransportDay * 0.08)),
    autoRickshaw: fmtMoney(perPersonTransportDay * 0.22),
    busFare: fmtMoney(Math.max(1, perPersonTransportDay * 0.08)),
    metroFare: fmtMoney(Math.max(1, perPersonTransportDay * 0.10)),
    trainFare: fmtMoney(perPersonTransportDay * 0.30),
    scooterRental: `${fmtMoney(perPersonTransportDay * 0.80)}/day`,
    carRental: `${fmtMoney(perPersonTransportDay * 3.0)}/day`,
    airportTransfer: fmtMoney(perPersonTransportDay * 1.5),
  };

  // Attraction cards: preserve free attractions; normalize paid fees into the trip currency.
  if (Array.isArray(itinerary.placesToVisit) && itinerary.placesToVisit.length) {
    const paidPlaces = itinerary.placesToVisit.filter((p: any) => !/\bfree\b/i.test(String(p.entryFee || "")));
    const perPaidPlace = paidPlaces.length ? calculated.sightseeing / travelers / paidPlaces.length : 0;
    itinerary.placesToVisit.forEach((place: any) => {
      if (/\bfree\b/i.test(String(place.entryFee || ""))) place.entryFee = "Free";
      else place.entryFee = fmtMoney(perPaidPlace);
    });
    itinerary.attractionCosts = itinerary.placesToVisit.map((p: any) => ({ name: p.name, fee: p.entryFee }));
  }

  // Local food price hints (used by PDF/UI when present) are derived from the reconciled food pool.
  if (Array.isArray(itinerary.localFood)) {
    const baseMeal = Math.max(1, perPersonFoodDay / 3);
    itinerary.localFood.forEach((food: any, idx: number) => {
      const text = `${food.name || ""} ${food.type || ""}`.toLowerCase();
      let lo = 0.55, hi = 1.05;
      if (/tea|coffee|beverage|dessert|pastry|snack/.test(text)) { lo = 0.25; hi = 0.55; }
      else if (/fine|luxury|truffle|tasting|michelin/.test(text)) { lo = 1.15; hi = 2.0; }
      const variation = 1 + ((idx % 3) - 1) * 0.07;
      food.estimatedPrice = `${fmtMoney(baseMeal * lo * variation)} - ${fmtMoney(baseMeal * hi * variation)}`;
    });
  }

  // Filter hotel recommendations according to travel style
  if (itinerary.hotelRecommendations) {
    const hr = itinerary.hotelRecommendations;
    const styleLower = travelStyle.toLowerCase();

    // Ensure prices match style
    if (styleLower.includes("budget") || styleLower.includes("backpacker")) {
      if (hr.budget) {
        hr.budget.forEach((h: any) => {
          if (!h.pricePerNight || h.pricePerNight.includes("NaN")) {
            h.pricePerNight = `${currencySym}${Math.round(calculated.hotel / (days * travelers * 2)).toLocaleString()}/night`;
          }
        });
      }
    } else if (styleLower.includes("luxury") || styleLower.includes("vip")) {
      if (hr.luxury) {
        hr.luxury.forEach((h: any) => {
          if (!h.pricePerNight || h.pricePerNight.includes("NaN")) {
            h.pricePerNight = `${currencySym}${Math.round(calculated.hotel / (days * travelers)).toLocaleString()}/night`;
          }
        });
      }
    }
  }

  return itinerary;
};
