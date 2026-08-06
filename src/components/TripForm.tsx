import { useState, FormEvent } from "react";
import { Compass, Calendar, Users, Sparkles, AlertCircle, MapPin, IndianRupee, DollarSign, PlaneTakeoff, Check, WandSparkles, ShieldCheck } from "lucide-react";
import { TravelStyle, TripInput } from "../types";

interface TripFormProps {
  onSubmit: (input: TripInput) => void;
  loading: boolean;
}

const POPULAR_DESTINATIONS = [
  { name: "Paris, France", icon: "🗼" },
  { name: "Tokyo, Japan", icon: "⛩️" },
  { name: "Bali, Indonesia", icon: "🌋" },
  { name: "New York, USA", icon: "🗽" },
  { name: "Rome, Italy", icon: "🏛️" },
  { name: "Goa, India", icon: "🌴" },
];

const TRAVEL_STYLES: Array<{ name: TravelStyle; icon: string; description: string }> = [
  { name: "Budget", icon: "💰", description: "Best trip at the lowest practical cost" },
  { name: "Smart Luxury", icon: "✨", description: "AI finds the best-value luxury budget for you" },
  { name: "Luxury", icon: "👑", description: "Maximum luxury within your chosen budget" },
  { name: "Family", icon: "👨‍👩‍👧", description: "Safe, comfortable and family-friendly" },
  { name: "Solo", icon: "🧍", description: "Safe, social and flexible solo travel" },
  { name: "Adventure", icon: "🧗", description: "Outdoor thrills and active experiences" },
  { name: "Business", icon: "💼", description: "Efficient stays, workspaces and fast transport" },
  { name: "Honeymoon", icon: "💕", description: "Romantic stays, dining and private moments" },
  { name: "Backpacker", icon: "🎒", description: "Hostels, local food and low-cost exploration" },
  { name: "Food Explorer", icon: "🍽️", description: "Local dishes, markets, cafés and food tours" },
  { name: "Wellness & Spa", icon: "🌿", description: "Spa, yoga, nature and slow travel" },
  { name: "Culture & History", icon: "🏛️", description: "Museums, heritage, traditions and local stories" },
  { name: "Beach Escape", icon: "🏖️", description: "Beaches, resorts, sunsets and water activities" },
];

