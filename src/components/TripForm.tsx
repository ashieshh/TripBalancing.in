import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  Compass,
  DollarSign,
  IndianRupee,
  MapPin,
  PlaneTakeoff,
  Sparkles,
  Users,
} from "lucide-react";
import {
  BudgetMode,
  DestinationRecommendation,
  PlanningMode,
  RevisitPreference,
  TravelerType,
  TravelStyle,
  TripInput,
} from "../types";
import { BudgetFeasibilityResult, evaluateBudgetFeasibility } from "../utils/budgetCalculator";

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

const TRAVELER_TYPES: Array<{ name: TravelerType; icon: string }> = [
  { name: "Couple", icon: "💕" },
  { name: "Honeymoon", icon: "💍" },
  { name: "Family", icon: "👨‍👩‍👧" },
  { name: "Friends", icon: "👥" },
  { name: "Solo", icon: "🧍" },
  { name: "Business", icon: "💼" },
  { name: "Senior Citizens", icon: "👴" },
  { name: "Students", icon: "🎓" },
  { name: "Women-only Trip", icon: "👭" },
  { name: "Group Trip", icon: "🚌" },
];

const TRAVEL_STYLES: Array<{ name: TravelStyle; icon: string; description: string }> = [
  { name: "Budget", icon: "💰", description: "Safe and enjoyable at the lowest practical cost" },
  { name: "Smart Luxury", icon: "✨", description: "Best luxury feeling for the best value" },
  { name: "Luxury", icon: "👑", description: "Maximum luxury within your selected limit" },
  { name: "Family", icon: "👨‍👩‍👧", description: "Comfortable, safe and child-friendly" },
  { name: "Solo", icon: "🧍", description: "Safe, social and flexible solo travel" },
  { name: "Adventure", icon: "🧗", description: "Outdoor thrills and active experiences" },
  { name: "Business", icon: "💼", description: "Fast transport, workspaces and reliable stays" },
  { name: "Honeymoon", icon: "💕", description: "Romantic stays and memorable couple experiences" },
  { name: "Backpacker", icon: "🎒", description: "Hostels, local food and low-cost exploration" },
  { name: "Food Explorer", icon: "🍽️", description: "Markets, local dishes, cafés and food tours" },
  { name: "Wellness & Spa", icon: "🌿", description: "Spa, yoga, nature and slow travel" },
  { name: "Culture & History", icon: "🏛️", description: "Museums, heritage and local traditions" },
  { name: "Beach Escape", icon: "🏖️", description: "Beaches, sunsets, resorts and water activities" },
];

const INTERESTS = ["Beach", "Mountains", "Food", "Culture", "Nature", "Shopping", "Nightlife", "Adventure", "Wildlife", "Relaxation"];

