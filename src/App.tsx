import { useState, useEffect, useLayoutEffect, useMemo, useRef, lazy, Suspense } from "react";
import { 
  Globe, LogOut, ArrowLeft, Sparkles, Database, WifiOff, MapPin, 
  ChevronRight, Calendar, Landmark, Info, ExternalLink, Moon, Sun, AlertCircle, Crown, Zap, Users, ShieldCheck, Star
} from "lucide-react";
import { TripBalancingLogo } from "./components/TripBalancingLogo";
import { Itinerary, TripInput, TripRecord } from "./types";
import { db, isRealSupabaseConfigured } from "./lib/supabase";
import TripForm from "./components/TripForm";
import ThemeToggle from "./components/ThemeToggle";
import type { LegalTab } from "./components/LegalAndSupportModal";
import { BuddyInvitation } from "./types";

import ItineraryView from "./components/ItineraryView";
import Dashboard from "./components/Dashboard";
import AuthModal from "./components/AuthModal";
import PremiumUpgradeModal from "./components/PremiumUpgradeModal";
import BuddyInviteModal from "./components/BuddyInviteModal";
import GoogleContactsModal from "./components/GoogleContactsModal";
import LegalAndSupportModal from "./components/LegalAndSupportModal";
import AdminDashboard from "./components/AdminDashboard";

const SuspenseFallback = () => (
  <div className="flex items-center justify-center p-8 space-x-2 text-teal-600 dark:text-teal-400 min-h-[120px]">
    <TripBalancingLogo className="w-6 h-6" spin />
    <span className="text-xs font-bold text-slate-400">Loading...</span>
  </div>
);

