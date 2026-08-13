import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { 
  Download, Save, Trash, Calendar, Users, Briefcase, ChevronDown, ChevronUp, MapPin, Printer,
  Map, UtensilsCrossed, CheckSquare, Info, Star, Compass, Tag, Truck, Check, AlertTriangle,
  Plus, Trash2, Coins, Camera, Image, Share2, Copy, Link, Globe, Sparkles, MessageSquare, Send, X,
  Search, Sun, CloudSun, Cloud, CloudRain, Snowflake, CloudLightning, PlaneTakeoff, Clock
} from "lucide-react";
import { Itinerary, TripRecord, LoggedExpense } from "../types";
// Lazy-load heavier visual sub-components to optimize chunk size and page speed
import DestinationWeather from "./DestinationWeather";
import CameraCapture from "./CameraCapture";
import BudgetBreakdownChart from "./BudgetBreakdownChart";
import ItineraryMap from "./ItineraryMap";

interface ItineraryViewProps {
  itinerary: Itinerary;
  onSave?: () => void;
  isSaving?: boolean;
  isSaved?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
  tripId?: string | null;
  onUpdateNotesAndRating?: (tripId: string, rating: number, privateNote: string, category?: string, reviewText?: string) => void;
  onUpdateItinerary?: (tripId: string | null, updatedItinerary: Itinerary) => void;
  isReadOnly?: boolean;
  onInviteBuddy?: () => void;
}

