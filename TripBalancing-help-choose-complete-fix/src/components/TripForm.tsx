import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  DollarSign,
  IndianRupee,
  MapPin,
  RotateCcw,
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
import LocationAutocomplete, { LocationSuggestion } from "./LocationAutocomplete";

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
  { name: "Budget", icon: "💰", description: "Lowest practical cost" },
  { name: "Smart Luxury", icon: "✨", description: "Best premium value" },
  { name: "Luxury", icon: "👑", description: "High-end comfort and service" },
  { name: "Adventure", icon: "🧗", description: "Outdoor thrills and active days" },
  { name: "Backpacker", icon: "🎒", description: "Hostels and low-cost exploring" },
  { name: "Food Explorer", icon: "🍽️", description: "Local food and culinary experiences" },
  { name: "Wellness & Spa", icon: "🌿", description: "Spa, yoga and slow travel" },
  { name: "Culture & History", icon: "🏛️", description: "Heritage, museums and traditions" },
  { name: "Beach Escape", icon: "🏖️", description: "Beaches, resorts and water activities" },
  { name: "Nature & Wildlife", icon: "🌲", description: "Nature, wildlife and scenic escapes" },
  { name: "Shopping", icon: "🛍️", description: "Markets, malls and local finds" },
  { name: "Nightlife", icon: "🌃", description: "Evenings, music and entertainment" },
];

const INTERESTS = ["Beach", "Mountains", "Food", "Culture", "Nature", "Shopping", "Nightlife", "Adventure", "Wildlife", "Relaxation"];
const HELP_STEPS = ["Trip basics", "Preferences", "Dates & budget", "AI recommendations", "Review"];

type HelpStep = 1 | 2 | 3 | 4 | 5;

