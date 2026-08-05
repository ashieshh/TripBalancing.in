// Central travel budget calculator.
// All calculations use numeric values; formatting is applied only for display.

export interface BudgetFactorsInput {
  destination: string;
  origin?: string;
  travelers: number;
  days: number;
  travelStyle: string;
  userBudgetInput?: string | number;
  includeFlights?: boolean;
}

export interface CalculatedCategoryBreakdown {
  plannedBudget: number;
  flight: number;
  hotel: number;
  food: number;
  localTransport: number;
  sightseeing: number;
  visaAndInsurance: number;
  miscellaneous: number;
  grandTotal: number;
  expectedMin: number;
  expectedMax: number;
  averageDailyBudgetNum: number;
  currencySymbol: string;
  isBudgetTooLow: boolean;
  warningMessage?: string;
  formatted: {
    plannedBudget: string;
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
}

export const parseNumericValue = (value?: string | number | null): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const detectCurrencySymbol = (value?: string | number): string => {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (value.includes("₹") || normalized.includes("inr") || normalized.includes("rs")) return "₹";
    if (value.includes("€") || normalized.includes("eur")) return "€";
    if (value.includes("£") || normalized.includes("gbp")) return "£";
    if (normalized.includes("aed")) return "AED ";
    if (value.includes("$") || normalized.includes("usd")) return "$";
  }
  return "₹";
};

type CostTier = "low" | "medium" | "high";
type NormalizedStyle = "budget" | "mid" | "premium" | "luxury";

const normalizeStyle = (styleValue: string): NormalizedStyle => {
  const style = (styleValue || "mid-range").toLowerCase();
  if (style.includes("luxury") || style.includes("vip")) return "luxury";
  if (style.includes("premium")) return "premium";
  if (style.includes("budget") || style.includes("backpack") || style.includes("solo")) return "budget";
  return "mid";
};

const getDestinationInfo = (destinationValue: string) => {
  const destination = (destinationValue || "").toLowerCase();
  const internationalKeywords = [
    "france", "paris", "italy", "rome", "spain", "germany", "uk", "london", "england",
    "usa", "america", "new york", "japan", "tokyo", "singapore", "dubai", "uae", "maldives",
    "thailand", "bali", "indonesia", "turkey", "greece", "portugal", "vietnam", "korea",
    "australia", "switzerland", "netherlands", "amsterdam", "austria", "vienna", "norway",
    "iceland", "canada", "egypt"
  ];
  const highCostKeywords = [
    "paris", "france", "london", "uk", "new york", "usa", "switzerland", "tokyo", "japan",
    "singapore", "dubai", "maldives", "sydney", "australia", "amsterdam", "vienna", "norway",
    "iceland", "rome", "italy", "barcelona", "spain"
  ];
  const mediumCostKeywords = [
    "bangkok", "thailand", "bali", "indonesia", "istanbul", "turkey", "prague", "budapest",
    "athens", "greece", "lisbon", "portugal", "kuala lumpur", "malaysia", "vietnam", "seoul",
    "goa", "kerala", "udaipur", "jaipur"
  ];

  const isInternational = internationalKeywords.some((keyword) => destination.includes(keyword));
  const tier: CostTier = highCostKeywords.some((keyword) => destination.includes(keyword))
    ? "high"
    : mediumCostKeywords.some((keyword) => destination.includes(keyword))
      ? "medium"
      : "low";

  return { isInternational, tier };
};

const convertFromInr = (amount: number, symbol: string): number => {
  const rates: Record<string, number> = {
    "₹": 1,
    "$": 85,
    "€": 92,
    "£": 108,
    "AED ": 23
  };
  return amount / (rates[symbol] || 1);
};

const formatAmount = (amount: number, symbol: string): string => {
  const rounded = Math.round(amount);
  return `${symbol}${rounded.toLocaleString("en-IN")}`;
};