export default function ItineraryView({ 
  itinerary, 
  onSave, 
  isSaving = false, 
  isSaved = false,
  onDelete,
  isDeleting = false,
  tripId = null,
  onUpdateNotesAndRating,
  onUpdateItinerary,
  isReadOnly = false,
  onInviteBuddy
}: ItineraryViewProps) {
  const [activeTab, setActiveTab] = useState<"itinerary" | "places" | "food" | "packing" | "weather" | "budget">("itinerary");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 1: true });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // 5-day Open-Meteo weather forecast states
  const [headerWeather, setHeaderWeather] = useState<any[]>([]);
  const [headerWeatherLoading, setHeaderWeatherLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!itinerary.destination) return;

    async function fetchHeaderWeather() {
      setHeaderWeatherLoading(true);
      try {
        const response = await fetch("/api/open-weather", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destination: itinerary.destination,
            latitude: itinerary.latitude,
            longitude: itinerary.longitude
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (active && data && data.forecast) {
            setHeaderWeather(data.forecast);
          }
        }
      } catch (err) {
        console.error("Failed to fetch header open weather:", err);
      } finally {
        if (active) {
          setHeaderWeatherLoading(false);
        }
      }
    }

    fetchHeaderWeather();
    return () => {
      active = false;
    };
  }, [itinerary.destination, itinerary.latitude, itinerary.longitude]);

  const getHeaderWeatherIcon = (iconType: string) => {
    const norm = (iconType || "").toLowerCase().trim();
    switch (norm) {
      case "sunny":
        return <Sun className="w-4 h-4 text-amber-200 shrink-0" />;
      case "partly-cloudy":
        return <CloudSun className="w-4 h-4 text-sky-100 shrink-0" />;
      case "cloudy":
        return <Cloud className="w-4 h-4 text-slate-200 shrink-0" />;
      case "rainy":
        return <CloudRain className="w-4 h-4 text-blue-200 shrink-0" />;
      case "snowy":
        return <Snowflake className="w-4 h-4 text-cyan-100 shrink-0" />;
      case "stormy":
        return <CloudLightning className="w-4 h-4 text-purple-200 shrink-0" />;
      default:
        return <Cloud className="w-4 h-4 text-slate-200 shrink-0" />;
    }
  };

  const highlightText = (text: string | undefined | null, search: string) => {
    if (!text) return "";
    if (!search.trim()) return text;
    const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <mark key={i} className="bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-0.5 rounded-sm font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const getHeroImage = (destination: string): string => {
    const dest = destination.toLowerCase().trim();
    if (dest.includes("paris") || dest.includes("france") || dest.includes("french")) {
      return "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("london") || dest.includes("uk") || dest.includes("united kingdom") || dest.includes("england") || dest.includes("britain") || dest.includes("scotland") || dest.includes("edinburgh")) {
      return "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("tokyo") || dest.includes("japan") || dest.includes("kyoto") || dest.includes("osaka") || dest.includes("fuji") || dest.includes("hokkaido")) {
      return "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("new york") || dest.includes("nyc") || dest.includes("manhattan") || dest.includes("usa") || dest.includes("united states") || dest.includes("america") || dest.includes("brooklyn") || dest.includes("california") || dest.includes("los angeles") || dest.includes("san francisco")) {
      return "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("rome") || dest.includes("italy") || dest.includes("venice") || dest.includes("florence") || dest.includes("milan") || dest.includes("tuscany") || dest.includes("amalfi") || dest.includes("italian")) {
      return "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("bali") || dest.includes("indonesia") || dest.includes("ubud") || dest.includes("jakarta")) {
      return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("sydney") || dest.includes("australia") || dest.includes("melbourne") || dest.includes("queensland")) {
      return "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("dubai") || dest.includes("uae") || dest.includes("abu dhabi")) {
      return "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("switzerland") || dest.includes("alps") || dest.includes("zurich") || dest.includes("geneva") || dest.includes("lucerne") || dest.includes("swiss")) {
      return "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("maldives")) {
      return "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("singapore")) {
      return "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("thailand") || dest.includes("bangkok") || dest.includes("phuket") || dest.includes("pattaya") || dest.includes("chiang mai")) {
      return "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("egypt") || dest.includes("cairo") || dest.includes("pyramids") || dest.includes("giza") || dest.includes("nile")) {
      return "https://images.unsplash.com/photo-1503177119275-0aa32b31d468?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("greece") || dest.includes("athens") || dest.includes("santorini") || dest.includes("mykonos")) {
      return "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("turkey") || dest.includes("istanbul") || dest.includes("cappadocia") || dest.includes("antalya") || dest.includes("turkish")) {
      return "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("spain") || dest.includes("barcelona") || dest.includes("madrid") || dest.includes("seville") || dest.includes("mallorca") || dest.includes("ibiza") || dest.includes("spanish")) {
      return "https://images.unsplash.com/photo-1543783207-ec64e4d95325?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("canada") || dest.includes("toronto") || dest.includes("vancouver") || dest.includes("montreal") || dest.includes("quebec")) {
      return "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("germany") || dest.includes("berlin") || dest.includes("munich") || dest.includes("frankfurt") || dest.includes("bavaria") || dest.includes("german")) {
      return "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("amsterdam") || dest.includes("netherlands") || dest.includes("holland") || dest.includes("dutch")) {
      return "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("uttar pradesh") || dest.includes("india") || dest.includes("agra") || dest.includes("taj") || dest.includes("delhi") || dest.includes("mumbai") || dest.includes("jaipur") || dest.includes("goa") || dest.includes("kerala") || dest.includes("bengaluru") || dest.includes("rajasthan") || dest.includes("varanasi")) {
      if (dest.includes("varanasi") || dest.includes("ghat") || dest.includes("ganges") || dest.includes("ganga")) {
        return "https://images.unsplash.com/photo-1561361531-99f2a6a9715e?auto=format&fit=crop&w=1200&q=80";
      }
      if (dest.includes("jaipur") || dest.includes("rajasthan") || dest.includes("hawa mahal") || dest.includes("amer") || dest.includes("palace") || dest.includes("fort")) {
        return "https://images.unsplash.com/photo-1477587458883-471a5bd93ae3?auto=format&fit=crop&w=1200&q=80";
      }
      if (dest.includes("delhi") || dest.includes("qutub") || dest.includes("india gate") || dest.includes("red fort")) {
        return "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=1200&q=80";
      }
      if (dest.includes("mumbai") || dest.includes("bombay") || dest.includes("gateway")) {
        return "https://images.unsplash.com/photo-1529253355930-dd14234bc98e?auto=format&fit=crop&w=1200&q=80";
      }
      if (dest.includes("kerala") || dest.includes("munnar") || dest.includes("backwaters")) {
        return "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=1200&q=80";
      }
      return "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("beach") || dest.includes("island") || dest.includes("ocean") || dest.includes("hawaii") || dest.includes("honolulu") || dest.includes("maui")) {
      return "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80";
    }
    if (dest.includes("mountain") || dest.includes("trek") || dest.includes("himalaya") || dest.includes("nature") || dest.includes("forest") || dest.includes("lake") || dest.includes("hill")) {
      return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80";
    }
    return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80";
  };

  const getStaticMapUrl = (lat?: number, lng?: number): string => {
    const latitude = lat || 28.6139;
    const longitude = lng || 77.2090;
    return `https://static-maps.yandex.ru/1.x/?ll=${longitude},${latitude}&z=11&l=map&size=650,300&lang=en_US`;
  };

  const getTravellerEmail = (): string => {
    try {
      const sessionStr = localStorage.getItem("tripbalancing_mock_session");
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session && session.user && session.user.email) {
          return session.user.email;
        }
      }
    } catch (e) {
      // ignore
    }
    return "yadavvashish@gmail.com";
  };

  const renderSafeRupee = (text: string | undefined | null) => {
    if (!text) return "";
    const parts = text.split("₹");
    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {index > 0 && <span className="font-sans" style={{ fontFamily: "Arial, sans-serif" }}>₹</span>}
            {part}
          </span>
        ))}
      </>
    );
  };
  const [packingChecks, setPackingChecks] = useState<Record<string, boolean>>(() => {
    if (itinerary.packingChecks) return itinerary.packingChecks;
    const storageKey = `packing_checks_${tripId || itinerary.destination}`;
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.warn("Failed to parse packing checks:", e);
      }
    }
    return {};
  });

  // Sync state to localStorage on changes as backup cache
  useEffect(() => {
    const storageKey = `packing_checks_${tripId || itinerary.destination}`;
    localStorage.setItem(storageKey, JSON.stringify(packingChecks));
  }, [packingChecks, tripId, itinerary.destination]);

  // Load correct state when active itinerary or trip changes
  useEffect(() => {
    if (itinerary.packingChecks) {
      setPackingChecks(itinerary.packingChecks);
    } else {
      const storageKey = `packing_checks_${tripId || itinerary.destination}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        try {
          setPackingChecks(JSON.parse(cached));
        } catch (e) {
          console.warn("Failed to load packing checks:", e);
          setPackingChecks({});
        }
      } else {
        setPackingChecks({});
      }
    }
  }, [tripId, itinerary]);
  const [localNote, setLocalNote] = useState(itinerary.privateNote || "");
  const [localReview, setLocalReview] = useState(itinerary.reviewText || "");
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);
  const [reviewSavedFeedback, setReviewSavedFeedback] = useState(false);

  // States for logging new actual daily expenses
  const [showExpenseFormDay, setShowExpenseFormDay] = useState<number | null>(null);
  const [expenseAmount, setExpenseAmount] = useState<string>("");
  const [expenseDesc, setExpenseDesc] = useState<string>("");
  const [expenseCategory, setExpenseCategory] = useState<"Accommodation" | "Food" | "Activities" | "Transport" | "Other">("Food");

  // States for camera access and daily photos
  const [activeCameraDay, setActiveCameraDay] = useState<number | null>(null);
  const [selectedLightboxPhoto, setSelectedLightboxPhoto] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printErrorMsg, setPrintErrorMsg] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // AI Travel Assistant chat widget states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "model"; text: string }>>([
    {
      role: "model",
      text: `Hi there! I'm your TripBalancing AI Travel Assistant 🧭\n\nI have scanned your custom itinerary for **${itinerary.destination}**. Ask me any follow-up questions, such as:\n* "How do I get from our hotel to the local sights?"\n* "Recommend vegetarian or local street food options."\n* "What's the best local public transit method here?"`
    }
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatOpen]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatError(null);
    setIsChatLoading(true);

    // Append user message immediately
    const updatedMessages = [...chatMessages, { role: "user" as const, text: userMsg }];
    setChatMessages(updatedMessages);

    try {
      const res = await fetch("/api/itinerary-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          message: userMsg,
          history: chatMessages
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch response.");
      }

      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "model" as const, text: data.response || "No response received." }]);
    } catch (err: any) {
      console.error("AI Chat Error:", err);
      setChatError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const formatMessageText = (text: string) => {
    return text.split("\n").map((line, idx) => {
      let content: React.ReactNode = line;
      if (line.startsWith("- ") || line.startsWith("* ")) {
        content = <span className="pl-2 block">• {line.slice(2)}</span>;
      }
      const boldRegex = /\*\*(.*?)\*\*/g;
      if (line.includes("**")) {
        const parts = line.split(boldRegex);
        content = parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-extrabold text-slate-900 dark:text-white">{part}</strong> : part);
      }
      return <p key={idx} className="mb-1 leading-relaxed text-xs">{content}</p>;
    });
  };

  const getTripProgress = () => {
    if (!itinerary.startDate || !itinerary.endDate) return null;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const start = new Date(itinerary.startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(itinerary.endDate);
      end.setHours(0, 0, 0, 0);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

      const totalDurationMs = end.getTime() - start.getTime();
      const totalDays = Math.max(1, Math.ceil(totalDurationMs / (1000 * 60 * 60 * 24)) + 1);

      if (today < start) {
        const daysUntilStart = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          status: "upcoming" as const,
          percentage: 0,
          currentDay: 0,
          totalDays,
          label: `Upcoming adventure • Starts in ${daysUntilStart} ${daysUntilStart === 1 ? 'day' : 'days'}`
        };
      } else if (today > end) {
        return {
          status: "completed" as const,
          percentage: 100,
          currentDay: totalDays,
          totalDays,
          label: "Journey completed! Cherish the memories ✨"
        };
      } else {
        const elapsedMs = today.getTime() - start.getTime();
        const currentDay = Math.min(totalDays, Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1));
        const percentage = Math.round((currentDay / totalDays) * 100);
        return {
          status: "active" as const,
          percentage,
          currentDay,
          totalDays,
          label: `Currently on Day ${currentDay} of ${totalDays}`
        };
      }
    } catch (e) {
      console.error("Error calculating trip progress:", e);
      return null;
    }
  };

  const progress = getTripProgress();

  const getShareLink = () => {
    const origin = window.location.origin;
    const path = window.location.pathname;
    if (tripId) {
      return `${origin}${path}?share=${tripId}`;
    } else {
      try {
        const json = JSON.stringify(itinerary);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        return `${origin}${path}?shareData=${b64}`;
      } catch (e) {
        console.error("Failed to generate offline share link", e);
        return `${origin}${path}`;
      }
    }
  };

  const handleCopyShareLink = () => {
    const link = getShareLink();
    navigator.clipboard.writeText(link).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }).catch(err => {
      console.error("Failed to copy share link:", err);
    });
  };

  // Add photo to a specific itinerary day
  const handleAddPhotoToDay = (dayNumber: number, photoUrl: string) => {
    const updatedDays = itinerary.days.map(d => {
      if (d.dayNumber === dayNumber) {
        return {
          ...d,
          photos: [...(d.photos || []), photoUrl]
        };
      }
      return d;
    });

    const updatedItinerary = {
      ...itinerary,
      days: updatedDays
    };

    if (onUpdateItinerary) {
      onUpdateItinerary(tripId, updatedItinerary);
    }
  };

  // Delete photo from a specific itinerary day
  const handleDeletePhotoFromDay = (dayNumber: number, photoIndex: number) => {
    const updatedDays = itinerary.days.map(d => {
      if (d.dayNumber === dayNumber) {
        const updatedPhotos = (d.photos || []).filter((_, idx) => idx !== photoIndex);
        return {
          ...d,
          photos: updatedPhotos
        };
      }
      return d;
    });

    const updatedItinerary = {
      ...itinerary,
      days: updatedDays
    };

    if (onUpdateItinerary) {
      onUpdateItinerary(tripId, updatedItinerary);
    }
  };

  useEffect(() => {
    setLocalNote(itinerary.privateNote || "");
  }, [itinerary.privateNote]);

  useEffect(() => {
    setLocalReview(itinerary.reviewText || "");
  }, [itinerary.reviewText]);

  const toggleDay = (dayNum: number) => {
    setExpandedDays(prev => ({
      ...prev,
      [dayNum]: !prev[dayNum]
    }));
  };

  const togglePackingCheck = (item: string) => {
    const updated = {
      ...packingChecks,
      [item]: !packingChecks[item]
    };
    setPackingChecks(updated);
    if (onUpdateItinerary) {
      onUpdateItinerary(tripId || "", {
        ...itinerary,
        packingChecks: updated
      });
    }
  };

  // Add daily expense item
  const handleAddExpense = (dayNumber: number) => {
    const amountNum = parseFloat(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid expense amount greater than 0.");
      return;
    }
    if (!expenseDesc.trim()) {
      alert("Please enter a brief description for the expense.");
      return;
    }

    const newExpense: LoggedExpense = {
      id: Math.random().toString(36).substring(2, 9),
      dayNumber,
      category: expenseCategory,
      amount: amountNum,
      description: expenseDesc.trim()
    };

    const updatedExpenses = [...(itinerary.loggedExpenses || []), newExpense];
    const updatedItinerary = {
      ...itinerary,
      loggedExpenses: updatedExpenses
    };

    if (onUpdateItinerary) {
      onUpdateItinerary(tripId, updatedItinerary);
    }

    // Reset Form state
    setExpenseAmount("");
    setExpenseDesc("");
    setExpenseCategory("Food");
    setShowExpenseFormDay(null);
  };

  // Delete an expense item
  const handleDeleteExpense = (expenseId: string) => {
    const updatedExpenses = (itinerary.loggedExpenses || []).filter(e => e.id !== expenseId);
    const updatedItinerary = {
      ...itinerary,
      loggedExpenses: updatedExpenses
    };

    if (onUpdateItinerary) {
      onUpdateItinerary(tripId, updatedItinerary);
    }
  };

  // Helper to guess currency symbol from budget amount
  const getCurrencySymbol = () => {
    const totalText = itinerary.budgetAmount || "";
    if (totalText.includes("₹") || totalText.toLowerCase().includes("inr")) return "₹";
    if (totalText.includes("€") || totalText.toLowerCase().includes("eur")) return "€";
    if (totalText.includes("£") || totalText.toLowerCase().includes("gbp")) return "£";
    return "$";
  };

  // PDF Generation using jsPDF
  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    try {
      setIsExportingPDF(true);
      const { exportPremiumTravelPDF } = await import("../utils/pdfGenerator");
      await exportPremiumTravelPDF(itinerary, packingChecks, headerWeather);
    } catch (err) {
      console.error("Failed to export premium travel PDF:", err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrint = () => {
    try {
      // Check if we are inside an iframe sandbox
      const inIframe = window.self !== window.top;
      if (inIframe) {
        setPrintErrorMsg("");
        setShowPrintModal(true);
        return;
      }
      window.print();
    } catch (err: any) {
      console.warn("Direct window.print() failed:", err);
      setPrintErrorMsg(err?.message || "Browser print feature is restricted in sandboxed frames.");
      setShowPrintModal(true);
    }
  };

  const filteredDays = itinerary.days.filter((day) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    
    // Check day theme
    if (day.theme.toLowerCase().includes(query)) return true;
    
    // Check activities
    const matchesActivity = day.activities.some(
      (act) =>
        act.title.toLowerCase().includes(query) ||
        act.description.toLowerCase().includes(query) ||
        (act.location && act.location.toLowerCase().includes(query)) ||
        (act.cost && act.cost.toLowerCase().includes(query)) ||
        (act.time && act.time.toLowerCase().includes(query))
    );
    if (matchesActivity) return true;
    
    // Check daily expenses for this day
    const dayExpenses = (itinerary.loggedExpenses || []).filter((e) => e.dayNumber === day.dayNumber);
    const matchesExpense = dayExpenses.some(
      (exp) =>
        exp.description.toLowerCase().includes(query) ||
        exp.category.toLowerCase().includes(query)
    );
    if (matchesExpense) return true;
    
    return false;
  });

  const isLongItinerary = filteredDays.length > 30;
  const daysPerPage = 10;
  const paginatedDays = isLongItinerary
    ? filteredDays.slice((currentPage - 1) * daysPerPage, currentPage * daysPerPage)
    : filteredDays;

  return (
    <>
      <div className="print:hidden space-y-6">

      {isReadOnly && (
        <div className="flex items-center gap-3 p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50 rounded-2xl text-teal-800 dark:text-teal-400">
          <Globe className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 animate-pulse" />
          <div className="text-xs font-semibold">
            <span>You are viewing a shared read-only itinerary. Feel free to explore the tabs, daily photo gallery, transit guide, and local food recommendations!</span>
          </div>
        </div>
      )}
      
      {/* Visual Banner Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 text-white rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />
        
        {/* Top-Right Printer Action Button */}
        <button
          id="itinerary-top-right-print-btn"
          onClick={handlePrint}
          className="absolute top-4 right-4 z-20 flex items-center justify-center p-3 bg-white/15 hover:bg-white/25 border border-white/20 rounded-2xl text-white cursor-pointer transition-all shadow-md backdrop-blur-sm hover:scale-105 active:scale-95"
          title="Print / Save Itinerary"
        >
          <Printer className="w-5 h-5" />
        </button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-white/20 backdrop-blur-md rounded-full text-white uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5 animate-spin-slow" />
              Generated Guide
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">{itinerary.destination}</h2>
            {itinerary.origin && (
              <div className="flex flex-wrap gap-2 items-center">
                <p className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-white/10 backdrop-blur-md rounded-full text-white border border-white/10">
                  <PlaneTakeoff className="w-3.5 h-3.5 shrink-0" />
                  <span>Traveling from: <strong className="font-extrabold">{itinerary.origin}</strong></span>
                </p>
                {itinerary.originToDestinationDuration && itinerary.originToDestinationDuration !== "N/A" && (
                  <p className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-violet-650/40 backdrop-blur-md rounded-full text-white border border-violet-500/30">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-violet-200" />
                    <span>Est. Travel Time: <strong className="font-extrabold text-violet-100">{itinerary.originToDestinationDuration}</strong></span>
                  </p>
                )}
              </div>
            )}
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-teal-50 font-medium">
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {itinerary.startDate} to {itinerary.endDate}</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {itinerary.travelers} {itinerary.travelers === 1 ? 'traveler' : 'travelers'}</span>
              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {itinerary.travelStyle} Style</span>
            </p>

            {/* 5-Day Open Weather Forecast */}
            {headerWeatherLoading ? (
              <div className="mt-3.5 flex items-center gap-2 text-xs font-bold text-teal-100 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-200 animate-ping"></span>
                <span>Fetching 5-day weather forecast...</span>
              </div>
            ) : headerWeather && headerWeather.length > 0 ? (
              <div className="mt-3.5 pt-3.5 border-t border-white/10 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-100 flex items-center gap-1">
                  <CloudSun className="w-3.5 h-3.5" />
                  <span>5-Day Open Weather Forecast</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {headerWeather.map((day, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/15 px-2.5 py-1.5 rounded-xl text-[11px] hover:bg-white/15 transition-all shadow-sm"
                      title={day.condition}
                    >
                      <span className="font-extrabold text-[9px] tracking-wide uppercase opacity-90">{day.dayName}</span>
                      <span className="flex items-center justify-center">
                        {getHeaderWeatherIcon(day.iconType)}
                      </span>
                      <div className="flex items-center gap-0.5 font-bold">
                        <span className="text-white">{day.tempMax}°</span>
                        <span className="opacity-40 text-[9px]">/</span>
                        <span className="text-white/75 text-[10px]">{day.tempMin}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2.5">
            {onSave && !isReadOnly && (
              <button
                id="itinerary-save-btn"
                onClick={onSave}
                disabled={isSaving || isSaved}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm cursor-pointer transition-all ${
                  isSaved
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-white text-teal-700 hover:bg-teal-50 shadow-md hover:shadow-lg"
                }`}
              >
                {isSaving ? (
                  <span className="inline-block w-4 h-4 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
                ) : isSaved ? (
                  <>
                    <Check className="w-4 h-4" />
                    Saved to Dashboard
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Trip
                  </>
                )}
              </button>
            )}

            {tripId && !isReadOnly && onInviteBuddy && (
              <button
                id="itinerary-invite-buddy-btn"
                onClick={onInviteBuddy}
                className="flex items-center gap-2 px-5 py-3 bg-teal-600/90 hover:bg-teal-700/95 border border-teal-500/50 rounded-2xl font-bold text-sm text-white cursor-pointer transition-all shadow-md active:scale-95"
              >
                <Users className="w-4 h-4" />
                Invite Buddy
              </button>
            )}

            <button
              id="itinerary-share-btn"
              onClick={() => {
                setShowShareModal(true);
                setIsCopied(false);
              }}
              className="flex items-center gap-2 px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/25 rounded-2xl font-bold text-sm text-white cursor-pointer transition-all shadow-md backdrop-blur-sm"
            >
              <Share2 className="w-4 h-4" />
              Share Trip
            </button>

            <button
              id="itinerary-pdf-btn"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer transition-all shadow-md backdrop-blur-sm ${
                isExportingPDF
                  ? "bg-slate-700/60 opacity-75 cursor-not-allowed"
                  : "bg-slate-900/40 hover:bg-slate-950/65 border border-white/25"
              }`}
            >
              {isExportingPDF ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export PDF
                </>
              )}
            </button>

            {onDelete && !isReadOnly && (
              <button
                id="itinerary-delete-btn"
                onClick={onDelete}
                disabled={isDeleting}
                className="flex items-center justify-center p-3 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/25 rounded-2xl text-rose-500 cursor-pointer transition-all shadow-md"
                title="Delete this itinerary"
              >
                <Trash className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar tracker */}
        {progress && (
          <div className="mt-6 pt-5 border-t border-white/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-teal-50">
              <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-sm">
                <Compass className={`w-3.5 h-3.5 ${progress.status === 'active' ? 'animate-spin-slow' : ''}`} />
                {progress.label}
              </span>
              <span className="font-extrabold uppercase tracking-widest text-[10px] bg-black/10 px-2 py-1 rounded-md text-white">
                {progress.percentage}% Progress
              </span>
            </div>

            <div className="relative h-2.5 bg-white/25 rounded-full overflow-hidden shadow-inner">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${
                  progress.status === 'completed' 
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-300' 
                    : progress.status === 'active'
                      ? 'bg-gradient-to-r from-amber-300 via-emerald-400 to-cyan-300 animate-pulse'
                      : 'bg-white/40'
                }`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            {/* Day milestones indicator */}
            {progress.totalDays > 1 && (
              <div className="flex justify-between text-[10px] text-teal-100 font-extrabold px-1 pt-0.5">
                <span>Start</span>
                {Array.from({ length: Math.min(8, progress.totalDays - 2) }).map((_, i) => {
                  const dayNum = Math.round(((i + 1) / (Math.min(8, progress.totalDays - 2) + 1)) * progress.totalDays);
                  return (
                    <span 
                      key={i} 
                      className={progress.currentDay >= dayNum ? "text-white" : "text-teal-100/60"}
                    >
                      Day {dayNum}
                    </span>
                  );
                })}
                <span>End</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Private Note & Rating Widget */}
      {isReadOnly ? (
        (itinerary.rating || itinerary.privateNote || itinerary.reviewText) ? (
          <div className="p-6 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl shadow-sm space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span>Travel Creator's Experience & Notes</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Highlights, rating, and overall review shared by the itinerary creator.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {itinerary.rating && (
                <div className="md:col-span-4 space-y-1.5">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Rating Given</span>
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-900">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star}
                        className={`w-6 h-6 ${star <= (itinerary.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-200 dark:text-slate-850"}`} 
                      />
                    ))}
                  </div>
                </div>
              )}
              
              <div className="md:col-span-8 space-y-4">
                {itinerary.reviewText && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block font-bold">Creator's Trip Review</span>
                    <div className="p-4 bg-teal-500/5 dark:bg-teal-950/10 border border-teal-500/10 dark:border-teal-400/10 rounded-2xl text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed shadow-sm">
                      "{itinerary.reviewText}"
                    </div>
                  </div>
                )}

                {itinerary.privateNote && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Creator's Memory Log & Highlights</span>
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-900 rounded-2xl text-xs font-medium text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap leading-relaxed shadow-inner">
                      "{itinerary.privateNote}"
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null
      ) : (
        <div className="p-6 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                <span>Trip Experience & Review</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rate your journey, leave a public/shared review, and record private travel highlights.
              </p>
            </div>
            
            {/* Status Indicator */}
            {!isSaved && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide bg-amber-50 dark:bg-amber-950/20 text-amber-650 dark:text-amber-400 rounded-full">
                <AlertTriangle className="w-3.5 h-3.5" />
                Save Trip to Edit
              </span>
            )}
          </div>

          {isSaved ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Stars Selection & Review */}
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Star Rating</label>
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-900">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        id={`itinerary-star-${star}`}
                        onClick={() => {
                          const newRating = star;
                          if (tripId && onUpdateNotesAndRating) {
                            onUpdateNotesAndRating(tripId, newRating, itinerary.privateNote || "", undefined, itinerary.reviewText || "");
                          }
                        }}
                        className="text-slate-300 hover:text-amber-400 transition-colors cursor-pointer p-1"
                      >
                        <Star 
                          className={`w-6 h-6 ${star <= (itinerary.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-800"}`} 
                        />
                      </button>
                    ))}
                    {itinerary.rating && (
                      <span className="text-xs font-extrabold text-amber-500 ml-2">
                        {itinerary.rating} / 5 Stars
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-teal-500" />
                    <span>Your Trip Review (Shared with buddies)</span>
                  </label>
                  <div className="flex gap-2.5">
                    <textarea
                      id="itinerary-review-textarea"
                      value={localReview}
                      onChange={(e) => setLocalReview(e.target.value)}
                      placeholder="Write your review about the overall travel experience, highlights, and tips..."
                      rows={3}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-900 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all resize-none"
                    />
                    <button
                      id="itinerary-review-save-btn"
                      type="button"
                      onClick={() => {
                        if (tripId && onUpdateNotesAndRating) {
                          onUpdateNotesAndRating(tripId, itinerary.rating || 0, itinerary.privateNote || "", undefined, localReview);
                          setReviewSavedFeedback(true);
                          setTimeout(() => setReviewSavedFeedback(false), 2000);
                        }
                      }}
                      className="px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer shadow-sm flex flex-col justify-center items-center gap-1 min-w-[75px]"
                    >
                      {reviewSavedFeedback ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Saved!</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Private Note Textarea */}
              <div className="md:col-span-6 space-y-1.5 self-stretch flex flex-col">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Private Notes (Memory log, bookings, packing ideas etc.)</label>
                <div className="flex gap-2.5 flex-1">
                  <textarea
                    id="itinerary-notes-textarea"
                    value={localNote}
                    onChange={(e) => setLocalNote(e.target.value)}
                    placeholder="Record your private memories, hotel booking references, or packing tips here..."
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-900 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all resize-none flex-1 min-h-[140px]"
                  />
                  <button
                    id="itinerary-notes-save-btn"
                    type="button"
                    onClick={() => {
                      if (tripId && onUpdateNotesAndRating) {
                        onUpdateNotesAndRating(tripId, itinerary.rating || 0, localNote, undefined, itinerary.reviewText || "");
                        setNoteSavedFeedback(true);
                        setTimeout(() => setNoteSavedFeedback(false), 2000);
                      }
                    }}
                    className="px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-2xl transition-all cursor-pointer shadow-sm flex flex-col justify-center items-center gap-1 min-w-[75px]"
                  >
                    {noteSavedFeedback ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-900 flex items-center justify-center text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                💡 <strong>Unlocked on Save:</strong> Save this customized travel companion to rate your past or planned journey, and start writing down reviews and travel logs!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto md:overflow-x-visible md:flex-wrap p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl scrollbar-none">
        {[
          { id: "itinerary", label: "🗺️ Day-by-Day", desc: "Full chronological itinerary" },
          { id: "places", label: "🏞️ Sights & Places", desc: "Top must-visit locations" },
          { id: "food", label: "🍲 Food & Cuisine", desc: "Local foods and street eateries" },
          { id: "packing", label: "🎒 Packing & Transit", desc: "Packing checklist & commute guide" },
          { id: "weather", label: "⛅ Weather", desc: "5-day forecast & tips" },
          { id: "budget", label: "📊 Budget", desc: "Interactive budget breakdown" }
        ].map((tab) => (
          <button
            id={`nav-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[120px] py-3 px-4 rounded-xl text-center font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content Section */}
      <div className="bg-white dark:bg-slate-950 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-900 shadow-xl shadow-slate-100/10">
        
        {/* TAB 1: ITINERARY */}
        {activeTab === "itinerary" && (
          <div id="itinerary-tab-content" className="space-y-6">
            {itinerary.isAiBudgetPlanner && itinerary.aiBudgetSummary && (
              <div className="p-6 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-200 dark:border-teal-900 rounded-3xl space-y-2 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-500 animate-pulse" />
                  AI Budget Planner Optimization
                </span>
                <p className="text-base font-black text-slate-850 dark:text-slate-100 leading-snug">
                  {itinerary.aiBudgetSummary}
                </p>
                {itinerary.remainingBudget && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Remaining Budget Leftover: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{itinerary.remainingBudget}</strong>
                  </p>
                )}
              </div>
            )}
            {progress && (
              <div className="p-6 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-900 rounded-3xl space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                      <Compass className={`w-3.5 h-3.5 text-teal-500 ${progress.status === 'active' ? 'animate-spin-slow' : ''}`} />
                      Trip Timeline & Progress Tracker
                    </span>
                    <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {progress.status === "completed" ? (
                        <span className="text-emerald-600 dark:text-emerald-500 flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-emerald-500" /> ✨ Journey Completed!
                        </span>
                      ) : progress.status === "active" ? (
                        <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                          🚀 Ongoing Adventure
                        </span>
                      ) : (
                        <span className="text-teal-600 dark:text-teal-500">📅 Upcoming Adventure</span>
                      )}
                    </h4>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-sm font-black text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-3 py-1.5 rounded-2xl border border-teal-100/30 dark:border-teal-900/30">
                      {progress.percentage}% Completed
                    </span>
                  </div>
                </div>

                {/* Progress bar container */}
                <div className="space-y-2">
                  <div className="relative h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${
                        progress.status === 'completed' 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                          : progress.status === 'active'
                            ? 'bg-gradient-to-r from-amber-400 via-emerald-500 to-teal-400 animate-pulse'
                            : 'bg-teal-500/30'
                      }`}
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 italic">
                    {progress.label}
                  </p>
                </div>

                {/* Grid stats and interactive days tracker */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/80 dark:border-slate-850/60 shadow-xs">
                    <span className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Start Date</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{itinerary.startDate}</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/80 dark:border-slate-850/60 shadow-xs">
                    <span className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">End Date</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{itinerary.endDate}</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/80 dark:border-slate-850/60 shadow-xs">
                    <span className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Days</span>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">{progress.totalDays} Days</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-slate-950 rounded-2xl border border-slate-150/80 dark:border-slate-850/60 shadow-xs">
                    <span className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Days Logged</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {progress.status === 'completed' 
                        ? `${progress.totalDays} / ${progress.totalDays} Done` 
                        : progress.status === 'active'
                          ? `${progress.currentDay} / ${progress.totalDays} Done`
                          : `0 / ${progress.totalDays} Done`}
                    </span>
                  </div>
                </div>

                {/* Milestone circles */}
                {progress.totalDays > 0 && (
                  <div className="pt-2">
                    <span className="block text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Days Completed Milestone Checklist</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {Array.from({ length: progress.totalDays }).map((_, i) => {
                        const dNum = i + 1;
                        let isPassed = false;
                        let isActive = false;
                        if (progress.status === "completed") {
                          isPassed = true;
                        } else if (progress.status === "active") {
                          if (dNum < progress.currentDay) {
                            isPassed = true;
                          } else if (dNum === progress.currentDay) {
                            isActive = true;
                          }
                        }
                        return (
                          <div 
                            key={dNum}
                            className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border transition-all ${
                              isPassed 
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                                : isActive
                                  ? "bg-amber-500/15 border-amber-500 text-amber-650 dark:text-amber-400 ring-2 ring-amber-500/20 animate-pulse font-black"
                                  : "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-600"
                            }`}
                            title={`Day ${dNum}: ${isPassed ? 'Completed' : isActive ? 'Active Today' : 'Upcoming'}`}
                          >
                            {dNum}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Chronological Itinerary Schedule</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Explore and filter day-by-day activities, timings, locations, and logged expenses.
                </p>
              </div>
              <span className="self-start sm:self-auto text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 px-3 py-1 rounded-full">
                {itinerary.days.length} Days Planned
              </span>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="text"
                id="itinerary-activity-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search activities, themes, timings, locations, or expenses..."
                className="w-full pl-11 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              {filteredDays.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="mx-auto w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 animate-pulse">
                    <Search className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No matching activities found</h4>
                    <p className="text-xs text-slate-550 dark:text-slate-450 max-w-md mx-auto">
                      We couldn't find any activities, locations, timings, or expenses matching <span className="font-extrabold text-slate-700 dark:text-slate-300">"{searchQuery}"</span>. Try adjusting your keywords.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    Clear Search Filter
                  </button>
                </div>
              ) : (
                <>
                  {paginatedDays.map((day) => {
                    const isExpanded = searchQuery.trim() !== "" ? true : expandedDays[day.dayNumber];
                
                // Determine day status based on timeline progress
                let dayStatus: "passed" | "active" | "upcoming" = "upcoming";
                if (progress) {
                  if (progress.status === "completed") {
                    dayStatus = "passed";
                  } else if (progress.status === "active") {
                    if (day.dayNumber < progress.currentDay) {
                      dayStatus = "passed";
                    } else if (day.dayNumber === progress.currentDay) {
                      dayStatus = "active";
                    }
                  }
                }

                return (
                  <div 
                    key={day.dayNumber} 
                    className={`border rounded-2xl overflow-hidden transition-all ${
                      dayStatus === 'active'
                        ? "border-amber-400/70 dark:border-amber-500/60 shadow-md shadow-amber-500/5 ring-1 ring-amber-400/20"
                        : dayStatus === 'passed'
                          ? "border-slate-150 dark:border-slate-900 opacity-90"
                          : "border-slate-100 dark:border-slate-900"
                    }`}
                  >
                    {/* Header */}
                    <button
                      id={`day-accordion-btn-${day.dayNumber}`}
                      onClick={() => toggleDay(day.dayNumber)}
                      className={`w-full flex items-center justify-between p-5 transition-all text-left cursor-pointer ${
                        dayStatus === 'active'
                          ? "bg-amber-500/10 dark:bg-amber-950/20 hover:bg-amber-500/15 dark:hover:bg-amber-950/30"
                          : dayStatus === 'passed'
                            ? "bg-slate-50/60 dark:bg-slate-900/20 hover:bg-slate-100/60 dark:hover:bg-slate-900/40"
                            : "bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-extrabold tracking-wider uppercase ${
                            dayStatus === 'active'
                              ? "text-amber-650 dark:text-amber-400"
                              : dayStatus === 'passed'
                                ? "text-emerald-600 dark:text-emerald-500"
                                : "text-teal-600 dark:text-teal-400"
                          }`}>
                            Day {day.dayNumber}
                          </span>
                          {dayStatus === 'active' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-xs animate-pulse">
                              Active Today 🌟
                            </span>
                          )}
                          {dayStatus === 'passed' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450">
                              <Check className="w-3 h-3" /> Completed
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">{highlightText(day.theme, searchQuery)}</h4>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </button>

                    {/* Activities List */}
                    {isExpanded && (
                      <div className="p-5 border-t border-slate-100 dark:border-slate-900 space-y-6">
                        {/* Interactive Visual Route Map for this day */}
                        <div className="mb-2">
                          <Suspense fallback={
                            <div className="h-[250px] bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center space-y-2 animate-pulse">
                              <Map className="w-6 h-6 text-teal-400 animate-bounce" />
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Drawing Route Map...</span>
                            </div>
                          }>
                            <ItineraryMap
                              activities={day.activities}
                              destinationLat={itinerary.latitude}
                              destinationLng={itinerary.longitude}
                              destinationName={itinerary.destination}
                              dayNumber={day.dayNumber}
                            />
                          </Suspense>
                        </div>

                        {day.activities.map((activity, idx) => (
                          <div key={idx} className="relative pl-8 border-l border-slate-200 dark:border-slate-800 last:border-transparent pb-1">
                            {/* Chronology Dot */}
                            <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-teal-500 ring-4 ring-teal-50 dark:ring-teal-950" />

                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                              <div className="space-y-1">
                                <span className="inline-flex px-2 py-0.5 text-[10px] font-bold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 rounded-md">
                                  {highlightText(activity.time, searchQuery)}
                                </span>
                                <h5 className="text-base font-bold text-slate-800 dark:text-slate-200">{highlightText(activity.title, searchQuery)}</h5>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{highlightText(activity.description, searchQuery)}</p>
                              </div>

                              <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-end flex-shrink-0 mt-1">
                                {activity.location && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <MapPin className="w-3.5 h-3.5 text-teal-500" />
                                    {highlightText(activity.location, searchQuery)}
                                  </span>
                                )}
                                {activity.cost && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-0.5 rounded-full">
                                    <Tag className="w-3 h-3" />
                                    {highlightText(activity.cost, searchQuery)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Daily Insights Bento Grid */}
                        {(day.dailyBudget || (day.foodRecommendations && day.foodRecommendations.length > 0) || (day.transportationSuggestions && day.transportationSuggestions.length > 0)) && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-900 pt-5 mt-4">
                            {day.dailyBudget && (
                              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-850 space-y-2">
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
                                  <Coins className="w-4 h-4" />
                                  Estimated Day Budget
                                </div>
                                <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                                  {day.dailyBudget}
                                </p>
                              </div>
                            )}

                            {day.foodRecommendations && day.foodRecommendations.length > 0 && (
                              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-850 space-y-2">
                                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                                  <UtensilsCrossed className="w-4 h-4" />
                                  Food Recommendations
                                </div>
                                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4 font-medium">
                                  {day.foodRecommendations.map((food, fIdx) => (
                                    <li key={fIdx}>{highlightText(food, searchQuery)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {day.transportationSuggestions && day.transportationSuggestions.length > 0 && (
                              <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-850 space-y-2">
                                <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-extrabold text-xs uppercase tracking-wider">
                                  <Truck className="w-4 h-4" />
                                  Transit Suggestions
                                </div>
                                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4 font-medium">
                                  {day.transportationSuggestions.map((transit, tIdx) => (
                                    <li key={tIdx}>{highlightText(transit, searchQuery)}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Daily Actual Expenses Section */}
                        <div className="border-t border-slate-100 dark:border-slate-900 pt-5 mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="p-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
                                <Coins className="w-4 h-4" />
                              </span>
                              <div>
                                <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                                  Daily Expense Tracker
                                </h5>
                                <p className="text-[11px] font-semibold text-slate-405 dark:text-slate-500">
                                  Log actual spending for Day {day.dayNumber}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Total Spent for Day */}
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-850 px-2.5 py-1 rounded-xl">
                                Day Total: {getCurrencySymbol()}{(itinerary.loggedExpenses || [])
                                  .filter(e => e.dayNumber === day.dayNumber)
                                  .reduce((acc, curr) => acc + curr.amount, 0)
                                  .toFixed(2)}
                              </span>

                              {/* Toggle Form Button */}
                              {!isReadOnly && (
                                <button
                                  type="button"
                                  id={`toggle-expense-form-btn-day-${day.dayNumber}`}
                                  onClick={() => {
                                    if (showExpenseFormDay === day.dayNumber) {
                                      setShowExpenseFormDay(null);
                                    } else {
                                      setShowExpenseFormDay(day.dayNumber);
                                      setExpenseAmount("");
                                      setExpenseDesc("");
                                      setExpenseCategory("Food");
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded-lg transition-all cursor-pointer border border-teal-200/50 dark:border-teal-900/45"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  Add Expense
                                </button>
                              )}
                            </div>
                          </div>

                          {/* List of logged expenses for this day */}
                          {(() => {
                            const dayExpenses = (itinerary.loggedExpenses || []).filter(e => e.dayNumber === day.dayNumber);
                            if (dayExpenses.length === 0) {
                              return (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic py-1 pl-1 font-medium">
                                  {isReadOnly 
                                    ? `No actual spending logged for Day ${day.dayNumber}.`
                                    : `No actual spending logged for Day ${day.dayNumber} yet. Click 'Add Expense' to record one!`
                                  }
                                </p>
                              );
                            }
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
                                {dayExpenses.map((exp) => (
                                  <div
                                    key={exp.id}
                                    className="p-3 bg-slate-50/55 dark:bg-slate-900/10 border border-slate-100 dark:border-slate-900 rounded-xl flex items-center justify-between gap-2.5 hover:border-slate-200 dark:hover:border-slate-850 transition-all group"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400">
                                          {highlightText(exp.category, searchQuery)}
                                        </span>
                                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                          {getCurrencySymbol()}{exp.amount.toFixed(2)}
                                        </span>
                                      </div>
                                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                        {highlightText(exp.description, searchQuery)}
                                      </p>
                                    </div>

                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        id={`delete-expense-btn-${exp.id}`}
                                        onClick={() => handleDeleteExpense(exp.id)}
                                        className="text-slate-400 hover:text-rose-500 dark:text-slate-550 dark:hover:text-rose-450 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                                        title="Delete spending record"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Inline Add Expense Form */}
                          {showExpenseFormDay === day.dayNumber && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAddExpense(day.dayNumber);
                              }}
                              className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-150 dark:border-slate-850/75 space-y-3.5"
                            >
                              <h6 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Log actual day {day.dayNumber} expense
                              </h6>

                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                {/* Amount */}
                                <div className="sm:col-span-3 space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Amount ({getCurrencySymbol()})</label>
                                  <input
                                    type="number"
                                    id={`expense-amount-input-day-${day.dayNumber}`}
                                    required
                                    min="0.01"
                                    step="any"
                                    placeholder="0.00"
                                    value={expenseAmount}
                                    onChange={(e) => setExpenseAmount(e.target.value)}
                                    className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-450 font-bold transition-all"
                                  />
                                </div>

                                {/* Category */}
                                <div className="sm:col-span-3 space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Category</label>
                                  <select
                                    id={`expense-category-select-day-${day.dayNumber}`}
                                    value={expenseCategory}
                                    onChange={(e: any) => setExpenseCategory(e.target.value)}
                                    className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 font-bold transition-all"
                                  >
                                    <option value="Accommodation">Accommodation</option>
                                    <option value="Food">Food & Meals</option>
                                    <option value="Activities">Activities</option>
                                    <option value="Transport">Transportation</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>

                                {/* Description */}
                                <div className="sm:col-span-6 space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Description</label>
                                  <input
                                    type="text"
                                    id={`expense-desc-input-day-${day.dayNumber}`}
                                    required
                                    placeholder="e.g., Dinner, metro ticket, souvenir"
                                    value={expenseDesc}
                                    onChange={(e) => setExpenseDesc(e.target.value)}
                                    className="w-full p-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 font-medium transition-all"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 text-[11px] font-bold">
                                <button
                                  type="button"
                                  id={`cancel-expense-btn-day-${day.dayNumber}`}
                                  onClick={() => setShowExpenseFormDay(null)}
                                  className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer transition-all"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  id={`submit-expense-btn-day-${day.dayNumber}`}
                                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg cursor-pointer transition-all shadow-sm"
                                >
                                  Log Expense
                                </button>
                              </div>
                            </form>
                          )}
                        </div>

                        {/* Daily Travel Photos & Camera Section */}
                        <div className="border-t border-slate-100 dark:border-slate-900 pt-5 mt-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="p-1.5 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-lg">
                                <Camera className="w-4 h-4" />
                              </span>
                              <div>
                                <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-550 dark:text-slate-400">
                                  Daily Photo Gallery
                                </h5>
                                <p className="text-[11px] font-semibold text-slate-405 dark:text-slate-500">
                                  Capture or upload beautiful snapshots for Day {day.dayNumber}
                                </p>
                              </div>
                            </div>

                            {!isReadOnly && (
                              <button
                                type="button"
                                id={`toggle-photo-form-btn-day-${day.dayNumber}`}
                                onClick={() => {
                                  if (activeCameraDay === day.dayNumber) {
                                    setActiveCameraDay(null);
                                  } else {
                                    setActiveCameraDay(day.dayNumber);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20 rounded-lg transition-all cursor-pointer border border-sky-200/50 dark:border-sky-900/45"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Attach Photo
                              </button>
                            )}
                          </div>

                          {/* Inline CameraCapture Interface */}
                          {activeCameraDay === day.dayNumber && (
                            <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-2xl border border-slate-150 dark:border-slate-850/60">
                              <Suspense fallback={<div className="p-4 text-center text-xs text-slate-400">Loading camera...</div>}>
                                <CameraCapture
                                  onPhotoAdded={(photoUrl) => handleAddPhotoToDay(day.dayNumber, photoUrl)}
                                  onClose={() => setActiveCameraDay(null)}
                                />
                              </Suspense>
                            </div>
                          )}

                          {/* Photo Grid Gallery */}
                          {(() => {
                            const dayPhotos = day.photos || [];
                            if (dayPhotos.length === 0) {
                              return (
                                <div className="flex items-center gap-3 p-3 bg-slate-50/30 dark:bg-slate-900/5 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-[11px] font-medium italic">
                                  <Image className="w-4 h-4 text-slate-300 dark:text-slate-700" />
                                  <span>
                                    {isReadOnly 
                                      ? `No travel memories captured for Day ${day.dayNumber}.`
                                      : `No travel memories captured for Day ${day.dayNumber} yet. Click 'Attach Photo' to start!`
                                    }
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                                {dayPhotos.map((photo, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="relative aspect-video rounded-xl overflow-hidden border border-slate-150 dark:border-slate-850/75 shadow-sm hover:shadow-md group transition-all"
                                  >
                                    <img
                                      src={photo}
                                      alt={`Day ${day.dayNumber} memory ${pIdx + 1}`}
                                      className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-300"
                                      referrerPolicy="no-referrer"
                                      onClick={() => setSelectedLightboxPhoto(photo)}
                                      loading="lazy"
                                      decoding="async"
                                    />
                                    {/* Delete Button on Hover */}
                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        id={`delete-day-${day.dayNumber}-photo-${pIdx}`}
                                        onClick={() => handleDeletePhotoFromDay(day.dayNumber, pIdx)}
                                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-rose-600 text-white rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer shadow-sm"
                                        title="Delete photo memory"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isLongItinerary && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-150 dark:border-slate-850 pt-6 mt-6">
                  <button
                    type="button"
                    id="prev-days-page-btn"
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage(prev => Math.max(1, prev - 1));
                      document.getElementById("itinerary-tab-content")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all border border-slate-200 dark:border-slate-850 shadow-sm flex items-center justify-center gap-1.5"
                  >
                    Previous Days
                  </button>
                  <span className="text-xs font-bold text-slate-550 dark:text-slate-450 text-center">
                    Showing Days {(currentPage - 1) * daysPerPage + 1} - {Math.min(currentPage * daysPerPage, filteredDays.length)} of {filteredDays.length}
                  </span>
                  <button
                    type="button"
                    id="next-days-page-btn"
                    disabled={currentPage === Math.ceil(filteredDays.length / daysPerPage)}
                    onClick={() => {
                      setCurrentPage(prev => Math.min(Math.ceil(filteredDays.length / daysPerPage), prev + 1));
                      document.getElementById("itinerary-tab-content")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all border border-slate-200 dark:border-slate-850 shadow-sm flex items-center justify-center gap-1.5"
                  >
                    Next Days
                  </button>
                </div>
              )}
            </>
          )}
        </div>
          </div>
        )}

        {/* TAB 2: PLACES TO VISIT */}
        {activeTab === "places" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Map className="w-5 h-5 text-teal-500" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Top Sightseeing & Landmark Recommendations</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {itinerary.placesToVisit.map((place, idx) => (
                <div key={idx} className="p-5 border border-slate-100 dark:border-slate-900 rounded-2xl hover:border-teal-200 dark:hover:border-teal-900 hover:shadow-md transition-all space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-200">{place.name}</h4>
                    <span className="inline-flex items-center justify-center w-7 h-7 bg-teal-50 dark:bg-teal-950/40 rounded-lg text-teal-600 dark:text-teal-400 text-sm font-bold">
                      {idx + 1}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{place.description}</p>
                  
                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs border-t border-slate-100 dark:border-slate-900">
                    <div>
                      <span className="text-slate-400 font-medium block">⏰ Best Time to Visit:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{place.bestTimeToVisit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">🎟️ Entrance Ticket:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-bold">{place.entryFee}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: FOOD RECOMMENDATIONS */}
        {activeTab === "food" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-teal-500" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Local Food & Dining Guides</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {itinerary.localFood.map((food, idx) => (
                <div key={idx} className="p-5 border border-slate-100 dark:border-slate-900 rounded-2xl hover:border-teal-200 dark:hover:border-teal-900 transition-all flex gap-4">
                  <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xl font-bold">
                    {food.type.toLowerCase().includes("veg") && !food.type.toLowerCase().includes("non") ? "🟢" : "🔴"}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-start justify-between">
                      <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-200">{food.name}</h4>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-md">
                        {food.type}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{food.description}</p>
                    <div className="text-xs bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-900">
                      <span className="font-bold text-teal-600 dark:text-teal-400 block mb-0.5">📍 Recommended Eatery:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{food.mustTryAt}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: PACKING, BUDGET & TRANSIT */}
        {activeTab === "packing" && (
          <div className="space-y-8">
            
            {/* Checklist Header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Packing Checklist */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-teal-500" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Smart Packing Checklist</h3>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-900 space-y-2.5">
                  {itinerary.packingChecklist.map((item, idx) => {
                    const isChecked = !!packingChecks[item];
                    return (
                      <button
                        id={`packing-item-btn-${idx}`}
                        key={idx}
                        disabled={isReadOnly}
                        onClick={() => togglePackingCheck(item)}
                        className={`w-full flex items-center gap-3 py-1.5 px-2 text-left rounded-lg transition-colors ${
                          isReadOnly 
                            ? "cursor-default" 
                            : "cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${
                          isChecked 
                            ? "bg-teal-500 border-teal-500 text-white" 
                            : "border-slate-300 dark:border-slate-700 text-transparent"
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                        <span className={`text-sm font-medium ${isChecked ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"}`}>
                          {item}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transportation Suggestions */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-teal-500" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Local Transit & Commute Suggestions</h3>
                </div>

                <div className="space-y-3">
                  {itinerary.transportationSuggestions.map((trans, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-900 flex justify-between gap-3 items-start">
                      <div className="space-y-1">
                        <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400">{trans.type}</span>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{trans.description}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full flex-shrink-0">
                        {trans.estimatedCost}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Estimated Budget Breakdown Row */}
            <div className="space-y-4 border-t border-slate-100 dark:border-slate-900 pt-6">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-teal-500" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Estimated Budget Range ({itinerary.budgetAmount})</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4">
                {[
                  { label: "🛏️ Stay & Lodging", val: itinerary.estimatedBudgetBreakdown.accommodation },
                  { label: "🍛 Dine & Food", val: itinerary.estimatedBudgetBreakdown.food },
                  { label: "🎟️ Sights & Tickets", val: itinerary.estimatedBudgetBreakdown.activities },
                  { label: "🚕 Commutes & Fuel", val: itinerary.estimatedBudgetBreakdown.transport },
                  { label: "🛍️ Misc & Shopping", val: itinerary.estimatedBudgetBreakdown.miscellaneous || "Flexible" },
                  ...(itinerary.origin && itinerary.detailedBudgetSummary?.originToDestinationCost && itinerary.detailedBudgetSummary.originToDestinationCost !== "N/A"
                    ? [{ label: `✈️ Travel from ${itinerary.origin}`, val: itinerary.detailedBudgetSummary.originToDestinationCost, isTransit: true }]
                    : []),
                  { label: "💵 Estimated Total", val: itinerary.estimatedBudgetBreakdown.total, highlight: true }
                ].map((breakdown, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl border ${
                    breakdown.highlight 
                      ? "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-900 text-teal-700 dark:text-teal-300" 
                      : (breakdown as any).isTransit
                      ? "bg-violet-50/60 dark:bg-violet-950/20 border-violet-150 dark:border-violet-950 text-violet-750 dark:text-violet-300"
                      : "bg-slate-50/50 dark:bg-slate-900/20 border-slate-100 dark:border-slate-900 text-slate-600 dark:text-slate-400"
                  }`}>
                    <span className="text-xs font-semibold block mb-1">{breakdown.label}</span>
                    <span className="text-sm font-extrabold">{breakdown.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Travel & Safety Tips */}
            <div className="space-y-4 border-t border-slate-100 dark:border-slate-900 pt-6">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-teal-500" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Safety & Cultural Travel Tips</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {itinerary.travelTips.map((tip, idx) => (
                  <div key={idx} className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-900">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{tip}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 5: WEATHER */}
        {activeTab === "weather" && (
          <Suspense fallback={<div className="p-8 text-center text-xs font-semibold text-slate-400">Loading Weather Insights...</div>}>
            <DestinationWeather 
              destination={itinerary.destination} 
              latitude={itinerary.latitude} 
              longitude={itinerary.longitude} 
              startDate={itinerary.startDate}
              endDate={itinerary.endDate}
            />
          </Suspense>
        )}

        {/* TAB 6: BUDGET BREAKDOWN */}
        {activeTab === "budget" && (
          <Suspense fallback={
            <div className="h-[350px] bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl flex flex-col items-center justify-center space-y-3 animate-pulse">
              <Coins className="w-8 h-8 text-teal-400 animate-spin" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading Budget Breakdown Chart...</span>
            </div>
          }>
            <BudgetBreakdownChart 
              breakdown={itinerary.estimatedBudgetBreakdown} 
              loggedExpenses={itinerary.loggedExpenses || []}
              itinerary={itinerary}
            />
          </Suspense>
        )}

      </div>

      {/* Full-screen Lightbox Modal */}
      {selectedLightboxPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedLightboxPhoto(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button
              onClick={() => setSelectedLightboxPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer font-bold text-sm inline-flex items-center gap-1 bg-white/5 backdrop-blur-sm"
            >
              ✕ Close
            </button>
            <img
              src={selectedLightboxPhoto}
              alt="Enlarged travel memory"
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
              decoding="async"
            />
          </div>
        </div>
      )}

      {/* Print / Save PDF Guidance Modal */}
      {showPrintModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowPrintModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Printer className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Print / Save Itinerary</span>
              </h3>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-650 dark:text-slate-550 dark:hover:text-slate-350 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50 rounded-2xl flex gap-3">
                <Info className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-teal-850 dark:text-teal-300">Browser Frame Restriction</h4>
                  <p className="text-[11px] text-teal-800/80 dark:text-teal-400/80 leading-relaxed font-semibold">
                    Because this app is currently running in an embedded preview frame, direct browser printing is restricted by security rules.
                  </p>
                </div>
              </div>

              {printErrorMsg && (
                <p className="text-[10px] text-rose-500 font-bold bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/50 p-2.5 rounded-xl">
                  Error Details: {printErrorMsg}
                </p>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                To print your beautifully formatted itinerary guide or save it as a PDF from your browser, please choose one of these simple methods:
              </p>

              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850">
                  <span className="flex items-center justify-center w-5 h-5 bg-teal-100 dark:bg-teal-900 text-teal-750 dark:text-teal-300 rounded-full text-xs font-black shrink-0">1</span>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-850 dark:text-slate-200">Export Offline PDF Guide</span>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Click the "Export PDF" button on the itinerary dashboard to instantly generate a complete, high-quality styled PDF guide.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850">
                  <span className="flex items-center justify-center w-5 h-5 bg-teal-100 dark:bg-teal-900 text-teal-750 dark:text-teal-300 rounded-full text-xs font-black shrink-0">2</span>
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-850 dark:text-slate-200">Open in a New Tab to Print</span>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Open this application in a standalone browser tab. Then, clicking the printer symbol or pressing <kbd className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px]">Ctrl+P</kbd> / <kbd className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-[9px]">⌘+P</kbd> will launch the print dialog perfectly!
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowPrintModal(false);
                  handleExportPDF();
                }}
                className="py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white text-xs font-black rounded-2xl cursor-pointer transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  window.open(window.location.href, "_blank");
                }}
                className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-black rounded-2xl cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-750"
              >
                <Globe className="w-4 h-4" />
                <span>Open New Tab</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Trip Modal */}
      {showShareModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <span>Share Itinerary</span>
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-650 dark:text-slate-550 dark:hover:text-slate-350 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
              Share this itinerary with friends and family! They can view the day-by-day map, daily photo gallery, transit guide, and budget charts using this read-only link.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Public Link</label>
              <div className="flex gap-2 bg-slate-50 dark:bg-slate-950 p-2 rounded-2xl border border-slate-100 dark:border-slate-850">
                <input
                  type="text"
                  readOnly
                  value={getShareLink()}
                  className="w-full text-xs font-semibold text-slate-700 dark:text-slate-350 bg-transparent border-none focus:outline-none px-2 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopyShareLink()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex-shrink-0"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* WhatsApp Share Option */}
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Direct Share</label>
              <button
                type="button"
                onClick={() => {
                  const dest = itinerary.destination || "our trip";
                  const link = getShareLink();
                  const text = `Hey! Check out our amazing travel itinerary for *${dest}* on TripBalancing! 🌍✈️ Check the day-by-day plan, budget breakdown, and recommended attractions here:\n\n${link}`;
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                }}
                className="w-full py-3 bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-black rounded-2xl cursor-pointer transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.705 1.457h.004c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span>Share on WhatsApp</span>
              </button>
            </div>

            <div className="text-center pt-2 border-t border-slate-50 dark:border-slate-850">
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Travel Assistant Chat Widget */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        {isChatOpen ? (
          <div 
            id="travel-assistant-chat-window"
            className="w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-10rem)] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          >
            {/* Chat Header */}
            <div className="p-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-white/20 rounded-xl">
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-wide uppercase">AI Travel Guide</h4>
                  <p className="text-[10px] text-teal-50 font-bold">Ask about {itinerary.destination}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer font-bold text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/20">
              {chatMessages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role !== "user" && (
                    <div className="p-1.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl h-fit">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div 
                    className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed font-semibold shadow-sm ${
                      msg.role === "user" 
                        ? "bg-teal-600 text-white rounded-br-none" 
                        : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-50/50 dark:border-slate-750 rounded-bl-none"
                    }`}
                  >
                    {formatMessageText(msg.text)}
                  </div>
                </div>
              ))}
              
              {isChatLoading && (
                <div className="flex gap-2 justify-start items-center">
                  <div className="p-1.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl h-fit">
                    <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-slate-50/50 dark:border-slate-750 rounded-2xl rounded-bl-none p-3 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              {chatError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-[11px] text-rose-600 dark:text-rose-400 rounded-2xl font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form 
              onSubmit={handleSendChatMessage}
              className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-1.5"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about hotels, directions, meals..."
                disabled={isChatLoading}
                className="flex-1 bg-slate-50 dark:bg-slate-950/60 border border-slate-150 dark:border-slate-850 px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:border-teal-500 dark:focus:border-teal-400 text-slate-800 dark:text-slate-100 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="p-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl disabled:opacity-40 disabled:hover:bg-teal-600 transition-all cursor-pointer flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <button
            id="travel-assistant-toggle-btn"
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white px-5 py-3.5 rounded-full shadow-2xl hover:shadow-teal-500/20 transition-all cursor-pointer font-bold text-sm transform hover:-translate-y-0.5 active:scale-95"
          >
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span>AI Travel Assistant</span>
          </button>
        )}
      </div>
      </div>

      {/* ========================================== */}
      {/* 🖨️ BEAUTIFUL PHYSICAL PRINT LAYOUT CONTAINER */}
      {/* ========================================== */}
      <div className="hidden print:block print-only-container bg-white text-slate-900 font-sans p-0 space-y-0">
        
        {/* ========================================== */}
        {/* PREMIUM COVER PAGE (1st Page) */}
        {/* ========================================== */}
        <div className="print-cover-page border-[8px] border-double border-slate-900 p-8 flex flex-col justify-between h-[260mm] bg-white relative">
          
          {/* Cover Header */}
          <div className="text-center space-y-4 pt-4">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-teal-600 block">
              TripBalancing Companion • Premium Guide
            </span>
            <div className="w-16 h-0.5 bg-teal-500 mx-auto" />
            <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-slate-900 mt-2">
              CURATED TRAVEL GUIDE
            </h1>
          </div>

          {/* Cover Body / Destination Info */}
          <div className="text-center my-6 space-y-6">
            <h2 className="text-5xl font-extrabold tracking-tight text-slate-900 capitalize leading-tight">
              {itinerary.destination}
            </h2>
            <div className="w-32 h-1 bg-slate-900 mx-auto" />
            
            {/* Curated Cover Image */}
            <div className="relative rounded-3xl overflow-hidden border-2 border-slate-900 shadow-xl max-w-full h-[100mm] mx-auto mt-4">
              <img 
                src={getHeroImage(itinerary.destination)} 
                alt={itinerary.destination}
                className="w-full h-full object-cover filter brightness-95"
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="sync"
              />
            </div>
          </div>

          {/* Cover Footer / Metadata */}
          <div className="border-t-2 border-slate-900 pt-6 mt-4">
            <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold text-slate-800">
              <div className="border-r border-slate-300 space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 block">DATES</span>
                <span className="text-slate-800 font-extrabold">{itinerary.startDate} — {itinerary.endDate}</span>
              </div>
              <div className="border-r border-slate-300 space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 block">COMPANIONS</span>
                <span className="text-slate-800 font-extrabold">{itinerary.travelers} {itinerary.travelers === 1 ? 'Traveler' : 'Travelers'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-slate-400 block">TRAVEL STYLE</span>
                <span className="text-slate-800 font-extrabold">{itinerary.travelStyle} Style</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold border-t border-slate-200 mt-6 pt-4">
              <span>Curated specifically for: <span className="text-slate-800 font-black">{getTravellerEmail()}</span></span>
              <span>Generated: July 11, 2026</span>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* PAGE 2: WELCOME & GEOGRAPHIC OVERVIEW */}
        {/* ========================================== */}
        <div className="print-page-break print-section space-y-6 pt-6">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
            <h3 className="text-lg font-black uppercase tracking-wider">
              🗺️ Destination Landmark & Geographic Overview
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">Page 2</span>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-slate-650 leading-relaxed font-medium">
              Welcome to your customized travel guide for <strong className="text-slate-900 font-black">{itinerary.destination}</strong>. 
              This document contains your verified schedule, landmark listings, local recommendations, packing checkboxes, and calculated budget details.
            </p>

            {/* Static Map rendering */}
            <div className="rounded-2xl overflow-hidden border border-slate-300 shadow-sm">
              <img 
                src={getStaticMapUrl(itinerary.latitude, itinerary.longitude)} 
                alt="Destination Map" 
                className="w-full h-[85mm] object-cover"
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="sync"
              />
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                <span>📍 Location Focus: {itinerary.destination} (Coordinates: {itinerary.latitude?.toFixed(4) ?? "28.6139"}°N, {itinerary.longitude?.toFixed(4) ?? "77.2090"}°E)</span>
                <span className="text-teal-700">Digital Map Reference</span>
              </div>
            </div>

            {/* Live QR Code Companion Box */}
            <div className="border-2 border-teal-600 rounded-2xl p-5 bg-teal-50/10 flex items-center gap-6 mt-6 print-no-break">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.href)}`} 
                alt="QR Code" 
                className="w-24 h-24 border border-slate-200 rounded-xl bg-white p-1 flex-shrink-0"
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="sync"
              />
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-teal-900">
                  ⚡ ACCESS MOBILE COMPANION APP
                </h4>
                <p className="text-[11px] text-slate-650 leading-relaxed font-medium">
                  Scan this QR code with your smartphone to unlock this itinerary's live companion interface. Access turn-by-turn navigation pins, check dynamic local weather updates, and instantly record actual expenses on-the-go while you travel!
                </p>
                <div className="text-[9.5px] font-bold text-teal-800">
                  🌐 Live Link: {window.location.href.substring(0, 75)}...
                </div>
              </div>
            </div>
          </div>

          <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
            Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 1: CHRONOLOGICAL TIMELINE */}
        {/* ========================================== */}
        <div className="print-page-break print-section space-y-6 pt-6">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
            <h3 className="text-lg font-black uppercase tracking-wider">
              📅 Day-by-Day Curated Schedule & Timeline
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">Itinerary Breakdown</span>
          </div>

          <div className="space-y-8">
            {itinerary.days.map((day) => (
              <div key={day.dayNumber} className="print-no-break border border-slate-200 rounded-2xl p-5 bg-slate-50/30 space-y-4">
                
                {/* Day Header */}
                <div className="flex justify-between items-baseline border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Day {day.dayNumber}: <span className="text-teal-700">{day.theme}</span>
                  </h4>
                  {day.dailyBudget && (
                    <span className="text-[11px] font-black text-slate-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-100">
                      Budget: {renderSafeRupee(day.dailyBudget)}
                    </span>
                  )}
                </div>

                {/* Timeline Activities */}
                <div className="space-y-4 pl-3 border-l-2 border-teal-500">
                  {day.activities.map((activity, aIdx) => (
                    <div key={aIdx} className="space-y-1 relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[17px] top-[4px] w-2 h-2 rounded-full bg-teal-500 border border-white" />
                      
                      <div className="flex items-baseline gap-2">
                        <span className="text-teal-700 font-black text-xs min-w-[70px] uppercase">{activity.time}</span>
                        <span className="text-slate-900 font-black text-xs">— {activity.title}</span>
                        {activity.cost && (
                          <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100 ml-auto">
                            {renderSafeRupee(activity.cost)}
                          </span>
                        )}
                      </div>
                      
                      <div className="pl-[78px] text-[11px] text-slate-650 leading-relaxed font-medium space-y-1">
                        <p>{activity.description}</p>
                        {activity.location && (
                          <span className="text-slate-500 font-bold block text-[10px]">
                            📍 Location / Meeting Point: {activity.location}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Day-Level Recommendations */}
                {( (day.foodRecommendations && day.foodRecommendations.length > 0) || (day.transportationSuggestions && day.transportationSuggestions.length > 0) ) && (
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 text-[11px]">
                    {day.foodRecommendations && day.foodRecommendations.length > 0 && (
                      <div className="space-y-1">
                        <span className="font-black text-slate-800 uppercase tracking-wider text-[10px] block text-amber-700">
                          🍲 Local Food Spots
                        </span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                          {day.foodRecommendations.map((food, fIdx) => (
                            <li key={fIdx}>{food}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {day.transportationSuggestions && day.transportationSuggestions.length > 0 && (
                      <div className="space-y-1">
                        <span className="font-black text-slate-800 uppercase tracking-wider text-[10px] block text-teal-700">
                          🚕 Daily Transit
                        </span>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600 font-medium">
                          {day.transportationSuggestions.map((transit, tIdx) => (
                            <li key={tIdx}>{transit}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Day-level Actual Expenses */}
                {itinerary.loggedExpenses && itinerary.loggedExpenses.filter(e => e.dayNumber === day.dayNumber).length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
                      Actual Expenses Logged on Companion App
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {itinerary.loggedExpenses
                        .filter(e => e.dayNumber === day.dayNumber)
                        .map((exp) => (
                          <div key={exp.id} className="flex justify-between items-center text-[10px] border border-slate-200/60 p-2 rounded-lg bg-slate-100/50 font-bold">
                            <span className="text-slate-700">{exp.category}: {exp.description}</span>
                            <span className="text-slate-900 font-black">{renderSafeRupee("₹" + exp.amount.toLocaleString("en-IN"))}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>

          <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
            Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 2: TOP SIGHTSEEING LANDMARKS */}
        {/* ========================================== */}
        {itinerary.placesToVisit && itinerary.placesToVisit.length > 0 && (
          <div className="print-page-break print-section space-y-6 pt-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
              <h3 className="text-lg font-black uppercase tracking-wider">
                🏞️ Top Sightseeing & Landmark Recommendations
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">Sights List</span>
            </div>

            <div className="print-grid-2">
              {itinerary.placesToVisit.map((place, idx) => (
                <div key={idx} className="print-no-break border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase">
                      {idx + 1}. {place.name}
                    </h4>
                    <p className="text-[11px] text-slate-650 leading-relaxed font-medium mt-1">
                      {place.description}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[10px] font-bold">
                    <div>
                      <span className="text-slate-400 uppercase tracking-wider block text-[8px]">Best Time</span>
                      <span className="text-slate-800">{place.bestTimeToVisit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wider block text-[8px]">Admission Fee</span>
                      <span className="text-slate-800">{renderSafeRupee(place.entryFee)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
              Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SECTION 3: CULINARY DINING RECS */}
        {/* ========================================== */}
        {itinerary.localFood && itinerary.localFood.length > 0 && (
          <div className="print-page-break print-section space-y-6 pt-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
              <h3 className="text-lg font-black uppercase tracking-wider">
                🍲 Local Culinary & Dining Recommendations
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">Dining Guide</span>
            </div>

            <div className="print-grid-2">
              {itinerary.localFood.map((food, idx) => (
                <div key={idx} className="print-no-break border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-slate-150 pb-1.5">
                      <h4 className="text-xs font-black text-slate-900 uppercase">{food.name}</h4>
                      <span className="text-[8px] font-black uppercase bg-slate-100 border border-slate-250 px-1.5 py-0.2 rounded text-slate-600">
                        {food.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-650 leading-relaxed font-medium mt-1.5">
                      {food.description}
                    </p>
                  </div>
                  
                  <div className="text-[10px] font-bold text-teal-800 pt-2 border-t border-slate-200">
                    📍 Recommended Eatery: <span className="text-slate-900 font-black">{food.mustTryAt}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
              Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SECTION 4: PACKING CHECKLIST & TRANSIT */}
        {/* ========================================== */}
        <div className="print-page-break print-section space-y-6 pt-6">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
            <h3 className="text-lg font-black uppercase tracking-wider">
              🎒 Packing Guide & Transit suggestions
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">Preparation</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Packing List */}
            {itinerary.packingChecklist && itinerary.packingChecklist.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider border-b border-slate-200 pb-1 text-slate-800">
                  🎒 Packing Checklist
                </h4>
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/10 space-y-2">
                  {itinerary.packingChecklist.map((item, idx) => {
                    const isChecked = !!packingChecks[item];
                    return (
                      <div key={idx} className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <div className={`print-checkbox-box ${isChecked ? "print-checkbox-box-checked" : ""}`} />
                        <span className={isChecked ? "line-through text-slate-400" : ""}>{item}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transit List */}
            {itinerary.transportationSuggestions && itinerary.transportationSuggestions.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider border-b border-slate-200 pb-1 text-slate-800">
                  🚕 Local Commute Suggestions
                </h4>
                <div className="space-y-3">
                  {itinerary.transportationSuggestions.map((trans, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-2xl p-3.5 bg-slate-50/20 flex justify-between items-start gap-2">
                      <div className="space-y-1">
                        <span className="text-xs font-black text-teal-800 uppercase">{trans.type}</span>
                        <p className="text-[10.5px] text-slate-650 leading-relaxed font-medium">{trans.description}</p>
                      </div>
                      <span className="text-[10px] font-black text-slate-850 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded h-fit whitespace-nowrap">
                        {renderSafeRupee(trans.estimatedCost)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
            Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
          </div>
        </div>

        {/* ========================================== */}
        {/* SECTION 5: DETAILED BUDGET COST ANALYSIS */}
        {/* ========================================== */}
        {itinerary.estimatedBudgetBreakdown && (
          <div className="print-page-break print-section space-y-6 pt-6">
            <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
              <h3 className="text-lg font-black uppercase tracking-wider">
                📊 Curated Budget & Financial Breakdown
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">Financials</span>
            </div>

            <div className="space-y-6">
              
              {/* Elegant Budget Table */}
              <div className="border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black uppercase tracking-wider">
                      <th className="p-3">Category Cost Component</th>
                      <th className="p-3 text-right">Curated Estimates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-bold">
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-700">🏨 Accommodation & Stays</td>
                      <td className="p-3 text-right text-slate-900 font-extrabold">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.accommodation)}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-700">🍲 Food & Local Dining</td>
                      <td className="p-3 text-right text-slate-900 font-extrabold">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.food)}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-700">🎟️ Sightseeing Attractions & Tickets</td>
                      <td className="p-3 text-right text-slate-900 font-extrabold">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.activities)}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-700">🚕 Local Transport & Transit</td>
                      <td className="p-3 text-right text-slate-900 font-extrabold">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.transport)}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 text-slate-700">🎁 Miscellaneous & Shopping</td>
                      <td className="p-3 text-right text-slate-900 font-extrabold">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.miscellaneous || "Flexible")}
                      </td>
                    </tr>
                    <tr className="bg-teal-50/20 border-t border-slate-300">
                      <td className="p-3 text-teal-900 font-black uppercase tracking-wider">Total Estimated Budget</td>
                      <td className="p-3 text-right text-teal-900 font-black text-sm">
                        {renderSafeRupee(itinerary.estimatedBudgetBreakdown.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total Summary Cost Analysis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase text-slate-400 font-black block">Curator Allocation Style</span>
                  <p className="text-xs text-slate-650 font-medium">
                    This budget is calibrated for a <strong className="text-slate-900">{itinerary.travelStyle}</strong> style itinerary, assuming {itinerary.travelers} co-travelers sharing key overhead costs.
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/20 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] uppercase text-slate-400 font-black block">Live Balance Calculation</span>
                  <p className="text-xs text-slate-650 font-medium">
                    To record real payments and track budget surpluses or overruns, open your companion dashboard and use the expense manager.
                  </p>
                </div>
              </div>

            </div>

            <div className="print-section-footer pt-6 text-center text-[9px] text-slate-400 font-bold border-t border-slate-100">
              Trip to {itinerary.destination} — Curated Travel Guide | Powered by TripBalancing
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SECTION 6: SAFETY TIPS & PRIVATE NOTES */}
        {/* ========================================== */}
        <div className="print-page-break print-section space-y-6 pt-6">
          <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-baseline">
            <h3 className="text-lg font-black uppercase tracking-wider">
              💡 Essential Safety & Curator Notes
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">Closing Advice</span>
          </div>

          <div className="space-y-6">
            
            {/* Travel Tips */}
            {itinerary.travelTips && itinerary.travelTips.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider border-b border-slate-200 pb-1 text-slate-800">
                  💡 Professional Travel & Safety Tips
                </h4>
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/20">
                  <ul className="list-disc pl-5 space-y-2 text-xs font-medium text-slate-700 leading-relaxed">
                    {itinerary.travelTips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Private Notes */}
            {itinerary.privateNote && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider border-b border-slate-200 pb-1 text-slate-800">
                  📝 Personal Curator Remarks
                </h4>
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/30 font-serif italic text-xs leading-relaxed text-slate-800">
                  "{itinerary.privateNote}"
                </div>
              </div>
            )}

          </div>

          {/* Final Footer info */}
          <div className="border-t border-slate-300 pt-6 mt-12 text-center text-[10px] text-slate-400 font-medium">
            Generated automatically by TripBalancing. © 2026 TripBalancing Travel Companion. All rights reserved.
          </div>
        </div>

      </div>
    </>
  );
}