export default function TripForm({ onSubmit, loading }: TripFormProps) {
  const [planningMode, setPlanningMode] = useState<PlanningMode>("known_destination");
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelDays, setTravelDays] = useState<number | "">("");
  const [budgetPrefix, setBudgetPrefix] = useState<"₹" | "$">("₹");
  const [budgetVal, setBudgetVal] = useState("50000");
  const [travelers, setTravelers] = useState(1);
  const [travelerType, setTravelerType] = useState<TravelerType>("Couple");
  const [travelStyle, setTravelStyle] = useState<TravelStyle>("Budget");
  const [budgetMode, setBudgetMode] = useState<BudgetMode>("fixed");
  const [tripScope, setTripScope] = useState<"Domestic" | "International" | "Both">("Domestic");
  const [tripPurpose, setTripPurpose] = useState("Vacation");
  const [preferredWeather, setPreferredWeather] = useState("Any");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(["Food", "Culture"]);
  const [visitedInput, setVisitedInput] = useState("");
  const [visitedDestinations, setVisitedDestinations] = useState<string[]>([]);
  const [revisitPreference, setRevisitPreference] = useState<RevisitPreference>("new_only");
  const [recommendations, setRecommendations] = useState<DestinationRecommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feasibility, setFeasibility] = useState<BudgetFeasibilityResult | null>(null);
  const [dreamTripSaved, setDreamTripSaved] = useState(false);
  const [feasibilityHighlight, setFeasibilityHighlight] = useState(false);
  const feasibilityRef = useRef<HTMLElement | null>(null);

  const recommendBudget = budgetMode === "recommended" || travelStyle === "Smart Luxury";

  useEffect(() => {
    if (!feasibility || feasibility.feasible || !feasibilityRef.current) return;

    // The feasibility result is rendered above the form controls. Bring it into view
    // immediately so users never think the Generate button did nothing.
    const timer = window.setTimeout(() => {
      feasibilityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      feasibilityRef.current?.focus({ preventScroll: true });
      setFeasibilityHighlight(true);
    }, 60);

    const highlightTimer = window.setTimeout(() => setFeasibilityHighlight(false), 2800);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(highlightTimer);
    };
  }, [feasibility]);

  const tripDatesValid = useMemo(() => Boolean(startDate && endDate), [startDate, endDate]);

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (!value) return;
    if (travelDays) {
      const end = new Date(value);
      end.setDate(end.getDate() + Number(travelDays) - 1);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (!startDate || !value) return;
    const start = new Date(startDate);
    const end = new Date(value);
    if (end >= start) {
      setTravelDays(Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    }
  };

  const handleTravelDaysChange = (value: string) => {
    if (!value) {
      setTravelDays("");
      return;
    }
    const days = Math.max(1, Math.min(365, Number.parseInt(value, 10) || 1));
    setTravelDays(days);
    if (startDate) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + days - 1);
      setEndDate(end.toISOString().split("T")[0]);
    }
  };

  const addVisitedDestination = () => {
    const value = visitedInput.trim();
    if (!value || visitedDestinations.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setVisitedDestinations((current) => [...current, value]);
    setVisitedInput("");
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) =>
      current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest],
    );
  };

  const getDestinationRecommendations = async () => {
    setError(null);
    if (!origin.trim()) return setError("Please enter your starting city.");
    if (!travelDays) return setError("Please enter the number of travel days.");
    if (!recommendBudget && (!budgetVal || Number(budgetVal) <= 0)) return setError("Please enter your total budget.");

    setRecommendationLoading(true);
    try {
      const response = await fetch("/api/recommend-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: origin.trim(),
          days: Number(travelDays),
          travelers,
          travelerType,
          travelStyle,
          budgetMode,
          budgetAmount: recommendBudget ? "AI Recommended" : `${budgetPrefix}${Number(budgetVal).toLocaleString()}`,
          tripScope,
          tripPurpose,
          preferredWeather,
          interests: selectedInterests,
          visitedDestinations,
          revisitPreference,
          startDate,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to recommend destinations.");
      setRecommendations(data.recommendations || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to recommend destinations.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDreamTripSaved(false);

    if (!destination.trim()) return setError(planningMode === "help_choose" ? "Select one recommended destination first." : "Please enter a destination.");
    if (!origin.trim()) return setError("Please enter your starting city.");
    if (!tripDatesValid) return setError("Please select the trip dates.");
    if (!recommendBudget && (!budgetVal || Number(budgetVal) <= 0)) return setError("Please enter your total trip budget.");

    // Validate both locations before any budget calculation. Never allow the AI to
    // silently reinterpret a typo such as "mumu" as a completely different city.
    try {
      const validationResponse = await fetch("/api/validate-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: origin.trim(), destination: destination.trim() }),
      });
      const validation = await validationResponse.json();
      if (!validationResponse.ok) {
        setError(validation.error || "Please enter valid city, state or country names.");
        return;
      }
      if (!validation.origin?.valid) {
        setError(`Starting location "${origin.trim()}" could not be verified. Please select a real city, state or country.`);
        return;
      }
      if (!validation.destination?.valid) {
        setError(`Destination "${destination.trim()}" could not be verified. Please select a real city, state or country.`);
        return;
      }

      // Use the geocoder's canonical labels for every downstream calculation.
      const canonicalOrigin = validation.origin.canonicalName || origin.trim();
      const canonicalDestination = validation.destination.canonicalName || destination.trim();
      setOrigin(canonicalOrigin);
      setDestination(canonicalDestination);

      // Fixed-budget trips must pass the feasibility gate before any AI itinerary is generated.
      if (!recommendBudget) {
        const check = evaluateBudgetFeasibility({
          destination: canonicalDestination,
          origin: canonicalOrigin,
          travelers,
          days: Math.max(1, Number(travelDays) || Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1),
          travelStyle,
          userBudgetInput: `${budgetPrefix}${Number(budgetVal).toLocaleString()}`,
        });

        setFeasibility(check);
        if (!check.feasible) return;
      } else {
        setFeasibility(null);
      }

      onSubmit({
        planningMode,
        destination: canonicalDestination,
        origin: canonicalOrigin,
        startDate,
        endDate,
        budgetAmount: recommendBudget ? "AI Recommended" : `${budgetPrefix}${Number(budgetVal).toLocaleString()}`,
        travelers,
        travelerType,
        travelStyle,
        budgetMode,
        tripPurpose,
        preferredWeather,
        interests: selectedInterests,
        visitedDestinations,
        revisitPreference,
        isAiBudgetPlanner: recommendBudget,
      });
      return;
    } catch {
      setError("We could not verify the locations right now. Please try again.");
      return;
    }

  };

  const formatFeasibilityMoney = (value: number) => {
    const symbol = feasibility?.estimate.currencySymbol || budgetPrefix;
    return `${symbol}${Math.round(value).toLocaleString()}`;
  };

  const useMinimumBudget = () => {
    if (!feasibility) return;
    setBudgetVal(String(Math.ceil(feasibility.minimumBudget / 1000) * 1000));
    setFeasibility(null);
    setError(null);
  };

  const chooseAnotherStyle = () => {
    setFeasibility(null);
    setError("Choose another Travel Style below, then generate again.");
    setTimeout(() => document.getElementById("travel-style-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const findSimilarDestinations = () => {
    setFeasibility(null);
    setPlanningMode("help_choose");
    setDestination("");
    setRecommendations([]);
    setError("We kept your budget. Complete Help Me Choose to find destinations that fit it.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveDreamTrip = () => {
    try {
      const key = "tripbalancing_dream_trips";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const record = {
        destination: destination.trim(),
        origin: origin.trim(),
        travelers,
        travelStyle,
        startDate,
        endDate,
        plannedBudget: `${budgetPrefix}${Number(budgetVal).toLocaleString()}`,
        minimumBudget: feasibility ? formatFeasibilityMoney(feasibility.minimumBudget) : undefined,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 50)));
      setDreamTripSaved(true);
    } catch {
      setError("We could not save this Dream Trip on this device.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-sm text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/10 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feasibility && !feasibility.feasible && (
        <section
          ref={feasibilityRef}
          tabIndex={-1}
          aria-live="assertive"
          className={`rounded-3xl border bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm outline-none transition-all duration-500 dark:from-amber-950/20 dark:to-orange-950/10 sm:p-6 ${
            feasibilityHighlight
              ? "border-amber-400 ring-4 ring-amber-400/25 shadow-[0_0_0_8px_rgba(251,191,36,0.08)] scale-[1.01]"
              : "border-amber-300/70 dark:border-amber-800/50"
          }`}
        >
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-500/15 p-2.5 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">Budget Check</p>
                <h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">This trip is not realistic with the current budget</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  We stopped generation before creating impossible prices. For {destination}, your current budget covers about {feasibility.budgetCoveragePercent}% of the minimum realistic estimate.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Your Budget</span>
                <strong className="mt-1 block text-base text-slate-900 dark:text-white">{formatFeasibilityMoney(feasibility.userBudget)}</strong>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Minimum Realistic</span>
                <strong className="mt-1 block text-base text-slate-900 dark:text-white">{formatFeasibilityMoney(feasibility.minimumBudget)}</strong>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Recommended</span>
                <strong className="mt-1 block text-base text-teal-700 dark:text-teal-400">{formatFeasibilityMoney(feasibility.recommendedBudget)}</strong>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-3 dark:border-rose-900/30 dark:bg-rose-950/20">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">Shortfall</span>
                <strong className="mt-1 block text-base text-rose-700 dark:text-rose-400">{formatFeasibilityMoney(feasibility.shortfall)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button type="button" onClick={useMinimumBudget} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100">Increase Budget</button>
              <button type="button" onClick={chooseAnotherStyle} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition hover:border-teal-300 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Change Travel Style</button>
              <button type="button" onClick={findSimilarDestinations} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-black text-teal-700 transition hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-400">Find Similar Destinations</button>
              <button type="button" onClick={saveDreamTrip} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-700 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">{dreamTripSaved ? "✓ Dream Trip Saved" : "Save as Dream Trip"}</button>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 border-b border-slate-100 pb-6 dark:border-slate-900">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">Plan your trip</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">How would you like to start?</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a destination or let TripBalancing match one to your time and budget.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setPlanningMode("known_destination"); setRecommendations([]); }} className={`flex min-h-[92px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 ${planningMode === "known_destination" ? "border-teal-500 bg-teal-50 dark:bg-teal-950/20" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500 text-xl text-white">📍</div><div><div className="font-black text-slate-900 dark:text-white">I Know My Destination</div><p className="mt-1 text-xs text-slate-500">Plan the complete trip for a place you selected.</p></div>
          </button>
          <button type="button" onClick={() => { setPlanningMode("help_choose"); setDestination(""); }} className={`flex min-h-[92px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 ${planningMode === "help_choose" ? "border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-950/20" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xl dark:bg-violet-950/50">✨</div><div><div className="font-black text-slate-900 dark:text-white">Help Me Choose</div><p className="mt-1 text-xs text-slate-500">Get destination matches from your time, budget and interests.</p></div>
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <FieldLabel icon={<PlaneTakeoff className="h-4 w-4 text-violet-500" />} label="Travelling from">
          <input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Mumbai, London, New York..." className="input-field" />
        </FieldLabel>
        {planningMode === "known_destination" ? (
          <FieldLabel icon={<MapPin className="h-4 w-4 text-teal-500" />} label="Destination">
            <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Jaipur, Paris, Bali..." className="input-field" />
          </FieldLabel>
        ) : (
          <FieldLabel icon={<Compass className="h-4 w-4 text-fuchsia-500" />} label="Trip scope">
            <div className="grid grid-cols-3 gap-2">{(["Domestic", "International", "Both"] as const).map((scope) => <ChoiceButton key={scope} selected={tripScope === scope} onClick={() => setTripScope(scope)}>{scope}</ChoiceButton>)}</div>
          </FieldLabel>
        )}
      </section>

      {planningMode === "known_destination" && (
        <div className="flex flex-wrap gap-2">{POPULAR_DESTINATIONS.map((item) => <button key={item.name} type="button" onClick={() => setDestination(item.name)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-400">{item.icon} {item.name}</button>)}</div>
      )}

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Who is travelling?</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{TRAVELER_TYPES.map((item) => <ChoiceButton key={item.name} selected={travelerType === item.name} onClick={() => setTravelerType(item.name)}><span className="mr-1">{item.icon}</span>{item.name}</ChoiceButton>)}</div>
      </section>

      <section id="travel-style-section" className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Select your travel style</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] gap-3">{TRAVEL_STYLES.map((item) => <button key={item.name} type="button" onClick={() => setTravelStyle(item.name)} title={item.description} className={`min-h-[112px] rounded-2xl border-2 p-3 text-center transition ${travelStyle === item.name ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-300" : "border-slate-100 bg-slate-50/50 text-slate-600 dark:border-slate-900 dark:bg-slate-900/30 dark:text-slate-400"}`}><div className="text-xl">{item.icon}</div><div className="mt-1 text-sm font-bold">{item.name}{item.name === "Smart Luxury" && <span className="ml-1 text-[9px] text-fuchsia-500">NEW</span>}</div><p className="mt-1 text-[10px] leading-tight opacity-75">{item.description}</p></button>)}</div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Budget mode</p>
        <div className="grid gap-3 md:grid-cols-2">
          <ChoiceButton selected={budgetMode === "fixed" && travelStyle !== "Smart Luxury"} onClick={() => { setBudgetMode("fixed"); if (travelStyle === "Smart Luxury") setTravelStyle("Luxury"); }}>💳 I have a fixed budget</ChoiceButton>
          <ChoiceButton selected={recommendBudget} onClick={() => setBudgetMode("recommended")}>✨ Recommend the ideal budget</ChoiceButton>
        </div>
        {travelStyle === "Smart Luxury" && <p className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs text-fuchsia-700 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20 dark:text-fuchsia-300">Smart Luxury automatically recommends the best-value luxury budget. It avoids wasteful ultra-luxury spending.</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="Start date"><input type="date" value={startDate} onChange={(event) => handleStartDateChange(event.target.value)} min={new Date().toISOString().split("T")[0]} className="input-field" /></FieldLabel>
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="Trip duration"><input type="number" min="1" max="365" value={travelDays} onChange={(event) => handleTravelDaysChange(event.target.value)} placeholder="Number of days" className="input-field" /></FieldLabel>
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="End date"><input type="date" value={endDate} onChange={(event) => handleEndDateChange(event.target.value)} min={startDate || new Date().toISOString().split("T")[0]} className="input-field" /></FieldLabel>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {!recommendBudget ? (
          <FieldLabel icon={budgetPrefix === "₹" ? <IndianRupee className="h-4 w-4 text-teal-500" /> : <DollarSign className="h-4 w-4 text-teal-500" />} label="Maximum total trip budget">
            <div className="flex gap-2"><div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"><button type="button" onClick={() => setBudgetPrefix("₹")} className={`rounded-xl px-3 font-bold ${budgetPrefix === "₹" ? "bg-white text-teal-600 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>₹</button><button type="button" onClick={() => setBudgetPrefix("$")} className={`rounded-xl px-3 font-bold ${budgetPrefix === "$" ? "bg-white text-teal-600 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>$</button></div><input type="number" min="1" value={budgetVal} onChange={(event) => setBudgetVal(event.target.value)} className="input-field" /></div>
          </FieldLabel>
        ) : <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300"><Sparkles className="mb-2 h-5 w-5" /><strong>AI budget recommendation enabled.</strong><p className="mt-1 text-xs opacity-80">You will receive minimum practical, recommended and premium estimates.</p></div>}
        <FieldLabel icon={<Users className="h-4 w-4 text-teal-500" />} label="Number of travelers"><div className="flex items-center gap-3"><button type="button" onClick={() => setTravelers((value) => Math.max(1, value - 1))} className="counter-btn">−</button><input type="number" min="1" value={travelers} onChange={(event) => setTravelers(Math.max(1, Number(event.target.value) || 1))} className="input-field text-center font-bold" /><button type="button" onClick={() => setTravelers((value) => value + 1)} className="counter-btn">+</button></div></FieldLabel>
      </section>

      {planningMode === "help_choose" && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <h3 className="font-black text-slate-900 dark:text-white">Destination preferences</h3>
          <div className="grid gap-4 md:grid-cols-3"><FieldLabel label="Trip purpose"><select value={tripPurpose} onChange={(event) => setTripPurpose(event.target.value)} className="input-field"><option>Vacation</option><option>Weekend Trip</option><option>Honeymoon</option><option>Birthday</option><option>Anniversary</option><option>Friends Reunion</option><option>Relaxation</option><option>Food Tour</option><option>Adventure</option><option>Pilgrimage</option></select></FieldLabel><FieldLabel label="Preferred weather"><select value={preferredWeather} onChange={(event) => setPreferredWeather(event.target.value)} className="input-field"><option>Any</option><option>Sunny</option><option>Cold</option><option>Mild</option><option>Rainy</option><option>Snow</option></select></FieldLabel><FieldLabel label="Visited-place rule"><select value={revisitPreference} onChange={(event) => setRevisitPreference(event.target.value as RevisitPreference)} className="input-field"><option value="new_only">New places only</option><option value="allow_revisit">New + visited places</option><option value="favorites_only">Revisit favourites</option></select></FieldLabel></div>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">What do you enjoy?</p><div className="flex flex-wrap gap-2">{INTERESTS.map((interest) => <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selectedInterests.includes(interest) ? "border-fuchsia-500 bg-fuchsia-500 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>{selectedInterests.includes(interest) && <Check className="mr-1 inline h-3 w-3" />}{interest}</button>)}</div></div>
          <FieldLabel label="Places already visited"><div className="flex gap-2"><input value={visitedInput} onChange={(event) => setVisitedInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addVisitedDestination(); } }} placeholder="Type Goa, Jaipur, Dubai..." className="input-field" /><button type="button" onClick={addVisitedDestination} className="rounded-2xl bg-slate-900 px-4 font-bold text-white dark:bg-white dark:text-slate-900">Add</button></div></FieldLabel>
          {visitedDestinations.length > 0 && <div className="flex flex-wrap gap-2">{visitedDestinations.map((place) => <button key={place} type="button" onClick={() => setVisitedDestinations((current) => current.filter((item) => item !== place))} className="rounded-full bg-slate-200 px-3 py-1 text-xs dark:bg-slate-800">{place} ×</button>)}</div>}
          <button type="button" onClick={getDestinationRecommendations} disabled={recommendationLoading || loading} className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-4 font-bold text-white disabled:opacity-50">{recommendationLoading ? "Finding your best destinations..." : "✨ Recommend Destinations"}</button>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="space-y-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Best matches</p><h3 className="text-xl font-black">Select one destination to continue</h3></div><div className="grid gap-4 md:grid-cols-3">{recommendations.map((item, index) => <button key={`${item.destination}-${index}`} type="button" onClick={() => setDestination(item.destination)} className={`rounded-2xl border-2 p-5 text-left transition ${destination === item.destination ? "border-teal-500 bg-teal-50 dark:bg-teal-950/20" : "border-slate-200 dark:border-slate-800"}`}><div className="flex items-center justify-between"><span className="font-black">{index + 1}. {item.destination}</span><span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-black text-teal-700">{item.matchScore}%</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.whyItFits}</p><p className="mt-3 text-xs font-bold text-slate-500">Estimated: {item.estimatedCostRange}</p><p className="mt-1 text-xs text-slate-500">Best for: {item.bestFor.join(", ")}</p></button>)}</div></section>
      )}

      <button type="submit" disabled={loading || recommendationLoading || (planningMode === "help_choose" && !destination)} className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 py-4 text-base font-bold text-white shadow-md transition hover:shadow-lg disabled:opacity-50">{loading ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />Consulting AI Travel Expert...</> : <><Sparkles className="h-5 w-5" />{planningMode === "help_choose" ? "Build Trip for Selected Destination" : "Generate Itinerary with AI"}</>}</button>
    </form>
  );
}

function FieldLabel({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return <label className="block space-y-2"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{icon}{label}</span>{children}</label>;
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border-2 px-3 py-3 text-sm font-bold transition ${selected ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-300" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>{children}</button>;
}
