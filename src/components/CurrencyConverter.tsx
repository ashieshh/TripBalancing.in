import { useState, useEffect } from "react";
import { 
  Coins, ArrowRightLeft, Calculator, HelpCircle, 
  RefreshCw, Edit3, Check, Globe2, AlertCircle, TrendingUp, Info, ChevronRight, Hotel, Utensils, Compass, Bus, Banknote
} from "lucide-react";
import { TripRecord } from "../types";

// Helper to get currency name from code using standard Intl API
const getCurrencyName = (code: string): string => {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" });
    return names.of(code) || code;
  } catch (e) {
    return code;
  }
};

// Helper to get currency symbol from code using standard Intl API
const getCurrencySymbol = (code: string): string => {
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol"
    });
    const parts = formatter.formatToParts(1);
    const symbolPart = parts.find(part => part.type === "currency");
    return symbolPart ? symbolPart.value : code;
  } catch (e) {
    return code;
  }
};

// Standard preset exchange rates relative to 1 INR (Indian Rupee) as base or USD as anchor
// We'll store standard rates relative to 1 USD, then convert easily.
const EXCHANGE_RATES: Record<string, { rateToUsd: number; symbol: string; name: string }> = {
  INR: { rateToUsd: 83.50, symbol: "₹", name: "Indian Rupee" },
  USD: { rateToUsd: 1.00, symbol: "$", name: "US Dollar" },
  EUR: { rateToUsd: 0.92, symbol: "€", name: "Euro" },
  GBP: { rateToUsd: 0.78, symbol: "£", name: "British Pound" },
  JPY: { rateToUsd: 161.20, symbol: "¥", name: "Japanese Yen" },
  AUD: { rateToUsd: 1.49, symbol: "A$", name: "Australian Dollar" },
  CAD: { rateToUsd: 1.36, symbol: "C$", name: "Canadian Dollar" },
  SGD: { rateToUsd: 1.34, symbol: "S$", name: "Singapore Dollar" },
  AED: { rateToUsd: 3.67, symbol: "د.إ", name: "UAE Dirham" },
  CHF: { rateToUsd: 0.89, symbol: "CHF", name: "Swiss Franc" },
  THB: { rateToUsd: 36.40, symbol: "฿", name: "Thai Baht" },
};

interface CurrencyConverterProps {
  trips: TripRecord[];
}

