// Real-World Mathematical Travel Budget Calculator and Reconciler

export interface BudgetFactorsInput {
  destination: string;
  origin?: string;
  travelers: number;
  days: number;
  travelStyle: string; // Budget, Mid-range, Premium, Luxury, Family, Solo, Adventure
  userBudgetInput?: string | number; // User entered budget string or number
  flightEstimateInr?: number; // Optional market-based round-trip total for ALL travelers
  startDate?: string; // Used for seasonality and exact hotel-night calculation
  endDate?: string; // Used with startDate to calculate hotel nights
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


const calculateHotelNights = (startDate: string | undefined, endDate: string | undefined, fallbackDays: number): number => {
  if (startDate && endDate) {
    const start = new Date(`${startDate}T12:00:00Z`);
    const end = new Date(`${endDate}T12:00:00Z`);
    const diffMs = end.getTime() - start.getTime();
    if (Number.isFinite(diffMs) && diffMs >= 0) {
      return Math.max(0, Math.round(diffMs / 86400000));
    }
  }
  return Math.max(0, fallbackDays - 1);
};

// Calculate realistic, mathematically consistent travel budget
export const calculateRealWorldBudget = (input: BudgetFactorsInput): CalculatedCategoryBreakdown => {
  const travelers = Math.max(1, input.travelers || 1);
  const days = Math.max(1, input.days || 1);
  // Hotel nights come from the actual dates when available. A 4-day Aug 31 → Sep 3 trip is 3 nights.
  const nights = calculateHotelNights(input.startDate, input.endDate, days);
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
  // When the backend has a recent market airfare estimate from Travelpayouts/Aviasales,
  // that total is authoritative for the whole party. The route-band model remains the fallback.
  const marketFlightTotalInr = Number(input.flightEstimateInr);
  const hasMarketFlightEstimate = Number.isFinite(marketFlightTotalInr) && marketFlightTotalInr > 0;
  let flightCostPerPerson = hasMarketFlightEstimate ? marketFlightTotalInr / travelers : 0;
  if (hasMarketFlightEstimate && !samePlaceTrip) {
    // Keep the recent market-derived round-trip estimate.
  } else if (samePlaceTrip) {
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

  // 2. Hotel / Accommodation Cost per night per room.
  // These are destination-market estimates, not live bookable hotel prices.
  // City profiles stop inexpensive international destinations (for example Baku)
  // from falling into the generic Tier-3/India-like baseline.
  const hotelProfiles: Array<{ tokens: string[]; budget: number; mid: number; luxury: number; peakMonths?: number[]; peakFactor?: number; shoulderFactor?: number }> = [
    { tokens: ["baku", "azerbaijan"], budget: 3200, mid: 6200, luxury: 14500, peakMonths: [5,6,7,8,9], peakFactor: 1.12, shoulderFactor: 0.96 },
    { tokens: ["dubai", "united arab emirates", "uae"], budget: 6500, mid: 13500, luxury: 36000, peakMonths: [11,12,1,2,3], peakFactor: 1.25, shoulderFactor: 0.90 },
    { tokens: ["paris", "france"], budget: 9000, mid: 19000, luxury: 52000, peakMonths: [5,6,7,8,9], peakFactor: 1.18, shoulderFactor: 0.94 },
    { tokens: ["london", "united kingdom", "england"], budget: 9500, mid: 20000, luxury: 55000, peakMonths: [5,6,7,8,9,12], peakFactor: 1.18, shoulderFactor: 0.95 },
    { tokens: ["bangkok", "thailand"], budget: 2800, mid: 6000, luxury: 15000, peakMonths: [11,12,1,2], peakFactor: 1.18, shoulderFactor: 0.94 },
    { tokens: ["bali", "indonesia"], budget: 3000, mid: 7000, luxury: 18000, peakMonths: [6,7,8,12], peakFactor: 1.20, shoulderFactor: 0.94 },
    { tokens: ["singapore"], budget: 6500, mid: 14000, luxury: 34000, peakMonths: [6,7,12], peakFactor: 1.15, shoulderFactor: 0.97 },
    { tokens: ["tokyo", "japan"], budget: 6000, mid: 12500, luxury: 32000, peakMonths: [3,4,10,11], peakFactor: 1.18, shoulderFactor: 0.96 },
    { tokens: ["mumbai"], budget: 3000, mid: 6500, luxury: 16000, peakMonths: [11,12,1,2], peakFactor: 1.15, shoulderFactor: 0.95 },
    { tokens: ["goa"], budget: 2800, mid: 6500, luxury: 18000, peakMonths: [11,12,1,2], peakFactor: 1.30, shoulderFactor: 0.88 },
  ];
  const normalizedDestination = normalizePlaceName(input.destination);
  const hotelProfile = hotelProfiles.find(profile => profile.tokens.some(token => normalizedDestination.includes(token)));
  let hotelNightRate = hotelProfile
    ? hotelProfile[style]
    : style === "budget"
      ? (tier === 1 ? 7500 : tier === 2 ? 3500 : 2200)
      : style === "mid"
        ? (tier === 1 ? 22000 : tier === 2 ? 9500 : 5200)
        : (tier === 1 ? 75000 : tier === 2 ? 38000 : 22000);

  // Mild seasonality only: enough to reflect high/shoulder season without pretending
  // to know a live hotel quote. Unknown/invalid dates stay at the destination baseline.
  const parsedStart = input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : null;
  if (hotelProfile && parsedStart && !Number.isNaN(parsedStart.getTime())) {
    const month = parsedStart.getUTCMonth() + 1;
    const isPeak = hotelProfile.peakMonths?.includes(month);
    hotelNightRate *= isPeak ? (hotelProfile.peakFactor || 1.12) : (hotelProfile.shoulderFactor || 0.96);
  }
  hotelNightRate = Math.round(hotelNightRate / 100) * 100;

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
    userBudgetInput,
    flightEstimateInr: Number(itinerary.flightEstimateInr) || undefined,
    startDate: itinerary.startDate,
    endDate: itinerary.endDate
  });

