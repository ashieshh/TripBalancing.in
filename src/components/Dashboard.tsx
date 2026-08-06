import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { 
  Compass, Calendar, Users, Briefcase, MapPin, Trash, Eye, Globe2, Search, X, Star, Lock, 
  Pencil, ShieldCheck, Shield, Mail, Check, AlertCircle, LogOut, Luggage, Cloud, ExternalLink, Coins,
  Tag, MessageSquare, TrendingUp, ArrowUpDown, ChevronDown, Clock
} from "lucide-react";
import { TripRecord, BuddyInvitation } from "../types";

// Lazy load heavy components to reduce initial bundle size and speed up page load
import GlobalPackingChecklist from "./GlobalPackingChecklist";
import CurrencyConverter from "./CurrencyConverter";
import TravelBuddyInvitationsSection from "./TravelBuddyInvitationsSection";
import DashboardOverview from "./DashboardOverview";

interface DashboardProps {
  trips: TripRecord[];
  sharedTrips?: TripRecord[];
  acceptedInvitations?: BuddyInvitation[];
  incomingInvitations?: BuddyInvitation[];
  onAcceptInvitation?: (invitationId: string) => void;
  onDeclineInvitation?: (invitationId: string) => void;
  onSelectTrip: (trip: TripRecord, isReadOnly?: boolean) => void;
  onDeleteTrip: (tripId: string) => void;
  isDeleting: string | null;
  onUpdateNotesAndRating: (tripId: string, rating: number, privateNote: string, category?: string, reviewText?: string) => void;
  plan?: "free" | "pay_per_trip" | "yearly" | "lifetime";
  freeTripsUsed?: number;
  paidTripsBalance?: number;
  onUpgradeClick?: () => void;
}

