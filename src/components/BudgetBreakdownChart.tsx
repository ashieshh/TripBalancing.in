import { useState, useEffect } from "react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { 
  Hotel, Utensils, Compass, Bus, Banknote, PieChart as ChartIcon, Info, Coins,
  ArrowRightLeft, Globe2, TrendingUp, Calendar, RefreshCw, AlertCircle, ShieldCheck,
  Car, Bike, Plane, MapPin, Star, ExternalLink, Train, Receipt, Sparkles, Ticket
} from "lucide-react";
import { BudgetBreakdown, LoggedExpense, Itinerary } from "../types";

interface BudgetBreakdownChartProps {
  breakdown: BudgetBreakdown;
  loggedExpenses?: LoggedExpense[];
  itinerary?: Itinerary;
}

// Helper to parse both min and max expected values from range strings
function parseBudgetRange(val: string | undefined | null): { min: number; max: number } {
  if (!val) return { min: 0, max: 0 };
  const clean = val.replace(/,/g, "");
  const matches = clean.match(/(\d+(?:\.\d+)?)/g);
  if (matches && matches.length >= 2) {
    const min = parseFloat(matches[0]);
    const max = parseFloat(matches[1]);
    return {
      min: isNaN(min) ? 0 : min,
      max: isNaN(max) ? 0 : max
    };
  } else if (matches && matches.length === 1) {
    const single = parseFloat(matches[0]);
    const valNum = isNaN(single) ? 0 : single;
    // For single values, define a small logical range around the cost for nicer min-max display
    return { 
      min: Math.round(valNum * 0.9), 
      max: Math.round(valNum * 1.1) 
    };
  }
  return { min: 0, max: 0 };
}

// Detect currency symbol safely
function detectCurrencySymbol(val: string | undefined | null): string {
  if (!val) return "₹";
  const trimmed = val.trim();
  const symbolMatch = trimmed.match(/^([^\d\s,]+)/);
  if (symbolMatch) {
    const possibleSymbol = symbolMatch[1];
    if (!/^[a-zA-Z0-9]+$/.test(possibleSymbol) || possibleSymbol.length <= 3) {
      return possibleSymbol;
    }
  }
  if (trimmed.toLowerCase().includes("usd") || trimmed.includes("$")) return "$";
  if (trimmed.toLowerCase().includes("inr") || trimmed.includes("₹")) return "₹";
  if (trimmed.toLowerCase().includes("eur") || trimmed.includes("€")) return "€";
  if (trimmed.toLowerCase().includes("gbp") || trimmed.includes("£")) return "£";
  
  return "₹";
}

const POPULAR_CURRENCIES: Record<string, { symbol: string; name: string }> = {
  INR: { symbol: "₹", name: "Indian Rupee" },
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  JPY: { symbol: "¥", name: "Japanese Yen" },
  AUD: { symbol: "A$", name: "Australian Dollar" },
  CAD: { symbol: "C$", name: "Canadian Dollar" },
  SGD: { symbol: "S$", name: "Singapore Dollar" },
  AED: { symbol: "د.إ", name: "UAE Dirham" },
  CHF: { symbol: "CHF", name: "Swiss Franc" },
  THB: { symbol: "฿", name: "Thai Baht" },
  CNY: { symbol: "¥", name: "Chinese Yuan" },
};

const FALLBACK_RATES_TO_USD: Record<string, number> = {
  USD: 1.00,
  EUR: 0.92,
  INR: 83.50,
  GBP: 0.78,
  JPY: 161.20,
  AUD: 1.49,
  CAD: 1.36,
  SGD: 1.34,
  AED: 3.67,
  CHF: 0.89,
  THB: 36.40,
  CNY: 7.25,
};

function detectBaseCurrencyCode(val: string | undefined | null): string {
  if (!val) return "INR";
  const trimmed = val.toLowerCase();
  if (trimmed.includes("inr") || trimmed.includes("₹")) return "INR";
  if (trimmed.includes("usd") || trimmed.includes("$")) return "USD";
  if (trimmed.includes("eur") || trimmed.includes("€")) return "EUR";
  if (trimmed.includes("gbp") || trimmed.includes("£")) return "GBP";
  if (trimmed.includes("jpy") || trimmed.includes("¥")) return "JPY";
  if (trimmed.includes("aud") || trimmed.includes("a$")) return "AUD";
  if (trimmed.includes("cad") || trimmed.includes("c$")) return "CAD";
  if (trimmed.includes("sgd") || trimmed.includes("s$")) return "SGD";
  if (trimmed.includes("aed") || trimmed.includes("د.إ")) return "AED";
  if (trimmed.includes("chf")) return "CHF";
  if (trimmed.includes("thb") || trimmed.includes("฿")) return "THB";
  if (trimmed.includes("cny")) return "CNY";
  return "INR";
}