export default function App() {
  // Navigation & View state
  const [currentView, setCurrentView] = useState<"app" | "admin">(() => {
    return window.location.pathname === "/admin" ? "admin" : "app";
  });
  const [isAdminVerified, setIsAdminVerified] = useState<boolean>(false);
  const [adminAccessChecked, setAdminAccessChecked] = useState<boolean>(false);

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userDataLoading, setUserDataLoading] = useState(false);

  // Handle browser navigation / popstate
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/admin") {
        setCurrentView("admin");
      } else {
        setCurrentView("app");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Check Admin Status when user session loads
  useEffect(() => {
    async function verifyAdminAccess() {
      setAdminAccessChecked(false);
      try {
        const token = await db.getAccessToken();
        if (!token) {
          setIsAdminVerified(false);
          setAdminAccessChecked(true);
          return;
        }
        const res = await fetch("/api/admin/check-access", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.isAdmin) {
            setIsAdminVerified(true);
          } else {
            setIsAdminVerified(false);
          }
        } else {
          setIsAdminVerified(false);
        }
      } catch (err) {
        setIsAdminVerified(false);
      } finally {
        setAdminAccessChecked(true);
      }
    }

    verifyAdminAccess();
  }, [user?.id]);

  // Initialize theme choice on initial load
  useEffect(() => {
    const saved = localStorage.getItem("tripbalancing_theme") || "light";
    const root = window.document.documentElement;
    if (saved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, []);

  // Premium Subscription state
  const [plan, setPlan] = useState<"free" | "pay_per_trip" | "yearly" | "lifetime">("free");
  const [freeTripsUsed, setFreeTripsUsed] = useState<number>(0);
  const [paidTripsBalance, setPaidTripsBalance] = useState<number>(0);
  const [showPremiumModal, setShowPremiumModal] = useState<boolean>(false);

  // Legal & Support Modal state
  const [showLegalModal, setShowLegalModal] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<LegalTab>("privacy");

  const handleOpenLegalModal = (tab: LegalTab) => {
    setLegalTab(tab);
    setShowLegalModal(true);
  };

  const isPremium = plan === "yearly" || plan === "lifetime";

  const handleUpgradeSuccess = async (chosenPlan: "pay_per_trip" | "yearly" | "lifetime", tripsAddedCount = 0) => {
    if (!user) return;
    // Payment entitlements are written by the server only after Razorpay verification.
    // Refresh the authoritative profile instead of allowing the browser to grant itself a plan.
    const profile = await db.getUserProfile(user.id, user.email);
    if (profile) {
      setPlan(profile.plan || chosenPlan);
      setPaidTripsBalance(profile.paid_trips_balance ?? paidTripsBalance + tripsAddedCount);
    } else {
      // UI fallback only; no database entitlement is written from the browser.
      setPlan(chosenPlan);
      if (chosenPlan === "pay_per_trip") setPaidTripsBalance(v => v + tripsAddedCount);
    }
  };

  // App UI state
  const [trips, setTrips] = useState<TripRecord[]>([]);

  // Calculate travel metrics helper
  const getUserDisplayName = (u: any) => {
    if (!u) return "";
    
    // Check if user object has explicit name or displayName fields
    const rawName = 
      u.displayName || 
      u.fullName || 
      u.user_metadata?.full_name || 
      u.user_metadata?.name || 
      u.user_metadata?.displayName;

    if (rawName && typeof rawName === "string" && !rawName.includes("@")) {
      const formatted = rawName
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      if (formatted.trim()) return formatted;
    }

    // Fallback to email: format into a clean display name (e.g., "yadavvashish" -> "Yadavvashish" or "john.doe" -> "John Doe")
    if (u.email && typeof u.email === "string") {
      const emailNamePart = u.email.split("@")[0];
      const formattedEmailName = emailNamePart
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      if (formattedEmailName.trim()) return formattedEmailName;
    }

    return "Guest User";
  };

  const getCountryFromDestination = (dest: string): string => {
    if (!dest) return "";
    const parts = dest.split(",");
    if (parts.length > 1) {
      return parts[parts.length - 1].trim();
    }
    const destLower = dest.toLowerCase().trim();
    if (destLower.includes("india") || destLower.includes("delhi") || destLower.includes("goa") || destLower.includes("mumbai") || destLower.includes("bengaluru") || destLower.includes("bangalore")) return "India";
    if (destLower.includes("france") || destLower.includes("paris")) return "France";
    if (destLower.includes("japan") || destLower.includes("tokyo")) return "Japan";
    if (destLower.includes("uk") || destLower.includes("london") || destLower.includes("united kingdom") || destLower.includes("england")) return "United Kingdom";
    if (destLower.includes("usa") || destLower.includes("new york") || destLower.includes("nyc") || destLower.includes("united states") || destLower.includes("america")) return "United States";
    if (destLower.includes("indonesia") || destLower.includes("bali")) return "Indonesia";
    if (destLower.includes("singapore")) return "Singapore";
    if (destLower.includes("uae") || destLower.includes("dubai") || destLower.includes("united arab emirates")) return "United Arab Emirates";
    if (destLower.includes("thailand") || destLower.includes("bangkok")) return "Thailand";
    if (destLower.includes("italy") || destLower.includes("rome")) return "Italy";
    if (destLower.includes("australia") || destLower.includes("sydney")) return "Australia";
    return dest.trim().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  };

  const countriesVisitedCount = useMemo(() => {
    const uniqueCountries = new Set(
      trips.map(t => getCountryFromDestination(t.destination))
        .filter(c => c.length > 0)
    );
    return uniqueCountries.size;
  }, [trips]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [activeItinerary, setActiveItinerary] = useState<Itinerary | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  
  // Travel Companion / Buddy states
  const [sharedTrips, setSharedTrips] = useState<TripRecord[]>([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState<BuddyInvitation[]>([]);
  const [incomingInvitations, setIncomingInvitations] = useState<BuddyInvitation[]>([]);
  const [activeTripIsReadOnly, setActiveTripIsReadOnly] = useState<boolean>(false);
  const [showBuddyInviteModal, setShowBuddyInviteModal] = useState<boolean>(false);
  const [showGoogleContactsModal, setShowGoogleContactsModal] = useState<boolean>(false);
  
  // API generation & DB saving states
  const [generating, setGenerating] = useState(false);
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [publicReviews, setPublicReviews] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/reviews/public")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setPublicReviews(Array.isArray(data?.reviews) ? data.reviews : []))
      .catch(() => setPublicReviews([]));
  }, []);
  const pendingTripResultScroll = useRef(false);
  const dashboardScrollPosition = useRef(0);
  const lastTripInput = useRef<TripInput | null>(null);
  const tripHistoryEntry = useRef(false);

  useEffect(() => {
    if (!generating) {
      setGenerationElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const updateElapsed = () => setGenerationElapsed(Math.floor((Date.now() - startedAt) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  // Always bring a generation error into view. This is especially important
  // on the long trip form where the user may be several screens below it.
  useEffect(() => {
    if (!apiError) return;
    requestAnimationFrame(() => {
      document.getElementById("trip-planning-error")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [apiError]);

  // Every trip opens at its header, whether it is newly generated, saved or shared.
  useLayoutEffect(() => {
    if (generating || !activeItinerary || !pendingTripResultScroll.current) return;
    pendingTripResultScroll.current = false;

    const target = document.getElementById("generated-trip-result-top");
    if (!target) return;

    const headerOffset = 96;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "auto" });
    target.focus({ preventScroll: true });
  }, [generating, activeItinerary]);

  useEffect(() => {
    const handleBrowserBack = () => {
      if (!tripHistoryEntry.current) return;
      tripHistoryEntry.current = false;
      setActiveItinerary(null);
      setActiveTripId(null);
      requestAnimationFrame(() => window.scrollTo({
        top: dashboardScrollPosition.current,
        left: 0,
        behavior: "auto",
      }));
    };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  const closeActiveTrip = () => {
    if (tripHistoryEntry.current) {
      window.history.back();
      return;
    }
    setActiveItinerary(null);
    setActiveTripId(null);
    requestAnimationFrame(() => window.scrollTo({
      top: dashboardScrollPosition.current,
      left: 0,
      behavior: "auto",
    }));
  };

  // Share mode state
  const [isSharedMode, setIsSharedMode] = useState(false);
  const [sharedItinerary, setSharedItinerary] = useState<Itinerary | null>(null);
  const [sharedTripId, setSharedTripId] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!sharedItinerary) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [sharedItinerary]);

  // Check for shared URL parameters on mount
  useEffect(() => {
    async function checkShareLink() {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get("share");
      const shareData = params.get("shareData");

      if (shareId) {
        setIsSharedMode(true);
        setShareLoading(true);
        setShareError(null);
        try {
          const trip = await db.getTrip(shareId);
          if (trip) {
            setSharedItinerary(trip.itinerary);
            setSharedTripId(trip.id);
          } else {
            setShareError("Shared trip itinerary not found.");
          }
        } catch (err) {
          console.error("Failed to load shared trip:", err);
          setShareError("Could not retrieve the shared trip. It may have been deleted or the database is unavailable.");
        } finally {
          setShareLoading(false);
        }
      } else if (shareData) {
        setIsSharedMode(true);
        setShareLoading(true);
        setShareError(null);
        try {
          const decoded = atob(shareData);
          const parsed = JSON.parse(decoded);
          if (parsed && typeof parsed === "object" && parsed.destination) {
            setSharedItinerary(parsed);
          } else {
            setShareError("Invalid shared itinerary format.");
          }
        } catch (err) {
          console.error("Failed to parse shared data:", err);
          setShareError("The shared itinerary link is corrupted or invalid.");
        } finally {
          setShareLoading(false);
        }
      }
    }
    checkShareLink();
  }, []);

  // Load active session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const currentUser = await db.getSessionUser();
        setUser(currentUser);
      } catch (err) {
        console.error("Error loading session:", err);
      } finally {
        setAuthLoading(false);
      }
    }
    checkSession();
  }, []);

  const fetchInvitations = async () => {
    if (!user) return;
    try {
      const allInvs = await db.getInvitationsForUser(user.email);
      // Fetch trip details for each pending invitation to display the destination
      const pendingInvs = allInvs.filter(i => i.status === "pending");
      const resolvedPendingInvs = await Promise.all(
        pendingInvs.map(async (inv) => {
          try {
            const trip = await db.getTrip(inv.tripId);
            return {
              ...inv,
              tripDetails: trip ? {
                destination: trip.destination,
                startDate: trip.startDate,
                endDate: trip.endDate
              } : (inv.tripDetails || (inv.fullTrip ? {
                destination: inv.fullTrip.destination,
                startDate: inv.fullTrip.startDate,
                endDate: inv.fullTrip.endDate
              } : undefined))
            };
          } catch (e) {
            return inv;
          }
        })
      );
      setIncomingInvitations(resolvedPendingInvs);
      setAcceptedInvitations(allInvs.filter(i => i.status === "accepted"));
    } catch (err) {
      console.error("Failed to load invitations:", err);
    }
  };

  const fetchSharedTrips = async () => {
    if (!user) return;
    try {
      const data = await db.getSharedTripsForUser(user.email);
      setSharedTrips(data);
    } catch (err) {
      console.error("Failed to load shared trips:", err);
    }
  };

  const fetchUserTrips = async () => {
    if (!user) return;
    setTripsLoading(true);
    try {
      const data = await db.getTrips(user.id);
      setTrips(data);
    } catch (err) {
      console.error("Failed to load user trips:", err);
    } finally {
      setTripsLoading(false);
    }
  };

  const syncUserDashboard = async () => {
    if (!user) return;
    await Promise.all([
      fetchUserTrips(),
      fetchInvitations(),
      fetchSharedTrips()
    ]);
  };

  const loadUserData = async (u: any) => {
    if (!u) {
      setPlan("free");
      setFreeTripsUsed(0);
      setPaidTripsBalance(0);
      setTrips([]);
      setSharedTrips([]);
      setIncomingInvitations([]);
      setAcceptedInvitations([]);
      return;
    }

    setUserDataLoading(true);
    try {
      const profile = await db.syncLocalStorageToSupabase(u.id, u.email);
      if (profile) {
        setPlan(profile.plan || "free");
        setFreeTripsUsed(profile.free_trips_used ?? 0);
        setPaidTripsBalance(profile.paid_trips_balance ?? 0);
      }
      await syncUserDashboard();
    } catch (err) {
      console.error("Failed to load user data from Supabase:", err);
    } finally {
      setUserDataLoading(false);
    }
  };

  // Fetch trips, profile, and companion invites once user is logged in
  useEffect(() => {
    if (user) {
      loadUserData(user);
    } else {
      setPlan("free");
      setFreeTripsUsed(0);
      setPaidTripsBalance(0);
      setTrips([]);
      setSharedTrips([]);
      setIncomingInvitations([]);
      setAcceptedInvitations([]);
    }
  }, [user]);

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      await db.updateInvitationStatus(invitationId, "accepted");
      await syncUserDashboard();
    } catch (err) {
      console.error("Failed to accept invitation:", err);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    try {
      await db.updateInvitationStatus(invitationId, "declined");
      await syncUserDashboard();
    } catch (err) {
      console.error("Failed to decline invitation:", err);
    }
  };

  // Handle Auth Success
  const handleAuthSuccess = (authenticatedUser: any) => {
    setUser(authenticatedUser);
  };

  // Handle Logout
  const handleSignOut = async () => {
    try {
      await db.signOut();
      setUser(null);
      setActiveItinerary(null);
      setActiveTripId(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  // Generate Itinerary via Backend Express API proxying Gemini
  const handleGenerateItinerary = async (input: TripInput) => {
    const remainingFree = Math.max(0, 2 - freeTripsUsed);
    
    // Premium plan limitation check (Free users max 2 plans, unless they have paid-per-trip balance or upgraded)
    if (!isPremium) {
      if (plan === "free" && remainingFree <= 0 && paidTripsBalance <= 0) {
        setShowPremiumModal(true);
        return;
      }
      if (plan === "pay_per_trip" && paidTripsBalance <= 0) {
        setShowPremiumModal(true);
        return;
      }
    }

    setGenerating(true);
    lastTripInput.current = input;
    pendingTripResultScroll.current = true;
    setApiError(null);
    setActiveItinerary(null);
    setActiveTripId(null);

    try {
      const accessToken = await db.getAccessToken();
      if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/generate-itinerary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({ ...input })
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(response.ok
          ? "The trip service returned an invalid response. Please try again."
          : "The trip service is temporarily unavailable. Please try again in a moment.");
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate your itinerary. Please try again.");
      }
      if (data.itinerary) {
        setActiveItinerary(data.itinerary);
        
        // The server is the only authority that consumes free trips or paid credits.
        // Refresh the UI from the entitlement returned after the server-side atomic update.
        if (data.entitlement) {
          setPlan(data.entitlement.plan || "free");
          setFreeTripsUsed(Number(data.entitlement.freeTripsUsed || 0));
          setPaidTripsBalance(Number(data.entitlement.paidTripsBalance || 0));
        }
      } else {
        throw new Error("No itinerary received from backend.");
      }
    } catch (err: any) {
      pendingTripResultScroll.current = false;
      console.error("Generation failed:", err);
      setApiError(err.message || "An unexpected error occurred during trip generation.");
    } finally {
      setGenerating(false);
    }
  };

  // Save trip to Database
  const handleSaveTrip = async () => {
    if (!user || !activeItinerary) return;

    setSaving(true);
    try {
      if (activeTripId) {
        // Update existing trip
        await db.updateTrip(activeTripId, activeItinerary);
        await fetchUserTrips();
      } else {
        // Save new trip
        const newTrip = await db.saveTrip(
          user.id,
          activeItinerary.destination,
          activeItinerary.startDate,
          activeItinerary.endDate,
          activeItinerary.budgetAmount,
          activeItinerary.travelers,
          activeItinerary.travelStyle as any,
          activeItinerary
        );
        setActiveTripId(newTrip.id);
        await fetchUserTrips();
      }
    } catch (err) {
      console.error("Failed to save itinerary:", err);
    } finally {
      setSaving(false);
    }
  };

  // Update notes, rating, and category for a trip
  const handleUpdateTripNotesAndRating = async (tripId: string, rating: number, privateNote: string, category?: string, reviewText?: string) => {
    const tripToUpdate = trips.find(t => t.id === tripId);
    if (!tripToUpdate) return;

    const updatedItinerary = {
      ...tripToUpdate.itinerary,
      rating,
      privateNote,
      reviewText: reviewText !== undefined ? reviewText : tripToUpdate.itinerary.reviewText,
      category: category !== undefined ? category : tripToUpdate.itinerary.category
    };

    try {
      await db.updateTrip(tripId, updatedItinerary);
      
      // Update local state for immediate reactive UI update
      setTrips(prev => prev.map(t => t.id === tripId ? { 
        ...t, 
        itinerary: updatedItinerary, 
        category: category !== undefined ? category : t.category 
      } : t));
      
      if (activeTripId === tripId) {
        setActiveItinerary(updatedItinerary);
      }
    } catch (err) {
      console.error("Failed to update trip notes & rating:", err);
    }
  };

  const handleSubmitTripReview = async (tripId: string, rating: number, reviewText: string) => {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) throw new Error("Save this trip before submitting a review.");

    const accessToken = await db.getAccessToken();
    if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tripId, destination: trip.destination, rating, reviewText })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Could not submit your review.");

    // Persist locally only after the server accepted the review and email notification.
    const updatedItinerary = {
      ...trip.itinerary,
      rating,
      reviewText,
      reviewModerationStatus: "pending" as const,
      reviewerEmail: user?.email || trip.itinerary.reviewerEmail
    };
    await db.updateTrip(tripId, updatedItinerary);
    setTrips(prev => prev.map(item => item.id === tripId ? { ...item, itinerary: updatedItinerary } : item));
    if (activeTripId === tripId) setActiveItinerary(updatedItinerary);
  };

  // Update entire itinerary for a trip (or active unsaved itinerary)
  const handleUpdateItinerary = async (tripId: string | null, updatedItinerary: Itinerary) => {
    if (!tripId) {
      // Unsaved trip: Update active itinerary state in memory
      setActiveItinerary(updatedItinerary);
      return;
    }

    try {
      await db.updateTrip(tripId, updatedItinerary);
      
      // Update local state for immediate reactive UI update
      setTrips(prev => prev.map(t => t.id === tripId ? { ...t, itinerary: updatedItinerary } : t));
      
      if (activeTripId === tripId) {
        setActiveItinerary(updatedItinerary);
      }
    } catch (err) {
      console.error("Failed to update trip itinerary:", err);
    }
  };

  // Delete trip
  const handleDeleteTrip = async (tripId: string) => {
    if (!confirm("Are you sure you want to delete this trip itinerary?")) return;
    setDeletingId(tripId);
    try {
      await db.deleteTrip(tripId);
      if (activeTripId === tripId) {
        setActiveItinerary(null);
        setActiveTripId(null);
      }
      await fetchUserTrips();
    } catch (err) {
      console.error("Failed to delete trip:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Check if active itinerary is already saved in loaded trips
  const isCurrentlySaved = trips.some(t => t.id === activeTripId) || (activeItinerary && trips.some(t => t.destination === activeItinerary.destination && t.startDate === activeItinerary.startDate && t.endDate === activeItinerary.endDate));

  // If in shared read-only mode, render the public/shared view completely bypassing Auth
  if (isSharedMode) {
    if (shareLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
          <TripBalancingLogo className="w-16 h-16" spin />
          <p className="mt-4 text-sm font-bold tracking-wide uppercase">Loading Shared Itinerary...</p>
        </div>
      );
    }

    if (shareError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-full max-w-md bg-white dark:bg-slate-950 p-8 rounded-3xl border border-slate-100 dark:border-slate-900 shadow-xl space-y-6">
            <div className="inline-flex p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-2xl">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">Unable to load shared itinerary</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{shareError}</p>
            </div>
            <button
              onClick={() => {
                window.location.href = window.location.origin;
              }}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl text-sm font-bold transition-colors cursor-pointer shadow-sm animate-pulse"
            >
              Go to TripBalancing Planner
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors duration-300">
        <header className="print:hidden sticky top-0 z-40 bg-white/80 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-150 dark:border-slate-900 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <button 
              onClick={() => { window.location.href = window.location.origin; }}
              className="flex items-center gap-2.5 text-xl font-extrabold text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <div className="p-1.5 bg-slate-900 rounded-xl shadow-md border border-slate-800">
                <TripBalancingLogo className="w-6 h-6" spin />
              </div>
              <span>TripBalancing</span>
            </button>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <button
                onClick={() => { window.location.href = window.location.origin; }}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>Create Your Own Trip</span>
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          {sharedItinerary && (
            <ItineraryView 
              itinerary={sharedItinerary} 
              isReadOnly={true}
              tripId={sharedTripId || undefined}
            />
          )}
        </main>

        <footer className="print:hidden border-t border-slate-150 dark:border-slate-900 bg-white dark:bg-slate-950 py-10 transition-colors mt-12 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <TripBalancingLogo className="w-5 h-5" spin />
              <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">TripBalancing</span>
              <span>|</span>
              <span>© 2026 TripBalancing travel helper app. Shared read-only mode.</span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  if (authLoading || userDataLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
        <TripBalancingLogo className="w-16 h-16" spin />
        <p className="mt-4 text-sm font-bold tracking-wide uppercase">Syncing your travel data with Supabase...</p>
      </div>
    );
  }

  // Password recovery must always show the secure new-password form.
  // Supabase may establish a temporary recovery session before App renders,
  // so this check must happen before the normal authenticated dashboard.
  const isPasswordRecoveryRoute = window.location.pathname === "/reset-password";

  // Not authenticated screen (or active password recovery flow)
  if (!user || isPasswordRecoveryRoute) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 relative">
        {/* Floating Theme Toggle */}
        <div className="absolute top-6 right-6 z-50">
          <ThemeToggle />
        </div>
        
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Pitch Info */}
          <div className="md:col-span-7 space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-100/55 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-bold text-xs rounded-full uppercase tracking-wider">
              <Sparkles className="w-4 h-4 animate-pulse" />
              Next-Gen Travel Planner
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-none">
              Plan your next trip with <span className="bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 bg-clip-text text-transparent">TripBalancing</span>
            </h1>
            <p className="text-xs md:text-sm font-extrabold text-teal-600 dark:text-teal-400 tracking-wide uppercase italic select-none">
              "Balance Your Budget. Explore the World."
            </p>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
              Craft beautiful customized travel itineraries in seconds. Enter your destination, budget, style, and travel companions to receive tailored guides, transit suggestions, safety hacks, and local food recommendations worldwide.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">🧭 Day-by-day Schedules</span>
              <span className="flex items-center gap-1">🍛 Street Food Recommendations</span>
              <span className="flex items-center gap-1">🎒 Smart Packing lists</span>
              <span className="flex items-center gap-1">📄 Multi-page PDF Exports</span>
            </div>
          </div>

          {/* Login Form */}
          <div className="md:col-span-5">
            <Suspense fallback={<SuspenseFallback />}>
              <AuthModal onSuccess={handleAuthSuccess} />
            </Suspense>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "admin" || window.location.pathname === "/admin") {
    if (!adminAccessChecked) {
      return <SuspenseFallback />;
    }
    if (!isAdminVerified) {
      if (window.location.pathname === "/admin") window.history.replaceState({}, "", "/");
      if (currentView !== "app") setTimeout(() => setCurrentView("app"), 0);
    } else {
      return (
        <Suspense fallback={<SuspenseFallback />}>
          <AdminDashboard
            onBackToApp={() => {
              window.history.pushState({}, "", "/");
              setCurrentView("app");
            }}
          />
        </Suspense>
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      
      {/* Main Header */}
      <header className="print:hidden sticky top-0 z-40 bg-white/80 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-150 dark:border-slate-900 transition-colors">
        <div className="max-w-7xl min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2400px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          
          {/* Logo and Travel Activity Summary Bar */}
          <div className="flex flex-col items-start gap-1">
            <button 
              id="header-logo-btn"
              onClick={closeActiveTrip}
              className="flex items-center gap-2.5 text-xl font-extrabold text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <div className="p-1.5 bg-slate-900 rounded-xl shadow-md border border-slate-800">
                <TripBalancingLogo className="w-6 h-6" spin />
              </div>
              <span className="hidden min-[440px]:inline">TripBalancing</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 px-2.5 py-0.5 rounded-full border border-slate-100 dark:border-slate-900/80">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                <span>Total Trips Planned:</span>
                <strong className="text-slate-700 dark:text-slate-300">{trips.length}</strong>
              </span>
              <span className="w-px h-2.5 bg-slate-200 dark:bg-slate-800"></span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Countries Visited:</span>
                <strong className="text-slate-700 dark:text-slate-300">{countriesVisitedCount}</strong>
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <ThemeToggle />

            {/* Admin Portal Header Button for Verified Admins */}
            {isAdminVerified && (
              <button
                id="header-admin-panel-btn"
                onClick={() => {
                  window.history.pushState({}, "", "/admin");
                  setCurrentView("admin");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-600 dark:text-teal-400 font-extrabold rounded-xl text-xs cursor-pointer transition-all shadow-sm"
                title="Open Admin Dashboard"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden min-[580px]:inline">Admin Panel</span>
              </button>
            )}

            {/* Premium Button or Badge */}
            {isPremium ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-tr from-amber-400/15 to-amber-500/15 border border-amber-300/45 text-amber-650 dark:text-amber-400 font-extrabold rounded-xl text-[11px] select-none shadow-sm shadow-amber-500/5" title="Premium Member">
                <Crown className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span className="hidden min-[500px]:inline">Premium Member</span>
              </span>
            ) : (
              <button
                id="header-upgrade-premium-btn"
                onClick={() => setShowPremiumModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black rounded-xl text-xs cursor-pointer transition-all shadow-sm active:scale-95"
                title="Go Premium"
              >
                <Crown className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                <span className="hidden min-[500px]:inline">Go Premium</span>
              </button>
            )}

            {/* Profile Details */}
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="hidden sm:block text-right">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{getUserDisplayName(user)}</span>
              </div>
              
              <button
                id="header-logout-btn"
                onClick={handleSignOut}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Content Body */}
      <main className="max-w-7xl min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2400px] mx-auto px-4 sm:px-6 py-8">
        
        {/* Error Notification */}
        {apiError && (
          <div id="trip-planning-error" role="alert" tabIndex={-1} className="flex items-start gap-3 p-4 mb-8 border rounded-3xl bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-bold">Trip Planning Error</h4>
              <p className="text-sm leading-relaxed">{apiError}</p>
              {lastTripInput.current && (
                <button
                  type="button"
                  onClick={() => handleGenerateItinerary(lastTripInput.current!)}
                  disabled={generating}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}

        {/* LOADING STATE FOR GENERATION */}
        {generating && (
          <div className="max-w-2xl mx-auto py-16 text-center space-y-6">
            <div className="relative inline-flex items-center justify-center p-5 bg-slate-950 rounded-3xl shadow-xl border border-slate-800 animate-bounce">
              <TripBalancingLogo className="w-12 h-12" spin />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                {generationElapsed < 15 ? "Checking your trip details..." : generationElapsed < 40 ? "Building your day-by-day plan..." : "Finalizing prices and routes..."}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {generationElapsed < 45
                  ? `Your trip is being prepared. ${generationElapsed}s elapsed.`
                  : "The AI is taking longer than expected. We’ll automatically switch to a verified destination plan if needed."}
              </p>
            </div>

            {/* Simulated milestones */}
            <div className="max-w-xs mx-auto bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-850">
              <div className="flex items-center gap-3 text-left">
                <span className="inline-block w-2.5 h-2.5 bg-teal-500 rounded-full animate-ping" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {generationElapsed < 15 ? "Validating destination and dates" : generationElapsed < 40 ? "Creating activities and meals" : "Checking costs, hotels and transport"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE ITINERARY DISPLAY */}
        {!generating && activeItinerary && (
          <div id="generated-trip-result-top" tabIndex={-1} className="space-y-6 scroll-mt-24 outline-none">
            <button
              id="back-to-dashboard-btn"
              onClick={closeActiveTrip}
              className="print:hidden inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition-colors shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Travel Hub
            </button>

            <Suspense fallback={<SuspenseFallback />}>
              <ItineraryView 
                itinerary={activeItinerary} 
                onSave={handleSaveTrip}
                isSaving={saving}
                isSaved={isCurrentlySaved}
                onDelete={activeTripId ? () => handleDeleteTrip(activeTripId) : undefined}
                isDeleting={deletingId === activeTripId}
                tripId={activeTripId}
                onUpdateNotesAndRating={handleUpdateTripNotesAndRating}
                onSubmitReview={handleSubmitTripReview}
                onUpdateItinerary={handleUpdateItinerary}
                isReadOnly={activeTripIsReadOnly}
                onInviteBuddy={() => setShowBuddyInviteModal(true)}
              />
            </Suspense>
          </div>
        )}

        {/* NORMAL PLANNER & TRAVEL LIBRARY DISPLAY */}
        {!activeItinerary && (
          <div className={`mx-auto w-full max-w-[1560px] space-y-10 ${generating ? "hidden" : ""}`} aria-hidden={generating}>
            <section className="overflow-hidden rounded-[34px] border border-slate-200/70 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
              <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-teal-50/40 px-5 py-6 dark:border-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-teal-950/10 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-2xl">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-500/15 bg-teal-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
                      <Sparkles className="h-3.5 w-3.5" /> AI Travel Planner
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">Plan your next trip, your way.</h1>
                    <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
                      Choose your destination or let TripBalancing help you find the right one for your time, style and budget.
                    </p>
                  </div>

                  <div className="min-w-[210px] rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Your plan</span>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${isPremium ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-teal-500/10 text-teal-600 dark:text-teal-400"}`}>
                        {plan === "lifetime" ? "Lifetime" : plan === "yearly" ? "Yearly" : plan === "pay_per_trip" ? "Pay per trip" : "Free"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-xl font-black text-slate-900 dark:text-white">{isPremium ? "Unlimited" : `${Math.max(0, 2 - freeTripsUsed) + paidTripsBalance}`}</div>
                        <div className="text-[10px] font-bold text-slate-400">{isPremium ? "Trip plans active" : "Plans available"}</div>
                      </div>
                      {!isPremium && (
                        <button onClick={() => setShowPremiumModal(true)} className="text-[10px] font-black text-teal-600 hover:underline dark:text-teal-400">Upgrade</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-8">
                {freeTripsUsed >= 2 && paidTripsBalance <= 0 && !isPremium && (
                  <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300"><AlertCircle className="h-4 w-4" />Your free trip limit is reached.</div>
                    <button onClick={() => setShowPremiumModal(true)} className="rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black text-slate-950">View plans</button>
                  </div>
                )}
                <TripForm onSubmit={handleGenerateItinerary} loading={generating} />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">Your travel space</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">Trips & travel tools</h2>
                </div>
                <p className="text-xs font-medium text-slate-400">Your guides, packing, alerts and currency tools in one place.</p>
              </div>

              {tripsLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3].map((n) => <div key={n} className="h-52 animate-pulse rounded-[26px] border border-slate-200 bg-slate-100/60 dark:border-slate-800 dark:bg-slate-900/50" />)}
                </div>
              ) : (
                <Suspense fallback={<SuspenseFallback />}>
                  <Dashboard
                    trips={trips}
                    sharedTrips={sharedTrips}
                    acceptedInvitations={acceptedInvitations}
                    incomingInvitations={incomingInvitations}
                    onAcceptInvitation={handleAcceptInvitation}
                    onDeclineInvitation={handleDeclineInvitation}
                    onSelectTrip={(trip, isReadOnly = false) => {
                      dashboardScrollPosition.current = window.scrollY;
                      pendingTripResultScroll.current = true;
                      window.history.pushState({ tripView: true }, "", window.location.href);
                      tripHistoryEntry.current = true;
                      setActiveItinerary(trip.itinerary);
                      setActiveTripId(trip.id);
                      setActiveTripIsReadOnly(isReadOnly);
                    }}
                    onDeleteTrip={handleDeleteTrip}
                    isDeleting={deletingId}
                    onUpdateNotesAndRating={handleUpdateTripNotesAndRating}
                    plan={plan}
                    freeTripsUsed={freeTripsUsed}
                    paidTripsBalance={paidTripsBalance}
                    onUpgradeClick={() => setShowPremiumModal(true)}
                  />
                </Suspense>
              )}
            </section>

            {publicReviews.length > 0 && (
              <section className="space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">Traveler experiences</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white">What travelers are saying</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {publicReviews.slice(0, 6).map((review) => (
                    <article key={review.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-200 dark:text-slate-800"}`} />)}
                      </div>
                      <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">“{review.reviewText}”</p>
                      <p className="mt-4 text-xs font-extrabold text-teal-600 dark:text-teal-400">Verified trip · {review.destination}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="print:hidden border-t border-slate-150 dark:border-slate-900 bg-white dark:bg-slate-950 py-10 transition-colors mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row items-center justify-between gap-6 text-slate-400 font-medium">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
            <div className="flex items-center gap-2">
              <TripBalancingLogo className="w-5 h-5" spin />
              <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">TripBalancing</span>
            </div>
            <span className="hidden sm:inline">|</span>
            <span>© 2026 TripBalancing travel helper app. All rights reserved.</span>
          </div>

          {/* User Experience Policy & Support Links */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold">
            <button 
              type="button"
              onClick={() => handleOpenLegalModal("privacy")}
              className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button 
              type="button"
              onClick={() => handleOpenLegalModal("terms")}
              className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
            >
              Terms & Conditions
            </button>
            <span>•</span>
            <button 
              type="button"
              onClick={() => handleOpenLegalModal("refund")}
              className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
            >
              Refund Policy
            </button>
            <span>•</span>
            <button 
              type="button"
              onClick={() => handleOpenLegalModal("contact")}
              className="hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer font-bold text-slate-600 dark:text-slate-300 hover:underline"
            >
              Contact Us
            </button>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}>
        <PremiumUpgradeModal 
          isOpen={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
          onUpgradeSuccess={handleUpgradeSuccess}
          userEmail={user?.email || "guest@tripbalancing.com"}
          currentPlan={plan}
          remainingFreeTrips={Math.max(0, 2 - freeTripsUsed)}
          paidTripsBalance={paidTripsBalance}
          onOpenLegalPage={handleOpenLegalModal}
        />

        <LegalAndSupportModal
          isOpen={showLegalModal}
          onClose={() => setShowLegalModal(false)}
          defaultTab={legalTab}
          userEmail={user?.email || ""}
        />

        <BuddyInviteModal 
          isOpen={showBuddyInviteModal}
          onClose={() => setShowBuddyInviteModal(false)}
          tripId={activeTripId}
          tripDestination={activeItinerary?.destination || ""}
          userEmail={user?.email || ""}
        />

        <GoogleContactsModal
          isOpen={showGoogleContactsModal}
          onClose={() => setShowGoogleContactsModal(false)}
          tripDestination={activeItinerary?.destination || ""}
        />
      </Suspense>

    </div>
  );
}