// Robust number parsing helper to handle currencies, commas, and text wrapping
function parseBudgetAmount(val: string | undefined | null): number {
  if (!val) return 0;
  // Remove commas to avoid parsing issues, then extract first contiguous decimal number
  const clean = val.replace(/,/g, "");
  const match = clean.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

const CHART_COLORS = [
  "#0d9488", // Teal
  "#6366f1", // Indigo
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#ec4899", // Pink
  "#10b981", // Emerald
  "#8b5cf6", // Purple
  "#f43f5e", // Rose
];

function getInviterDisplayName(email: string): string {
  if (!email) return "Travel Companion";
  const namePart = email.split("@")[0];
  const formatted = namePart
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return formatted.trim() || "Travel Companion";
}

function formatTimeSent(dateStr?: string): string {
  if (!dateStr) return "Recently";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Dashboard({ 
  trips, 
  sharedTrips = [],
  acceptedInvitations = [],
  incomingInvitations = [],
  onAcceptInvitation,
  onDeclineInvitation,
  onSelectTrip, 
  onDeleteTrip, 
  isDeleting, 
  onUpdateNotesAndRating,
  plan = "free",
  freeTripsUsed = 0,
  paidTripsBalance = 0,
  onUpgradeClick
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"trips" | "packing" | "tips" | "currency">("trips");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "alphabetical" | "rating">("newest");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState("");
  const [tempRating, setTempRating] = useState(0);
  const [tempCategory, setTempCategory] = useState("");
  const [processingInvId, setProcessingInvId] = useState<string | null>(null);
  const [invitationNotification, setInvitationNotification] = useState<string | null>(null);

  const handleAcceptInvite = async (invId: string, destination?: string) => {
    setProcessingInvId(invId);
    try {
      if (onAcceptInvitation) {
        await onAcceptInvitation(invId);
        setInvitationNotification(`🎉 Accepted invitation to explore ${destination || "trip"}! Added under Shared Adventures below.`);
        setActiveTab("trips");
        setTimeout(() => setInvitationNotification(null), 6000);
      }
    } catch (err) {
      console.error("Failed to accept invitation:", err);
    } finally {
      setProcessingInvId(null);
    }
  };

  const handleDeclineInvite = async (invId: string) => {
    setProcessingInvId(invId);
    try {
      if (onDeclineInvitation) {
        await onDeclineInvitation(invId);
        setInvitationNotification("Invitation declined.");
        setTimeout(() => setInvitationNotification(null), 4000);
      }
    } catch (err) {
      console.error("Failed to decline invitation:", err);
    } finally {
      setProcessingInvId(null);
    }
  };
  
  // Live Travel Tips States
  const [tips, setTips] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  // Fetch live travel tips grounded with Google Search
  useEffect(() => {
    if (activeTab === "tips") {
      const fetchTravelTips = async () => {
        setTipsLoading(true);
        setTipsError(null);
        try {
          const allDestinations = Array.from(new Set([
            ...trips.map(t => t.destination),
            ...sharedTrips.map(t => t.destination)
          ])).filter(Boolean);

          const cacheKey = `travel_tips_${allDestinations.sort().join(",")}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const { timestamp, tips: cachedTips, sources: cachedSources } = JSON.parse(cached);
              // Travel tips cache valid for 4 hours
              if (Date.now() - timestamp < 4 * 60 * 60 * 1000) {
                setTips(cachedTips);
                setSources(cachedSources);
                setTipsLoading(false);
                return;
              }
            } catch (e) {
              console.warn("Failed to parse cached travel tips", e);
            }
          }

          const response = await fetch("/api/travel-tips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destinations: allDestinations }),
          });

          if (!response.ok) {
            throw new Error("Failed to retrieve live travel tips");
          }

          const data = await response.json();
          const fetchedTips = data.tips || [];
          const fetchedSources = data.sources || [];
          
          setTips(fetchedTips);
          setSources(fetchedSources);

          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              tips: fetchedTips,
              sources: fetchedSources
            }));
          } catch (e) {
            console.warn("Failed to write travel tips cache", e);
          }
        } catch (err: any) {
          console.error(err);
          setTipsError(err.message || "Failed to load live travel tips.");
        } finally {
          setTipsLoading(false);
        }
      };

      fetchTravelTips();
    }
  }, [activeTab, trips, sharedTrips]);
  
  // Calculate stats based on all trips
  const totalTrips = trips.length;
  
  const uniqueDestinations = useMemo(() => new Set(
    trips.map(t => {
      const parts = t.destination.split(",");
      return parts[0].trim();
    })
  ).size, [trips]);

  const totalTravelers = useMemo(() => trips.reduce((acc, curr) => acc + (curr.travelers || 1), 0), [trips]);

  // Filter and sort trips based on search query (destination or date), date range, and sort preference
  const filteredTrips = useMemo(() => {
    const filtered = trips.filter((trip) => {
      // 1. Text Search Filter (Destination or Date strings)
      const q = searchQuery.toLowerCase().trim();
      let matchesText = true;
      if (q) {
        // Check destination match
        const destinationMatches = trip.destination.toLowerCase().includes(q);

        // Check date match
        const rawStartMatches = trip.startDate.toLowerCase().includes(q);
        const rawEndMatches = trip.endDate.toLowerCase().includes(q);

        const startDateObj = new Date(trip.startDate);
        const endDateObj = new Date(trip.endDate);

        const formattedStartLong = isNaN(startDateObj.getTime()) ? "" : startDateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedStartShort = isNaN(startDateObj.getTime()) ? "" : startDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedEndLong = isNaN(endDateObj.getTime()) ? "" : endDateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedEndShort = isNaN(endDateObj.getTime()) ? "" : endDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const dateMatches = 
          rawStartMatches || 
          rawEndMatches || 
          formattedStartLong.includes(q) ||
          formattedStartShort.includes(q) ||
          formattedEndLong.includes(q) ||
          formattedEndShort.includes(q);

        matchesText = destinationMatches || dateMatches;
      }

      // 2. Date Range Filter
      let matchesDateRange = true;
      const tripStart = new Date(trip.startDate);
      const tripEnd = new Date(trip.endDate);

      if (filterStartDate) {
        const startLimit = new Date(filterStartDate);
        if (!isNaN(tripEnd.getTime()) && !isNaN(startLimit.getTime())) {
          if (tripEnd < startLimit) matchesDateRange = false;
        } else if (!isNaN(tripStart.getTime()) && !isNaN(startLimit.getTime())) {
          if (tripStart < startLimit) matchesDateRange = false;
        }
      }

      if (filterEndDate) {
        const endLimit = new Date(filterEndDate);
        if (!isNaN(tripStart.getTime()) && !isNaN(endLimit.getTime())) {
          if (tripStart > endLimit) matchesDateRange = false;
        } else if (!isNaN(tripEnd.getTime()) && !isNaN(endLimit.getTime())) {
          if (tripEnd > endLimit) matchesDateRange = false;
        }
      }

      // 3. Category Filter
      let matchesCategory = true;
      if (selectedCategoryFilter) {
        const tripCat = (trip.category || trip.itinerary?.category || "").toLowerCase().trim();
        if (tripCat !== selectedCategoryFilter.toLowerCase().trim()) {
          matchesCategory = false;
        }
      }

      return matchesText && matchesDateRange && matchesCategory;
    });

    // Sort the filtered trips
    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      } else if (sortBy === "oldest") {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else if (sortBy === "alphabetical") {
        return a.destination.localeCompare(b.destination);
      } else if (sortBy === "rating") {
        const ratingA = a.itinerary?.rating || 0;
        const ratingB = b.itinerary?.rating || 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
      return 0;
    });
  }, [trips, searchQuery, filterStartDate, filterEndDate, selectedCategoryFilter, sortBy]);

  // Filter and sort shared trips based on search query (destination or date), date range, and sort preference
  const filteredSharedTrips = useMemo(() => {
    const filtered = sharedTrips.filter((trip) => {
      // 1. Text Search Filter (Destination or Date strings)
      const q = searchQuery.toLowerCase().trim();
      let matchesText = true;
      if (q) {
        // Check destination match
        const destinationMatches = trip.destination.toLowerCase().includes(q);

        // Check date match
        const rawStartMatches = trip.startDate.toLowerCase().includes(q);
        const rawEndMatches = trip.endDate.toLowerCase().includes(q);

        const startDateObj = new Date(trip.startDate);
        const endDateObj = new Date(trip.endDate);

        const formattedStartLong = isNaN(startDateObj.getTime()) ? "" : startDateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedStartShort = isNaN(startDateObj.getTime()) ? "" : startDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedEndLong = isNaN(endDateObj.getTime()) ? "" : endDateObj.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const formattedEndShort = isNaN(endDateObj.getTime()) ? "" : endDateObj.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).toLowerCase();

        const dateMatches = 
          rawStartMatches || 
          rawEndMatches || 
          formattedStartLong.includes(q) ||
          formattedStartShort.includes(q) ||
          formattedEndLong.includes(q) ||
          formattedEndShort.includes(q);

        matchesText = destinationMatches || dateMatches;
      }

      // 2. Date Range Filter
      let matchesDateRange = true;
      const tripStart = new Date(trip.startDate);
      const tripEnd = new Date(trip.endDate);

      if (filterStartDate) {
        const startLimit = new Date(filterStartDate);
        if (!isNaN(tripEnd.getTime()) && !isNaN(startLimit.getTime())) {
          if (tripEnd < startLimit) matchesDateRange = false;
        } else if (!isNaN(tripStart.getTime()) && !isNaN(startLimit.getTime())) {
          if (tripStart < startLimit) matchesDateRange = false;
        }
      }

      if (filterEndDate) {
        const endLimit = new Date(filterEndDate);
        if (!isNaN(tripStart.getTime()) && !isNaN(endLimit.getTime())) {
          if (tripStart > endLimit) matchesDateRange = false;
        } else if (!isNaN(tripEnd.getTime()) && !isNaN(endLimit.getTime())) {
          if (tripEnd > endLimit) matchesDateRange = false;
        }
      }

      // 3. Category Filter
      let matchesCategory = true;
      if (selectedCategoryFilter) {
        const tripCat = (trip.category || trip.itinerary?.category || "").toLowerCase().trim();
        if (tripCat !== selectedCategoryFilter.toLowerCase().trim()) {
          matchesCategory = false;
        }
      }

      return matchesText && matchesDateRange && matchesCategory;
    });

    // Sort the filtered shared trips
    return [...filtered].sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      } else if (sortBy === "oldest") {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else if (sortBy === "alphabetical") {
        return a.destination.localeCompare(b.destination);
      } else if (sortBy === "rating") {
        const ratingA = a.itinerary?.rating || 0;
        const ratingB = b.itinerary?.rating || 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
      return 0;
    });
  }, [sharedTrips, searchQuery, filterStartDate, filterEndDate, selectedCategoryFilter, sortBy]);

  const hasAnyTrips = trips.length > 0 || sharedTrips.length > 0;

  const categoryData = useMemo(() => {
    const groups: Record<string, number> = {};
    trips.forEach((trip) => {
      let cat = (trip.category || trip.itinerary?.category || "Uncategorized").trim();
      if (cat) {
        cat = cat.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
      const amount = parseBudgetAmount(trip.budgetAmount);
      if (amount > 0) {
        groups[cat] = (groups[cat] || 0) + amount;
      }
    });

    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
    })).sort((a, b) => b.value - a.value);
  }, [trips]);

  return (
    <div className="space-y-8">
      
      {/* Invitation Toast Banner */}
      {invitationNotification && (
        <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-2xl flex items-center justify-between gap-3 text-teal-700 dark:text-teal-300 font-bold text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-teal-500 stroke-[3]" />
            <span>{invitationNotification}</span>
          </div>
          <button 
            onClick={() => setInvitationNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Incoming Travel Buddy Invitations */}
      {incomingInvitations.length > 0 && (
        <Suspense fallback={null}>
          <TravelBuddyInvitationsSection
            incomingInvitations={incomingInvitations}
            getInviterDisplayName={getInviterDisplayName}
            formatTimeSent={formatTimeSent}
            processingInvId={processingInvId}
            handleDeclineInvite={handleDeclineInvite}
            handleAcceptInvite={handleAcceptInvite}
          />
        </Suspense>
      )}

      {/* View Switcher Tabs */}
      <div className="flex flex-wrap bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-2xl border border-slate-200/25 dark:border-slate-800/25 w-full sm:w-auto gap-1">
        <button
          id="dashboard-tab-trips"
          onClick={() => setActiveTab("trips")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
            activeTab === "trips"
              ? "bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-400 shadow-sm"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Compass className="w-4 h-4" />
          Adventures & Map
        </button>
        <button
          id="dashboard-tab-packing"
          onClick={() => setActiveTab("packing")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
            activeTab === "packing"
              ? "bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-400 shadow-sm"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Luggage className="w-4 h-4" />
          Global Packing Prep
        </button>
        <button
          id="dashboard-tab-tips"
          onClick={() => setActiveTab("tips")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
            activeTab === "tips"
              ? "bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-400 shadow-sm"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <AlertCircle className="w-4 h-4 text-rose-500 animate-pulse" />
          Live Travel Tips & Alerts
        </button>
        <button
          id="dashboard-tab-currency"
          onClick={() => setActiveTab("currency")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
            activeTab === "currency"
              ? "bg-white dark:bg-slate-950 text-teal-600 dark:text-teal-400 shadow-sm"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Coins className="w-4 h-4 text-emerald-500" />
          Currency Converter
        </button>
      </div>

      {activeTab === "trips" ? (
        <>
          <DashboardOverview
            trips={trips}
            onSelectTrip={onSelectTrip}
            totalTrips={totalTrips}
            uniqueDestinations={uniqueDestinations}
            totalTravelers={totalTravelers}
            plan={plan}
            freeTripsUsed={freeTripsUsed}
            paidTripsBalance={paidTripsBalance}
            onUpgradeClick={onUpgradeClick}
            categoryData={categoryData}
          />

      {/* Trips list section */}
      <div className="max-w-[1400px] w-full mx-auto p-6 space-y-6">
        {!hasAnyTrips && (
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Saved Travel Itineraries</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage, view, and export your curated travel guides.</p>
            </div>
          </div>
        )}

        {hasAnyTrips && (
          <div className="w-full space-y-6">
            <div className="pb-4 border-b border-slate-100 dark:border-slate-900 w-full">
              <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-8 items-start w-full">
                {/* Left column (title & description) */}
                <div className="space-y-1 min-w-0">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Saved Travel Itineraries</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Manage, view, and export your curated travel guides.</p>
                </div>
                
                {/* Right column: Search, Sort and Date Range on the right */}
                <div className="flex flex-col gap-4 w-full">
                  {/* First row: Search by destination (full width of right column) */}
                  <div className="relative w-full">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      id="search-destination-input"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by destination..."
                      className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all font-medium shadow-sm"
                    />
                    {searchQuery && (
                      <button
                        id="clear-search-btn"
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Second row: dropdown and date filter toggle side-by-side */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
                    {/* Sort By Dropdown (Date Dropdown) */}
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                        <ArrowUpDown className="w-4 h-4" />
                      </span>
                      <select
                        id="sort-trips-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="w-full pl-10 pr-10 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer transition-all appearance-none"
                      >
                        <option value="newest" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100">Date: Newest</option>
                        <option value="oldest" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100">Date: Oldest</option>
                        <option value="alphabetical" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100">Destination: A-Z</option>
                        <option value="rating" className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100">Rating: Highest First</option>
                      </select>
                      <span className="absolute inset-y-0 right-0.5 flex items-center pr-3.5 pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </span>
                    </div>

                    {/* Date Range Toggle Button */}
                    <button
                      id="toggle-date-filter-btn"
                      onClick={() => setShowDateFilters(!showDateFilters)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-2xl text-sm font-bold transition-all cursor-pointer bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 shadow-sm"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Date Range</span>
                      {(filterStartDate || filterEndDate) && (
                        <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                      )}
                    </button>

                    {/* Reset Filters Shortcut */}
                    {(searchQuery || filterStartDate || filterEndDate || selectedCategoryFilter) && (
                      <button
                        id="clear-all-filters-btn"
                        onClick={() => {
                          setSearchQuery("");
                          setFilterStartDate("");
                          setFilterEndDate("");
                          setSelectedCategoryFilter("");
                        }}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer transition-colors px-2 py-1 whitespace-nowrap self-center"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expandable Date Range Filter Panel */}
            {showDateFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50/50 dark:bg-slate-900/40 border border-slate-150 dark:border-slate-850 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-1.5">
                  <label htmlFor="filter-start-date" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Trips Starting On / After
                  </label>
                  <div className="relative">
                    <input
                      id="filter-start-date"
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 font-medium"
                    />
                    {filterStartDate && (
                      <button
                        onClick={() => setFilterStartDate("")}
                        className="absolute inset-y-0 right-8 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="filter-end-date" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Trips Ending On / Before
                  </label>
                  <div className="relative">
                    <input
                      id="filter-end-date"
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 font-medium"
                    />
                    {filterEndDate && (
                      <button
                        onClick={() => setFilterEndDate("")}
                        className="absolute inset-y-0 right-8 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Category Filter Pills */}
            {(() => {
              const combinedTrips = [...trips, ...sharedTrips];
              const allCats = Array.from(
                new Set(
                  combinedTrips
                    .map((t) => t.category || t.itinerary?.category)
                    .map((c) => c?.trim())
                    .filter(Boolean)
                )
              ) as string[];
              
              if (allCats.length === 0) return null;

              return (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-900/60 mt-2 animate-in fade-in duration-200">
                  <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                    <Tag className="w-3.5 h-3.5 text-teal-500" />
                    Categories:
                  </span>
                  <button
                    id="category-filter-all"
                    onClick={() => setSelectedCategoryFilter("")}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedCategoryFilter === ""
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-500/10"
                        : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350"
                    }`}
                  >
                    All ({combinedTrips.length})
                  </button>
                  {allCats.map((cat) => {
                    const count = combinedTrips.filter(
                      (t) => (t.category || t.itinerary?.category || "").toLowerCase().trim() === cat.toLowerCase().trim()
                    ).length;
                    return (
                      <button
                        key={cat}
                        id={`category-filter-${cat.replace(/\s+/g, "-").toLowerCase()}`}
                        onClick={() => setSelectedCategoryFilter(cat)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedCategoryFilter.toLowerCase() === cat.toLowerCase()
                            ? "bg-teal-600 text-white shadow-sm shadow-teal-500/10"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-350"
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                          selectedCategoryFilter.toLowerCase() === cat.toLowerCase()
                            ? "bg-white/20 text-white"
                            : "bg-slate-250 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {!hasAnyTrips ? (
          <div className="text-center py-16 bg-white dark:bg-slate-950 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-4 p-8">
            <div className="inline-flex items-center justify-center p-4 bg-teal-50 dark:bg-teal-950/20 rounded-2xl text-teal-500">
              <Compass className="w-10 h-10 animate-spin-slow" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">No trips planned yet</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">Start by filling out the planner form above to customize your first AI trip itinerary.</p>
            </div>
          </div>
        ) : trips.length === 0 ? (
          <div className="p-6 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40 rounded-3xl text-center space-y-2">
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">You haven't created any personal itineraries yet.</p>
            <p className="text-xs text-slate-400">Use the Trip Planner form at the top of the page to build your own trip, or browse the Shared Adventures below!</p>
          </div>
        ) : filteredTrips.length === 0 && filteredSharedTrips.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-950 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-4 p-8">
            <div className="inline-flex items-center justify-center p-4 bg-amber-50 dark:bg-amber-950/20 rounded-2xl text-amber-500">
              <Search className="w-10 h-10" />
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">No matching itineraries found</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                We couldn't find any saved or shared itineraries matching your search criteria.
              </p>
              <button
                id="reset-search-btn"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStartDate("");
                  setFilterEndDate("");
                  setSelectedCategoryFilter("");
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/40 text-teal-600 dark:text-teal-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        ) : trips.length > 0 && filteredTrips.length === 0 ? (
          <div className="p-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            No personal itineraries match your filters. Check matching Shared Adventures below.
          </div>
        ) : (
          <div className="saved-trips-grid w-full max-w-full min-w-0">
            {filteredTrips.map((trip) => {
              const startDateFormatted = new Date(trip.startDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });
              
              const endDateFormatted = new Date(trip.endDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });

              const isDeletingTrip = isDeleting === trip.id;

              return (
                <div 
                  key={trip.id} 
                  className="h-full flex flex-col justify-between bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-[32px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:-translate-y-1.5 hover:border-teal-500/30 dark:hover:border-teal-500/40 transition-all duration-300"
                >
                  <div className="p-8 sm:p-9 flex-1 flex flex-col justify-between space-y-5">
                    {/* Top Content Group */}
                    <div className="space-y-4">
                      {/* Destination & Style */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-full tracking-wide">
                            {trip.travelStyle} Style
                          </span>
                          {(trip.category || trip.itinerary?.category) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-full tracking-wide border border-amber-200/20 dark:border-amber-900/20">
                              <Tag className="w-2.5 h-2.5 text-amber-500" />
                              {trip.category || trip.itinerary?.category}
                            </span>
                          )}
                        </div>
                        <h4 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-slate-100 leading-snug line-clamp-1 flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-5 h-5 text-teal-500 flex-shrink-0" />
                          <span className="truncate">{trip.destination}</span>
                        </h4>
                      </div>

                      {/* Meta Indicators */}
                      <div className="space-y-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-900 pt-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Calendar className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">{startDateFormatted} - {endDateFormatted}</span>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Users className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">{trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}</span>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Briefcase className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                          <span className="truncate">Budget: {trip.budgetAmount}</span>
                        </div>
                      </div>
                    </div>

                    {/* Ratings & Notes Section */}
                    <div className="border-t border-slate-100 dark:border-slate-900 pt-4 space-y-4">
                      {editingNotesId === trip.id ? (
                        <div className="space-y-3 bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-150 dark:border-slate-850">
                          {/* Stars selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 block">Your Rating</label>
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  id={`star-${trip.id}-${star}`}
                                  onClick={() => setTempRating(star)}
                                  className="text-slate-300 hover:text-amber-450 dark:text-slate-800 transition-colors cursor-pointer p-0.5"
                                >
                                  <Star 
                                    className={`w-4 h-4 ${star <= tempRating ? "fill-amber-450 text-amber-450" : "text-slate-300 dark:text-slate-700"}`} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Category input & suggestions */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 block">Category (e.g. Work, Vacation, Adventure)</label>
                            <input
                              id={`category-input-${trip.id}`}
                              type="text"
                              value={tempCategory}
                              onChange={(e) => setTempCategory(e.target.value)}
                              placeholder="Assign a custom category..."
                              className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all"
                            />
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {['Vacation', 'Work', 'Adventure', 'Leisure', 'Business', 'Family'].map((cat) => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setTempCategory(cat)}
                                  className={`px-2 py-0.5 border text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                                    tempCategory.toLowerCase().trim() === cat.toLowerCase()
                                      ? "bg-teal-50 border-teal-200 text-teal-600 dark:bg-teal-950/40 dark:border-teal-900 dark:text-teal-400"
                                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500 dark:bg-slate-950 dark:border-slate-850 dark:hover:bg-slate-900"
                                  }`}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Private note text area */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500 block">Private Note</label>
                            <textarea
                              id={`note-textarea-${trip.id}`}
                              value={tempNote}
                              onChange={(e) => setTempNote(e.target.value)}
                              placeholder="Write a private memory or note..."
                              rows={2}
                              className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all resize-none"
                            />
                          </div>

                          {/* Save & Cancel buttons */}
                          <div className="flex items-center gap-2 justify-end text-xs font-bold pt-1">
                            <button
                              id={`cancel-notes-btn-${trip.id}`}
                              type="button"
                              onClick={() => setEditingNotesId(null)}
                              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              id={`save-notes-btn-${trip.id}`}
                              type="button"
                              onClick={() => {
                                onUpdateNotesAndRating(trip.id, tempRating, tempNote, tempCategory.trim());
                                setEditingNotesId(null);
                              }}
                              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg cursor-pointer transition-all shadow-sm"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {/* Rating display / prompt */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {trip.itinerary.rating ? (
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star 
                                      key={star} 
                                      className={`w-4 h-4 ${star <= (trip.itinerary.rating || 0) ? "fill-amber-450 text-amber-450" : "text-slate-250 dark:text-slate-800"}`} 
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                                  No rating yet
                                </span>
                              )}
                            </div>

                            <button
                              id={`edit-notes-btn-${trip.id}`}
                              onClick={() => {
                                setEditingNotesId(trip.id);
                                setTempNote(trip.itinerary.privateNote || "");
                                setTempRating(trip.itinerary.rating || 0);
                                setTempCategory(trip.category || trip.itinerary?.category || "");
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded-lg transition-all cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {trip.itinerary.privateNote || trip.itinerary.rating ? "Edit Note" : "Add Note & Rating"}
                            </button>
                          </div>

                          {/* Private note preview */}
                          {trip.itinerary.privateNote && (
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-900 text-xs font-medium text-slate-600 dark:text-slate-400 leading-normal flex items-start gap-2 animate-fade-in min-h-[46px]">
                              <Lock className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                              <p className="line-clamp-2 italic leading-relaxed">{trip.itinerary.privateNote}</p>
                            </div>
                          )}

                          {/* Trip review preview */}
                          {trip.itinerary.reviewText && (
                            <div className="p-3 bg-teal-500/5 dark:bg-teal-950/10 rounded-xl border border-teal-500/10 dark:border-teal-400/10 text-xs font-medium text-slate-600 dark:text-slate-400 leading-normal flex items-start gap-2 animate-fade-in min-h-[46px]">
                              <MessageSquare className="w-3 h-3 text-teal-500 mt-0.5 flex-shrink-0" />
                              <p className="line-clamp-2 leading-relaxed">"{trip.itinerary.reviewText}"</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="px-8 pb-6 pt-5 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-900 flex flex-col gap-3">
                    <button
                      id={`view-trip-btn-${trip.id}`}
                      onClick={() => onSelectTrip(trip)}
                      className="w-full h-11 flex items-center justify-center gap-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm shadow-teal-500/10 hover:shadow-teal-500/25"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Itinerary</span>
                    </button>

                    <button
                      id={`delete-trip-btn-${trip.id}`}
                      onClick={() => onDeleteTrip(trip.id)}
                      disabled={isDeletingTrip}
                      className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/10 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 font-bold text-xs rounded-xl transition-all duration-200 cursor-pointer"
                      title="Delete Trip"
                    >
                      {isDeletingTrip ? (
                        <span className="inline-block w-4 h-4 border-2 border-rose-600 dark:border-rose-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Trash className="w-3.5 h-3.5" />
                          <span>Delete Itinerary</span>
                        </>
                      )}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Shared Adventures */}
      {sharedTrips && sharedTrips.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-slate-150 dark:border-slate-900">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-500" />
              <span>Shared Adventures</span>
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Curated travel guides where you are added as a travel companion.</p>
          </div>

          {filteredSharedTrips.length === 0 ? (
            <div className="p-6 bg-slate-50 dark:bg-slate-900/30 rounded-3xl text-center text-xs font-semibold text-slate-500 dark:text-slate-450 border border-dashed border-slate-200 dark:border-slate-800">
              No shared adventures match your search or filters.
            </div>
          ) : (
            <div className="saved-trips-grid w-full max-w-full min-w-0">
              {filteredSharedTrips.map((trip) => {
                const startDateFormatted = new Date(trip.startDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });
                
                const endDateFormatted = new Date(trip.endDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });

                // Find matching invitation to see if we have read or write access
                const matchingInv = acceptedInvitations.find(i => i.tripId === trip.id);
                const isReadOnly = matchingInv ? matchingInv.accessType === "read" : true;

                return (
                  <div 
                    key={trip.id} 
                    className="h-full flex flex-col justify-between bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-[32px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:-translate-y-1.5 hover:border-teal-500/30 dark:hover:border-teal-500/40 transition-all duration-300"
                  >
                    <div className="p-8 sm:p-9 flex-1 flex flex-col justify-between space-y-5">
                      {/* Top Content Group */}
                      <div className="space-y-4">
                        {/* Destination & Style */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-full tracking-wide">
                              {trip.travelStyle} Style
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              {isReadOnly ? (
                                <>
                                  <Shield className="w-3 h-3" /> Viewer
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-3 h-3" /> Collaborator
                                </>
                              )}
                            </span>
                          </div>
                          <h4 className="text-lg md:text-xl font-extrabold text-slate-800 dark:text-slate-100 leading-snug line-clamp-1 flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-5 h-5 text-teal-500 flex-shrink-0" />
                            <span className="truncate">{trip.destination}</span>
                          </h4>
                        </div>

                        {/* Meta Indicators */}
                        <div className="space-y-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-900 pt-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Calendar className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{startDateFormatted} - {endDateFormatted}</span>
                          </div>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Users className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}</span>
                          </div>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Briefcase className="w-4.5 h-4.5 text-slate-400 flex-shrink-0" />
                            <span className="truncate">Budget: {trip.budgetAmount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Private note preview */}
                      {trip.itinerary.privateNote && (
                        <div className="border-t border-slate-100 dark:border-slate-900 pt-4">
                          <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-900 text-xs font-medium text-slate-600 dark:text-slate-400 leading-normal flex items-start gap-2 animate-fade-in min-h-[46px]">
                            <Lock className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                            <p className="line-clamp-2 italic leading-relaxed">{trip.itinerary.privateNote}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions footer */}
                    <div className="px-8 pb-6 pt-5 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-900 flex flex-col gap-3">
                      <button
                        id={`view-shared-trip-btn-${trip.id}`}
                        onClick={() => onSelectTrip(trip, isReadOnly)}
                        className="w-full h-11 flex items-center justify-center gap-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-sm shadow-teal-500/10 hover:shadow-teal-500/25"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View Shared Itinerary</span>
                      </button>
                      
                      {onDeclineInvitation && matchingInv && (
                        <button
                          id={`leave-shared-trip-btn-${trip.id}`}
                          onClick={() => onDeclineInvitation(matchingInv.id)}
                          className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/10 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 font-bold text-xs rounded-xl transition-all duration-200 cursor-pointer"
                          title="Leave Collaboration"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Leave Collaboration</span>
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      ) : activeTab === "packing" ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-teal-500/10 to-emerald-500/10 dark:from-teal-950/20 dark:to-emerald-950/20 border border-teal-100/30 dark:border-teal-900/30 rounded-3xl p-6 space-y-2">
            <h3 className="text-xl font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <Luggage className="w-5 h-5 text-teal-600 dark:text-teal-400 animate-pulse" />
              <span>General Prep & Global Packing Planner</span>
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              We've automatically scanned all your upcoming travel itineraries, matched common essentials, and consolidated them into a single, unified list. Use this master checklist to prepare for your journeys without missing a beat!
            </p>
          </div>
          <Suspense fallback={
            <div className="p-8 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl flex flex-col items-center justify-center space-y-3">
              <Luggage className="w-8 h-8 text-teal-400 animate-bounce" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compiling Packing Checklist...</span>
            </div>
          }>
            <GlobalPackingChecklist trips={trips} />
          </Suspense>
        </div>
      ) : activeTab === "currency" ? (
        <Suspense fallback={
          <div className="p-8 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl flex flex-col items-center justify-center space-y-3">
            <Coins className="w-8 h-8 text-teal-400 animate-spin" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Accessing Live Currency Converter...</span>
          </div>
        }>
          <CurrencyConverter trips={trips} />
        </Suspense>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 dark:from-teal-950/20 dark:via-emerald-950/15 dark:to-cyan-950/20 border border-teal-100/30 dark:border-teal-900/30 rounded-3xl p-6 space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-650 dark:text-teal-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Globe2 className="w-3 h-3 animate-spin-slow" />
                Live Grounded Search
              </span>
            </div>
            <h3 className="text-xl font-bold text-slate-850 dark:text-slate-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-500 animate-pulse" />
              <span>Travel Advisories & Proactive Tips</span>
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
              Get real-time guidelines, local warnings, weather notices, and safety advisories for your saved destinations. Powered by Google Search and analyzed by Gemini.
            </p>
          </div>

          {tipsLoading && (
            <div className="text-center py-20 bg-white dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-900 space-y-4">
              <div className="relative inline-flex items-center justify-center p-4 bg-teal-50 dark:bg-teal-950/20 rounded-2xl text-teal-600 dark:text-teal-400 animate-bounce">
                <Compass className="w-8 h-8 animate-spin-slow" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">Retrieving Live Destination Alerts...</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Searching current news, local weather patterns, and safety warnings using Google Search.
                </p>
              </div>
            </div>
          )}

          {tipsError && (
            <div className="p-6 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-3xl text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-rose-800 dark:text-rose-400">Failed to load travel tips</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{tipsError}</p>
              </div>
              <button
                id="retry-tips-btn"
                onClick={() => {
                  setActiveTab("trips");
                  setTimeout(() => setActiveTab("tips"), 100);
                }}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm shadow-rose-500/10"
              >
                Retry Search
              </button>
            </div>
          )}

          {!tipsLoading && !tipsError && tips.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-slate-950 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-4 p-8">
              <div className="inline-flex items-center justify-center p-4 bg-teal-50 dark:bg-teal-950/20 rounded-2xl text-teal-500">
                <Globe2 className="w-10 h-10" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">No active advisories found</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  We couldn't retrieve any critical notifications at this time. All destinations seem to have normal safety profiles.
                </p>
              </div>
            </div>
          )}

          {!tipsLoading && !tipsError && tips.length > 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] w-full max-w-full min-w-0 gap-6">
                {tips.map((tip, index) => {
                  const isWarning = tip.category === "warning";
                  const isWeather = tip.category === "weather";
                  const isCulture = tip.category === "culture";
                  
                  let cardBg = "bg-teal-50/50 dark:bg-teal-950/10 border-teal-150 dark:border-teal-900/30";
                  let badgeBg = "bg-teal-500/10 text-teal-600 dark:text-teal-400";
                  let TitleColor = "text-teal-850 dark:text-teal-200";
                  let IconComponent = Compass;

                  if (isWarning) {
                    cardBg = "bg-rose-50/50 dark:bg-rose-950/10 border-rose-150 dark:border-rose-900/30";
                    badgeBg = "bg-rose-500/10 text-rose-600 dark:text-rose-400";
                    TitleColor = "text-rose-850 dark:text-rose-200";
                    IconComponent = AlertCircle;
                  } else if (isWeather) {
                    cardBg = "bg-sky-50/50 dark:bg-sky-950/10 border-sky-150 dark:border-sky-900/30";
                    badgeBg = "bg-sky-500/10 text-sky-600 dark:text-sky-400";
                    TitleColor = "text-sky-850 dark:text-sky-200";
                    IconComponent = Cloud;
                  } else if (isCulture) {
                    cardBg = "bg-purple-50/50 dark:bg-purple-950/10 border-purple-150 dark:border-purple-900/30";
                    badgeBg = "bg-purple-500/10 text-purple-600 dark:text-purple-400";
                    TitleColor = "text-purple-850 dark:text-purple-200";
                    IconComponent = Globe2;
                  }

                  return (
                    <div 
                      key={index}
                      className={`p-6 border rounded-3xl ${cardBg} flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[9px] uppercase tracking-wider ${badgeBg} flex items-center gap-1`}>
                            <IconComponent className="w-3 h-3" />
                            {tip.category}
                          </span>
                          
                          {tip.importance && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase ${
                              tip.importance === "high" 
                                ? "bg-rose-500 text-white" 
                                : tip.importance === "medium"
                                ? "bg-amber-500 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}>
                              {tip.importance} Priority
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                            {tip.destination}
                          </span>
                          <h4 className={`text-base font-extrabold ${TitleColor}`}>
                            {tip.title}
                          </h4>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold leading-relaxed">
                          {tip.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real Search Sources Grounding */}
              {sources.length > 0 && (
                <div className="p-6 bg-slate-50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-850 rounded-3xl space-y-3.5">
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <h4 className="text-xs font-black text-slate-700 dark:text-slate-350 uppercase tracking-wider">Verified Live Search Sources</h4>
                  </div>
                  
                  <div className="flex flex-wrap gap-2.5">
                    {sources.map((source, idx) => (
                      <a 
                        key={idx}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-extrabold text-teal-600 dark:text-teal-400 transition-all shadow-sm"
                      >
                        <span>{source.title}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