export default function TripForm({ onSubmit, loading }: TripFormProps) {
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelDays, setTravelDays] = useState<number | "">("");
  const [budgetPrefix, setBudgetPrefix] = useState<"₹" | "$">("₹");
  const [budgetVal, setBudgetVal] = useState("50000");
  const [travelers, setTravelers] = useState(1);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>("Budget");
  const [error, setError] = useState<string | null>(null);
  const [isAiBudgetPlanner, setIsAiBudgetPlanner] = useState(false);

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val) {
      if (travelDays) {
        const start = new Date(val);
        const end = new Date(start);
        end.setDate(start.getDate() + Number(travelDays) - 1);
        setEndDate(end.toISOString().split("T")[0]);
      } else if (endDate) {
        const start = new Date(val);
        const end = new Date(endDate);
        if (end >= start) {
          const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
          setTravelDays(diff);
        } else {
          setEndDate("");
          setTravelDays("");
        }
      }
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (startDate && val) {
      const start = new Date(startDate);
      const end = new Date(val);
      if (end >= start) {
        const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
        setTravelDays(diff);
      }
    }
  };

  const handleTravelDaysChange = (valStr: string) => {
    if (valStr === "") {
      setTravelDays("");
      return;
    }
    let val = parseInt(valStr, 10);
    if (isNaN(val)) return;
    if (val < 1) val = 1;
    if (val > 365) val = 365;
    setTravelDays(val);
    if (startDate) {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(start.getDate() + val - 1);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!destination.trim()) {
      setError("Please specify a travel destination.");
      return;
    }

    const isSmartLuxury = travelStyle === "Smart Luxury";
    const isAiMode = travelStyle === "Budget" && isAiBudgetPlanner;

    if (!isAiMode && (!startDate || !endDate)) {
      setError("Please pick both start and end dates.");
      return;
    }

    let finalStartDate = startDate;
    let finalEndDate = endDate;

    if (isAiMode) {
      // If start date is not selected, set to tomorrow
      if (!finalStartDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        finalStartDate = tomorrow.toISOString().split("T")[0];
      }

      // Estimate comfortable travel days to calculate finalEndDate for local schema
      const amount = Number(budgetVal) || 20000;
      const symbol = budgetPrefix;
      const dailyCostPerPerson = symbol === "₹" ? 3000 : 50;
      const totalDailyCost = dailyCostPerPerson * travelers;
      const calculatedDays = Math.max(1, Math.floor(amount / totalDailyCost));

      const start = new Date(finalStartDate);
      const end = new Date(start);
      end.setDate(start.getDate() + calculatedDays - 1);
      finalEndDate = end.toISOString().split("T")[0];
    } else {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        setError("The end date cannot be earlier than your start date.");
        return;
      }

      const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
      if (durationDays < 1 || durationDays > 365) {
        setError("Please specify a trip duration between 1 and 365 days.");
        return;
      }
    }

    onSubmit({
      destination: destination.trim(),
      origin: origin.trim() || undefined,
      startDate: finalStartDate,
      endDate: finalEndDate,
      budgetAmount: isSmartLuxury ? "AI Recommended" : `${budgetPrefix}${Number(budgetVal).toLocaleString()}`,
      travelers,
      travelStyle,
      isAiBudgetPlanner: isAiMode,
    });
  };

  // Get style color accents
  const getStyleTheme = (style: TravelStyle) => {
    switch (style) {
      case "Budget":
        return {
          bg: "bg-teal-50 dark:bg-teal-950/20",
          border: "border-teal-200 dark:border-teal-900",
          text: "text-teal-700 dark:text-teal-400",
          accent: "teal"
        };
      case "Luxury":
        return {
          bg: "bg-purple-50 dark:bg-purple-950/20",
          border: "border-purple-200 dark:border-purple-900",
          text: "text-purple-700 dark:text-purple-400",
          accent: "purple"
        };
      case "Family":
        return {
          bg: "bg-blue-50 dark:bg-blue-950/20",
          border: "border-blue-200 dark:border-blue-900",
          text: "text-blue-700 dark:text-blue-400",
          accent: "blue"
        };
      case "Solo":
        return {
          bg: "bg-indigo-50 dark:bg-indigo-950/20",
          border: "border-indigo-200 dark:border-indigo-900",
          text: "text-indigo-700 dark:text-indigo-400",
          accent: "indigo"
        };
      case "Adventure":
        return { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-900", text: "text-amber-700 dark:text-amber-400", accent: "amber" };
      default:
        return { bg: "bg-cyan-50 dark:bg-cyan-950/20", border: "border-cyan-200 dark:border-cyan-900", text: "text-cyan-700 dark:text-cyan-400", accent: "cyan" };
    }
  };

  const activeTheme = getStyleTheme(travelStyle);

  return (
    <form onSubmit={handleSubmit} className="relative overflow-hidden space-y-8 bg-white dark:bg-slate-950 p-5 sm:p-6 md:p-8 rounded-[28px] border border-slate-200/80 dark:border-slate-800 shadow-2xl shadow-slate-900/5 dark:shadow-black/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-teal-400" />
      <div className="pointer-events-none absolute -right-28 -top-28 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-48 h-52 w-52 rounded-full bg-teal-500/10 blur-3xl" />

      <section className="relative rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-slate-50 via-white to-teal-50/60 dark:from-slate-900 dark:via-slate-950 dark:to-teal-950/20 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-fuchsia-200/80 dark:border-fuchsia-900/50 bg-fuchsia-50 dark:bg-fuchsia-950/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-700 dark:text-fuchsia-300">
              <WandSparkles className="h-3.5 w-3.5" />
              AI Trip Designer
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Build a trip that fits your <span className="bg-gradient-to-r from-fuchsia-600 to-teal-500 bg-clip-text text-transparent">style and budget</span>
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Tell us the basics. TripBalancing will match the destination, experience level, daily plan and estimated cost.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[330px]">
            {[{label:'Personalized', icon: Sparkles}, {label:'Budget-aware', icon: IndianRupee}, {label:'Safer plan', icon: ShieldCheck}].map(({label, icon: Icon}) => (
              <div key={label} className="rounded-2xl border border-white/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-3 text-center shadow-sm backdrop-blur">
                <Icon className="mx-auto h-4 w-4 text-teal-500" />
                <div className="mt-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {error && (
        <div className="flex items-start gap-2.5 p-4 border rounded-2xl bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400 text-sm leading-relaxed">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Origin and Destination Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Origin Field */}
        <div className="space-y-3">
          <label htmlFor="origin-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <PlaneTakeoff className="w-4 h-4 text-violet-500" />
            Where are you traveling from?
          </label>
          <div className="relative">
            <input
              id="origin-input"
              type="text"
              placeholder="Enter starting city (e.g. New York, London, Tokyo...)"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              disabled={loading}
              className="w-full pl-5 pr-12 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-800 dark:text-slate-200 rounded-2xl text-base transition-all"
            />
          </div>
        </div>

        {/* Destination Field */}
        <div className="space-y-3">
          <label htmlFor="destination-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-500" />
            Where are you traveling to?
          </label>
          <div className="relative">
            <input
              id="destination-input"
              type="text"
              placeholder="Enter destination (e.g. Paris, Tokyo, Bali, Rome...)"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={loading}
              className="w-full pl-5 pr-12 py-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-base transition-all"
              required
            />
            <Compass className="absolute right-4 top-4.5 w-5 h-5 text-slate-400 animate-spin-slow" />
          </div>
        </div>
      </div>

      {/* Popular Tags */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className="text-xs font-medium text-slate-400">Popular Destinations:</span>
        {POPULAR_DESTINATIONS.map((dest) => (
          <button
            id={`popular-dest-${dest.name.replace(/\s+/g, '-').toLowerCase()}`}
            type="button"
            key={dest.name}
            disabled={loading}
            onClick={() => setDestination(dest.name)}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-slate-100 hover:bg-teal-50 dark:bg-slate-900 dark:hover:bg-slate-850 border border-transparent hover:border-teal-200 dark:hover:border-teal-950 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-full transition-all cursor-pointer"
          >
            <span>{dest.icon}</span>
            <span>{dest.name}</span>
          </button>
        ))}
      </div>

      {/* 2. Select Your Travel Style */}
      <div className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.16em] block">
              Select Your Travel Style
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">This changes where you stay, what you eat and which experiences are prioritized.</p>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Choose one</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 w-full gap-3">
          {TRAVEL_STYLES.map(({ name: style, icon, description }) => {
            const isSelected = travelStyle === style;
            const styleTheme = getStyleTheme(style);
            return (
              <button
                id={`style-btn-${style.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                type="button" key={style} disabled={loading}
                onClick={() => { setTravelStyle(style); if (style !== "Budget") setIsAiBudgetPlanner(false); }}
                title={description}
                className={`group relative overflow-hidden p-3.5 rounded-2xl text-left border transition-all cursor-pointer min-h-[128px] flex flex-col ${isSelected ? `${styleTheme.bg} ${styleTheme.border} ${styleTheme.text} ring-2 ring-offset-2 dark:ring-offset-slate-950 ring-fuchsia-500/25 shadow-lg shadow-fuchsia-500/5 -translate-y-0.5` : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:-translate-y-0.5 hover:border-teal-300 dark:hover:border-teal-800 hover:shadow-lg"}`}
              >
                {isSelected && <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white"><Check className="h-3 w-3" /></span>}
                {style === "Smart Luxury" && <span className="absolute left-0 top-0 rounded-br-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white">Recommended</span>}
                <div className={`text-2xl mb-2 ${style === "Smart Luxury" ? "mt-4" : ""}`}>{icon}</div>
                <div className="text-sm font-black leading-tight pr-5">{style}</div>
                <div className="mt-1.5 text-[10px] leading-4 opacity-75">{description}</div>
              </button>
            );
          })}
        </div>

        {travelStyle === "Smart Luxury" && (
          <div className="mt-4 p-4 bg-fuchsia-500/5 border border-fuchsia-200 dark:border-fuchsia-900/40 rounded-2xl">
            <div className="font-extrabold text-fuchsia-700 dark:text-fuchsia-400">✨ Smart Luxury — no budget required</div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">AI will calculate Minimum Luxury, Best-Value Smart Luxury and Premium Luxury, then build the recommended best-value plan.</p>
          </div>
        )}

        {travelStyle === "Budget" && (
          <div className="mt-4 p-4 bg-teal-500/5 dark:bg-teal-500/5 border border-teal-100 dark:border-teal-900/40 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="text-left w-full sm:w-auto">
              <h4 className="text-sm font-extrabold text-teal-850 dark:text-teal-400 flex items-center gap-1.5">
                <span>Budget Planning Mode</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Select manual input or let AI calculate the optimal duration.</p>
            </div>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/20 w-full sm:w-auto">
              <button
                id="btn-manual-budget-mode"
                type="button"
                onClick={() => setIsAiBudgetPlanner(false)}
                className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all ${!isAiBudgetPlanner ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                Manual Planning
              </button>
              <button
                id="btn-ai-budget-mode"
                type="button"
                onClick={() => setIsAiBudgetPlanner(true)}
                className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${isAiBudgetPlanner ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
              >
                AI Budget Planner ✨
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3, 4, 5. Date Selectors */}
      {travelStyle === "Budget" && isAiBudgetPlanner ? (
        <div className="flex flex-wrap gap-5 w-full max-w-full min-w-0">
          <div className="flex-1 min-w-[240px] space-y-2">
            <label htmlFor="start-date" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-500" />
              Start Date (Optional)
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={loading}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-sm transition-all"
            />
          </div>
          <div className="flex-1 min-w-[240px] flex items-end">
            <div className="p-4 bg-teal-500/5 dark:bg-teal-500/5 border border-teal-100/50 dark:border-teal-900/30 rounded-2xl text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2.5 min-h-[52px] w-full">
              <Sparkles className="w-4 h-4 text-teal-500 flex-shrink-0 animate-pulse" />
              <span>AI will automatically compute the maximum possible duration based on your budget!</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] w-full max-w-full min-w-0 gap-5">
          <div className="space-y-2">
            <label htmlFor="start-date" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-500" />
              Start Date
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              disabled={loading}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="travel-days" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-500" />
              Trip Duration (Days)
            </label>
            <input
              id="travel-days"
              type="number"
              value={travelDays}
              onChange={(e) => handleTravelDaysChange(e.target.value)}
              disabled={loading}
              min="1"
              max="365"
              placeholder="1 to 365 days"
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-sm transition-all"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="end-date" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-500" />
              End Date
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              disabled={loading}
              min={startDate || new Date().toISOString().split("T")[0]}
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-sm transition-all"
              required
            />
          </div>
        </div>
      )}

      {/* 6, 7. Budget & Travelers */}
      <div className="flex flex-wrap gap-6 w-full max-w-full min-w-0">
        {travelStyle !== "Smart Luxury" && <div className="flex-1 min-w-[280px] space-y-2">
          <label htmlFor="budget-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            {budgetPrefix === "₹" ? <IndianRupee className="w-4 h-4 text-teal-500" /> : <DollarSign className="w-4 h-4 text-teal-500" />}
            Total Trip Budget
          </label>
          <div className="flex gap-2">
            <div className="flex flex-shrink-0 bg-slate-100 dark:bg-slate-900 rounded-2xl p-1 border border-slate-200 dark:border-slate-800">
              <button
                id="budget-prefix-inr"
                type="button"
                onClick={() => setBudgetPrefix("₹")}
                className={`px-3 py-1 text-sm font-bold rounded-xl transition-all ${budgetPrefix === "₹" ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
              >
                ₹<span className="hidden sm:inline"> (INR)</span>
              </button>
              <button
                id="budget-prefix-usd"
                type="button"
                onClick={() => setBudgetPrefix("$")}
                className={`px-3 py-1 text-sm font-bold rounded-xl transition-all ${budgetPrefix === "$" ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}
              >
                $<span className="hidden sm:inline"> (USD)</span>
              </button>
            </div>
            <input
              id="budget-input"
              type="number"
              placeholder="Budget Amount"
              value={budgetVal}
              onChange={(e) => setBudgetVal(e.target.value)}
              disabled={loading}
              min="1"
              className="flex-1 min-w-0 px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl text-sm transition-all"
              required
            />
          </div>
        </div>}

        <div className="flex-1 min-w-[280px] space-y-2">
          <label htmlFor="travelers-input" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-500" />
            Number of Travelers
          </label>
          <div className="flex items-center gap-3">
            <button
              id="travelers-minus-btn"
              type="button"
              disabled={loading || travelers <= 1}
              onClick={() => setTravelers(prev => Math.max(1, prev - 1))}
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200 font-bold rounded-2xl transition-all cursor-pointer disabled:opacity-50"
            >
              -
            </button>
            <input
              id="travelers-input"
              type="number"
              value={travelers}
              onChange={(e) => setTravelers(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={loading}
              min="1"
              className="flex-1 min-w-0 text-center py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 rounded-2xl font-bold text-sm transition-all"
            />
            <button
              id="travelers-plus-btn"
              type="button"
              disabled={loading}
              onClick={() => setTravelers(prev => prev + 1)}
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200 font-bold rounded-2xl transition-all cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {travelStyle === "Budget" && isAiBudgetPlanner && budgetVal && Number(budgetVal) > 0 && (
        <div className="p-4 bg-teal-500/10 dark:bg-teal-500/5 border border-teal-200/50 dark:border-teal-900/30 text-teal-850 dark:text-teal-300 text-sm font-bold rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <Sparkles className="w-5 h-5 text-teal-500 flex-shrink-0 animate-pulse" />
          <span>
            {(() => {
              const amount = Number(budgetVal);
              const symbol = budgetPrefix;
              const dailyCostPerPerson = symbol === "₹" ? 3000 : 50;
              const totalDailyCost = dailyCostPerPerson * travelers;
              const days = Math.max(1, Math.floor(amount / totalDailyCost));
              if (days === 1) {
                return `With your budget of ${symbol}${amount.toLocaleString()}, you can comfortably travel for 1 day.`;
              }
              return `With your budget of ${symbol}${amount.toLocaleString()}, you can comfortably travel for ${days} days and ${days - 1} nights.`;
            })()}
          </span>
        </div>
      )}

      {/* 8. Submit Button */}
      <button
        id="itinerary-submit-btn"
        type="submit"
        disabled={loading}
        className="group relative w-full overflow-hidden flex items-center justify-center gap-2.5 py-4.5 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-teal-500 hover:shadow-xl hover:shadow-fuchsia-500/20 active:scale-[0.99] disabled:opacity-50 text-white font-black rounded-2xl cursor-pointer transition-all text-base shadow-lg"
      >
        {loading ? (
          <>
            <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Consulting AI Travel Expert...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 animate-pulse" />
            <span>Generate Itinerary with AI</span>
          </>
        )}
      </button>

    </form>
  );
}