export default function TripForm({ onSubmit, loading }: TripFormProps) {
  const [planningMode, setPlanningMode] = useState<PlanningMode>("known_destination");
  const [helpStep, setHelpStep] = useState<HelpStep>(1);
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [originConfirmed, setOriginConfirmed] = useState(false);
  const [destinationConfirmed, setDestinationConfirmed] = useState(false);
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
  const [errorHighlight, setErrorHighlight] = useState(false);
  const [feasibility, setFeasibility] = useState<BudgetFeasibilityResult | null>(null);
  const [dreamTripSaved, setDreamTripSaved] = useState(false);
  const [feasibilityHighlight, setFeasibilityHighlight] = useState(false);

  const errorRef = useRef<HTMLDivElement | null>(null);
  const feasibilityRef = useRef<HTMLElement | null>(null);
  const wizardTopRef = useRef<HTMLDivElement | null>(null);

  const recommendBudget = budgetMode === "recommended" || travelStyle === "Smart Luxury";
  const tripDatesValid = useMemo(() => Boolean(startDate && endDate), [startDate, endDate]);

  const scrollToElement = (element: HTMLElement | null, highlight?: () => void) => {
    if (!element) return;
    // Wait until React has committed the card and browser layout is stable.
    window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus({ preventScroll: true });
      highlight?.();
    }, 140);
  };

  useEffect(() => {
    if (!error || !errorRef.current) return;
    scrollToElement(errorRef.current, () => setErrorHighlight(true));
    const timer = window.setTimeout(() => setErrorHighlight(false), 2600);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!feasibility || feasibility.feasible || !feasibilityRef.current) return;
    scrollToElement(feasibilityRef.current, () => setFeasibilityHighlight(true));
    const timer = window.setTimeout(() => setFeasibilityHighlight(false), 2800);
    return () => window.clearTimeout(timer);
  }, [feasibility]);

  const goWizardTop = () => {
    window.setTimeout(() => wizardTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  const setFormError = (message: string) => {
    setError(message);
  };

  const clearTransient = () => {
    setError(null);
    setFeasibility(null);
    setDreamTripSaved(false);
  };

  const switchPlanningMode = (mode: PlanningMode) => {
    clearTransient();
    setPlanningMode(mode);
    setHelpStep(1);
    setRecommendations([]);
    setDestination("");
    setDestinationConfirmed(false);
    goWizardTop();
  };

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
    if (end >= start) setTravelDays(Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  };

  const handleTravelDaysChange = (value: string) => {
    if (!value) return setTravelDays("");
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
    setSelectedInterests((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]);
  };

  const validateHelpStep = (step: HelpStep): boolean => {
    setError(null);
    if (step === 1) {
      if (!origin.trim()) return setFormError("Please enter your starting city."), false;
      if (!originConfirmed) return setFormError("Please select your starting city from the location suggestions."), false;
      if (!travelers || travelers < 1) return setFormError("Please enter the number of travelers."), false;
    }
    if (step === 2 && selectedInterests.length === 0) return setFormError("Please select at least one travel interest."), false;
    if (step === 3) {
      if (!travelDays) return setFormError("Please enter the number of travel days."), false;
      if (!startDate) return setFormError("Please select your trip start date."), false;
      if (!recommendBudget && (!budgetVal || Number(budgetVal) <= 0)) return setFormError("Please enter your total trip budget."), false;
    }
    if (step === 4 && recommendations.length === 0) return setFormError("Find destination recommendations before continuing."), false;
    if (step === 5 && (!destination || !destinationConfirmed)) return setFormError("Please select one recommended destination."), false;
    return true;
  };

  const nextHelpStep = () => {
    if (!validateHelpStep(helpStep)) return;
    if (helpStep < 5) {
      setHelpStep((helpStep + 1) as HelpStep);
      setError(null);
      goWizardTop();
    }
  };

  const previousHelpStep = () => {
    setError(null);
    if (helpStep === 1) {
      switchPlanningMode("known_destination");
      return;
    }
    setHelpStep((helpStep - 1) as HelpStep);
    goWizardTop();
  };

  const getDestinationRecommendations = async () => {
    setError(null);
    if (!validateHelpStep(3)) {
      setHelpStep(3);
      return;
    }
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to recommend destinations right now.");
      const next = Array.isArray(data.recommendations) ? data.recommendations : [];
      if (!next.length) throw new Error("No destination matches were returned. Please try again.");
      setRecommendations(next);
      setDestination("");
      setDestinationConfirmed(false);
      setHelpStep(5);
      goWizardTop();
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Unable to recommend destinations right now. Please try again.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  const selectRecommendation = (item: DestinationRecommendation) => {
    setDestination(item.destination);
    setDestinationConfirmed(true);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDreamTripSaved(false);

    if (planningMode === "help_choose" && helpStep !== 5) return setFormError("Complete the Help Me Choose steps before building your trip.");
    if (!destination.trim()) return setFormError(planningMode === "help_choose" ? "Select one recommended destination first." : "Please enter a destination.");
    if (!origin.trim()) return setFormError("Please enter your starting city.");
    if (!originConfirmed) return setFormError("Please select your starting city from the suggestions before continuing.");
    if (!destinationConfirmed) return setFormError(planningMode === "help_choose" ? "Please select one recommended destination first." : "Please select your destination from the suggestions before continuing.");
    if (!tripDatesValid) return setFormError("Please select the trip dates.");
    if (!recommendBudget && (!budgetVal || Number(budgetVal) <= 0)) return setFormError("Please enter your total trip budget.");

    try {
      const validationResponse = await fetch("/api/validate-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: origin.trim(), destination: destination.trim() }),
      });
      const validation = await validationResponse.json().catch(() => ({}));
      if (!validationResponse.ok) return setFormError(validation.error || "Please select valid locations.");
      if (!validation.origin?.valid) return setFormError(`Starting location "${origin.trim()}" could not be verified. Please select a location from the suggestions.`);
      if (!validation.destination?.valid) return setFormError(`Destination "${destination.trim()}" could not be verified. Please select a location from the suggestions.`);

      const canonicalOrigin = validation.origin.canonicalName || origin.trim();
      const canonicalDestination = validation.destination.canonicalName || destination.trim();
      setOrigin(canonicalOrigin);
      setDestination(canonicalDestination);

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
    } catch {
      setFormError("We could not verify the trip details right now. Please check your connection and try again.");
    }
  };

  const formatFeasibilityMoney = (value: number) => `${feasibility?.estimate.currencySymbol || budgetPrefix}${Math.round(value).toLocaleString()}`;
  const useMinimumBudget = () => {
    if (!feasibility) return;
    setBudgetVal(String(Math.ceil(feasibility.minimumBudget / 1000) * 1000));
    setFeasibility(null);
    setError(null);
  };
  const chooseAnotherStyle = () => {
    setFeasibility(null);
    setFormError("Choose another Travel Style, then generate again.");
    window.setTimeout(() => document.getElementById("travel-style-section")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };
  const findSimilarDestinations = () => {
    setFeasibility(null);
    setPlanningMode("help_choose");
    setHelpStep(1);
    setDestination("");
    setDestinationConfirmed(false);
    setRecommendations([]);
    setError(null);
    goWizardTop();
  };
  const saveDreamTrip = () => {
    try {
      const key = "tripbalancing_dream_trips";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const record = { destination: destination.trim(), origin: origin.trim(), travelers, travelStyle, startDate, endDate, plannedBudget: `${budgetPrefix}${Number(budgetVal).toLocaleString()}`, minimumBudget: feasibility ? formatFeasibilityMoney(feasibility.minimumBudget) : undefined, savedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 50)));
      setDreamTripSaved(true);
    } catch {
      setFormError("We could not save this Dream Trip on this device.");
    }
  };

  const travelerGrid = (
    <section className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Who is travelling?</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TRAVELER_TYPES.map((item) => <ChoiceButton key={item.name} selected={travelerType === item.name} onClick={() => setTravelerType(item.name)}>{item.icon} {item.name}</ChoiceButton>)}
      </div>
    </section>
  );

  const travelStyleGrid = (
    <section id="travel-style-section" className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Select your travel style</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {TRAVEL_STYLES.map((item) => (
          <button key={item.name} type="button" onClick={() => { setTravelStyle(item.name); if (item.name === "Smart Luxury") setBudgetMode("recommended"); }} className={`min-h-[112px] rounded-2xl border-2 p-3 text-left transition ${travelStyle === item.name ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm dark:bg-teal-950/20 dark:text-teal-300" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>
            <div className="text-xl">{item.icon}</div><div className="mt-1 text-sm font-black">{item.name}{item.name === "Smart Luxury" && <span className="ml-1 text-[9px] text-fuchsia-500">NEW</span>}</div><p className="mt-1 text-[10px] leading-tight opacity-75">{item.description}</p>
          </button>
        ))}
      </div>
    </section>
  );

  const dateBudgetFields = (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="Start date"><input type="date" value={startDate} onChange={(event) => handleStartDateChange(event.target.value)} min={new Date().toISOString().split("T")[0]} className="input-field" /></FieldLabel>
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="Trip duration"><input type="number" min="1" max="365" value={travelDays} onChange={(event) => handleTravelDaysChange(event.target.value)} placeholder="Number of days" className="input-field" /></FieldLabel>
        <FieldLabel icon={<Calendar className="h-4 w-4 text-teal-500" />} label="End date"><input type="date" value={endDate} onChange={(event) => handleEndDateChange(event.target.value)} min={startDate || new Date().toISOString().split("T")[0]} className="input-field" /></FieldLabel>
      </section>
      <section className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Budget mode</p>
        <div className="grid gap-3 md:grid-cols-2"><ChoiceButton selected={budgetMode === "fixed" && travelStyle !== "Smart Luxury"} onClick={() => { setBudgetMode("fixed"); if (travelStyle === "Smart Luxury") setTravelStyle("Luxury"); }}>💳 I have a fixed budget</ChoiceButton><ChoiceButton selected={recommendBudget} onClick={() => setBudgetMode("recommended")}>✨ Recommend the ideal budget</ChoiceButton></div>
      </section>
      {!recommendBudget ? (
        <FieldLabel icon={budgetPrefix === "₹" ? <IndianRupee className="h-4 w-4 text-teal-500" /> : <DollarSign className="h-4 w-4 text-teal-500" />} label="Maximum total trip budget">
          <div className="flex gap-2"><div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"><button type="button" onClick={() => setBudgetPrefix("₹")} className={`rounded-xl px-3 font-bold ${budgetPrefix === "₹" ? "bg-white text-teal-600 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>₹</button><button type="button" onClick={() => setBudgetPrefix("$")} className={`rounded-xl px-3 font-bold ${budgetPrefix === "$" ? "bg-white text-teal-600 shadow-sm dark:bg-slate-800" : "text-slate-500"}`}>$</button></div><input type="number" min="1" value={budgetVal} onChange={(event) => setBudgetVal(event.target.value)} className="input-field" /></div>
        </FieldLabel>
      ) : <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300"><Sparkles className="mb-2 h-5 w-5" /><strong>AI budget recommendation enabled.</strong><p className="mt-1 text-xs opacity-80">You will receive minimum practical, recommended and premium estimates.</p></div>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="relative space-y-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6 lg:p-8">
      <div ref={wizardTopRef} className="scroll-mt-28" />

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className={`scroll-mt-28 rounded-2xl border bg-rose-50 p-4 text-rose-800 outline-none transition-all duration-500 dark:bg-rose-950/20 dark:text-rose-300 ${errorHighlight ? "border-rose-400 ring-4 ring-rose-400/20 shadow-lg" : "border-rose-200 dark:border-rose-900/50"}`}>
          <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" /><div className="flex-1"><p className="font-black">We need your attention</p><p className="mt-1 text-sm leading-relaxed">{error}</p></div></div>
          {planningMode === "help_choose" && helpStep === 4 && <div className="mt-4 grid gap-2 sm:grid-cols-3"><button type="button" onClick={getDestinationRecommendations} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Try Again</button><button type="button" onClick={() => { setError(null); setHelpStep(3); goWizardTop(); }} className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-black">← Back</button><button type="button" onClick={() => switchPlanningMode("known_destination")} className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-black">Plan Manually</button></div>}
        </div>
      )}

      {feasibility && !feasibility.feasible && (
        <section ref={feasibilityRef} tabIndex={-1} aria-live="assertive" className={`scroll-mt-28 rounded-3xl border bg-gradient-to-br from-amber-50 to-orange-50 p-5 outline-none transition-all duration-500 dark:from-amber-950/20 dark:to-orange-950/10 sm:p-6 ${feasibilityHighlight ? "border-amber-400 ring-4 ring-amber-400/25 shadow-lg" : "border-amber-300/70 dark:border-amber-800/50"}`}>
          <div className="flex gap-3"><AlertCircle className="mt-1 h-6 w-6 shrink-0 text-amber-500" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">Budget check</p><h3 className="mt-1 text-xl font-black">This trip is not realistic with the current budget</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We stopped generation before creating impossible prices.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Your budget" value={formatFeasibilityMoney(feasibility.userBudget)} /><Metric label="Minimum realistic" value={formatFeasibilityMoney(feasibility.minimumBudget)} /><Metric label="Recommended" value={formatFeasibilityMoney(feasibility.recommendedBudget)} accent /><Metric label="Shortfall" value={formatFeasibilityMoney(feasibility.shortfall)} danger /></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><button type="button" onClick={useMinimumBudget} className="rounded-xl bg-slate-900 px-3 py-3 text-xs font-black text-white dark:bg-white dark:text-slate-900">Increase Budget</button><button type="button" onClick={chooseAnotherStyle} className="rounded-xl border border-slate-300 px-3 py-3 text-xs font-black dark:border-slate-700">Change Travel Style</button><button type="button" onClick={findSimilarDestinations} className="rounded-xl border border-teal-500 px-3 py-3 text-xs font-black text-teal-600">Find Similar Destinations</button><button type="button" onClick={saveDreamTrip} className="rounded-xl border border-amber-500 px-3 py-3 text-xs font-black text-amber-700">{dreamTripSaved ? "✓ Dream Trip Saved" : "Save as Dream Trip"}</button></div>
        </section>
      )}

      <section className="space-y-4">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600">Plan your trip</p><h2 className="mt-1 text-2xl font-black">How would you like to start?</h2><p className="mt-1 text-sm text-slate-500">Choose a destination or let TripBalancing match one to your time and budget.</p></div>
        <div className="grid gap-3 md:grid-cols-2"><ChoiceButton selected={planningMode === "known_destination"} onClick={() => switchPlanningMode("known_destination")}>📍 I Know My Destination</ChoiceButton><ChoiceButton selected={planningMode === "help_choose"} onClick={() => switchPlanningMode("help_choose")}>✨ Help Me Choose</ChoiceButton></div>
      </section>

      {planningMode === "help_choose" ? (
        <div className="space-y-6">
          <WizardProgress step={helpStep} />

          <section className="min-h-[430px] rounded-3xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/30 sm:p-7">
            {helpStep === 1 && <div className="space-y-6"><StepHeading number={1} title="Trip basics" text="Tell us where you are starting and who is travelling." /><div className="grid gap-4 lg:grid-cols-2"><LocationAutocomplete label="Travelling from" value={origin} confirmed={originConfirmed} placeholder="Start typing your city..." onChange={(value) => { setOrigin(value); setOriginConfirmed(false); }} onSelect={(suggestion: LocationSuggestion) => { setOrigin(suggestion.canonicalName); setOriginConfirmed(true); setError(null); }} /><FieldLabel label="Trip scope"><select value={tripScope} onChange={(e) => setTripScope(e.target.value as typeof tripScope)} className="input-field"><option>Domestic</option><option>International</option><option>Both</option></select></FieldLabel></div><FieldLabel icon={<Users className="h-4 w-4 text-teal-500" />} label="Number of travelers"><div className="flex max-w-md items-center gap-3"><button type="button" onClick={() => setTravelers(v => Math.max(1, v - 1))} className="counter-btn">−</button><input type="number" min="1" value={travelers} onChange={(e) => setTravelers(Math.max(1, Number(e.target.value) || 1))} className="input-field text-center font-bold" /><button type="button" onClick={() => setTravelers(v => v + 1)} className="counter-btn">+</button></div></FieldLabel>{travelerGrid}</div>}

            {helpStep === 2 && <div className="space-y-6"><StepHeading number={2} title="Travel preferences" text="Choose the experience you want. These choices shape the destination matches." />{travelStyleGrid}<div className="grid gap-4 md:grid-cols-3"><FieldLabel label="Trip purpose"><select value={tripPurpose} onChange={(e) => setTripPurpose(e.target.value)} className="input-field"><option>Vacation</option><option>Weekend Trip</option><option>Honeymoon</option><option>Birthday</option><option>Anniversary</option><option>Friends Reunion</option><option>Relaxation</option><option>Food Tour</option><option>Adventure</option><option>Pilgrimage</option></select></FieldLabel><FieldLabel label="Preferred weather"><select value={preferredWeather} onChange={(e) => setPreferredWeather(e.target.value)} className="input-field"><option>Any</option><option>Sunny</option><option>Cold</option><option>Mild</option><option>Rainy</option><option>Snow</option></select></FieldLabel><FieldLabel label="Visited-place rule"><select value={revisitPreference} onChange={(e) => setRevisitPreference(e.target.value as RevisitPreference)} className="input-field"><option value="new_only">New places only</option><option value="allow_revisit">New + visited places</option><option value="favorites_only">Revisit favourites</option></select></FieldLabel></div><div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">What do you enjoy?</p><div className="flex flex-wrap gap-2">{INTERESTS.map((interest) => <button key={interest} type="button" onClick={() => toggleInterest(interest)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selectedInterests.includes(interest) ? "border-fuchsia-500 bg-fuchsia-500 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>{selectedInterests.includes(interest) && <Check className="mr-1 inline h-3 w-3" />}{interest}</button>)}</div></div><FieldLabel label="Places already visited"><div className="flex gap-2"><input value={visitedInput} onChange={(e) => setVisitedInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVisitedDestination(); } }} placeholder="Type Goa, Jaipur, Dubai..." className="input-field" /><button type="button" onClick={addVisitedDestination} className="rounded-2xl bg-slate-900 px-4 font-bold text-white dark:bg-white dark:text-slate-900">Add</button></div></FieldLabel>{visitedDestinations.length > 0 && <div className="flex flex-wrap gap-2">{visitedDestinations.map(place => <button key={place} type="button" onClick={() => setVisitedDestinations(c => c.filter(i => i !== place))} className="rounded-full bg-slate-200 px-3 py-1 text-xs dark:bg-slate-800">{place} ×</button>)}</div>}</div>}

            {helpStep === 3 && <div className="space-y-6"><StepHeading number={3} title="Dates & budget" text="Tell us when you are travelling and your spending limit." />{dateBudgetFields}</div>}

            {helpStep === 4 && <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><div className="max-w-xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-2xl">✨</div><h3 className="mt-4 text-2xl font-black">Ready to find your best destinations</h3><p className="mt-2 text-sm leading-relaxed text-slate-500">TripBalancing will compare your origin, dates, budget, traveler type and preferences and return the strongest matches.</p><button type="button" onClick={getDestinationRecommendations} disabled={recommendationLoading || loading} className="mt-6 min-w-[260px] rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-6 py-4 font-black text-white shadow-lg disabled:opacity-50">{recommendationLoading ? "Finding your best destinations..." : "✨ Find Destinations"}</button></div></div>}

            {helpStep === 5 && <div className="space-y-5"><StepHeading number={5} title="Choose your destination" text="Select one match, review the details, then build your trip." />{recommendations.length > 0 ? <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{recommendations.map((item, index) => <button key={`${item.destination}-${index}`} type="button" onClick={() => selectRecommendation(item)} className={`rounded-2xl border-2 p-5 text-left transition ${destination === item.destination ? "border-teal-500 bg-teal-50 shadow-md dark:bg-teal-950/20" : "border-slate-200 bg-white hover:border-teal-300 dark:border-slate-800 dark:bg-slate-950"}`}><div className="flex items-center justify-between gap-3"><span className="font-black">{index + 1}. {item.destination}</span><span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-black text-teal-700">{item.matchScore}%</span></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.whyItFits}</p><p className="mt-3 text-xs font-bold text-slate-500">Estimated: {item.estimatedCostRange}</p><p className="mt-1 text-xs text-slate-500">Best for: {item.bestFor.join(", ")}</p></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><p className="font-bold">No recommendations loaded.</p><button type="button" onClick={() => setHelpStep(4)} className="mt-3 text-sm font-black text-teal-600">← Find destinations</button></div>}{destinationConfirmed && <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4"><p className="text-xs font-black uppercase tracking-wider text-teal-600">Selected destination</p><p className="mt-1 text-lg font-black">{destination}</p></div>}</div>}
          </section>

          <div className="sticky bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="flex items-center justify-between gap-3"><button type="button" onClick={previousHelpStep} disabled={recommendationLoading || loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-black disabled:opacity-50 dark:border-slate-700"><ArrowLeft className="h-4 w-4" />{helpStep === 1 ? "Change planning mode" : "Back"}</button><span className="hidden text-xs font-bold text-slate-400 sm:inline">Step {helpStep} of 5 · {HELP_STEPS[helpStep - 1]}</span>{helpStep < 4 && <button type="button" onClick={nextHelpStep} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-black text-white">Continue <ArrowRight className="h-4 w-4" /></button>}{helpStep === 4 && <button type="button" onClick={getDestinationRecommendations} disabled={recommendationLoading || loading} className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{recommendationLoading ? "Finding..." : "Find Destinations"}<ArrowRight className="h-4 w-4" /></button>}{helpStep === 5 && <button type="submit" disabled={loading || !destinationConfirmed} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? "Generating..." : "Build This Trip"}<Sparkles className="h-4 w-4" /></button>}</div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-2"><LocationAutocomplete label="Where are you travelling from?" value={origin} confirmed={originConfirmed} placeholder="Start typing your city..." onChange={(value) => { setOrigin(value); setOriginConfirmed(false); }} onSelect={(suggestion) => { setOrigin(suggestion.canonicalName); setOriginConfirmed(true); setError(null); }} /><LocationAutocomplete label="Where are you travelling to?" value={destination} confirmed={destinationConfirmed} placeholder="Start typing your destination..." onChange={(value) => { setDestination(value); setDestinationConfirmed(false); }} onSelect={(suggestion) => { setDestination(suggestion.canonicalName); setDestinationConfirmed(true); setError(null); }} /></section>
          <div className="flex flex-wrap gap-2">{POPULAR_DESTINATIONS.map((item) => <button key={item.name} type="button" onClick={() => { setDestination(item.name); setDestinationConfirmed(true); setError(null); }} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-400">{item.icon} {item.name}</button>)}</div>
          {travelerGrid}
          {travelStyleGrid}
          {dateBudgetFields}
          <FieldLabel icon={<Users className="h-4 w-4 text-teal-500" />} label="Number of travelers"><div className="flex max-w-md items-center gap-3"><button type="button" onClick={() => setTravelers(v => Math.max(1, v - 1))} className="counter-btn">−</button><input type="number" min="1" value={travelers} onChange={(e) => setTravelers(Math.max(1, Number(e.target.value) || 1))} className="input-field text-center font-bold" /><button type="button" onClick={() => setTravelers(v => v + 1)} className="counter-btn">+</button></div></FieldLabel>
          <button type="submit" disabled={loading || recommendationLoading} className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 py-4 text-base font-bold text-white shadow-md transition hover:shadow-lg disabled:opacity-50">{loading ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />Consulting AI Travel Expert...</> : <><Sparkles className="h-5 w-5" />Generate Itinerary with AI</>}</button>
        </div>
      )}
    </form>
  );
}

function WizardProgress({ step }: { step: HelpStep }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-600">Help Me Choose</p><p className="mt-1 text-sm font-black">Step {step} of 5 · {HELP_STEPS[step - 1]}</p></div><span className="text-xs font-bold text-slate-400">{step * 20}%</span></div><div className="grid grid-cols-5 gap-2">{HELP_STEPS.map((label, index) => <div key={label} className="space-y-1"><div className={`h-2 rounded-full ${index + 1 <= step ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-800"}`} /><span className="hidden text-[9px] font-bold text-slate-400 lg:block">{label}</span></div>)}</div></div>;
}
function StepHeading({ number, title, text }: { number: number; title: string; text: string }) { return <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-600">Step {number}</p><h3 className="mt-1 text-2xl font-black">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function FieldLabel({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) { return <label className="block space-y-2"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{icon}{label}</span>{children}</label>; }
function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-xl border-2 px-3 py-3 text-sm font-bold transition ${selected ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/20 dark:text-teal-300" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>{children}</button>; }
function Metric({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) { return <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-950/60"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-lg font-black ${danger ? "text-rose-600" : accent ? "text-teal-600" : "text-slate-900 dark:text-white"}`}>{value}</p></div>; }