export const calculateRealWorldBudget = (input: BudgetFactorsInput): CalculatedCategoryBreakdown => {
  const travelers = Math.max(1, Math.floor(Number(input.travelers) || 1));
  const days = Math.max(1, Math.floor(Number(input.days) || 1));
  const nights = Math.max(1, days - 1);
  const rooms = Math.max(1, Math.ceil(travelers / 2));
  const style = normalizeStyle(input.travelStyle);
  const { tier, isInternational } = getDestinationInfo(input.destination);
  const currencySymbol = detectCurrencySymbol(input.userBudgetInput);
  const plannedBudget = parseNumericValue(input.userBudgetInput);
  const includeFlights = input.includeFlights !== false;

  const rateTable = {
    budget: {
      flightDomestic: 7000, flightInternationalMedium: 28000, flightInternationalHigh: 60000,
      hotelLow: 2200, hotelMedium: 4500, hotelHigh: 8000,
      foodLow: 800, foodMedium: 1400, foodHigh: 2600,
      transportLow: 450, transportMedium: 800, transportHigh: 1400,
      activitiesLow: 600, activitiesMedium: 1000, activitiesHigh: 1800,
      contingency: 0.05
    },
    mid: {
      flightDomestic: 12000, flightInternationalMedium: 45000, flightInternationalHigh: 90000,
      hotelLow: 5000, hotelMedium: 10000, hotelHigh: 22000,
      foodLow: 1800, foodMedium: 3500, foodHigh: 7000,
      transportLow: 900, transportMedium: 1800, transportHigh: 3500,
      activitiesLow: 1400, activitiesMedium: 2800, activitiesHigh: 5500,
      contingency: 0.07
    },
    premium: {
      flightDomestic: 22000, flightInternationalMedium: 80000, flightInternationalHigh: 150000,
      hotelLow: 12000, hotelMedium: 25000, hotelHigh: 50000,
      foodLow: 4200, foodMedium: 8000, foodHigh: 14000,
      transportLow: 2500, transportMedium: 5000, transportHigh: 9000,
      activitiesLow: 3500, activitiesMedium: 7000, activitiesHigh: 12000,
      contingency: 0.10
    },
    luxury: {
      flightDomestic: 40000, flightInternationalMedium: 130000, flightInternationalHigh: 250000,
      hotelLow: 25000, hotelMedium: 50000, hotelHigh: 110000,
      foodLow: 8000, foodMedium: 15000, foodHigh: 25000,
      transportLow: 6000, transportMedium: 12000, transportHigh: 22000,
      activitiesLow: 8000, activitiesMedium: 15000, activitiesHigh: 28000,
      contingency: 0.12
    }
  } as const;

  const rates = rateTable[style];
  const tierSuffix = tier === "high" ? "High" : tier === "medium" ? "Medium" : "Low";

  const flightPerTravelerInr = isInternational
    ? (tier === "high" ? rates.flightInternationalHigh : rates.flightInternationalMedium)
    : rates.flightDomestic;
  const hotelPerRoomNightInr = rates[`hotel${tierSuffix}` as keyof typeof rates] as number;
  const foodPerTravelerDayInr = rates[`food${tierSuffix}` as keyof typeof rates] as number;
  const transportPerTravelerDayInr = rates[`transport${tierSuffix}` as keyof typeof rates] as number;
  const activityPerTravelerDayInr = rates[`activities${tierSuffix}` as keyof typeof rates] as number;
  const visaInsurancePerTravelerInr = isInternational ? (tier === "high" ? 18000 : 9000) : 1000;

  const flight = includeFlights ? Math.round(convertFromInr(flightPerTravelerInr * travelers, currencySymbol)) : 0;
  const hotel = Math.round(convertFromInr(hotelPerRoomNightInr * nights * rooms, currencySymbol));
  const food = Math.round(convertFromInr(foodPerTravelerDayInr * days * travelers, currencySymbol));
  const localTransport = Math.round(convertFromInr(transportPerTravelerDayInr * days * travelers, currencySymbol));
  const sightseeing = Math.round(convertFromInr(activityPerTravelerDayInr * days * travelers, currencySymbol));
  const visaAndInsurance = Math.round(convertFromInr(visaInsurancePerTravelerInr * travelers, currencySymbol));

  const subtotalBeforeContingency = flight + hotel + food + localTransport + sightseeing + visaAndInsurance;
  const miscellaneous = Math.round(subtotalBeforeContingency * rates.contingency);
  const grandTotal = subtotalBeforeContingency + miscellaneous;
  const expectedMin = Math.round(grandTotal * 0.9);
  const expectedMax = Math.round(grandTotal * 1.15);
  const averageDailyBudgetNum = Math.round((food + localTransport + sightseeing + miscellaneous) / days);
  const isBudgetTooLow = plannedBudget > 0 && plannedBudget < expectedMin;

  const warningMessage = isBudgetTooLow
    ? `Your planned budget of ${formatAmount(plannedBudget, currencySymbol)} is below the estimated minimum of ${formatAmount(expectedMin, currencySymbol)} for a ${input.travelStyle || "Mid-range"} trip to ${input.destination}. Increase the budget, shorten the trip, or choose a more economical travel style.`
    : undefined;

  return {
    plannedBudget,
    flight,
    hotel,
    food,
    localTransport,
    sightseeing,
    visaAndInsurance,
    miscellaneous,
    grandTotal,
    expectedMin,
    expectedMax,
    averageDailyBudgetNum,
    currencySymbol,
    isBudgetTooLow,
    warningMessage,
    formatted: {
      plannedBudget: plannedBudget > 0 ? formatAmount(plannedBudget, currencySymbol) : "Not specified",
      flight: includeFlights ? formatAmount(flight, currencySymbol) : "Excluded",
      hotel: formatAmount(hotel, currencySymbol),
      food: formatAmount(food, currencySymbol),
      localTransport: formatAmount(localTransport, currencySymbol),
      sightseeing: formatAmount(sightseeing, currencySymbol),
      visaAndInsurance: formatAmount(visaAndInsurance, currencySymbol),
      miscellaneous: formatAmount(miscellaneous, currencySymbol),
      grandTotal: formatAmount(grandTotal, currencySymbol),
      expectedRange: `${formatAmount(expectedMin, currencySymbol)} – ${formatAmount(expectedMax, currencySymbol)}`,
      averageDailyBudget: formatAmount(averageDailyBudgetNum, currencySymbol)
    }
  };
};

