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

const INR_PER_CURRENCY_UNIT: Record<TripCurrencyCode, number> = {
  INR: 1,
  USD: 85,
  EUR: 100,
  GBP: 116,
  AED: 23.15,
  JPY: 0.58,
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
  amountInr / INR_PER_CURRENCY_UNIT[code];
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
  const nights = Math.max(1, days - 1);
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
  // A route is international when either endpoint is recognized as foreign.
  // This prevents foreign-origin trips to India (for example Paris -> Mumbai)
  // from falling through to the Rs. 4,000 domestic transit baseline.
  const isInternational = destinationInfo.isInternational || originInfo.isInternational;
  const routeTier: 1 | 2 | 3 = isInternational
    ? (Math.min(destinationInfo.tier, originInfo.tier) as 1 | 2 | 3)
    : destinationInfo.tier;
  const hasOrigin = Boolean(input.origin && input.origin.trim() !== "");
  const currencyCode = detectCurrencyCode(input.userBudgetInput, input.destination);
  const currencySymbol = currencySymbolFor(currencyCode);
  const fromInr = (amountInr: number) => convertInrToTripCurrency(amountInr, currencyCode);

  // 1. Flight / Transit Cost per traveler (Roundtrip)
  let flightCostPerPerson = 0;
  if (hasOrigin || isInternational) {
    if (isInternational) {
      if (routeTier === 1) { // Long-haul / high-cost international route
        flightCostPerPerson = style === "budget" ? 55000 : style === "mid" ? 85000 : 220000;
      } else { // Short-haul international
        flightCostPerPerson = style === "budget" ? 18000 : style === "mid" ? 28000 : 65000;
      }
    } else { // Domestic flight/train
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
  if (isInternational) {
    visaInsurancePerPerson = tier === 1 ? 16500 : 6500;
  } else {
    visaInsurancePerPerson = 600; // Basic trip insurance/pass
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
  const shortfallNum = plannedBudgetNum > 0 ? Math.max(0, grandTotalNum - plannedBudgetNum) : 0;
  const remainingBudgetNum = plannedBudgetNum > 0 ? Math.max(0, plannedBudgetNum - grandTotalNum) : 0;

  itinerary.budgetShortfall = `${currencySym}${Math.round(shortfallNum).toLocaleString()}`;
  // Never trust an AI-generated leftover value. Remaining budget is always
  // planned budget minus the exact same realistic grand total used everywhere else.
  itinerary.remainingBudget = `${currencySym}${Math.round(remainingBudgetNum).toLocaleString()}`;
  itinerary.budgetStatus = plannedBudgetNum <= 0
    ? "no_budget"
    : plannedBudgetNum < calculated.expectedMin
      ? "insufficient"
      : plannedBudgetNum < grandTotalNum
        ? "tight"
        : "comfortable";

  if (calculated.isBudgetTooLow) {
    itinerary.budgetWarning = calculated.warningMessage;
  } else {
    delete itinerary.budgetWarning;
  }

  // Grand total invariant: every component below, including visa/insurance and origin travel, is included in total.
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

  // Reconcile day-by-day budgets using the same allocation rules as the PDF.
  // Shared costs are spread across days, activity costs follow the actual day,
  // and long-distance travel + visa/insurance are assigned to Day 1.
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
    const sharedDaily = (calculated.hotel + calculated.food + calculated.localTransport + calculated.miscellaneous) / dayCount;
    let allocatedSoFar = 0;

    itinerary.days.forEach((day: any, idx: number) => {
      const allocatedActivities = allActivitySubtotal > 0
        ? calculated.sightseeing * activitySubtotals[idx] / allActivitySubtotal
        : calculated.sightseeing / dayCount;
      const tripLevelCosts = idx === 0 ? calculated.flight + calculated.visaAndInsurance : 0;
      const rawDayTotal = sharedDaily + allocatedActivities + tripLevelCosts;
      const isLastDay = idx === dayCount - 1;
      const dayAlloc = isLastDay
        ? Math.max(0, Math.round(grandTotalNum - allocatedSoFar))
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