export default function CurrencyConverter({ trips }: CurrencyConverterProps) {
  const [fromCurrency, setFromCurrency] = useState("INR");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState<string>("10000");
  const [customRate, setCustomRate] = useState<string>("");
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [tripBudgetBreakdown, setTripBudgetBreakdown] = useState<{
    accommodation: number;
    food: number;
    activities: number;
    transport: number;
    total: number;
  } | null>(null);

  // Live Exchange Rates state
  const [rates, setRates] = useState<Record<string, { rateToUsd: number; symbol: string; name: string }>>(EXCHANGE_RATES);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Parse numeric amount helper
  const parseAmount = (val: string): number => {
    const clean = val.replace(/,/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Helper to extract numeric values from travel budget breakdown strings
  const parseBudgetAmount = (val: string | undefined | null): number => {
    if (!val) return 0;
    const clean = val.replace(/,/g, "");
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const num = parseFloat(match[1]);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  // Standard conversion logic: From -> USD -> To
  const getStandardRate = (from: string, to: string): number => {
    const fromConf = rates[from];
    const toConf = rates[to];
    if (!fromConf || !toConf) return 1;
    // 1 From = (1 / fromConf.rateToUsd) USD
    // USD * toConf.rateToUsd = To
    return toConf.rateToUsd / fromConf.rateToUsd;
  };

  // Fetch Live Rates
  const fetchRates = async () => {
    setIsFetching(true);
    setApiError(null);
    try {
      // Check client-side cache in localStorage first
      const cached = localStorage.getItem("travel_exchange_rates");
      const cachedTime = localStorage.getItem("travel_exchange_rates_time");
      const thirtyMinutes = 30 * 60 * 1000;

      if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < thirtyMinutes) {
        const parsed = JSON.parse(cached);
        if (parsed && Object.keys(parsed).length > 0) {
          setRates(parsed);
          const cachedUpdated = localStorage.getItem("travel_exchange_rates_updated");
          setLastUpdated(cachedUpdated || new Date(parseInt(cachedTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          setIsFetching(false);
          return;
        }
      }

      const res = await fetch("/api/exchange-rates");
      if (!res.ok) {
        throw new Error("Rates API returned non-200");
      }
      const data = await res.json();
      if (!data || !data.rates) {
        throw new Error("Invalid exchange rates data received");
      }

      // Convert API rates to our target structure
      const newRates: Record<string, { rateToUsd: number; symbol: string; name: string }> = {};
      Object.entries(data.rates).forEach(([code, rate]) => {
        newRates[code] = {
          rateToUsd: Number(rate),
          symbol: getCurrencySymbol(code),
          name: getCurrencyName(code)
        };
      });

      setRates(newRates);
      
      // Get readable updated string from API or current time
      const updatedString = data.time_last_update_utc 
        ? new Date(data.time_last_update_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      setLastUpdated(updatedString);

      // Save to localStorage for cache
      localStorage.setItem("travel_exchange_rates", JSON.stringify(newRates));
      localStorage.setItem("travel_exchange_rates_time", Date.now().toString());
      localStorage.setItem("travel_exchange_rates_updated", updatedString);

    } catch (err) {
      console.error("Error fetching live exchange rates:", err);
      setApiError("Live exchange rates are temporarily unavailable. Please try again later.");
      
      // Try to fallback to any expired cache in localStorage
      const expiredCache = localStorage.getItem("travel_exchange_rates");
      if (expiredCache) {
        try {
          const parsed = JSON.parse(expiredCache);
          setRates(parsed);
          const cachedUpdated = localStorage.getItem("travel_exchange_rates_updated");
          if (cachedUpdated) {
            setLastUpdated(cachedUpdated + " (Offline)");
          }
        } catch (e) {
          // ignore
        }
      }
    } finally {
      setIsFetching(false);
    }
  };

  // Get active exchange rate (use customRate if editing & defined, otherwise standard)
  const activeRate = customRate && !isNaN(parseFloat(customRate))
    ? parseFloat(customRate)
    : getStandardRate(fromCurrency, toCurrency);

  // Load rates on mount
  useEffect(() => {
    fetchRates();
  }, []);

  // Auto-fill standard rate when currencies change, rates load, or check cache freshness
  useEffect(() => {
    setCustomRate(getStandardRate(fromCurrency, toCurrency).toFixed(4));

    // Automatically trigger background refresh of rates if they haven't been fetched in the last 30 minutes
    const cachedTime = localStorage.getItem("travel_exchange_rates_time");
    if (!cachedTime || (Date.now() - parseInt(cachedTime)) > 30 * 60 * 1000) {
      fetchRates();
    }
  }, [fromCurrency, toCurrency, rates]);

  // Load selected trip's budget breakdown
  useEffect(() => {
    if (selectedTripId) {
      const trip = trips.find(t => t.id === selectedTripId);
      if (trip && trip.itinerary) {
        const bd = trip.itinerary.estimatedBudgetBreakdown;
        if (bd) {
          const acc = parseBudgetAmount(bd.accommodation);
          const food = parseBudgetAmount(bd.food);
          const act = parseBudgetAmount(bd.activities);
          const trans = parseBudgetAmount(bd.transport);
          const tot = parseBudgetAmount(bd.total) || (acc + food + act + trans);
          
          setTripBudgetBreakdown({
            accommodation: acc,
            food: food,
            activities: act,
            transport: trans,
            total: tot
          });

          // Match the "from" currency from trip budget detection if possible
          const rawBudget = bd.total || bd.accommodation || "";
          if (rawBudget.includes("₹") || rawBudget.toLowerCase().includes("inr")) {
            setFromCurrency("INR");
          } else if (rawBudget.includes("$") || rawBudget.toLowerCase().includes("usd")) {
            setFromCurrency("USD");
          } else if (rawBudget.includes("€") || rawBudget.toLowerCase().includes("eur")) {
            setFromCurrency("EUR");
          } else if (rawBudget.includes("£") || rawBudget.toLowerCase().includes("gbp")) {
            setFromCurrency("GBP");
          } else if (rawBudget.includes("¥") || rawBudget.toLowerCase().includes("jpy")) {
            setFromCurrency("JPY");
          }
          
          // Set amount to the trip's total
          setAmount(tot.toString());
        }
      }
    } else {
      setTripBudgetBreakdown(null);
    }
  }, [selectedTripId, trips]);

  const handleSwapCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
  };

  const convertedValue = parseAmount(amount) * activeRate;
  const fromSymbol = EXCHANGE_RATES[fromCurrency]?.symbol || "";
  const toSymbol = EXCHANGE_RATES[toCurrency]?.symbol || "";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Introduction Header */}
      <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 dark:from-teal-950/20 dark:via-emerald-950/15 dark:to-cyan-950/20 border border-teal-100/30 dark:border-teal-900/30 rounded-3xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
            <Coins className="w-3 h-3" />
            Budget Utility
          </span>
        </div>
        <h3 className="text-xl font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <span>Local Currency & Travel Budget Estimator</span>
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
          Estimate your trip expenses in local destination currency. Convert custom amounts manually, or load any of your saved itineraries to instantly convert entire travel budgets.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Quick Converter & Rates */}
        <div className="lg:col-span-7">
          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-900 p-6 rounded-3xl shadow-sm space-y-5 h-full flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-900 pb-4">
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-teal-500" />
                <span>1. Convert Currency</span>
              </h4>
              <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1 rounded-full border border-slate-100 dark:border-slate-900">
                <button
                  type="button"
                  onClick={() => !isFetching && fetchRates()}
                  disabled={isFetching}
                  className={`p-0.5 rounded-full text-slate-500 dark:text-slate-400 hover:text-teal-500 transition-colors cursor-pointer ${isFetching ? "animate-spin text-teal-500" : ""}`}
                  title="Update rates now"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-550 dark:text-slate-400 font-bold">
                  {lastUpdated ? `Live Rates Updated: ${lastUpdated}` : isFetching ? "Updating rates..." : "Live Rates Enabled"}
                </span>
              </div>
            </div>

            {/* API Error Banner if fetch fails */}
            {apiError && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400 font-semibold animate-in fade-in duration-250">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p>{apiError}</p>
                  <p className="text-[10px] text-red-550 dark:text-red-400 font-medium">Using fallback rates to perform calculations.</p>
                </div>
              </div>
            )}

            {/* Input Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Amount to Convert
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 font-black text-slate-400 dark:text-slate-500 text-sm">
                  {fromSymbol}
                </span>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^0-9.]/g, "");
                    setAmount(clean);
                  }}
                  placeholder="Enter amount..."
                  className="w-full pl-9 pr-14 py-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850 rounded-2xl text-slate-800 dark:text-slate-100 font-bold text-base focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                />
                <span className="absolute inset-y-0 right-4 flex items-center text-xs font-black text-slate-400 dark:text-slate-500">
                  {fromCurrency}
                </span>
              </div>
            </div>

            {/* From & To Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-9 items-center gap-3">
              
              {/* From Currency Selector */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  From Currency
                </label>
                <select
                  value={fromCurrency}
                  onChange={(e) => setFromCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850 rounded-2xl text-slate-800 dark:text-slate-100 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                >
                  {Object.entries(rates)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([code, config]) => {
                      const c = config as { rateToUsd: number; symbol: string; name: string };
                      return (
                        <option key={code} value={code}>
                          {code} - {c.name} ({c.symbol})
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Swap Button */}
              <div className="md:col-span-1 flex justify-center pt-5">
                <button
                  type="button"
                  onClick={handleSwapCurrencies}
                  className="p-2.5 bg-slate-100 hover:bg-teal-500/10 hover:text-teal-600 dark:bg-slate-900 dark:hover:bg-teal-500/20 dark:hover:text-teal-400 rounded-full text-slate-500 dark:text-slate-400 transition-all cursor-pointer border border-slate-200/50 dark:border-slate-800/50 active:scale-90"
                  title="Swap Currencies"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
              </div>

              {/* To Currency Selector */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  To Currency
                </label>
                <select
                  value={toCurrency}
                  onChange={(e) => setToCurrency(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850 rounded-2xl text-slate-800 dark:text-slate-100 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                >
                  {Object.entries(rates)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([code, config]) => {
                      const c = config as { rateToUsd: number; symbol: string; name: string };
                      return (
                        <option key={code} value={code}>
                          {code} - {c.name} ({c.symbol})
                        </option>
                      );
                    })}
                </select>
              </div>

            </div>

            {/* Custom Rate Adjustment Panel */}
            <div className="p-3.5 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-slate-150 dark:border-slate-900 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 font-semibold text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <span>
                  Exchange Rate: <strong className="text-slate-800 dark:text-slate-100">1 {fromCurrency} = {activeRate.toFixed(4)} {toCurrency}</strong>
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {isEditingRate ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      className="w-20 px-2 py-1 text-center bg-white dark:bg-slate-950 border border-teal-500 rounded-lg text-xs font-bold focus:outline-none"
                      placeholder="Rate"
                    />
                    <button
                      onClick={() => setIsEditingRate(false)}
                      className="p-1 bg-emerald-500 text-white rounded-lg cursor-pointer hover:bg-emerald-600"
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingRate(true)}
                    className="text-[10px] font-black text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Customize Rate</span>
                  </button>
                )}
                
                {customRate && parseFloat(customRate) !== getStandardRate(fromCurrency, toCurrency) && (
                  <button
                    onClick={() => {
                      setCustomRate(getStandardRate(fromCurrency, toCurrency).toFixed(4));
                      setIsEditingRate(false);
                    }}
                    className="text-[10px] font-black text-slate-400 dark:text-slate-500 hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Conversion Result Block */}
            <div className="p-6 bg-gradient-to-r from-teal-500/5 via-emerald-500/5 to-cyan-500/5 dark:from-teal-950/10 dark:via-emerald-950/10 dark:to-cyan-950/10 rounded-2xl border border-teal-500/10 dark:border-teal-500/5 flex flex-col items-center justify-center text-center py-8 space-y-2 relative overflow-hidden">
              <span className="text-[10px] font-black uppercase text-teal-600 dark:text-teal-400 tracking-wider">
                Converted Amount Estimate
              </span>
              <div className="space-y-1">
                <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold">
                  {parseAmount(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {rates[fromCurrency]?.name} =
                </p>
                <h3 className="text-3xl font-black text-slate-850 dark:text-slate-100 flex items-center justify-center gap-1.5">
                  <span className="text-teal-650 dark:text-teal-400 font-black">{toSymbol}</span>
                  <span>{convertedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  {toCurrency} ({rates[toCurrency]?.name})
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Trip Budget Breakdown Converter */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-900 p-6 rounded-3xl shadow-sm space-y-5 flex flex-col h-full justify-between">
            <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              2. Load Travel Budget
            </h4>

            {trips.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3.5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-slate-400" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-350">No planned trips found</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Create a trip itinerary first to automatically load and convert budgets!
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    Select Planned Adventure
                  </label>
                  <select
                    value={selectedTripId}
                    onChange={(e) => setSelectedTripId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850 rounded-2xl text-slate-800 dark:text-slate-100 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    <option value="">-- Choose saved trip --</option>
                    {trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.destination} ({trip.startDate})
                      </option>
                    ))}
                  </select>
                </div>

                {tripBudgetBreakdown ? (
                  <div className="space-y-4 animate-in fade-in duration-350 flex-1 flex flex-col justify-between">
                    
                    {/* Budget Breakdown Converted */}
                    <div className="space-y-2.5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                        Estimated Budget Converted
                      </span>

                      <div className="space-y-2">
                        {/* Accommodation */}
                        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/30 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="p-1.5 bg-teal-500/10 text-teal-650 dark:text-teal-400 rounded-lg">
                              <Hotel className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Accommodation</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-850 dark:text-slate-100 block">
                              {toSymbol}{(tripBudgetBreakdown.accommodation * activeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                              {fromSymbol}{tripBudgetBreakdown.accommodation.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Food */}
                        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/30 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="p-1.5 bg-amber-500/10 text-amber-650 dark:text-amber-400 rounded-lg">
                              <Utensils className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Food & Dining</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-850 dark:text-slate-100 block">
                              {toSymbol}{(tripBudgetBreakdown.food * activeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                              {fromSymbol}{tripBudgetBreakdown.food.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Activities */}
                        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/30 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="p-1.5 bg-purple-500/10 text-purple-655 dark:text-purple-400 rounded-lg">
                              <Compass className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Activities</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-850 dark:text-slate-100 block">
                              {toSymbol}{(tripBudgetBreakdown.activities * activeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                              {fromSymbol}{tripBudgetBreakdown.activities.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Transport */}
                        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/30 rounded-xl flex items-center justify-between border border-slate-100 dark:border-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="p-1.5 bg-sky-500/10 text-sky-650 dark:text-sky-400 rounded-lg">
                              <Bus className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-350">Transportation</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-850 dark:text-slate-100 block">
                              {toSymbol}{(tripBudgetBreakdown.transport * activeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold">
                              {fromSymbol}{tripBudgetBreakdown.transport.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Total Highlight */}
                        <div className="p-4 bg-teal-500/5 dark:bg-teal-950/20 border-t-2 border-dashed border-teal-500/20 rounded-xl flex items-center justify-between mt-1">
                          <div className="flex items-center gap-2">
                            <Banknote className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">Total Est. Budget</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                              {toSymbol}{(tripBudgetBreakdown.total * activeRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                              {fromSymbol}{tripBudgetBreakdown.total.toLocaleString()} {fromCurrency}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                    <div className="p-3.5 bg-teal-500/5 rounded-2xl border border-teal-500/10 text-[11px] font-semibold text-teal-650 dark:text-teal-400 leading-relaxed mt-2 flex items-start gap-2">
                      <Info className="w-4 h-4 shrink-0 text-teal-500 mt-0.5" />
                      <span>
                        Budget loaded successfully. Changing the From/To currencies on the left will instantly update these travel breakdowns.
                      </span>
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3.5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <Calculator className="w-8 h-8 text-slate-400" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-350">No budget loaded yet</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Select a planned adventure from the menu above to map its budget to local currency!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Information Disclaimer */}
      <div className="p-5 bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-850 rounded-3xl flex items-start gap-3">
        <Info className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <h4 className="text-xs font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider">Currency Exchange Notes</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
            The standard rates displayed here are estimates and are updated periodically. Bank transaction fees, credit card foreign exchange markups (typically 1% to 3.5%), and local ATM/exchange booth rates may vary. You can click <strong>Customize Rate</strong> to override the active exchange rate with your card's exact rate for pinpoint accuracy.
          </p>
        </div>
      </div>

    </div>
  );
}