  const currencySym = calculated.currencySymbol;

  // Itinerary-informed activity costing. The destination/style baseline remains a guardrail,
  // but the visible Activities & Experiences category is now derived from the actual blocks
  // in the itinerary instead of blindly charging a fixed per-day sightseeing allowance.
  // Admission, private service and premium experience costs are estimated separately.
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    const tripCurrency = detectCurrencyCode(userBudgetInput, destination);
    const toTrip = (inr:number) => Math.max(0, Math.round(convertInrToTripCurrency(inr, tripCurrency)));
    const parseSourceMoneyToTrip = (raw:any):number => {
      const text=String(raw??'').trim();
      if(!text || /\bfree\b|included|n\/?a/i.test(text)) return 0;
      const m=text.replace(/,/g,'').match(/[0-9]+(?:\.[0-9]+)?/);
      if(!m) return 0;
      const n=Math.max(0,Number(m[0])||0);
      const source=detectCurrencyCode(text,destination);
      const inr=n*getLiveCrossRate(source,'INR');
      return Math.max(0,Math.round(inr*getLiveCrossRate('INR',tripCurrency)));
    };
    const placeRows=Array.isArray(itinerary.placesToVisit)?itinerary.placesToVisit:[];
    const norm=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\b(the|a|an|private|priority|visit|experience|tour|guided|at|to|of|and)\b/g,' ').replace(/\s+/g,' ').trim();
    const styleKey=String(travelStyle||'').toLowerCase();
    const premiumBlockInr=/luxury/.test(styleKey)?5500:/smart luxury/.test(styleKey)?3200:1400;
    const standardExperienceInr=/luxury/.test(styleKey)?1800:800;
    let componentActivityTotal=0;
    const chargedPlaces=new Set<string>();
    for(const day of itinerary.days){
      for(const a of (Array.isArray(day?.activities)?day.activities:[])){
        const text=`${a?.title||''} ${a?.description||''} ${a?.location||''}`;
        if(/breakfast|brunch|lunch|dinner|meal|restaurant|cafe|tasting|dessert|food craft|market \/ food|transfer|chauffeur|airport|check[- ]?in|check[- ]?out/i.test(text)) continue;
        const ak=norm(`${a?.title||''} ${a?.location||''}`);
        const place=placeRows.find((p:any)=>{const pk=norm(p?.name);return pk&&(ak.includes(pk)||pk.includes(ak));});
        if(place){
          const pk=norm(place?.name);
          if(!chargedPlaces.has(pk)){ componentActivityTotal+=parseSourceMoneyToTrip(place?.entryFee); chargedPlaces.add(pk); }
          if(/private|priority|reserved|guide|premium/i.test(text)) componentActivityTotal+=toTrip(premiumBlockInr);
          continue;
        }
        if(/spa|wellness|private|priority|cruise|yacht|premium|chef-led|workshop|class|producer/i.test(text)) componentActivityTotal+=toTrip(premiumBlockInr);
        else if(!/walk|beach|promenade|neighborhood|neighbourhood|free time/i.test(text)) componentActivityTotal+=toTrip(standardExperienceInr);
      }
    }
    // Keep a small floor for incidental paid sights, but never let a generic style multiplier
    // overwhelm the activities that are actually listed.
    const activityFloor=toTrip(Math.max(800, travelers*days*250));
    const componentEstimate=Math.max(activityFloor,componentActivityTotal);
    if(componentEstimate>0){
      calculated.sightseeing=Math.min(calculated.sightseeing,componentEstimate);
      calculated.miscellaneous=Math.round((calculated.hotel+calculated.food+calculated.localTransport+calculated.sightseeing)*0.06);
      calculated.grandTotal=calculated.flight+calculated.hotel+calculated.food+calculated.localTransport+calculated.sightseeing+calculated.visaAndInsurance+calculated.miscellaneous;
      calculated.expectedMin=Math.round(calculated.grandTotal*0.92);
      calculated.expectedMax=Math.round(calculated.grandTotal*1.08);
      calculated.averageDailyBudgetNum=Math.round(calculated.grandTotal/days);
      const f=(n:number)=>`${currencySym}${Math.max(0,Math.round(n)).toLocaleString()}`;
      calculated.formatted.sightseeing=f(calculated.sightseeing);
      calculated.formatted.miscellaneous=f(calculated.miscellaneous);
      calculated.formatted.grandTotal=f(calculated.grandTotal);
      calculated.formatted.expectedRange=`${f(calculated.expectedMin)} - ${f(calculated.expectedMax)}`;
      calculated.formatted.averageDailyBudget=f(calculated.averageDailyBudgetNum);
    }
  }

  const grandTotalNum = calculated.grandTotal;
  const rawPlannedBudgetNum = parseNumericValue(userBudgetInput);
  const isRecommendedMode = Boolean(itinerary.isAiBudgetPlanner);
  // In AI-recommended mode, the recommendation includes a practical 10% safety buffer,
  // while realisticEstimatedCost remains the deterministic expected trip cost.
  const recommendedSafeBudgetNum = Math.ceil((grandTotalNum * 1.10) / 100) * 100;
  const plannedBudgetNum = isRecommendedMode ? recommendedSafeBudgetNum : rawPlannedBudgetNum;
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
  if (isRecommendedMode) {
    itinerary.aiBudgetSummary = `Expected trip cost is ${calculated.formatted.grandTotal}. AI recommended safe budget: ${plannedBudgetFormatted}, including a practical buffer for normal price variation. Expected planning range: ${calculated.formatted.expectedRange}.`;
  } else if (plannedBudgetNum > 0) {
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

  // Reconcile day-by-day ON-TRIP spend from CATEGORY allocations first.
  // Each visible daily component is an authoritative slice of the trip-level category,
  // and dailyBudget is then derived from those components. This guarantees that:
  //   1) each day's visible components add exactly to that day's displayed total; and
  //   2) all days together add exactly to every trip-level category total.
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    const dayCount = itinerary.days.length;
    const parseMoney = (value: any): number => {
      if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
      const text = String(value ?? "").replace(/,/g, "");
      if (/\bfree\b|included/i.test(text)) return 0;
      const match = text.match(/[0-9]+(?:\.[0-9]+)?/);
      if (!match) return 0;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    // Exact integer distributor: rounds the whole pool once and assigns every rupee.
    const distributeExact = (total: number, weights: number[]): number[] => {
      const target = Math.max(0, Math.round(total));
      if (!weights.length) return [];
      const safeWeights = weights.map(w => Number.isFinite(w) && w > 0 ? w : 0);
      const weightSum = safeWeights.reduce((a, b) => a + b, 0);
      const effective = weightSum > 0 ? safeWeights : weights.map(() => 1);
      const effectiveSum = effective.reduce((a, b) => a + b, 0) || 1;
      const raw = effective.map(w => target * w / effectiveSum);
      const base = raw.map(v => Math.floor(v));
      let remainder = target - base.reduce((a, b) => a + b, 0);
      const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
      for (let k = 0; k < remainder; k++) base[order[k % order.length].i] += 1;
      return base;
    };

    const stayNights = Math.min(dayCount, calculateHotelNights(itinerary.startDate, itinerary.endDate, dayCount));
    const hotelWeights = itinerary.days.map((_: any, idx: number) => idx < stayNights ? 1 : 0);
    const evenWeights = itinerary.days.map(() => 1);
    // Weight day-level allocations by the itinerary actually shown to the user.
    // This avoids mechanically identical day budgets when one day contains substantially
    // more meals, transfers or paid experiences than another.
    const foodWeights = itinerary.days.map((day: any) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      const mealCount = activities.filter((a:any)=>/(breakfast|brunch|lunch|dinner|restaurant|meal)/i.test(`${a?.title||''} ${a?.description||''}`)).length;
      const tastingCount = activities.filter((a:any)=>/(tasting|dessert|cafe|coffee|tea|market|food walk|culinary)/i.test(`${a?.title||''} ${a?.description||''}`)).length;
      return Math.max(0.5, mealCount * 1.0 + tastingCount * 0.35);
    });
    const transportWeights = itinerary.days.map((day:any)=>{
      const activities = Array.isArray(day.activities) ? day.activities : [];
      const km = activities.reduce((sum:number,a:any)=>sum + (Number(a?.distanceFromPreviousKm)||0),0);
      const transferBlocks = activities.filter((a:any)=>/(transfer|chauffeur|taxi|rideshare|private car|tour vehicle)/i.test(`${a?.title||''} ${a?.transportFromPrevious||''}`)).length;
      return Math.max(0.5, km + transferBlocks * 4);
    });
    const activityWeights = itinerary.days.map((day: any) => {
      const activities = Array.isArray(day.activities) ? day.activities : [];
      const paid = activities.reduce((sum: number, activity: any) => sum + parseMoney(activity?.cost), 0);
      const experienceCount = activities.filter((a:any)=>!/(breakfast|brunch|lunch|dinner|restaurant|meal|transfer|check[- ]?in|check[- ]?out)/i.test(`${a?.title||''}`)).length;
      return Math.max(0.5, paid + experienceCount * 10);
    });

    const hotelByDay = distributeExact(calculated.hotel, hotelWeights);
    const foodByDay = distributeExact(calculated.food, foodWeights);
    const transportByDay = distributeExact(calculated.localTransport, transportWeights);
    const miscByDay = distributeExact(calculated.miscellaneous, evenWeights);
    const activitiesByDay = distributeExact(calculated.sightseeing, activityWeights);

    const fmtDayPart = (value: number) => `${currencySym}${Math.max(0, Math.round(value)).toLocaleString()}`;

    itinerary.days.forEach((day: any, idx: number) => {
      const parts = [
        hotelByDay[idx] || 0,
        foodByDay[idx] || 0,
        transportByDay[idx] || 0,
        activitiesByDay[idx] || 0,
        miscByDay[idx] || 0
      ];
      const dayAlloc = parts.reduce((sum, value) => sum + value, 0);
      const formattedDay = fmtDayPart(dayAlloc);
      day.dailyBudget = formattedDay;
      day.estimatedTotalSpend = formattedDay;
      day.dailyCostBreakdown = {
        accommodation: fmtDayPart(parts[0]),
        food: fmtDayPart(parts[1]),
        localTransport: fmtDayPart(parts[2]),
        activities: fmtDayPart(parts[3]),
        miscellaneous: fmtDayPart(parts[4])
      };
    });
  }


  // GLOBAL CURRENCY NORMALIZATION
  // The deterministic calculator is authoritative for every monetary display.
  // AI may suggest names/descriptions, but it must not control currency or raw price scale.
  const fmtMoney = (value: number) => `${currencySym}${Math.max(0, Math.round(value)).toLocaleString()}`;

  // Keep standard attraction admission separate from premium tour/service spend.
  // This prevents a small entry ticket from inheriting the whole sightseeing pool.
  if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
    const firstMoneyNumber = (value:any):number => { const text=String(value??"").replace(/,/g,""); if(/\bfree\b|included/i.test(text))return 0; const m=text.match(/[0-9]+(?:\.[0-9]+)?/); return m?Math.max(0,Number(m[0])||0):0; };
    const key=(v:any)=>String(v||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\b(the|a|an|private|priority|visit|experience|tour|guided|at|to|of|and)\b/g," ").replace(/\s+/g," ").trim();
    const neutralAdmissionBudget = calculateRealWorldBudget({ destination, origin, travelers, days, travelStyle:'Budget', userBudgetInput, flightEstimateInr:Number(itinerary.flightEstimateInr)||undefined, startDate:itinerary.startDate, endDate:itinerary.endDate });
    const places=Array.isArray(itinerary.placesToVisit)?itinerary.placesToVisit:[];
    const paidCount=Math.max(1,places.filter((p:any)=>!/\bfree\b/i.test(String(p?.entryFee||""))).length);
    const standardAdmission=Math.max(0,neutralAdmissionBudget.sightseeing/travelers/paidCount);
    const placeFees=places.map((p:any)=>({key:key(p?.name),free:/\bfree\b/i.test(String(p?.entryFee||"")),fee:/\bfree\b/i.test(String(p?.entryFee||""))?0:standardAdmission})).filter((p:any)=>p.key);
    const serviceRows:Array<{activity:any;weight:number}>=[]; let fixedAdmissionTotal=0;
    itinerary.days.forEach((day:any)=>{ (Array.isArray(day?.activities)?day.activities:[]).forEach((activity:any)=>{
      const raw=String(activity?.cost??""); const ak=key(`${activity?.title||""} ${activity?.location||""}`);
      const isTransfer=/(transfer|chauffeur|drive|travel to|pickup|drop[- ]?off)/i.test(String(activity?.title||""));
      const matched=isTransfer ? undefined : placeFees.find((p:any)=>ak.includes(p.key)||p.key.includes(ak));
      if(matched){ if(matched.free)activity.cost="Free"; else { const fee=Math.max(1,Math.round(matched.fee)); activity.cost=fmtMoney(fee); fixedAdmissionTotal+=fee; } return; }
      const weight=firstMoneyNumber(raw); if(/\bfree\b|included/i.test(raw)||weight<=0){ if(!raw.trim()||/\bfree\b|included/i.test(raw))activity.cost="Free"; return; } serviceRows.push({activity,weight});
    }); });
    const remaining=Math.max(0,Math.round(calculated.sightseeing-fixedAdmissionTotal));
    if(serviceRows.length){ const totalWeight=serviceRows.reduce((n,r)=>n+r.weight,0)||serviceRows.length; let allocated=0; serviceRows.forEach((r,i)=>{ const amount=i===serviceRows.length-1?Math.max(0,remaining-allocated):Math.max(0,Math.round(remaining*r.weight/totalWeight)); allocated+=amount; r.activity.cost=amount>0?fmtMoney(amount):"Free / Included"; }); }
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
      const variation = [0.92, 1.00, 1.08];
      list.forEach((h: any, index: number) => {
        const variedRate = baseNight * factor * variation[index % variation.length];
        h.pricePerNight = `${fmtMoney(variedRate)}/night estimated`;
      });
    };
    // Align the recommended hotel tier with the actual accommodation allowance.
    // Keep this logic local to reconciliation so it cannot reference variables from
    // calculateRealWorldBudget() and cannot break trip generation at runtime.
    const hotelStyleKey = String(travelStyle || "Mid-range").toLowerCase();
    const selectedHotelTier = /luxury|honeymoon|wellness|spa/.test(hotelStyleKey)
      ? "luxury"
      : /budget|backpacker/.test(hotelStyleKey)
        ? "budget"
        : "mid";

    const budgetHotelFactor = selectedHotelTier === "budget" ? 1.00 : selectedHotelTier === "mid" ? 0.58 : 0.38;
    const midHotelFactor = selectedHotelTier === "budget" ? 1.85 : selectedHotelTier === "mid" ? 1.00 : 0.68;
    const luxuryHotelFactor = selectedHotelTier === "budget" ? 4.25 : selectedHotelTier === "mid" ? 2.35 : 1.00;

    setHotelTier(itinerary.hotelRecommendations.budget, budgetHotelFactor);
    setHotelTier(itinerary.hotelRecommendations.midRange, midHotelFactor);
    setHotelTier(itinerary.hotelRecommendations.luxury, luxuryHotelFactor);
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

  // Attraction cards show STANDARD ENTRY estimates and must not become more expensive merely
  // because the user selected Luxury. Premium/private tours remain separate itinerary activities.
  if (Array.isArray(itinerary.placesToVisit) && itinerary.placesToVisit.length) {
    const neutralAdmissionBudget = calculateRealWorldBudget({
      destination, origin, travelers, days, travelStyle: 'Budget', userBudgetInput,
      flightEstimateInr: Number(itinerary.flightEstimateInr) || undefined, startDate: itinerary.startDate, endDate: itinerary.endDate
    });
    const paidPlaces = itinerary.placesToVisit.filter((p: any) => !/\bfree\b/i.test(String(p.entryFee || "")));
    const perPaidPlace = paidPlaces.length ? neutralAdmissionBudget.sightseeing / travelers / paidPlaces.length : 0;
    itinerary.placesToVisit.forEach((place: any) => {
      if (/\bfree\b/i.test(String(place.entryFee || ""))) place.entryFee = "Free";
      else place.entryFee = fmtMoney(perPaidPlace);
      place.entryFeeBasis = 'Standard entry estimate';
    });
    itinerary.attractionCosts = itinerary.placesToVisit.map((p: any) => ({ name: p.name, fee: p.entryFee, basis: p.entryFeeBasis }));
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
            h.pricePerNight = `${currencySym}${Math.round(calculated.hotel / (nightsForRates * roomsForRates * 2)).toLocaleString()}/night`;
          }
        });
      }
    } else if (styleLower.includes("luxury") || styleLower.includes("vip")) {
      if (hr.luxury) {
        hr.luxury.forEach((h: any) => {
          if (!h.pricePerNight || h.pricePerNight.includes("NaN")) {
            h.pricePerNight = `${currencySym}${Math.round(calculated.hotel / (nightsForRates * roomsForRates)).toLocaleString()}/night`;
          }
        });
      }
    }
  }

  return itinerary;
};