export default function BudgetBreakdownChart({ breakdown, loggedExpenses = [], itinerary }: BudgetBreakdownChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedHotelTier, setSelectedHotelTier] = useState<"budget" | "midRange" | "luxury">("midRange");

  // Detect currency symbol from any available string
  const currencySymbol = detectCurrencySymbol(
    breakdown.total || breakdown.accommodation || breakdown.food || breakdown.activities || breakdown.transport
  );

  const destination = itinerary?.destination || "your destination";
  const accommodationTotalValue = parseBudgetRange(breakdown.accommodation || "0").max;
  const startMs = itinerary?.startDate ? new Date(`${itinerary.startDate}T00:00:00`).getTime() : NaN;
  const endMs = itinerary?.endDate ? new Date(`${itinerary.endDate}T00:00:00`).getTime() : NaN;
  const accommodationNights = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 86400000)) : 0;
  const accommodationPerNight = accommodationNights > 0 ? Math.round(accommodationTotalValue / accommodationNights) : 0;
  
  // Safe extraction of hotel recommendations with elegant fallbacks
  const hotelRecommendations = itinerary?.hotelRecommendations || {
    budget: [
      { name: "Eco Stay Hostel " + destination, pricePerNight: currencySymbol + "800", rating: 4.2, distanceFromCenter: "1.5 km", bookingLink: "#" },
      { name: "Central Tourist Inn", pricePerNight: currencySymbol + "1,200", rating: 4.0, distanceFromCenter: "2.1 km", bookingLink: "#" },
      { name: "Backpackers Haven", pricePerNight: currencySymbol + "700", rating: 4.5, distanceFromCenter: "0.8 km", bookingLink: "#" },
    ],
    midRange: [
      { name: "Grand Vista Hotel " + destination, pricePerNight: currencySymbol + "3,500", rating: 4.4, distanceFromCenter: "1.0 km", bookingLink: "#" },
      { name: "Urban Comfort Suites", pricePerNight: currencySymbol + "4,000", rating: 4.3, distanceFromCenter: "0.5 km", bookingLink: "#" },
      { name: "Green Garden Resort", pricePerNight: currencySymbol + "3,200", rating: 4.1, distanceFromCenter: "3.2 km", bookingLink: "#" },
    ],
    luxury: [
      { name: "The Royal Plaza Resort", pricePerNight: currencySymbol + "12,000", rating: 4.8, distanceFromCenter: "0.2 km", bookingLink: "#" },
      { name: "Serene Palms Luxury Villa", pricePerNight: currencySymbol + "15,000", rating: 4.9, distanceFromCenter: "4.5 km", bookingLink: "#" },
      { name: "Imperial Palace Hotel", pricePerNight: currencySymbol + "18,000", rating: 4.7, distanceFromCenter: "1.1 km", bookingLink: "#" },
    ]
  };

  const rawTransport = itinerary?.detailedTransportationCosts;
  const detailedTransportationCosts = {
    taxiStart: rawTransport?.taxiStart || currencySymbol + "60",
    taxiPerKm: rawTransport?.taxiPerKm || currencySymbol + "18",
    autoRickshaw: rawTransport?.autoRickshaw || currencySymbol + "40",
    busFare: rawTransport?.busFare || currencySymbol + "15",
    metroFare: rawTransport?.metroFare || currencySymbol + "25",
    trainFare: rawTransport?.trainFare || currencySymbol + "120",
    scooterRental: rawTransport?.scooterRental || currencySymbol + "400",
    carRental: rawTransport?.carRental || currencySymbol + "2,200",
    airportTransfer: rawTransport?.airportTransfer || currencySymbol + "800"
  };

  const rawFood = itinerary?.foodBudgetDaily;
  const foodBudgetDaily = {
    budget: rawFood?.budget || currencySymbol + "450",
    midRange: rawFood?.midRange || currencySymbol + "1,200",
    luxury: rawFood?.luxury || currencySymbol + "3,500"
  };

  const rawAttractions = itinerary?.attractionCosts;
  const attractionCosts = rawAttractions && rawAttractions.length > 0 
    ? rawAttractions.map(item => ({
        name: item.name,
        fee: item.fee
      }))
    : [
        { name: "Major Local Landmarks & Parks", fee: currencySymbol + "150" },
        { name: "Historical Museums & Forts", fee: currencySymbol + "250" },
        { name: "Guided Walking & Cultural Tours", fee: currencySymbol + "800" }
      ];

  const detailedBudgetSummary = itinerary?.detailedBudgetSummary || {
    accommodationTotal: breakdown.accommodation || (currencySymbol + "15,000"),
    foodTotal: breakdown.food || (currencySymbol + "8,000"),
    localTransportTotal: breakdown.transport || (currencySymbol + "3,500"),
    attractionTotal: breakdown.activities || (currencySymbol + "2,000"),
    miscellaneousExpenses: breakdown.miscellaneous || (currencySymbol + "1,500"),
    originToDestinationCost: itinerary?.origin ? (currencySymbol + "6,000 - " + currencySymbol + "12,000") : "N/A",
    grandTotal: breakdown.total || (currencySymbol + "30,000")
  };

  // Parse min and max expected costs
  const accommodationRange = parseBudgetRange(breakdown.accommodation);
  const foodRange = parseBudgetRange(breakdown.food);
  const activitiesRange = parseBudgetRange(breakdown.activities);
  const transportRange = parseBudgetRange(breakdown.transport);
  const miscRange = parseBudgetRange(breakdown.miscellaneous);
  const travelRange = parseBudgetRange(breakdown.originToDestinationTravel || detailedBudgetSummary.originToDestinationCost);
  const totalRange = parseBudgetRange(breakdown.total);

  // Fallbacks if total parsing is 0
  const calculatedMinSum = accommodationRange.min + foodRange.min + activitiesRange.min + transportRange.min + miscRange.min + (itinerary?.origin ? travelRange.min : 0);
  const calculatedMaxSum = accommodationRange.max + foodRange.max + activitiesRange.max + transportRange.max + miscRange.max + (itinerary?.origin ? travelRange.max : 0);

  const finalMinTotal = totalRange.min > 0 ? totalRange.min : (calculatedMinSum > 0 ? calculatedMinSum : 1);
  const finalMaxTotal = totalRange.max > 0 ? totalRange.max : (calculatedMaxSum > 0 ? calculatedMaxSum : 1);
  const averageTotal = (finalMinTotal + finalMaxTotal) / 2;

  // Aggregate actual spending by category
  const actualAccommodation = loggedExpenses
    .filter(e => e.category === "Accommodation")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const actualFood = loggedExpenses
    .filter(e => e.category === "Food")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const actualActivities = loggedExpenses
    .filter(e => e.category === "Activities")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const actualTransport = loggedExpenses
    .filter(e => e.category === "Transport")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const actualOther = loggedExpenses
    .filter(e => e.category === "Other")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalActualSpent = actualAccommodation + actualFood + actualActivities + actualTransport + actualOther;

  // Budget pace calculation
  const netVarianceMin = finalMinTotal - totalActualSpent;
  const netVarianceMax = finalMaxTotal - totalActualSpent;

  // Determine budget pace status
  let paceStatus = "within"; // within, under, over
  if (totalActualSpent < finalMinTotal) {
    paceStatus = "under";
  } else if (totalActualSpent > finalMaxTotal) {
    paceStatus = "over";
  }

  // Real-time currency converter states
  const detectedBase = detectBaseCurrencyCode(
    breakdown.total || breakdown.accommodation || breakdown.food || breakdown.activities || breakdown.transport
  );
  const [fromCurrency, setFromCurrency] = useState(detectedBase);
  const [toCurrency, setToCurrency] = useState(detectedBase === "INR" ? "USD" : "INR");
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesTimestamp, setRatesTimestamp] = useState<string | null>(null);

  // Auto-detect base currency if breakdown changes
  useEffect(() => {
    const detected = detectBaseCurrencyCode(
      breakdown.total || breakdown.accommodation || breakdown.food || breakdown.activities || breakdown.transport
    );
    setFromCurrency(detected);
    setToCurrency(detected === "INR" ? "USD" : "INR");
  }, [breakdown]);

  // Fetch live exchange rates
  useEffect(() => {
    let active = true;
    setLoadingRates(true);
    setRatesError(null);

    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch live exchange rates.");
        return res.json();
      })
      .then((data) => {
        if (active && data && data.rates) {
          setRates(data.rates);
          const updateTime = data.time_last_update_utc 
            ? new Date(data.time_last_update_utc).toLocaleTimeString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })
            : new Date().toLocaleTimeString();
          setRatesTimestamp(updateTime);
          setLoadingRates(false);
        }
      })
      .catch((err) => {
        console.error("Exchange rate API error:", err);
        if (active) {
          setRatesError("Could not retrieve real-time rates. Using offline fallback rates.");
          setLoadingRates(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const getExchangeRate = (from: string, to: string): number => {
    const rateFrom = rates?.[from] || FALLBACK_RATES_TO_USD[from] || 1;
    const rateTo = rates?.[to] || FALLBACK_RATES_TO_USD[to] || 1;
    return rateTo / rateFrom;
  };

  const activeRate = getExchangeRate(fromCurrency, toCurrency);
  const toSymbol = POPULAR_CURRENCIES[toCurrency]?.symbol || "";
  const fromSymbol = POPULAR_CURRENCIES[fromCurrency]?.symbol || currencySymbol;

  // Prepare Pie Chart data (using average of min and max for proportions)
  const averageAccommodation = (accommodationRange.min + accommodationRange.max) / 2;
  const averageFood = (foodRange.min + foodRange.max) / 2;
  const averageActivities = (activitiesRange.min + activitiesRange.max) / 2;
  const averageTransport = (transportRange.min + transportRange.max) / 2;
  const averageMisc = (miscRange.min + miscRange.max) / 2;
  const averageTravel = (travelRange.min + travelRange.max) / 2;

  const rawData = [
    { name: "Accommodation", value: averageAccommodation, rawText: breakdown.accommodation, icon: Hotel, color: "#14b8a6", min: accommodationRange.min, max: accommodationRange.max },
    { name: "Food & Meals", value: averageFood, rawText: breakdown.food, icon: Utensils, color: "#f59e0b", min: foodRange.min, max: foodRange.max },
    { name: "Attractions & Sights", value: averageActivities, rawText: breakdown.activities, icon: Compass, color: "#8b5cf6", min: activitiesRange.min, max: activitiesRange.max },
    { name: "Transportation", value: averageTransport, rawText: breakdown.transport, icon: Bus, color: "#0ea5e9", min: transportRange.min, max: transportRange.max },
    { name: "Miscellaneous", value: averageMisc, rawText: breakdown.miscellaneous || "Flexible", icon: Coins, color: "#6366f1", min: miscRange.min, max: miscRange.max },
    ...(itinerary?.origin && averageTravel > 0 ? [
      { name: `Travel from ${itinerary.origin}`, value: averageTravel, rawText: breakdown.originToDestinationTravel || detailedBudgetSummary.originToDestinationCost || "Flexible", icon: Plane, color: "#d946ef", min: travelRange.min, max: travelRange.max }
    ] : [])
  ];

  const chartData = rawData.filter(d => d.value > 0);
  const hasNoChartData = chartData.length === 0;

  const finalChartData = hasNoChartData 
    ? [
        { name: "Accommodation", value: 2500, rawText: "Flexible", icon: Hotel, color: "#14b8a6", min: 2000, max: 3000 },
        { name: "Food & Meals", value: 1500, rawText: "Flexible", icon: Utensils, color: "#f59e0b", min: 1000, max: 2000 },
        { name: "Attractions & Sights", value: 1000, rawText: "Flexible", icon: Compass, color: "#8b5cf6", min: 500, max: 1500 },
        { name: "Transportation", value: 800, rawText: "Flexible", icon: Bus, color: "#0ea5e9", min: 500, max: 1100 },
        { name: "Miscellaneous", value: 500, rawText: "Flexible", icon: Coins, color: "#6366f1", min: 300, max: 700 }
      ]
    : chartData;

  const totalForPercentages = finalChartData.reduce((acc, curr) => acc + curr.value, 0);

  // Prepare Bar Chart comparison data with min, max, and actual spent
  const barChartData = [
    { name: "Lodging", "Min Estimated": accommodationRange.min, "Max Estimated": accommodationRange.max, "Actual Spent": actualAccommodation },
    { name: "Food", "Min Estimated": foodRange.min, "Max Estimated": foodRange.max, "Actual Spent": actualFood },
    { name: "Attractions", "Min Estimated": activitiesRange.min, "Max Estimated": activitiesRange.max, "Actual Spent": actualActivities },
    { name: "Transport", "Min Estimated": transportRange.min, "Max Estimated": transportRange.max, "Actual Spent": actualTransport },
    ...(itinerary?.origin && travelRange.max > 0 ? [
      { name: "Travel Transit", "Min Estimated": travelRange.min, "Max Estimated": travelRange.max, "Actual Spent": 0 }
    ] : []),
    { name: "Misc & Other", "Min Estimated": miscRange.min, "Max Estimated": miscRange.max, "Actual Spent": actualOther }
  ];

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl p-6 space-y-9 shadow-sm transition-all">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <ChartIcon className="w-4 h-4" />
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Estimated Budget & Variance Tracker</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Highly realistic, destination-specific cost ranges comparing min/max estimates against your logged expenses.
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-150 dark:border-teal-900/35 text-teal-700 dark:text-teal-400 text-xs font-bold rounded-xl shadow-sm">
          <Banknote className="w-4 h-4" />
          <span>Estimated Budget Range: {breakdown.total || "Flexible"}</span>
        </div>
      </div>

      {/* Spending Tracker Variance Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Estimated Range */}
        <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Estimated Budget Range
            </span>
            <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
              {currencySymbol}{finalMinTotal.toLocaleString()} - {currencySymbol}{finalMaxTotal.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Actual Spending */}
        <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Actual Spent So Far
            </span>
            <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
              {currencySymbol}{totalActualSpent.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Variance Status and Pace */}
        <div className="bg-slate-50/50 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${
            paceStatus === "under" 
              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" 
              : paceStatus === "within"
              ? "bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400"
              : "bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400"
          }`}>
            {paceStatus === "under" ? (
              <span className="text-base font-bold">👍</span>
            ) : paceStatus === "within" ? (
              <span className="text-base font-bold">🎯</span>
            ) : (
              <span className="text-base font-bold">⚠️</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Pace Status
            </span>
            <p className={`text-sm font-black truncate mt-0.5 ${
              paceStatus === "under" 
                ? "text-emerald-650 dark:text-emerald-400" 
                : paceStatus === "within"
                ? "text-teal-650 dark:text-teal-400"
                : "text-rose-650 dark:text-rose-400"
            }`}>
              {paceStatus === "under" && `Under Budget (-${currencySymbol}${Math.abs(netVarianceMin).toLocaleString()})`}
              {paceStatus === "within" && "Right on Track (Within Range)"}
              {paceStatus === "over" && `Over Max Budget (+${currencySymbol}${Math.abs(netVarianceMax).toLocaleString()})`}
              <span className="text-[9px] font-bold block text-slate-400 dark:text-slate-500 mt-0.5">
                {paceStatus === "under" && "Safely below the minimum estimate"}
                {paceStatus === "within" && "Safely within the estimated threshold"}
                {paceStatus === "over" && "Exceeded maximum recommended average"}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Real-Time Local Currency Converter Section */}
      <div className="bg-gradient-to-br from-teal-500/5 via-emerald-500/5 to-cyan-500/5 dark:from-teal-950/10 dark:via-emerald-950/10 dark:to-cyan-950/10 border border-teal-500/10 dark:border-teal-400/10 rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-teal-500/10 dark:border-teal-500/20 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Interactive Currency Exchange (Estimated Cost Ranges)
              </h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Convert the estimated trip budget ranges instantly using live market exchange rates.
            </p>
          </div>

          <div className="flex-shrink-0">
            {loadingRates ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30 rounded-lg animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing rates...
              </span>
            ) : ratesError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                Offline Rates
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-lg" title={`Last updated: ${ratesTimestamp}`}>
                <Globe2 className="w-3 h-3 text-emerald-500 animate-pulse" />
                Live Rates Synced
              </span>
            )}
          </div>
        </div>

        {/* Currency Controls Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-9 items-center gap-4">
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
              Budget Base Currency
            </label>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              {Object.entries(POPULAR_CURRENCIES).map(([code, details]) => (
                <option key={code} value={code}>
                  {code} - {details.name} ({details.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1 flex justify-center pt-4 md:pt-5">
            <button
              onClick={() => {
                const temp = fromCurrency;
                setFromCurrency(toCurrency);
                setToCurrency(temp);
              }}
              className="p-2 bg-white hover:bg-teal-500/10 hover:text-teal-600 dark:bg-slate-900 dark:hover:bg-teal-500/20 dark:hover:text-teal-400 border border-slate-200 dark:border-slate-800 rounded-full text-slate-500 transition-all cursor-pointer active:scale-90 shadow-sm"
              title="Swap Currencies"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
              User's Local Currency
            </label>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
            >
              {Object.entries(POPULAR_CURRENCIES).map(([code, details]) => (
                <option key={code} value={code}>
                  {code} - {details.name} ({details.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Converted Values Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-2">
          {/* Accommodation */}
          <div className="bg-white dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-900 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-teal-500/10 text-teal-650 dark:text-teal-400 rounded-lg">
                <Hotel className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase">Lodging Range</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                  {toSymbol}{Math.round(accommodationRange.min * activeRate).toLocaleString()} - {toSymbol}{Math.round(accommodationRange.max * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold border-t border-slate-100 dark:border-slate-800/40 pt-1 mt-1 text-right">
              Est. Base: {fromSymbol}{accommodationRange.min.toLocaleString()} - {accommodationRange.max.toLocaleString()}
            </span>
          </div>

          {/* Food */}
          <div className="bg-white dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-900 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500/10 text-amber-650 dark:text-amber-400 rounded-lg">
                <Utensils className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase">Dining Range</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                  {toSymbol}{Math.round(foodRange.min * activeRate).toLocaleString()} - {toSymbol}{Math.round(foodRange.max * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold border-t border-slate-100 dark:border-slate-800/40 pt-1 mt-1 text-right">
              Est. Base: {fromSymbol}{foodRange.min.toLocaleString()} - {foodRange.max.toLocaleString()}
            </span>
          </div>

          {/* Activities */}
          <div className="bg-white dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-900 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-purple-500/10 text-purple-655 dark:text-purple-400 rounded-lg">
                <Compass className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase">Attractions Range</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                  {toSymbol}{Math.round(activitiesRange.min * activeRate).toLocaleString()} - {toSymbol}{Math.round(activitiesRange.max * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold border-t border-slate-100 dark:border-slate-800/40 pt-1 mt-1 text-right">
              Est. Base: {fromSymbol}{activitiesRange.min.toLocaleString()} - {activitiesRange.max.toLocaleString()}
            </span>
          </div>

          {/* Transportation */}
          <div className="bg-white dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-900 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-500/10 text-sky-650 dark:text-sky-400 rounded-lg">
                <Bus className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase">Transport Range</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                  {toSymbol}{Math.round(transportRange.min * activeRate).toLocaleString()} - {toSymbol}{Math.round(transportRange.max * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold border-t border-slate-100 dark:border-slate-800/40 pt-1 mt-1 text-right">
              Est. Base: {fromSymbol}{transportRange.min.toLocaleString()} - {transportRange.max.toLocaleString()}
            </span>
          </div>

          {/* Miscellaneous */}
          <div className="bg-white dark:bg-slate-900/40 p-3.5 rounded-xl border border-slate-150/60 dark:border-slate-900 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 rounded-lg">
                <Coins className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase">Misc & Shopping</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
                  {toSymbol}{Math.round(miscRange.min * activeRate).toLocaleString()} - {toSymbol}{Math.round(miscRange.max * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold border-t border-slate-100 dark:border-slate-800/40 pt-1 mt-1 text-right">
              Est. Base: {fromSymbol}{miscRange.min.toLocaleString()} - {miscRange.max.toLocaleString()}
            </span>
          </div>

          {/* Converted Total */}
          <div className="bg-teal-500/10 dark:bg-teal-950/35 p-3.5 rounded-xl border border-teal-500/20 flex flex-col justify-between gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-teal-500 text-white rounded-lg">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
              <div>
                <span className="text-[9px] font-extrabold text-teal-650 dark:text-teal-400 block uppercase">Est. Total Range</span>
                <span className="text-[11px] font-black text-teal-750 dark:text-teal-300">
                  {toSymbol}{Math.round(finalMinTotal * activeRate).toLocaleString()} - {toSymbol}{Math.round(finalMaxTotal * activeRate).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-[9px] text-teal-600 dark:text-teal-450 font-bold border-t border-teal-500/10 pt-1 mt-1 text-right">
              Base: {fromSymbol}{finalMinTotal.toLocaleString()} - {finalMaxTotal.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Dual Graphs Visual Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Left Side: Pie Chart Card (Estimated Weight Proportions of Average Cost) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center relative bg-slate-50/20 dark:bg-slate-900/5 border border-slate-100 dark:border-slate-900/60 p-5 rounded-3xl min-h-[300px]">
          <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 text-center">
            AI-Estimated Cost Share (Average)
          </h4>

          {hasNoChartData && (
            <div className="absolute top-2 right-2 z-10">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-650 dark:text-amber-400 text-[10px] font-extrabold uppercase rounded-lg border border-amber-100/40">
                Visual Mock Mode
              </span>
            </div>
          )}

          <div className="w-full h-[220px] relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={finalChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  onMouseEnter={(_, idx) => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {finalChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                      className="transition-all duration-300 outline-none cursor-pointer"
                      stroke="rgba(0,0,0,0.05)"
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const percentage = totalForPercentages > 0 
                        ? Math.round((data.value / totalForPercentages) * 100) 
                        : 0;
                      return (
                        <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white p-3 rounded-xl border border-slate-800 shadow-xl text-xs space-y-1">
                          <p className="font-extrabold flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                            {data.name}
                          </p>
                          <p className="font-medium text-slate-300">
                            Est. Range: <span className="text-white font-bold">{currencySymbol}{data.min.toLocaleString()} - {currencySymbol}{data.max.toLocaleString()}</span>
                          </p>
                          <p className="text-[10px] text-teal-300 font-bold">
                            Share: ~{percentage}% of total budget
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Inner text block */}
            <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {activeIndex !== null ? finalChartData[activeIndex].name : "Estimated Avg"}
              </span>
              <span className="text-base font-black text-slate-800 dark:text-slate-100">
                {activeIndex !== null 
                  ? `${currencySymbol}${Math.round((finalChartData[activeIndex].min + finalChartData[activeIndex].max)/2).toLocaleString()}`
                  : `${currencySymbol}${Math.round(averageTotal).toLocaleString()}`
                }
              </span>
              <span className="text-[9px] font-bold text-slate-450 dark:text-slate-500">
                {activeIndex !== null 
                  ? `${Math.round((finalChartData[activeIndex].value / totalForPercentages) * 100)}% weight`
                  : "approx total"
                }
              </span>
            </div>
          </div>

          {/* Color Indicators */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
            {finalChartData.map((d, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-1 cursor-pointer"
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <span 
                  className="w-2 rounded-full h-2 transition-transform" 
                  style={{ backgroundColor: d.color, transform: activeIndex === idx ? 'scale(1.2)' : 'none' }} 
                />
                <span className={`text-[10px] font-bold ${activeIndex === idx ? "text-slate-800 dark:text-slate-200" : "text-slate-550 dark:text-slate-400"}`}>
                  {d.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Comparison Bar Chart (Est Range vs. Actual Spent) */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-50/20 dark:bg-slate-900/5 border border-slate-100 dark:border-slate-900/60 p-5 rounded-3xl min-h-[300px]">
          <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 text-center">
            Pacing Comparison: Min/Max Range vs. Actual Spent
          </h4>

          <div className="w-full h-[220px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.03)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white p-3.5 rounded-xl border border-slate-800 shadow-xl text-xs space-y-2">
                          <p className="font-extrabold text-slate-350 uppercase tracking-wider text-[10px]">{data.name}</p>
                          <div className="space-y-1">
                            <p className="font-semibold flex items-center justify-between gap-5 text-slate-300">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400"/>Min Estimated:</span>
                              <span className="font-extrabold text-white">{currencySymbol}{data["Min Estimated"]?.toLocaleString() || 0}</span>
                            </p>
                            <p className="font-semibold flex items-center justify-between gap-5 text-slate-300">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-600"/>Max Estimated:</span>
                              <span className="font-extrabold text-white">{currencySymbol}{data["Max Estimated"]?.toLocaleString() || 0}</span>
                            </p>
                            <p className="font-semibold flex items-center justify-between gap-5 text-rose-300">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"/>Actual Spent:</span>
                              <span className="font-extrabold text-white">{currencySymbol}{data["Actual Spent"]?.toLocaleString() || 0}</span>
                            </p>
                            {/* variance detail */}
                            {(() => {
                              const act = data["Actual Spent"] || 0;
                              const min = data["Min Estimated"] || 0;
                              const max = data["Max Estimated"] || 0;
                              if (act > 0) {
                                if (act < min) {
                                  return (
                                    <p className="text-[10px] font-black pt-1.5 border-t border-slate-800 text-emerald-400">
                                      Under Min Budget by {currencySymbol}{Math.round(min - act).toLocaleString()}
                                    </p>
                                  );
                                } else if (act > max) {
                                  return (
                                    <p className="text-[10px] font-black pt-1.5 border-t border-slate-800 text-rose-400">
                                      Over Max Budget by {currencySymbol}{Math.round(act - max).toLocaleString()}
                                    </p>
                                  );
                                } else {
                                  return (
                                    <p className="text-[10px] font-black pt-1.5 border-t border-slate-800 text-teal-400">
                                      Within Estimated Range
                                    </p>
                                  );
                                }
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend iconType="circle" align="center" verticalAlign="bottom" layout="horizontal" wrapperStyle={{ fontSize: 10, fontWeight: 'bold', paddingTop: 4 }} />
                <Bar name="Est. Min" dataKey="Min Estimated" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                <Bar name="Est. Max" dataKey="Max Estimated" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar name="Actual Spent" dataKey="Actual Spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 font-bold mt-2">
            "Misc & Other" captures shopping, souvenirs, and general transactions logged outside of core lodging/transit.
          </p>
        </div>

      </div>

      {/* Category Cost Breakdown Grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 pl-1">
          Detailed Estimated Cost Ranges per Category
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 w-full">
          {rawData.map((category) => {
            const hasValue = category.value > 0;
            const percentage = totalForPercentages > 0 && hasValue
              ? Math.round((category.value / totalForPercentages) * 100) 
              : 0;

            const CategoryIcon = category.icon;

            return (
              <div 
                key={category.name}
                className="p-4 bg-slate-50/55 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl flex flex-col justify-between gap-3 hover:shadow-sm hover:border-slate-200 dark:hover:border-slate-850 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div 
                    className="p-2.5 rounded-xl border flex-shrink-0"
                    style={{ 
                      backgroundColor: `${category.color}12`, 
                      color: category.color,
                      borderColor: `${category.color}25`
                    }}
                  >
                    <CategoryIcon className="w-4 h-4" />
                  </div>

                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-extrabold text-slate-450 dark:text-slate-500 uppercase tracking-wider block truncate">
                        {category.name}
                      </span>
                      {hasValue && (
                        <span 
                          className="text-[8px] font-black px-1 py-0.5 rounded-md"
                          style={{ backgroundColor: `${category.color}15`, color: category.color }}
                        >
                          ~{percentage}%
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">
                      {category.min > 0 ? `${currencySymbol}${category.min.toLocaleString()} - ${currencySymbol}${category.max.toLocaleString()}` : "Flexible"}
                    </h4>
                    <p className="text-[10px] text-slate-450 dark:text-slate-400 font-medium line-clamp-1 italic">
                      {category.rawText || "Varies"}
                    </p>
                  </div>
                </div>

                {/* Tiny simulated progress bar underneath */}
                {hasValue && (
                  <div className="w-full h-1 bg-slate-200/60 dark:bg-slate-800/65 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${percentage}%`, backgroundColor: category.color }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- NEW COMPREHENSIVE TRAVEL COST BREAKDOWN --- */}
      <div className="border-t border-slate-100 dark:border-slate-900 pt-9 space-y-9">
        
        {/* SECTION 1: Curated Lodging Recommendations */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
                <Hotel className="w-4 h-4" />
              </span>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Curated Accommodation Recommendations</h4>
            </div>

            {/* Tier Selector Buttons */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl self-start sm:self-auto flex-shrink-0">
              {[
                { id: "budget", label: "Budget", price: "₹" },
                { id: "midRange", label: "Mid-Range", price: "₹₹" },
                { id: "luxury", label: "Luxury", price: "₹₹₹" }
              ].map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedHotelTier(tier.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedHotelTier === tier.id
                      ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {tier.label} ({tier.price})
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Highly recommended hotels at different comfort tiers. Prices are estimated seasonal averages.
            {accommodationPerNight > 0 && (
              <> Your trip currently allocates about <strong>{currencySymbol}{accommodationPerNight.toLocaleString()} per night</strong> across {accommodationNights} night{accommodationNights === 1 ? "" : "s"}; the tiers below are reference options, not a forced selection.</>
            )}
          </p>

          {/* Hotel Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hotelRecommendations[selectedHotelTier]?.map((hotel, index) => (
              <div 
                key={index} 
                className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-teal-500/20 dark:hover:border-teal-500/25 transition-all shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 line-clamp-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      {hotel.name}
                    </h5>
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/35 px-2 py-0.5 rounded-md">
                      Estimated
                    </span>
                  </div>

                  {/* Rating block */}
                  <div className="flex items-center gap-1 text-xs">
                    <div className="flex items-center text-amber-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3 h-3 ${i < Math.floor(hotel.rating) ? 'fill-amber-400' : 'text-slate-200 dark:text-slate-800'}`} 
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 ml-1">
                      {hotel.rating} / 5 Rating
                    </span>
                  </div>

                  {/* Distance and Price */}
                  <div className="space-y-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-900/60 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span>{hotel.distanceFromCenter} from city center</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">Avg Price Per Night</span>
                      <span className="text-sm font-black text-slate-800 dark:text-slate-100">
                        {hotel.pricePerNight}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Booking Button (External tab link to google or booking placeholder) */}
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(hotel.name + " " + destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <span>Check Rates</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 2: Transportation Cost Estimates */}
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
                <Bus className="w-4 h-4" />
              </span>
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">Local Transportation Estimates</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Estimated local travel fares, scooter rentals, and transit passes in {destination}. (Labled as Estimated Fares)
            </p>
          </div>

          {/* Transit Estimates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            
            {/* Taxi Fares */}
            <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-sky-500/10 text-sky-600 rounded-lg"><Car className="w-4 h-4" /></span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Taxi Commute</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Starting Fare: <span className="font-extrabold text-slate-850 dark:text-slate-100">{detailedTransportationCosts.taxiStart}</span></p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Per Kilometre: <span className="font-extrabold text-slate-850 dark:text-slate-100">{detailedTransportationCosts.taxiPerKm}</span></p>
              </div>
              <span className="block text-[8px] font-extrabold uppercase text-amber-500">Estimated Rates</span>
            </div>

            {/* Auto Rickshaw */}
            {detailedTransportationCosts.autoRickshaw && detailedTransportationCosts.autoRickshaw !== "N/A" && (
              <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-amber-500/10 text-amber-650 rounded-lg"><Bike className="w-4 h-4" /></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Auto Rickshaw</span>
                  </div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.autoRickshaw}</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500">Average local short ride</p>
                </div>
                <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
              </div>
            )}

            {/* Bus Fare */}
            <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg"><Bus className="w-4 h-4" /></span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Public Bus</span>
                </div>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.busFare}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500">Single tickets or per transit</p>
              </div>
              <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
            </div>

            {/* Metro Fare */}
            {detailedTransportationCosts.metroFare && detailedTransportationCosts.metroFare !== "N/A" && (
              <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-purple-500/10 text-purple-600 rounded-lg"><Train className="w-4 h-4" /></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Subway / Metro</span>
                  </div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.metroFare}</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500">Per zone or single trip</p>
                </div>
                <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
              </div>
            )}

            {/* Train Fare */}
            {detailedTransportationCosts.trainFare && detailedTransportationCosts.trainFare !== "N/A" && (
              <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-500/10 text-indigo-650 rounded-lg"><Train className="w-4 h-4" /></span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Local Train Fare</span>
                  </div>
                  <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.trainFare}</p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500">Local commuter distance</p>
                </div>
                <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
              </div>
            )}

            {/* Scooter / Bike Rental */}
            <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-rose-500/10 text-rose-600 rounded-lg"><Bike className="w-4 h-4" /></span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Scooter / Bike Rental</span>
                </div>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.scooterRental}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500">Daily rental price estimate</p>
              </div>
              <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
            </div>

            {/* Car Rental */}
            <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-teal-500/10 text-teal-600 rounded-lg"><Car className="w-4 h-4" /></span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Car Rental (Per Day)</span>
                </div>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.carRental}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500">Compact or sedan car per day</p>
              </div>
              <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
            </div>

            {/* Airport Transfer */}
            <div className="bg-slate-50/40 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-orange-500/10 text-orange-600 rounded-lg"><Plane className="w-4 h-4" /></span>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Airport Transfer</span>
                </div>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100 mt-2">{detailedTransportationCosts.airportTransfer}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500">One-way private shuttle/taxi</p>
              </div>
              <span className="block text-[8px] font-extrabold uppercase text-amber-500 pt-1">Estimated Rates</span>
            </div>

          </div>
        </div>

        {/* SECTION 3 & 4: Food Budget & Attraction Entry Fees */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Daily Food Budget */}
          <div className="md:col-span-5 bg-slate-50/20 dark:bg-slate-900/5 border border-slate-100 dark:border-slate-900/60 p-5 rounded-3xl space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="p-1.5 bg-amber-500/10 text-amber-600 rounded-lg">
                  <Utensils className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Estimated Daily Food Budgets</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Average dining budgets per traveler per day. (Labeled as Estimated Costs)
              </p>
            </div>

            <div className="space-y-3.5 pt-2">
              {[
                { title: "Budget Traveler", cost: foodBudgetDaily.budget, desc: "Local eateries, street food, fast casual", color: "bg-emerald-500" },
                { title: "Mid-Range Traveler", cost: foodBudgetDaily.midRange, desc: "Casual dining, sit-down local bistros", color: "bg-teal-500" },
                { title: "Luxury Traveler", cost: foodBudgetDaily.luxury, desc: "Fine-dining, top-tier hotel meals", color: "bg-purple-500" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/60 dark:border-slate-900 shadow-xs">
                  <div className="space-y-0.5">
                    <span className="text-xs font-black text-slate-850 dark:text-slate-200 block">{item.title}</span>
                    <span className="text-[10px] text-slate-450 dark:text-slate-500 font-medium">{item.desc}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">{item.cost}</span>
                    <span className="text-[8px] font-extrabold uppercase text-amber-500">Estimated</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attraction Ticket Entry Fees */}
          <div className="md:col-span-7 bg-slate-50/20 dark:bg-slate-900/5 border border-slate-100 dark:border-slate-900/60 p-5 rounded-3xl space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="p-1.5 bg-purple-500/10 text-purple-600 rounded-lg">
                  <Ticket className="w-4 h-4" />
                </span>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Attraction & Sights Ticket Fees</h4>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Approximate individual entrance fees for major landmarks. (Labled as Estimated Fees)
              </p>
            </div>

            {/* Scrollable List of attractions */}
            <div className="space-y-2 max-h-[195px] overflow-y-auto pr-1">
              {attractionCosts?.map((attraction, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/60 dark:border-slate-900 shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Ticket className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-750 dark:text-slate-200 truncate">{attraction.name}</span>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100">{attraction.fee}</span>
                    <span className="block text-[8px] font-extrabold text-amber-500 uppercase">Estimated</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* SECTION 5: Complete Budget Summary Travel Invoice */}
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-teal-500/5 to-emerald-500/5 dark:from-teal-950/10 dark:to-emerald-950/10 border border-teal-500/10 rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
          
          {/* Aesthetic background design */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 dark:bg-teal-500/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="text-center space-y-1.5 border-b border-dashed border-teal-500/15 pb-5">
            <div className="inline-flex p-2 bg-teal-500/10 text-teal-650 dark:text-teal-400 rounded-2xl mb-1">
              <Receipt className="w-6 h-6" />
            </div>
            <h4 className="text-base font-extrabold text-slate-850 dark:text-slate-100 uppercase tracking-wider">
              Comprehensive Budget Summary
            </h4>
            <p className="text-xs text-slate-550 dark:text-slate-400">
              Trip invoice receipt for <span className="font-extrabold text-teal-600 dark:text-teal-400">{destination}</span>
            </p>
          </div>

          <div className="space-y-3.5 text-xs">
            {/* Table layout */}
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
              <span>Accommodation Total</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{detailedBudgetSummary.accommodationTotal}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
              <span>Food Total</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{detailedBudgetSummary.foodTotal}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
              <span>Local Commute & Transportation</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{detailedBudgetSummary.localTransportTotal}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
              <span>Attractions & Sights Entrance Fees</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{detailedBudgetSummary.attractionTotal}</span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
              <span>Miscellaneous Expenses</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{detailedBudgetSummary.miscellaneousExpenses}</span>
            </div>
            {itinerary?.estimatedBudgetBreakdown?.visaAndInsurance && parseBudgetRange(itinerary.estimatedBudgetBreakdown.visaAndInsurance).max > 0 && (
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium">
                <span>🛡️ Travel Protection / Insurance</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{itinerary.estimatedBudgetBreakdown.visaAndInsurance}</span>
              </div>
            )}
            {itinerary?.origin && detailedBudgetSummary.originToDestinationCost && detailedBudgetSummary.originToDestinationCost !== "N/A" && (
              <div className="space-y-1 bg-violet-500/5 p-2 rounded-xl border border-violet-500/10">
                <div className="flex justify-between items-center text-slate-650 dark:text-slate-350 font-bold">
                  <span className="text-violet-600 dark:text-violet-400 flex items-center gap-1">✈️ Round-trip travel from {itinerary.origin}</span>
                  <span className="text-violet-600 dark:text-violet-400">{detailedBudgetSummary.originToDestinationCost}</span>
                </div>
                {itinerary?.flightEstimateSource === "travelpayouts-aviasales-cache" && (
                  <div className="text-[10px] text-violet-500/80 font-semibold">Recent Aviasales airfare estimate{itinerary?.flightEstimateRoute ? ` · ${itinerary.flightEstimateRoute}` : ""}{itinerary?.flightEstimateMethod ? ` · ${itinerary.flightEstimateMethod === "exact-dates" ? "exact dates" : itinerary.flightEstimateMethod === "month-broad" ? "same-month cached fare" : itinerary.flightEstimateMethod === "week-nearby" ? "nearby dates" : itinerary.flightEstimateMethod === "latest-period" ? "recent monthly cache" : "same-duration cached fare"}` : ""}{itinerary?.flightEstimateSourceDates ? ` · source ${itinerary.flightEstimateSourceDates}` : ""} · total for {itinerary.travelers || 1} traveler{(itinerary.travelers || 1) === 1 ? "" : "s"}. Cached airfare, not a guaranteed live booking price.</div>
                )}
                {itinerary?.flightEstimateSource === "route-model-fallback" && (
                  <div className="text-[10px] text-slate-400 font-semibold">Live fare unavailable for the selected dates. This is a planning estimate and may vary at booking.</div>
                )}
              </div>
            )}

            {itinerary?.isAiBudgetPlanner && itinerary?.remainingBudget && itinerary.remainingBudget !== "N/A" && (
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 font-medium border-t border-dashed border-teal-500/10 pt-3">
                <span>Recommended Safety Buffer</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{itinerary.remainingBudget}</span>
              </div>
            )}

            {/* Receipt dotted line */}
            <div className="border-t border-dashed border-teal-500/15 pt-5 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold uppercase text-teal-650 dark:text-teal-400 tracking-wider">
                  {itinerary?.isAiBudgetPlanner ? "AI Recommended Safe Budget" : "Grand Total Budget"}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block">
                  {itinerary?.isAiBudgetPlanner ? `Expected trip cost: ${detailedBudgetSummary.grandTotal}` : "Estimated market average"}
                </span>
              </div>
              <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
                {itinerary?.isAiBudgetPlanner
                  ? ((itinerary as any).plannedBudget || itinerary.budgetAmount || detailedBudgetSummary.grandTotal)
                  : detailedBudgetSummary.grandTotal}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Advisory Insight */}
      <div className="flex gap-3.5 p-4 bg-teal-50/25 dark:bg-teal-950/10 border border-teal-100/40 dark:border-teal-900/20 rounded-2xl items-start">
        <span className="p-2 bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 rounded-xl flex-shrink-0 mt-0.5">
          <ShieldCheck className="w-4 h-4" />
        </span>
        <div className="space-y-1">
          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Estimated Budget Notice</h4>
          <p className="text-xs text-slate-650 dark:text-slate-400 leading-relaxed font-medium">
            These values represent realistic, average destination costs based on the latest seasonal insights for your travel style and duration. They are clearly labeled as <strong>Estimated Budgets</strong> for your financial planning. Actual expenses can vary depending on real-world factors.
          </p>
        </div>
      </div>
    </div>
  );
}