export const reconcileItineraryBudget = (source: any): any => {
  if (!source || typeof source !== "object") return source;

  const itinerary = structuredClone(source);
  const days = Math.max(1, Array.isArray(itinerary.days) ? itinerary.days.length : 1);
  const originalPlannedBudget = itinerary.plannedBudget || itinerary.budgetAmount;

  const calculated = calculateRealWorldBudget({
    destination: itinerary.destination || "Destination",
    origin: itinerary.origin || "",
    travelers: Math.max(1, Number.parseInt(String(itinerary.travelers || 1), 10) || 1),
    days,
    travelStyle: itinerary.travelStyle || "Mid-range",
    userBudgetInput: originalPlannedBudget,
    includeFlights: itinerary.includeFlights !== false
  });

  // Preserve what the user entered and store the calculated estimate separately.
  itinerary.plannedBudget = calculated.formatted.plannedBudget;
  itinerary.budgetAmount = calculated.formatted.plannedBudget;
  itinerary.realisticEstimatedCost = calculated.formatted.grandTotal;
  itinerary.expectedRange = calculated.formatted.expectedRange;
  itinerary.averageDailyBudget = calculated.formatted.averageDailyBudget;
  itinerary.budgetWarning = calculated.warningMessage;

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

  itinerary.detailedBudgetSummary = {
    accommodationTotal: calculated.formatted.hotel,
    foodTotal: calculated.formatted.food,
    localTransportTotal: calculated.formatted.localTransport,
    attractionTotal: calculated.formatted.sightseeing,
    miscellaneousExpenses: calculated.formatted.miscellaneous,
    originToDestinationCost: calculated.formatted.flight,
    visaAndInsurance: calculated.formatted.visaAndInsurance,
    grandTotal: calculated.formatted.grandTotal
  };

  const onGroundTotal = calculated.food + calculated.localTransport + calculated.sightseeing + calculated.miscellaneous;
  const dailyBase = Math.floor(onGroundTotal / days);
  let remainder = onGroundTotal - dailyBase * days;

  if (Array.isArray(itinerary.days)) {
    itinerary.days = itinerary.days.map((day: any, index: number) => {
      const allocation = dailyBase + (index === 0 ? remainder : 0);
      return {
        ...day,
        dailyBudget: formatAmount(allocation, calculated.currencySymbol)
      };
    });
  }

  return itinerary;
};
