import { db } from "../lib/supabase";
import { useEffect, useMemo, useState, Suspense } from "react";
import {
  Compass,
  Calendar,
  Users,
  Briefcase,
  MapPin,
  Trash2,
  Search,
  X,
  ArrowUpDown,
  ChevronDown,
  Luggage,
  AlertCircle,
  Coins,
  Globe2,
  Cloud,
  ExternalLink,
  Check,
  BookOpen,
  Sparkles,
  Clock3,
  Home,
  ArrowRight,
} from "lucide-react";
import { TripRecord, BuddyInvitation } from "../types";
import GlobalPackingChecklist from "./GlobalPackingChecklist";
import CurrencyConverter from "./CurrencyConverter";
import TravelBuddyInvitationsSection from "./TravelBuddyInvitationsSection";

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
  onUpdateNotesAndRating: (
    tripId: string,
    rating: number,
    privateNote: string,
    category?: string,
    reviewText?: string
  ) => void;
  plan?: "free" | "pay_per_trip" | "yearly" | "lifetime";
  freeTripsUsed?: number;
  paidTripsBalance?: number;
  onUpgradeClick?: () => void;
}

type DashboardTab = "home" | "trips" | "packing" | "tips" | "currency";
type TripStatusFilter = "all" | "upcoming" | "completed";

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
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getTripStatus(trip: TripRecord): "Upcoming" | "Completed" {
  const end = new Date(trip.endDate);
  if (!isNaN(end.getTime()) && end.getTime() < Date.now()) return "Completed";
  return "Upcoming";
}

function formatTripDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Dashboard({
  trips,
  sharedTrips = [],
  incomingInvitations = [],
  onAcceptInvitation,
  onDeclineInvitation,
  onSelectTrip,
  onDeleteTrip,
  isDeleting,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "alphabetical">("newest");
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>("all");
  const [processingInvId, setProcessingInvId] = useState<string | null>(null);
  const [invitationNotification, setInvitationNotification] = useState<string | null>(null);

  const [tips, setTips] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const handleAcceptInvite = async (invId: string, destination?: string) => {
    setProcessingInvId(invId);
    try {
      if (onAcceptInvitation) {
        await onAcceptInvitation(invId);
        setInvitationNotification(`Invitation accepted${destination ? ` for ${destination}` : ""}.`);
        setActiveTab("trips");
        setTimeout(() => setInvitationNotification(null), 5000);
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
        setTimeout(() => setInvitationNotification(null), 3500);
      }
    } catch (err) {
      console.error("Failed to decline invitation:", err);
    } finally {
      setProcessingInvId(null);
    }
  };

  useEffect(() => {
    if (activeTab !== "tips") return;
    const fetchTravelTips = async () => {
      setTipsLoading(true);
      setTipsError(null);
      try {
        const allDestinations = Array.from(
          new Set([...trips.map((t) => t.destination), ...sharedTrips.map((t) => t.destination)])
        ).filter(Boolean);
        const cacheKey = `travel_tips_${allDestinations.sort().join(",")}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
              setTips(parsed.tips || []);
              setSources(parsed.sources || []);
              setTipsLoading(false);
              return;
            }
          } catch {
            // Ignore invalid cache and refresh.
          }
        }

        const accessToken = await db.getAccessToken();
        if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
        const response = await fetch("/api/travel-tips", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
          body: JSON.stringify({ destinations: allDestinations }),
        });
        if (!response.ok) throw new Error("Failed to retrieve live travel tips");
        const data = await response.json();
        const fetchedTips = data.tips || [];
        const fetchedSources = data.sources || [];
        setTips(fetchedTips);
        setSources(fetchedSources);
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ timestamp: Date.now(), tips: fetchedTips, sources: fetchedSources })
          );
        } catch {
          // Cache is optional.
        }
      } catch (err: any) {
        setTipsError(err?.message || "Failed to load live travel tips.");
      } finally {
        setTipsLoading(false);
      }
    };
    fetchTravelTips();
  }, [activeTab, trips, sharedTrips]);

  const filteredTrips = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const result = trips.filter((trip) => {
      const status = getTripStatus(trip).toLowerCase();
      const matchesSearch =
        !q ||
        trip.destination.toLowerCase().includes(q) ||
        trip.travelStyle.toLowerCase().includes(q) ||
        (trip.category || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "alphabetical") return a.destination.localeCompare(b.destination);
      const aTime = new Date(a.startDate).getTime() || 0;
      const bTime = new Date(b.startDate).getTime() || 0;
      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [trips, searchQuery, sortBy, statusFilter]);

  const upcomingCount = useMemo(() => trips.filter((t) => getTripStatus(t) === "Upcoming").length, [trips]);
  const completedCount = trips.length - upcomingCount;

  const recentTrips = useMemo(() => {
    return [...trips]
      .sort((a, b) => {
        const aTime = new Date(a.startDate).getTime() || 0;
        const bTime = new Date(b.startDate).getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [trips]);

  const tabs: { id: DashboardTab; label: string; icon: any }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "trips", label: "My Trips", icon: Compass },
    { id: "packing", label: "Packing", icon: Luggage },
    { id: "tips", label: "Travel Alerts", icon: AlertCircle },
    { id: "currency", label: "Currency", icon: Coins },
  ];

  return (
    <div className="space-y-6">
      {invitationNotification && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-xs font-bold text-teal-700 dark:text-teal-300">
          <div className="flex items-center gap-2"><Check className="h-4 w-4" />{invitationNotification}</div>
          <button onClick={() => setInvitationNotification(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {incomingInvitations.length > 0 && (
        <TravelBuddyInvitationsSection
          incomingInvitations={incomingInvitations}
          getInviterDisplayName={getInviterDisplayName}
          formatTimeSent={formatTimeSent}
          processingInvId={processingInvId}
          handleDeclineInvite={handleDeclineInvite}
          handleAcceptInvite={handleAcceptInvite}
        />
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all ${
                active
                  ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "home" && (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
                  <Home className="h-3 w-3" /> Travel Home
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Your trips, without the clutter</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Plan above, continue your latest trip here, or open your full travel library.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("trips")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white transition hover:bg-teal-600 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-400"
              >
                My Trips {trips.length > 0 ? `(${trips.length})` : ""} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {recentTrips.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-950">
              <Compass className="mx-auto h-9 w-9 text-teal-500" />
              <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">No saved trips yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create your first itinerary with the planner above.</p>
            </div>
          ) : (
            <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
              {(() => {
                const trip = recentTrips[0];
                const status = getTripStatus(trip);
                return (
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${status === "Upcoming" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"}`}>{status}</span>
                        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">{trip.travelStyle}</span>
                      </div>
                      <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Continue last trip</div>
                      <h3 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-900 dark:text-white">{trip.destination}</h3>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatTripDate(trip.startDate)}</span>
                        <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{trip.travelers} {trip.travelers === 1 ? "traveler" : "travelers"}</span>
                        <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{trip.budgetAmount || "Budget not set"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                      <button onClick={() => onSelectTrip(trip)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-xs font-black text-white transition hover:bg-teal-500">
                        <BookOpen className="h-4 w-4" /> Continue Trip
                      </button>
                      <button onClick={() => setActiveTab("trips")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black text-slate-700 transition hover:border-teal-500/30 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                        View All Trips <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {activeTab === "trips" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-5 rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
                  <BookOpen className="h-3 w-3" /> Travel Library
                </div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">My Trips</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open your guides, continue planning, or manage past adventures.</p>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-extrabold">
                <button onClick={() => setStatusFilter("all")} className={`rounded-xl px-3 py-2 ${statusFilter === "all" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>All {trips.length}</button>
                <button onClick={() => setStatusFilter("upcoming")} className={`rounded-xl px-3 py-2 ${statusFilter === "upcoming" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Upcoming {upcomingCount}</button>
                <button onClick={() => setStatusFilter("completed")} className={`rounded-xl px-3 py-2 ${statusFilter === "completed" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Completed {completedCount}</button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_210px]">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search destination or travel style"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white"
                />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
              </div>
              <div className="relative">
                <ArrowUpDown className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm font-bold text-slate-600 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="alphabetical">Destination A–Z</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-950">
              <Compass className="mx-auto h-9 w-9 text-teal-500" />
              <h3 className="mt-4 text-base font-black text-slate-900 dark:text-white">No trips here yet</h3>
              <p className="mt-1 text-sm text-slate-500">Create a trip above or change your filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTrips.map((trip) => {
                const status = getTripStatus(trip);
                const deleting = isDeleting === trip.id;
                return (
                  <article key={trip.id} className="group overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-1 hover:border-teal-500/30 hover:shadow-xl hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="h-1.5 bg-gradient-to-r from-teal-500 via-cyan-500 to-indigo-500" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${status === "Upcoming" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"}`}>{status}</span>
                            <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">{trip.travelStyle}</span>
                          </div>
                          <h3 className="truncate text-xl font-black tracking-tight text-slate-900 dark:text-white">{trip.destination}</h3>
                          {trip.origin && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><MapPin className="h-3.5 w-3.5" />From {trip.origin}</p>}
                        </div>
                        <button disabled={deleting} onClick={() => onDeleteTrip(trip.id)} className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-rose-950/20" title="Delete trip"><Trash2 className="h-4 w-4" /></button>
                      </div>

                      <div className="my-5 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/60">
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Calendar className="h-3.5 w-3.5" />Dates</div>
                          <div className="mt-1 text-xs font-extrabold text-slate-700 dark:text-slate-200">{formatTripDate(trip.startDate)}</div>
                          <div className="text-[10px] font-semibold text-slate-400">to {formatTripDate(trip.endDate)}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/60">
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><Users className="h-3.5 w-3.5" />Travelers</div>
                          <div className="mt-1 text-sm font-black text-slate-800 dark:text-white">{trip.travelers}</div>
                        </div>
                      </div>

                      <div className="mb-4 flex items-center justify-between rounded-2xl border border-teal-500/10 bg-teal-500/[0.06] px-4 py-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-wider text-teal-600/70 dark:text-teal-400/70">Planned Budget</div>
                          <div className="mt-0.5 text-base font-black text-teal-700 dark:text-teal-300">{trip.budgetAmount || "—"}</div>
                        </div>
                        <Briefcase className="h-5 w-5 text-teal-500" />
                      </div>

                      <button onClick={() => onSelectTrip(trip)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white transition hover:bg-teal-600 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-400">
                        <BookOpen className="h-4 w-4" /> Open Trip Guide
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {sharedTrips.length > 0 && (
            <section className="space-y-3 pt-2">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Shared Adventures</h3>
                <p className="text-xs text-slate-500">Trips shared with you by travel companions.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sharedTrips.map((trip) => (
                  <button key={trip.id} onClick={() => onSelectTrip(trip, true)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-500/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-black text-slate-900 dark:text-white">{trip.destination}</span><Sparkles className="h-4 w-4 text-teal-500" /></div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-slate-400"><span>{trip.travelStyle}</span><span>•</span><span>{trip.travelers} travelers</span></div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === "packing" && (
        <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">Preparing your packing list…</div>}>
          <GlobalPackingChecklist trips={trips} />
        </Suspense>
      )}

      {activeTab === "currency" && (
        <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">Loading currency tools…</div>}>
          <CurrencyConverter trips={trips} />
        </Suspense>
      )}

      {activeTab === "tips" && (
        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-rose-500"><AlertCircle className="h-3 w-3" />Live travel intelligence</div>
            <h2 className="mt-3 text-xl font-black text-slate-900 dark:text-white">Travel Alerts & Local Tips</h2>
            <p className="mt-1 text-sm text-slate-500">Current guidance for destinations in your saved trips.</p>
          </div>

          {tipsLoading && <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-950"><Compass className="mx-auto h-8 w-8 animate-spin text-teal-500" /><p className="mt-3 text-sm font-bold text-slate-500">Checking your destinations…</p></div>}
          {tipsError && <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-600 dark:border-rose-900/30 dark:bg-rose-950/10">{tipsError}</div>}
          {!tipsLoading && !tipsError && tips.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-14 text-center dark:border-slate-800 dark:bg-slate-950"><Globe2 className="mx-auto h-8 w-8 text-teal-500" /><p className="mt-3 text-sm font-bold text-slate-600 dark:text-slate-300">No active alerts found.</p></div>}

          {!tipsLoading && !tipsError && tips.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tips.map((tip, index) => {
                const Icon = tip.category === "weather" ? Cloud : tip.category === "warning" ? AlertCircle : Globe2;
                return (
                  <div key={index} className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400"><Icon className="h-3 w-3" />{tip.category}</span><span className="text-[9px] font-black uppercase text-slate-400">{tip.destination}</span></div>
                    <h3 className="mt-4 text-sm font-black text-slate-900 dark:text-white">{tip.title}</h3>
                    <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{tip.text}</p>
                  </div>
                );
              })}
            </div>
          )}

          {sources.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sources.map((source, idx) => (
                <a key={idx} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-teal-600 dark:border-slate-800 dark:bg-slate-950 dark:text-teal-400">{source.title}<ExternalLink className="h-3 w-3" /></a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
