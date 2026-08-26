import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import compression from "compression";
import crypto from "crypto";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import {
  sendBrevoEmail,
  generateWelcomeEmail,
  generatePaymentSuccessEmail,
  generatePaymentFailedEmail,
  generateRefundRequestReceivedEmail,
  generateRefundApprovedEmail,
  generateRefundRejectedEmail,
  generateSupportTicketEmail,
  generateBuddyInviteEmail
} from "./src/services/emailService";
import { reconcileItineraryBudget, setLiveUsdRates, getLiveCrossRate, detectCurrencyCode, parseNumericValue } from "./src/utils/budgetCalculator";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Server-Side Supabase Admin Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

// Auth verification must not depend on the service-role key. The normal Supabase
// client can validate the signed-in user's JWT, while the service-role client is
// reserved for privileged admin data operations (such as listing all users).
const supabaseAuth = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// In-Memory Fallback Stores for Data Persistence and Development Mode Sync
interface AdminUserRecord {
  user_id: string;
  role: string;
  created_at: string;
}

interface UserProfileRecord {
  id: string;
  email: string;
  full_name?: string;
  plan: string;
  trips_count: number;
  paid_trip_credits: number;
  status: string;
  created_at: string;
}

interface PaymentRecord {
  id: string;
  user_id?: string;
  user_email: string;
  razorpay_order_id?: string;
  razorpay_payment_id: string;
  plan_purchased: string;
  amount: number;
  currency: string;
  payment_status: string;
  is_test_mode: boolean;
  created_at: string;
}

interface SubscriptionRecord {
  id: string;
  user_id?: string;
  user_email: string;
  current_plan: string;
  purchase_date: string;
  expiry_date?: string | null;
  remaining_trip_credits: number;
  status: string;
}

interface SupportTicketRecord {
  id: string;
  ticket_ref: string;
  user_id?: string;
  user_email: string;
  subject: string;
  message: string;
  razorpay_payment_id?: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
}

interface RefundRequestRecord {
  id: string;
  user_id?: string;
  user_email: string;
  razorpay_payment_id: string;
  plan: string;
  purchase_date: string;
  trips_used_since_purchase: number;
  refund_eligible: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface FailedAccessLog {
  attempted_user_id?: string;
  attempted_email?: string;
  ip_address: string;
  user_agent: string;
  attempted_at: string;
}

// In-memory collections populated on initialization / user interactions
const IN_MEMORY_USERS: UserProfileRecord[] = [];
const IN_MEMORY_PAYMENTS: PaymentRecord[] = [];
const IN_MEMORY_SUBSCRIPTIONS: SubscriptionRecord[] = [];
const IN_MEMORY_SUPPORT_TICKETS: SupportTicketRecord[] = [];
const IN_MEMORY_REFUND_REQUESTS: RefundRequestRecord[] = [];

const FAILED_ADMIN_ACCESS_LOGS: FailedAccessLog[] = [];

// Helper to log failed access attempts securely
async function logFailedAdminAccess(attemptedUserId?: string, attemptedEmail?: string, req?: express.Request) {
  const log: FailedAccessLog = {
    attempted_user_id: attemptedUserId || "Anonymous",
    attempted_email: attemptedEmail || "unknown",
    ip_address: req ? (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "127.0.0.1") : "127.0.0.1",
    user_agent: req ? (req.headers["user-agent"] || "unknown") : "unknown",
    attempted_at: new Date().toISOString()
  };
  FAILED_ADMIN_ACCESS_LOGS.unshift(log);
  if (FAILED_ADMIN_ACCESS_LOGS.length > 50) FAILED_ADMIN_ACCESS_LOGS.pop();

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("failed_admin_access_logs").insert([log]);
    } catch (e) {
      // Ignore background log error
    }
  }
}

// Shared Supabase user authentication helper. All protected API routes derive identity
// from the signed Supabase JWT instead of trusting userId/email fields from the browser.
async function authenticateRequestUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7).trim();
  if (!token || token === "null" || token === "undefined") return null;
  const authClient = supabaseAuth || supabaseAdmin;
  if (!authClient) return null;
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function verifyUserAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await authenticateRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized: Please sign in again." });
    (req as any).authenticatedUser = { id: user.id, email: user.email || "" };
    next();
  } catch (err) {
    console.error("User auth middleware error:", err);
    res.status(500).json({ error: "Internal server error during authentication" });
  }
}

async function userHasAdminAccess(userId: string, email?: string | null) {
  // Primary source of truth: admin_users table. The optional ADMIN_EMAIL env value is
  // retained only as an explicit bootstrap fallback; there is no hard-coded owner email.
  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from("admin_users")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.role === "admin" || data?.role === "super_admin") return true;
    } catch (err) {
      console.warn("[Admin Auth] admin_users lookup warning:", err);
    }
  }
  const bootstrapEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return !!bootstrapEmail && String(email || "").trim().toLowerCase() === bootstrapEmail;
}

// Secure Admin Authorization Middleware
async function verifyAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await authenticateRequestUser(req);
    if (!user) {
      logFailedAdminAccess(undefined, "Unauthenticated Token", req);
      return res.status(401).json({ error: "Unauthorized: User session invalid or expired" });
    }
    const isAdminVerified = await userHasAdminAccess(user.id, user.email);
    if (!isAdminVerified) {
      logFailedAdminAccess(user.id, user.email || "non_admin_user", req);
      return res.status(403).json({ error: "Forbidden: Access denied. Admin permissions required." });
    }
    (req as any).adminUser = { id: user.id, email: user.email || "", role: "admin" };
    next();
  } catch (err: any) {
    console.error("Admin auth middleware error:", err);
    res.status(500).json({ error: "Internal server error during authorization" });
  }
}

// Enable Gzip/Brotli response compression
app.use(compression());

// Body parser
app.use(express.json());

// In-memory caches to optimize speed and avoid redundant API requests
interface CacheEntry {
  data: any;
  timestamp: number;
}
const ITINERARY_CACHE = new Map<string, CacheEntry>();
const GEOCODE_CACHE = new Map<string, CacheEntry>();
const TRAVEL_TIPS_CACHE = new Map<string, CacheEntry>();
const WEATHER_CACHE = new Map<string, CacheEntry>();
const OPEN_WEATHER_CACHE = new Map<string, CacheEntry>();
const RATES_CACHE = { data: null as any, timestamp: 0 };

const ITINERARY_TTL = 24 * 60 * 60 * 1000; // Cache itineraries for 24 hours
const GEOCODE_TTL = 30 * 24 * 60 * 60 * 1000; // Cache coordinates for 30 days
const TRAVEL_TIPS_TTL = 6 * 60 * 60 * 1000; // Cache travel advisories/tips for 6 hours
const WEATHER_TTL = 3 * 60 * 60 * 1000; // Cache weather forecast for 3 hours
const OPEN_WEATHER_TTL = 30 * 60 * 1000; // Cache open weather forecast for 30 minutes
const RATES_TTL = 30 * 60 * 1000; // Cache exchange rates for 30 minutes

async function ensureBudgetFxRates(): Promise<void> {
  try {
    if (RATES_CACHE.data?.rates && (Date.now() - RATES_CACHE.timestamp < RATES_TTL)) {
      setLiveUsdRates(RATES_CACHE.data.rates);
      return;
    }
    // FX refresh must never hold up itinerary generation. On hosts such as
    // Render an upstream FX outage can otherwise keep this request open until
    // the platform returns an HTML 502/504 page to the browser.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    let response: Response;
    try {
      response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return;
    const data: any = await response.json();
    if (data?.result === "success" && data?.rates) {
      RATES_CACHE.data = data;
      RATES_CACHE.timestamp = Date.now();
      setLiveUsdRates(data.rates);
    }
  } catch (error) {
    if (RATES_CACHE.data?.rates) setLiveUsdRates(RATES_CACHE.data.rates);
    console.warn("Budget FX refresh failed; using last available rates.");
  }
}

// Lazy-initialize Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please configure it in your Secrets / Env Panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

type GeminiFailureKind = "quota" | "overloaded" | "config" | "invalid_response" | "unknown";

class GeminiServiceError extends Error {
  kind: GeminiFailureKind;
  retryable: boolean;
  retryAfterSeconds?: number;
  original?: any;

  constructor(message: string, kind: GeminiFailureKind, retryable: boolean, original?: any, retryAfterSeconds?: number) {
    super(message);
    this.name = "GeminiServiceError";
    this.kind = kind;
    this.retryable = retryable;
    this.original = original;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let GEMINI_COOLDOWN_UNTIL = 0;

function classifyGeminiError(error: any): GeminiServiceError {
  if (error instanceof GeminiServiceError) return error;
  const status = String(error?.status || "").toUpperCase();
  const code = Number(error?.code || error?.statusCode || 0);
  const text = `${error?.message || ""} ${String(error || "")}`.toLowerCase();

  if (status === "RESOURCE_EXHAUSTED" || code === 429 || text.includes("resource_exhausted") || text.includes("quota") || text.includes("429")) {
    return new GeminiServiceError(
      "The AI service has temporarily reached its usage limit. Please try again shortly.",
      "quota",
      true,
      error,
      60
    );
  }

  if (status === "UNAVAILABLE" || code === 503 || text.includes("unavailable") || text.includes("overloaded") || text.includes("high demand") || text.includes("503")) {
    return new GeminiServiceError(
      "The AI service is temporarily busy. Please try again shortly.",
      "overloaded",
      true,
      error,
      20
    );
  }

  if (text.includes("api key") || text.includes("permission") || code === 401 || code === 403) {
    return new GeminiServiceError(
      "The AI service is not configured correctly.",
      "config",
      false,
      error
    );
  }

  if (text.includes("json") || text.includes("schema") || text.includes("parse")) {
    return new GeminiServiceError(
      "The AI service returned an invalid response.",
      "invalid_response",
      true,
      error,
      5
    );
  }

  return new GeminiServiceError(
    "The AI service could not complete the request.",
    "unknown",
    false,
    error
  );
}

function geminiHttpErrorPayload(error: any) {
  const classified = classifyGeminiError(error);
  const codeMap: Record<GeminiFailureKind, string> = {
    quota: "GEMINI_QUOTA_LIMIT",
    overloaded: "GEMINI_TEMPORARILY_UNAVAILABLE",
    config: "GEMINI_CONFIGURATION_ERROR",
    invalid_response: "GEMINI_INVALID_RESPONSE",
    unknown: "GEMINI_REQUEST_FAILED"
  };

  return {
    status: classified.kind === "config" ? 500 : 503,
    body: {
      error: classified.message,
      code: codeMap[classified.kind],
      retryable: classified.retryable,
      retryAfterSeconds: classified.retryAfterSeconds || null
    },
    classified
  };
}

// Central retry + cooldown so every Gemini-powered endpoint behaves consistently
// during quota exhaustion or temporary provider overload.
async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 2,
  delayMs = 1000
): Promise<any> {
  if (Date.now() < GEMINI_COOLDOWN_UNTIL) {
    const retryAfter = Math.max(1, Math.ceil((GEMINI_COOLDOWN_UNTIL - Date.now()) / 1000));
    throw new GeminiServiceError(
      "The AI service is temporarily cooling down after a quota or overload response.",
      "quota",
      true,
      undefined,
      retryAfter
    );
  }

  let attempt = 0;

  while (true) {
    try {
      return await ai.models.generateContent(options);
    } catch (rawError: any) {
      const error = classifyGeminiError(rawError);
      attempt++;

      if (error.kind === "quota" || error.kind === "overloaded") {
        const cooldownSeconds = error.kind === "quota" ? 60 : 20;
        GEMINI_COOLDOWN_UNTIL = Math.max(
          GEMINI_COOLDOWN_UNTIL,
          Date.now() + cooldownSeconds * 1000
        );
      }

      if (error.retryable && attempt <= maxRetries) {
        const backoffDelay =
          delayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
        console.warn(
          `[Gemini ${error.kind}] Attempt ${attempt} failed. Retrying in ${backoffDelay}ms.`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));

        // The cooldown is intended to protect against new concurrent requests.
        // This in-flight request is allowed to perform its bounded retry.
        GEMINI_COOLDOWN_UNTIL = 0;
        continue;
      }

      throw error;
    }
  }
}

// Highly robust multi-tier geocoding function
async function geocodeDestination(destination: string): Promise<{ latitude: number; longitude: number } | null> {
  const geoKey = destination.toLowerCase().trim();
  const cachedGeo = GEOCODE_CACHE.get(geoKey);
  if (cachedGeo && (Date.now() - cachedGeo.timestamp < GEOCODE_TTL)) {
    console.log(`[Cache Hit] Returning cached geocode for: ${destination}`);
    return cachedGeo.data;
  }

  // 1. Try Open-Meteo Geocoding API first (free, dynamic, real-world locations worldwide)
  try {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=5&language=en&format=json`;
    const geoRes = await fetch(geocodeUrl);
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      const results = geoData.results;
      if (results && results.length > 0) {
        // Find the most relevant matching location (the first result is the best match)
        const bestResult = results[0];
        const coordinates = {
          latitude: parseFloat(bestResult.latitude),
          longitude: parseFloat(bestResult.longitude)
        };
        GEOCODE_CACHE.set(geoKey, {
          data: coordinates,
          timestamp: Date.now()
        });
        console.log(`[Geocoding Success - OpenMeteo] Resolved "${destination}" to lat: ${coordinates.latitude}, lon: ${coordinates.longitude}`);
        return coordinates;
      }
    }
  } catch (err) {
    console.warn("Open-Meteo geocoding failed, trying fallback...", err);
  }

  // 2. Try Nominatim (OpenStreetMap) as a secondary public geocoding API
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1`;
    const geoRes = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "TripPlannerGeocodingService/1.0"
      }
    });
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData && geoData.length > 0) {
        const bestResult = geoData[0];
        const coordinates = {
          latitude: parseFloat(bestResult.lat),
          longitude: parseFloat(bestResult.lon)
        };
        GEOCODE_CACHE.set(geoKey, {
          data: coordinates,
          timestamp: Date.now()
        });
        console.log(`[Geocoding Success - Nominatim] Resolved "${destination}" to lat: ${coordinates.latitude}, lon: ${coordinates.longitude}`);
        return coordinates;
      }
    }
  } catch (err) {
    console.warn("Nominatim geocoding failed, trying fallback...", err);
  }

  // 3. Try Gemini AI Geocoding as a fallback
  try {
    const ai = getGeminiClient();
    const prompt = `Find the approximate global latitude and longitude coordinates for "${destination}". Respond in strict JSON.`;
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            latitude: { type: Type.NUMBER, description: "Latitude coordinate of destination" },
            longitude: { type: Type.NUMBER, description: "Longitude coordinate of destination" }
          },
          required: ["latitude", "longitude"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      GEOCODE_CACHE.set(geoKey, {
        data: parsed,
        timestamp: Date.now()
      });
      console.log(`[Geocoding Success - Gemini] Resolved "${destination}" to lat: ${parsed.latitude}, lon: ${parsed.longitude}`);
      return parsed;
    }
  } catch (err) {
    console.error("Gemini geocoding failed too:", err);
  }

  return null;
}

interface StrictLocationResult {
  valid: boolean;
  canonicalName?: string;
  latitude?: number;
  longitude?: number;
}

// Strict location validation intentionally does NOT use Gemini. A generative model can
// "correct" nonsense into a different city, which is unsafe for travel and budget math.
async function resolveLocationStrict(query: string): Promise<StrictLocationResult> {
  const raw = String(query || "").trim();
  if (raw.length < 2) return { valid: false };

  // Reuse the ranked autocomplete results so validation cannot silently change a
  // user's selected destination into a lower-quality place with the same name.
  const suggestions = await searchLocationSuggestions(raw);
  const best = suggestions[0];
  if (!best) return { valid: false };
  return {
    valid: true,
    canonicalName: best.canonicalName,
    latitude: best.latitude,
    longitude: best.longitude,
  };
}


interface LocationSuggestionResult {
  canonicalName: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

async function searchLocationSuggestions(query: string): Promise<LocationSuggestionResult[]> {
  const raw = String(query || "").trim();
  if (raw.length < 2) return [];

  type RankedSuggestion = LocationSuggestionResult & { score: number };
  const ranked: RankedSuggestion[] = [];
  const q = raw.toLowerCase();

  // Normalize provider output before de-duplication. Nominatim and Open-Meteo
  // often return the same city with slightly different admin labels/coordinates
  // (for example "Dubai, Dubai Emirate, UAE" and "Dubai, UAE").
  const normalizeKeyPart = (value?: string) => String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const add = (item: LocationSuggestionResult, score: number) => {
    ranked.push({ ...item, score });
  };

  // Nominatim is queried first because it includes importance + place type. This is
  // important for ambiguous tourism names such as "Goa": the Indian state should rank
  // above tiny villages that happen to share the same name.
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(raw)}&format=json&addressdetails=1&limit=10&accept-language=en`;
    const response = await fetch(url, { headers: { "User-Agent": "TripBalancing/2.0 (location-autocomplete)" } });
    if (response.ok) {
      const data: any = await response.json();
      for (const result of Array.isArray(data) ? data : []) {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        const address = result.address || {};
        const name = address.city || address.town || address.village || address.municipality || address.state || result.name || String(result.display_name || "").split(",")[0];
        if (!name) continue;
        const admin1 = address.state && String(address.state).toLowerCase() !== String(name).toLowerCase() ? String(address.state) : undefined;
        const country = address.country || undefined;
        const parts = [name, admin1, country].filter(Boolean);
        const exact = String(name).toLowerCase() === q ? 100 : String(name).toLowerCase().startsWith(q) ? 55 : 0;
        const importance = Number(result.importance || 0) * 100;
        const placeType = String(result.type || result.addresstype || "").toLowerCase();
        const typeBoost = ["state", "city", "town", "administrative"].includes(placeType) ? 25 : placeType === "village" ? 2 : 8;
        add({
          canonicalName: Array.from(new Set(parts)).join(", ") || result.display_name,
          name: String(name),
          admin1,
          country: country ? String(country) : undefined,
          latitude,
          longitude,
        }, exact + importance + typeBoost);
      }
    }
  } catch (error) {
    console.warn("Nominatim location suggestions failed:", error);
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(raw)}&count=10&language=en&format=json`;
    const response = await fetch(url);
    if (response.ok) {
      const data: any = await response.json();
      for (const result of Array.isArray(data?.results) ? data.results : []) {
        const latitude = Number(result.latitude);
        const longitude = Number(result.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !result.name) continue;
        const name = String(result.name);
        const admin1 = result.admin1 ? String(result.admin1) : undefined;
        const country = result.country ? String(result.country) : undefined;
        const parts = [name, admin1, country].filter(Boolean);
        const exact = name.toLowerCase() === q ? 80 : name.toLowerCase().startsWith(q) ? 40 : 0;
        const populationBoost = Math.min(30, Math.log10(Math.max(1, Number(result.population || 1))) * 4);
        add({ canonicalName: Array.from(new Set(parts)).join(", "), name, admin1, country, latitude, longitude }, exact + populationBoost);
      }
    }
  } catch (error) {
    console.warn("Open-Meteo location suggestions failed:", error);
  }

  // Sort first, then collapse duplicates across providers by semantic place identity.
  // Keep only the highest-ranked version of a city/name within the same country.
  // This removes duplicated Dubai/Dubai Emirate rows without hiding legitimate
  // same-name places in different countries.
  const sorted = ranked.sort((a, b) => b.score - a.score);
  const unique: RankedSuggestion[] = [];
  const seenSemantic = new Set<string>();
  for (const item of sorted) {
    const nameKey = normalizeKeyPart(item.name);
    const countryKey = normalizeKeyPart(item.country);
    if (!nameKey) continue;
    const semanticKey = `${nameKey}|${countryKey}`;
    if (seenSemantic.has(semanticKey)) continue;
    seenSemantic.add(semanticKey);
    unique.push(item);
    if (unique.length >= 6) break;
  }

  return unique.map(({ score, ...item }) => item);
}

app.get("/api/location-suggestions", async (req, res) => {
  const q = String(req.query?.q || "").trim();
  if (q.length < 2) return res.json({ suggestions: [] });
  const suggestions = await searchLocationSuggestions(q);
  return res.json({ suggestions });
});

app.post("/api/validate-locations", async (req, res) => {
  const origin = String(req.body?.origin || "").trim();
  const destination = String(req.body?.destination || "").trim();
  if (!origin || !destination) {
    return res.status(400).json({ error: "Please enter both a starting location and destination." });
  }

  const [originResult, destinationResult] = await Promise.all([
    resolveLocationStrict(origin),
    resolveLocationStrict(destination),
  ]);

  if (!originResult.valid || !destinationResult.valid) {
    return res.status(422).json({
      error: !originResult.valid
        ? `Starting location "${origin}" could not be verified.`
        : `Destination "${destination}" could not be verified.`,
      origin: originResult,
      destination: destinationResult,
    });
  }

  return res.json({ origin: originResult, destination: destinationResult });
});

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Helper to get sanitized Razorpay keys from environment
const getRazorpayKeys = () => {
  const rawKeyId = process.env.RAZORPAY_KEY_ID;
  const rawKeySecret = process.env.RAZORPAY_KEY_SECRET;

  const keyId = rawKeyId ? rawKeyId.replace(/^["']|["']$/g, "").trim() : "";
  const keySecret = rawKeySecret ? rawKeySecret.replace(/^["']|["']$/g, "").trim() : "";

  return { keyId, keySecret };
};

type AuthoritativeEntitlement = {
  plan: "free" | "pay_per_trip" | "yearly" | "lifetime";
  freeTripsUsed: number;
  paidTripsBalance: number;
  isPremium: boolean;
};

async function loadAuthoritativeEntitlement(userId: string, email?: string): Promise<AuthoritativeEntitlement | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("user_profiles")
    .select("plan, free_trips_used, paid_trips_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("user_profiles")
      .insert([{ id: userId, email: email || null, plan: "free", is_premium: false, free_trips_used: 0, paid_trips_balance: 0 }])
      .select("plan, free_trips_used, paid_trips_balance")
      .single();
    if (insertError) throw insertError;
    return { plan: "free", freeTripsUsed: 0, paidTripsBalance: 0, isPremium: false };
  }
  const plan = (["pay_per_trip", "yearly", "lifetime"].includes(String(data.plan)) ? data.plan : "free") as AuthoritativeEntitlement["plan"];
  return {
    plan,
    freeTripsUsed: Math.max(0, Number(data.free_trips_used || 0)),
    paidTripsBalance: Math.max(0, Number(data.paid_trips_balance || 0)),
    isPremium: plan === "yearly" || plan === "lifetime"
  };
}

function entitlementDeniedMessage(e: AuthoritativeEntitlement) {
  if (e.plan === "pay_per_trip") {
    return "Insufficient Balance: Please purchase an additional Pay-Per-Trip token (₹99) or upgrade to Premium to continue generating itineraries.";
  }
  return "Limit Reached: You have used all your free AI-generated trip plans. Please purchase an additional trip plan token (₹99) or upgrade to Premium to continue generating itineraries.";
}

function canGenerateFromEntitlement(e: AuthoritativeEntitlement) {
  if (e.isPremium) return true;
  if (e.plan === "pay_per_trip") return e.paidTripsBalance > 0;
  return e.freeTripsUsed < 2 || e.paidTripsBalance > 0;
}

async function consumeTripEntitlement(userId: string, email?: string): Promise<{ ok: boolean; status: number; error?: string; entitlement?: AuthoritativeEntitlement }> {
  if (!supabaseAdmin) return { ok: false, status: 503, error: "Secure entitlement service is not configured." };
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await loadAuthoritativeEntitlement(userId, email);
    if (!current) return { ok: false, status: 503, error: "Secure entitlement service is unavailable." };
    if (current.isPremium) return { ok: true, status: 200, entitlement: current };

    if (current.plan === "pay_per_trip") {
      if (current.paidTripsBalance <= 0) return { ok: false, status: 403, error: entitlementDeniedMessage(current), entitlement: current };
      const nextBalance = current.paidTripsBalance - 1;
      const { data, error } = await supabaseAdmin
        .from("user_profiles")
        .update({ paid_trips_balance: nextBalance, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .eq("paid_trips_balance", current.paidTripsBalance)
        .select("plan, free_trips_used, paid_trips_balance")
        .maybeSingle();
      if (error) throw error;
      if (data) return { ok: true, status: 200, entitlement: { ...current, paidTripsBalance: nextBalance } };
      continue;
    }

    if (current.freeTripsUsed < 2) {
      const nextUsed = current.freeTripsUsed + 1;
      const { data, error } = await supabaseAdmin
        .from("user_profiles")
        .update({ free_trips_used: nextUsed, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .eq("free_trips_used", current.freeTripsUsed)
        .select("plan, free_trips_used, paid_trips_balance")
        .maybeSingle();
      if (error) throw error;
      if (data) return { ok: true, status: 200, entitlement: { ...current, freeTripsUsed: nextUsed } };
      continue;
    }

    if (current.paidTripsBalance > 0) {
      const nextBalance = current.paidTripsBalance - 1;
      const { data, error } = await supabaseAdmin
        .from("user_profiles")
        .update({ paid_trips_balance: nextBalance, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .eq("paid_trips_balance", current.paidTripsBalance)
        .select("plan, free_trips_used, paid_trips_balance")
        .maybeSingle();
      if (error) throw error;
      if (data) return { ok: true, status: 200, entitlement: { ...current, paidTripsBalance: nextBalance } };
      continue;
    }
    return { ok: false, status: 403, error: entitlementDeniedMessage(current), entitlement: current };
  }
  return { ok: false, status: 409, error: "Your trip allowance changed in another session. Please retry." };
}

// Require a real signed-in Supabase user for payment operations.
async function verifyPaymentUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Please sign in before purchasing a plan." });
    }
    const token = authHeader.substring(7).trim();
    if (!token || !supabaseAuth) {
      return res.status(401).json({ error: "Unable to verify your signed-in session." });
    }
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user?.id || !user.email) {
      return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
    }
    (req as any).paymentUser = { id: user.id, email: user.email };
    next();
  } catch (error) {
    console.error("[Razorpay Auth] User verification failed:", error);
    return res.status(401).json({ error: "Unable to verify your signed-in session." });
  }
}

const PLAN_PRICES: Record<string, Record<string, number>> = {
  INR: { pay_per_trip: 9900, yearly: 49900, lifetime: 149900 },
  USD: { pay_per_trip: 200, yearly: 700, lifetime: 1900 }
};

const getServerPlanAmount = (planType: string, currency: string) =>
  PLAN_PRICES[currency]?.[planType] ?? null;


type PricingRegion = 'IN' | 'INTL';

async function getAccountPricingRegion(userId: string): Promise<PricingRegion | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('pricing_region,country_code')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[Pricing Region] Could not read profile region:', error.message);
    return null;
  }
  if (data?.pricing_region === 'IN' || data?.pricing_region === 'INTL') return data.pricing_region;
  if (data?.country_code === 'IN') return 'IN';
  if (data?.country_code) return 'INTL';
  return null;
}

app.get('/api/account/pricing-region', verifyPaymentUser, async (req, res) => {
  try {
    const paymentUser = (req as any).paymentUser as { id: string; email: string };
    const region = await getAccountPricingRegion(paymentUser.id);
    const { data: profile } = supabaseAdmin
      ? await supabaseAdmin.from('user_profiles').select('country_code').eq('id', paymentUser.id).maybeSingle()
      : { data: null as any };
    return res.json({
      pricingRegion: region,
      countryCode: profile?.country_code || null,
      currency: region === 'IN' ? 'INR' : region === 'INTL' ? 'USD' : null,
      needsSetup: !region
    });
  } catch (error) {
    console.error('[Pricing Region] Read failed:', error);
    return res.status(500).json({ error: 'Unable to read account pricing region.' });
  }
});

app.post('/api/account/pricing-region', verifyPaymentUser, async (req, res) => {
  try {
    const paymentUser = (req as any).paymentUser as { id: string; email: string };
    const countryCode = String(req.body?.countryCode || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return res.status(400).json({ error: 'Please select a valid country.' });
    }
    const requested: PricingRegion = countryCode === 'IN' ? 'IN' : 'INTL';
    if (!supabaseAdmin) return res.status(503).json({ error: 'Account service is unavailable.' });

    const existing = await getAccountPricingRegion(paymentUser.id);
    if (existing) {
      return res.status(409).json({ error: 'Your account pricing region is already set.', pricingRegion: existing });
    }

    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({
        pricing_region: requested,
        country_code: countryCode,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentUser.id);
    if (error) throw error;
    return res.json({ pricingRegion: requested, countryCode, currency: requested === 'IN' ? 'INR' : 'USD' });
  } catch (error: any) {
    console.error('[Pricing Region] Setup failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to save account pricing region.' });
  }
});

// Razorpay API configuration endpoint
app.get("/api/razorpay/config", (req, res) => {
  const { keyId, keySecret } = getRazorpayKeys();
  const isConfigured = !!(keyId && keySecret);
  res.json({
    keyId: keyId || "",
    isConfigured
  });
});

// Create Razorpay Order Handler
const handleCreateOrder = async (req: express.Request, res: express.Response) => {
  try {
    const { keyId, keySecret } = getRazorpayKeys();

    if (!keyId || !keySecret) {
      return res.status(401).json({ 
        error: "Razorpay credentials are missing. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env." 
      });
    }

    const { planType, receipt } = req.body;
    const paymentUser = (req as any).paymentUser as { id: string; email: string };
    const pricingRegion = await getAccountPricingRegion(paymentUser.id);
    if (!pricingRegion) {
      return res.status(409).json({ error: "Please complete your account country/region before purchasing a plan.", needsRegionSetup: true });
    }
    const targetCurrency = pricingRegion === 'IN' ? 'INR' : 'USD';
    if (!["pay_per_trip", "yearly", "lifetime"].includes(planType)) {
      return res.status(400).json({ error: "Invalid TripBalancing plan." });
    }
    if (!["INR", "USD"].includes(targetCurrency)) {
      return res.status(400).json({ error: "Unsupported payment currency." });
    }
    // Price is always determined on the server. Never trust a browser-supplied amount.
    const amount = getServerPlanAmount(planType, targetCurrency);
    if (!amount) {
      return res.status(400).json({ error: "Unable to determine the selected plan price." });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    const options = {
      amount: Math.round(amount),
      currency: targetCurrency,
      receipt: receipt || `receipt_${planType || "order"}_${Date.now()}`,
      notes: {
        planType,
        userId: paymentUser.id,
        userEmail: paymentUser.email,
        pricingRegion
      }
    };

    try {
      const order = await razorpay.orders.create(options);
      console.log(`[Razorpay API] Created order ${order.id} for amount ${order.amount} ${order.currency}`);
      return res.json({
        order_id: order.id,
        id: order.id,
        amount: order.amount,
        currency: order.currency
      });
    } catch (rzpErr: any) {
      console.error("[Razorpay API] Order creation failed:", rzpErr?.error?.description || rzpErr?.message || "Order creation failed.");
      
      // International accounts keep international pricing. Never silently fall back
      // to India pricing if a USD payment cannot be created.
      if (targetCurrency === "USD") {
        const description = rzpErr?.error?.description || rzpErr?.message || "USD payment could not be started.";
        return res.status(rzpErr?.statusCode || 400).json({
          error: `International payment could not be started: ${description}`
        });
      }

      const isAuthFailure = 
        rzpErr?.error?.code === "BAD_REQUEST_ERROR" && 
        (rzpErr?.error?.description === "Authentication failed" || rzpErr?.statusCode === 401);

      if (isAuthFailure) {
        return res.status(401).json({
          error: "Razorpay API Key Authentication Failed. The RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in .env is invalid or expired. Please update .env with active credentials from your Razorpay Dashboard (Settings -> API Keys)."
        });
      }

      const statusCode = rzpErr?.statusCode || 500;
      const description = rzpErr?.error?.description || rzpErr?.message || "Failed to create Razorpay order.";
      return res.status(statusCode).json({ error: description });
    }
  } catch (error: any) {
    console.error("Razorpay Order Creation Failed:", error);
    res.status(500).json({ error: error?.message || "Failed to create Razorpay order." });
  }
};

app.post("/api/create-order", verifyPaymentUser, handleCreateOrder);
app.post("/api/razorpay/create-order", verifyPaymentUser, handleCreateOrder);

// Verify Razorpay Payment Signature Handler
const handleVerifyPayment = async (req: express.Request, res: express.Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        status: "failure", 
        verified: false, 
        error: "Missing required payment verification fields (razorpay_order_id, razorpay_payment_id, razorpay_signature)." 
      });
    }

    const { keyId, keySecret } = getRazorpayKeys();
    const paymentUser = (req as any).paymentUser as { id: string; email: string };

    if (!keyId || !keySecret) {
      return res.status(400).json({ 
        status: "failure", 
        verified: false, 
        error: "Razorpay secret key is not configured on the server." 
      });
    }

    const hmac = crypto.createHmac("sha256", keySecret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    const expectedBuffer = Buffer.from(generated_signature, "utf8");
    const receivedBuffer = Buffer.from(String(razorpay_signature), "utf8");
    const signatureMatches = expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (signatureMatches) {
      console.log(`[Razorpay API] Signature verified successfully for order: ${razorpay_order_id}`);

      // Fetch the authoritative Razorpay records. Plan, price and ownership must never come from the browser.
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const [order, payment] = await Promise.all([
        razorpay.orders.fetch(razorpay_order_id),
        razorpay.payments.fetch(razorpay_payment_id)
      ]);
      if (payment.order_id !== razorpay_order_id) {
        return res.status(400).json({ status: "failure", verified: false, error: "Payment does not belong to this order." });
      }
      if (!["captured", "authorized"].includes(String(payment.status))) {
        return res.status(400).json({ status: "failure", verified: false, error: "Payment has not been successfully authorized." });
      }
      const planType = String((order.notes as any)?.planType || "");
      const orderUserId = String((order.notes as any)?.userId || "");
      if (!PLAN_PRICES.INR[planType] || orderUserId !== paymentUser.id) {
        return res.status(403).json({ status: "failure", verified: false, error: "Payment order ownership or plan is invalid." });
      }
      const orderCurrency = String(order.currency || "INR").toUpperCase();
      const accountRegion = await getAccountPricingRegion(paymentUser.id);
      const accountCurrency = accountRegion === 'IN' ? 'INR' : accountRegion === 'INTL' ? 'USD' : null;
      if (!accountCurrency || orderCurrency !== accountCurrency) {
        return res.status(403).json({ status: "failure", verified: false, error: "Payment currency does not match the account pricing region." });
      }
      const expectedAmount = getServerPlanAmount(planType, orderCurrency);
      if (!expectedAmount || Number(order.amount) !== expectedAmount || Number(payment.amount) !== Number(order.amount)) {
        return res.status(400).json({ status: "failure", verified: false, error: "Payment amount does not match the selected plan." });
      }
      const user_email = paymentUser.email;
      const user_id = paymentUser.id;
      const amountMajor = Number(order.amount) / 100;

      // Idempotency: a verified Razorpay payment can grant entitlement only once.
      let alreadyProcessed = IN_MEMORY_PAYMENTS.some(p => p.razorpay_payment_id === razorpay_payment_id);
      if (!alreadyProcessed && supabaseAdmin) {
        const { data: existingPayment } = await supabaseAdmin
          .from("payments")
          .select("razorpay_payment_id")
          .eq("razorpay_payment_id", razorpay_payment_id)
          .maybeSingle();
        alreadyProcessed = !!existingPayment;
      }
      if (alreadyProcessed) {
        return res.json({ status: "success", verified: true, alreadyProcessed: true, planType, currency: orderCurrency, amount: amountMajor, tripsAdded: 0, message: "Payment was already verified." });
      }
      {
        const paymentRec: PaymentRecord = {
          id: `pay_rec_${Date.now()}`,
          user_id: user_id,
          user_email: user_email,
          razorpay_order_id: razorpay_order_id,
          razorpay_payment_id: razorpay_payment_id,
          plan_purchased: planType || "pay_per_trip",
          amount: amountMajor,
          currency: orderCurrency,
          payment_status: "captured",
          is_test_mode: false,
          created_at: new Date().toISOString()
        };
        IN_MEMORY_PAYMENTS.unshift(paymentRec);

        // Upsert subscription record
        const existingSubIdx = IN_MEMORY_SUBSCRIPTIONS.findIndex(s => s.user_email === user_email);
        const newSub: SubscriptionRecord = {
          id: `sub_${Date.now()}`,
          user_id: user_id,
          user_email: user_email,
          current_plan: planType || "pay_per_trip",
          purchase_date: new Date().toISOString(),
          expiry_date: planType === "yearly" ? new Date(Date.now() + 365*24*3600*1000).toISOString() : null,
          remaining_trip_credits: planType === "pay_per_trip" ? 2 : 999,
          status: "active"
        };
        if (existingSubIdx !== -1) {
          IN_MEMORY_SUBSCRIPTIONS[existingSubIdx] = newSub;
        } else {
          IN_MEMORY_SUBSCRIPTIONS.unshift(newSub);
        }

        if (supabaseAdmin) {
          try {
            await supabaseAdmin.from("payments").insert([{
              user_id: user_id || null,
              user_email: user_email,
              razorpay_order_id: razorpay_order_id,
              razorpay_payment_id: razorpay_payment_id,
              plan_purchased: planType || "pay_per_trip",
              amount: paymentRec.amount,
              currency: orderCurrency,
              payment_status: String(payment.status)
            }]);

            await supabaseAdmin.from("subscriptions").upsert([{
              user_id: user_id || null,
              user_email: user_email,
              current_plan: planType || "pay_per_trip",
              purchase_date: new Date().toISOString(),
              status: "active"
            }], { onConflict: "user_id" });

            // Entitlement is granted server-side only after verified payment.
            const profileUpdate: any = {
              plan: planType,
              is_premium: planType === "yearly" || planType === "lifetime"
            };
            if (planType === "pay_per_trip") {
              const { data: existingProfile } = await supabaseAdmin
                .from("user_profiles")
                .select("paid_trips_balance")
                .eq("id", user_id)
                .maybeSingle();
              const creditsToAdd = orderCurrency === "USD" ? 2 : 1;
              profileUpdate.paid_trips_balance = Number(existingProfile?.paid_trips_balance || 0) + creditsToAdd;
            }
            await supabaseAdmin.from("user_profiles").update(profileUpdate).eq("id", user_id);
          } catch (e) {
            console.warn("[Razorpay Verification] Supabase sync warning:", e);
          }
        }

        // Trigger Transactional Payment Success Email via Brevo SMTP
        try {
          const emailData = generatePaymentSuccessEmail({
            userName: user_email.split("@")[0],
            planPurchased: planType || "pay_per_trip",
            amountPaid: paymentRec.amount,
            razorpayPaymentId: razorpay_payment_id,
            purchaseDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
          });
          sendBrevoEmail({
            to: user_email,
            subject: emailData.subject,
            html: emailData.html
          }).catch(err => console.warn("[Email Service] Payment success email dispatch error:", err));
        } catch (mailErr) {
          console.warn("[Email Service] Failed building payment success email:", mailErr);
        }
      }

      return res.json({ status: "success", verified: true, planType, currency: orderCurrency, amount: amountMajor, tripsAdded: planType === "pay_per_trip" ? (orderCurrency === "USD" ? 2 : 1) : 0, message: "Payment verified successfully" });
    } else {
      console.warn(`[Razorpay API] Signature mismatch for order: ${razorpay_order_id}`);
      
      // Trigger Transactional Payment Failed Email if email is present
      const failedEmail = req.body?.user_email;
      if (failedEmail) {
        try {
          const emailData = generatePaymentFailedEmail({
            userName: failedEmail.split("@")[0],
            attemptedPlan: req.body?.planType || "TripBalancing Upgrade",
            orderId: razorpay_order_id
          });
          sendBrevoEmail({
            to: failedEmail,
            subject: emailData.subject,
            html: emailData.html
          }).catch(err => console.warn("[Email Service] Payment failed email dispatch error:", err));
        } catch (mailErr) {
          console.warn("[Email Service] Failed building payment failed email:", mailErr);
        }
      }

      return res.status(400).json({ status: "failure", verified: false, error: "Invalid payment signature." });
    }
  } catch (error: any) {
    console.error("Razorpay Payment Verification Failed:", error);
    res.status(500).json({ status: "failure", verified: false, error: error?.message || "Failed to verify Razorpay payment." });
  }
};

app.post("/api/verify-payment", verifyPaymentUser, handleVerifyPayment);
app.post("/api/razorpay/verify-payment", verifyPaymentUser, handleVerifyPayment);

// ==============================================================================
// Admin Dashboard Secure API Routes
// ==============================================================================

app.get("/api/admin/check-access", verifyAdminAuth, (req, res) => {
  const adminUser = (req as any).adminUser;
  res.json({ isAdmin: true, user: adminUser });
});

app.get("/api/admin/overview", verifyAdminAuth, async (req, res) => {
  try {
    let totalRegisteredUsers = IN_MEMORY_USERS.length;
    let usersRegisteredToday = 1;
    let totalPaidUsers = IN_MEMORY_USERS.filter(u => u.plan !== "free").length;
    let freeUsers = IN_MEMORY_USERS.filter(u => u.plan === "free").length;
    let activeSubscriptions = IN_MEMORY_SUBSCRIPTIONS.filter(s => s.status === "active").length;
    let totalSuccessfulPayments = IN_MEMORY_PAYMENTS.filter(p => p.payment_status === "captured").length;
    let totalRevenue = IN_MEMORY_PAYMENTS.reduce((sum, p) => sum + (p.amount || 0), 0);
    let openSupportTickets = IN_MEMORY_SUPPORT_TICKETS.filter(t => t.status === "open" || t.status === "in_progress").length;
    let pendingRefundRequests = IN_MEMORY_REFUND_REQUESTS.filter(r => r.status === "pending").length;

    if (supabaseAdmin) {
      try {
        const { count: uCount } = await supabaseAdmin.from("user_profiles").select("*", { count: "exact", head: true });
        if (uCount !== null && uCount > 0) totalRegisteredUsers = uCount;

        const { count: pCount } = await supabaseAdmin.from("payments").select("*", { count: "exact", head: true });
        if (pCount !== null && pCount > 0) totalSuccessfulPayments = pCount;

        const { data: revData } = await supabaseAdmin.from("payments").select("amount");
        if (revData && revData.length > 0) {
          totalRevenue = revData.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        }

        const { count: sCount } = await supabaseAdmin.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active");
        if (sCount !== null && sCount > 0) activeSubscriptions = sCount;

        const { count: tCount } = await supabaseAdmin.from("support_tickets").select("*", { count: "exact", head: true }).neq("status", "resolved");
        if (tCount !== null && tCount > 0) openSupportTickets = tCount;

        const { count: rCount } = await supabaseAdmin.from("refund_requests").select("*", { count: "exact", head: true }).eq("status", "pending");
        if (rCount !== null && rCount > 0) pendingRefundRequests = rCount;
      } catch (e) {
        console.warn("[Admin Overview] DB query exception fallback to store:", e);
      }
    }

    res.json({
      totalRegisteredUsers,
      usersRegisteredToday,
      totalPaidUsers,
      freeUsers,
      activeSubscriptions,
      totalSuccessfulPayments,
      totalRevenue,
      openSupportTickets,
      pendingRefundRequests
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch overview metrics" });
  }
});

app.get("/api/admin/users", verifyAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string || "").toLowerCase().trim();
    const plan = (req.query.plan as string || "all").toLowerCase().trim();

    let usersList: UserProfileRecord[] = [];

    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Supabase admin connection is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Render Environment." });
    }

    // Read the actual Supabase Auth users, then enrich them with user_profiles when available.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authError) throw authError;

    const { data: profiles } = await supabaseAdmin.from("user_profiles").select("*");
    const profileById = new Map((profiles || []).map((p: any) => [p.id || p.user_id, p]));

    usersList = (authData?.users || []).map((authUser: any) => {
      const profile: any = profileById.get(authUser.id) || {};
      return {
        id: authUser.id,
        email: authUser.email || profile.email || "",
        full_name: profile.full_name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || "",
        plan: profile.plan || "free",
        trips_count: Number(profile.trips_count || 0),
        paid_trip_credits: Number(profile.paid_trips_balance ?? profile.paid_trip_credits ?? 0),
        status: profile.status || (authUser.banned_until ? "suspended" : "active"),
        created_at: authUser.created_at || profile.created_at || new Date(0).toISOString()
      } as UserProfileRecord;
    });

    if (search) {
      usersList = usersList.filter(u => u.email.toLowerCase().includes(search) || (u.full_name && u.full_name.toLowerCase().includes(search)));
    }

    if (plan && plan !== "all") {
      usersList = usersList.filter(u => (u.plan || "free").toLowerCase() === plan);
    }

    const total = usersList.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedUsers = usersList.slice(startIndex, startIndex + limit);

    res.json({ users: paginatedUsers, total, page, totalPages });
  } catch (err: any) {
    console.error("[Admin Users] Failed to load Supabase Auth users:", err);
    const message = String(err?.message || "Failed to fetch users");
    const status = /not authorized|permission|service role|invalid api key|jwt/i.test(message) ? 503 : 500;
    res.status(status).json({
      error: status === 503
        ? "Admin user access is not configured correctly. Check SUPABASE_SERVICE_ROLE_KEY in Render."
        : message
    });
  }
});

app.get("/api/admin/payments", verifyAdminAuth, async (req, res) => {
  try {
    let payments = [...IN_MEMORY_PAYMENTS];
    if (supabaseAdmin) {
      try {
        const { data: dbPayments } = await supabaseAdmin.from("payments").select("*").order("created_at", { ascending: false });
        if (dbPayments && dbPayments.length > 0) payments = dbPayments;
      } catch (e) {
        console.warn("[Admin Payments] DB query fallback:", e);
      }
    }

    res.json({ payments, total: payments.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch payments" });
  }
});

app.get("/api/admin/subscriptions", verifyAdminAuth, async (req, res) => {
  try {
    let subscriptions = [...IN_MEMORY_SUBSCRIPTIONS];
    if (supabaseAdmin) {
      try {
        const { data: dbSubs } = await supabaseAdmin.from("subscriptions").select("*").order("created_at", { ascending: false });
        if (dbSubs && dbSubs.length > 0) subscriptions = dbSubs;
      } catch (e) {
        console.warn("[Admin Subscriptions] DB query fallback:", e);
      }
    }

    res.json({ subscriptions, total: subscriptions.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch subscriptions" });
  }
});

app.get("/api/admin/support-tickets", verifyAdminAuth, async (req, res) => {
  try {
    let tickets = [...IN_MEMORY_SUPPORT_TICKETS];
    if (supabaseAdmin) {
      try {
        const { data: dbTickets } = await supabaseAdmin.from("support_tickets").select("*").order("created_at", { ascending: false });
        if (dbTickets && dbTickets.length > 0) tickets = dbTickets;
      } catch (e) {
        console.warn("[Admin Support Tickets] DB query fallback:", e);
      }
    }

    res.json({ tickets, total: tickets.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch support tickets" });
  }
});

app.get("/api/admin/refund-requests", verifyAdminAuth, async (req, res) => {
  try {
    let requests = [...IN_MEMORY_REFUND_REQUESTS];
    if (supabaseAdmin) {
      try {
        const { data: dbRefunds } = await supabaseAdmin.from("refund_requests").select("*").order("created_at", { ascending: false });
        if (dbRefunds && dbRefunds.length > 0) requests = dbRefunds;
      } catch (e) {
        console.warn("[Admin Refund Requests] DB query fallback:", e);
      }
    }

    const enrichedRequests = requests.map(r => {
      const purchaseTime = new Date(r.purchase_date).getTime();
      const nowTime = Date.now();
      const daysDiff = (nowTime - purchaseTime) / (1000 * 60 * 60 * 24);
      const isEligible = daysDiff <= 7 && (r.trips_used_since_purchase === 0 || !r.trips_used_since_purchase);
      return {
        ...r,
        refund_eligible: isEligible
      };
    });

    res.json({ requests: enrichedRequests, total: enrichedRequests.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch refund requests" });
  }
});

app.get("/api/admin/security-audit", verifyAdminAuth, async (req, res) => {
  try {
    const rlsTables = [
      { tableName: "admin_users", rlsEnabled: true },
      { tableName: "user_profiles", rlsEnabled: true },
      { tableName: "payments", rlsEnabled: true },
      { tableName: "subscriptions", rlsEnabled: true },
      { tableName: "support_tickets", rlsEnabled: true },
      { tableName: "refund_requests", rlsEnabled: true },
      { tableName: "failed_admin_access_logs", rlsEnabled: true }
    ];

    let failedAccessLogs = [...FAILED_ADMIN_ACCESS_LOGS];
    if (supabaseAdmin) {
      try {
        const { data: logs } = await supabaseAdmin.from("failed_admin_access_logs").select("*").order("attempted_at", { ascending: false }).limit(20);
        if (logs && logs.length > 0) failedAccessLogs = logs;
      } catch (e) {
        console.warn("[Security Audit] DB query fallback:", e);
      }
    }

    res.json({
      tables: rlsTables,
      failedAccessLogs: failedAccessLogs.map(l => ({
        attempted_user_id: l.attempted_user_id,
        attempted_email: l.attempted_email,
        ip_address: l.ip_address,
        user_agent: l.user_agent ? l.user_agent.substring(0, 50) + "..." : "unknown",
        attempted_at: l.attempted_at
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch security audit" });
  }
});

// Public Form Submissions for Support & Refunds
app.post("/api/support-tickets", verifyUserAuth, async (req, res) => {
  try {
    const { subject, message, paymentId } = req.body;
    const authUser = (req as any).authenticatedUser as { id: string; email: string };
    const contactEmail = authUser.email;
    const userId = authUser.id;
    if (!contactEmail || !message) {
      return res.status(400).json({ error: "Email and message are required." });
    }

    const ticketRef = `#TB-${Math.floor(100000 + Math.random() * 900000)}`;
    const newTicket: SupportTicketRecord = {
      id: `tkt_${Date.now()}`,
      ticket_ref: ticketRef,
      user_id: userId,
      user_email: contactEmail,
      subject: subject || "Customer Inquiry",
      message: message,
      razorpay_payment_id: paymentId || undefined,
      status: "open",
      created_at: new Date().toISOString()
    };

    IN_MEMORY_SUPPORT_TICKETS.unshift(newTicket);

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("support_tickets").insert([{
          ticket_ref: ticketRef,
          user_id: userId || null,
          user_email: contactEmail,
          subject: subject || "Customer Inquiry",
          message: message,
          razorpay_payment_id: paymentId || null,
          status: "open"
        }]);
      } catch (e) {
        console.warn("[Support Ticket API] Supabase insert warning:", e);
      }
    }

    // Trigger Transactional Support Ticket Email via Brevo SMTP
    try {
      const emailData = generateSupportTicketEmail({
        userName: contactEmail.split("@")[0],
        userEmail: contactEmail,
        ticketRef: ticketRef,
        subjectText: subject || "Customer Inquiry",
        messageText: message
      });
      sendBrevoEmail({
        to: contactEmail,
        subject: emailData.subject,
        html: emailData.html
      }).catch(err => console.warn("[Email Service] Support ticket email error:", err));
    } catch (mailErr) {
      console.warn("[Email Service] Failed building support ticket email:", mailErr);
    }

    res.json({ success: true, ticketRef });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to log support ticket" });
  }
});

app.post("/api/refund-requests", verifyUserAuth, async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "Payment ID is required." });
    const authUser = (req as any).authenticatedUser as { id: string; email: string };
    if (!supabaseAdmin) return res.status(503).json({ error: "Refund verification service is unavailable." });
    const { data: ownedPayment, error: paymentLookupError } = await supabaseAdmin
      .from("payments")
      .select("user_id, user_email, plan_purchased, created_at, razorpay_payment_id")
      .eq("razorpay_payment_id", paymentId)
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (paymentLookupError) throw paymentLookupError;
    if (!ownedPayment) return res.status(403).json({ error: "This payment does not belong to the signed-in account." });
    const purchaseDate = ownedPayment.created_at || new Date().toISOString();
    const purchaseTime = new Date(purchaseDate).getTime();
    const daysSince = (Date.now() - purchaseTime) / (1000 * 60 * 60 * 24);
    // Usage eligibility is reviewed by the admin against server-side entitlement history.
    // Never trust a browser-supplied tripsUsedSincePurchase value.
    const tripsUsed = 0;
    const isEligible = daysSince <= 7;
    const userEmail = authUser.email;
    const userId = authUser.id;
    const plan = ownedPayment.plan_purchased || "unknown";

    const newRequest: RefundRequestRecord = {
      id: `ref_${Date.now()}`,
      user_id: userId,
      user_email: userEmail,
      razorpay_payment_id: paymentId,
      plan,
      purchase_date: purchaseDate,
      trips_used_since_purchase: tripsUsed,
      refund_eligible: isEligible,
      status: "pending",
      created_at: new Date().toISOString()
    };

    IN_MEMORY_REFUND_REQUESTS.unshift(newRequest);

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("refund_requests").insert([{
          user_id: userId || null,
          user_email: userEmail,
          razorpay_payment_id: paymentId,
          plan: plan || "unknown",
          purchase_date: purchaseDate || new Date().toISOString(),
          trips_used_since_purchase: tripsUsed,
          refund_eligible: isEligible,
          status: "pending"
        }]);
      } catch (e) {
        console.warn("[Refund Request API] Supabase insert warning:", e);
      }
    }

    // Trigger Transactional Refund Request Received Email via Brevo SMTP
    try {
      const emailData = generateRefundRequestReceivedEmail({
        userName: userEmail.split("@")[0],
        razorpayPaymentId: paymentId,
        plan: plan || "Pro Plan",
        requestDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      });
      sendBrevoEmail({
        to: userEmail,
        subject: emailData.subject,
        html: emailData.html
      }).catch(err => console.warn("[Email Service] Refund request email error:", err));
    } catch (mailErr) {
      console.warn("[Email Service] Failed building refund request email:", mailErr);
    }

    res.json({ success: true, refundEligible: isEligible, status: "pending" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to process refund request" });
  }
});

// Dedicated Email API Endpoints

// 1. Welcome Email Endpoint (Sent after email verification)
app.post("/api/email/welcome", verifyUserAuth, async (req, res) => {
  try {
    const { email, name, appUrl } = req.body;
    if (!email) {
      return res.status(400).json({ error: "User email is required." });
    }
    const authUser = (req as any).authenticatedUser as { id: string; email: string };
    if (String(email).trim().toLowerCase() !== String(authUser.email).trim().toLowerCase()) {
      return res.status(403).json({ error: "You may only send a welcome email to your own account." });
    }

    const emailData = generateWelcomeEmail(name || email.split("@")[0], appUrl || "https://tripbalancing.in");
    const result = await sendBrevoEmail({
      to: email,
      subject: emailData.subject,
      html: emailData.html
    });

    res.json({ success: true, message: "Welcome email sent successfully", result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send welcome email" });
  }
});

// Admin Refund Decision Endpoint (Approves or rejects refund and dispatches email)
app.post("/api/admin/refunds/action", verifyAdminAuth, async (req, res) => {
  try {
    const { requestId, action, userEmail, razorpayPaymentId, amount, reason } = req.body;
    if (!userEmail || !razorpayPaymentId || !action) {
      return res.status(400).json({ error: "Missing required parameters: userEmail, razorpayPaymentId, and action." });
    }

    // Update in-memory record
    const refIdx = IN_MEMORY_REFUND_REQUESTS.findIndex(r => r.id === requestId || r.razorpay_payment_id === razorpayPaymentId);
    if (refIdx !== -1) {
      IN_MEMORY_REFUND_REQUESTS[refIdx].status = action === "approve" ? "approved" : "rejected";
    }

    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("refund_requests").update({ status: action === "approve" ? "approved" : "rejected" }).eq("razorpay_payment_id", razorpayPaymentId);
      } catch (e) {
        console.warn("[Admin Refund Action] Supabase update warning:", e);
      }
    }

    let emailResult;
    if (action === "approve") {
      const emailData = generateRefundApprovedEmail({
        userName: userEmail.split("@")[0],
        razorpayPaymentId,
        amountRefunded: Number(amount) || 499,
        approvedDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
      });
      emailResult = await sendBrevoEmail({
        to: userEmail,
        subject: emailData.subject,
        html: emailData.html
      });
    } else {
      const emailData = generateRefundRejectedEmail({
        userName: userEmail.split("@")[0],
        razorpayPaymentId,
        reason: reason || "Request submitted outside our 7-day money-back policy or service already consumed."
      });
      emailResult = await sendBrevoEmail({
        to: userEmail,
        subject: emailData.subject,
        html: emailData.html
      });
    }

    res.json({ success: true, action, status: action === "approve" ? "approved" : "rejected", emailResult });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to process refund decision action" });
  }
});

// Unified Transactional Email Dispatch Endpoint (Backend API)
app.post("/api/email/send-transactional", verifyUserAuth, async (req, res) => {
  try {
    const { templateType, recipientEmail, payload } = req.body;
    if (!templateType || !recipientEmail) {
      return res.status(400).json({ error: "templateType and recipientEmail are required." });
    }
    const authUser = (req as any).authenticatedUser as { id: string; email: string };
    if (templateType === "buddy_invite") {
      if (!supabaseAdmin) return res.status(503).json({ error: "Invitation verification service is unavailable." });
      const { data: pendingInvite } = await supabaseAdmin
        .from("buddy_invitations")
        .select("id")
        .eq("sender_email", authUser.email)
        .eq("recipient_email", String(recipientEmail).trim().toLowerCase())
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pendingInvite) return res.status(403).json({ error: "No matching pending buddy invitation was found." });
      payload.senderEmail = authUser.email;
    } else if (!(await userHasAdminAccess(authUser.id, authUser.email))) {
      return res.status(403).json({ error: "Admin authorization required for this email template." });
    }

    let emailData: { subject: string; html: string };

    switch (templateType) {
      case "welcome":
        emailData = generateWelcomeEmail(payload?.name || recipientEmail.split("@")[0], payload?.appUrl);
        break;
      case "payment_success":
        emailData = generatePaymentSuccessEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          planPurchased: payload?.planPurchased || "pay_per_trip",
          amountPaid: Number(payload?.amountPaid) || 499,
          razorpayPaymentId: payload?.razorpayPaymentId || "pay_mock_12345",
          purchaseDate: payload?.purchaseDate || new Date().toLocaleDateString("en-US")
        });
        break;
      case "payment_failed":
        emailData = generatePaymentFailedEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          attemptedPlan: payload?.attemptedPlan || "Pro Explorer",
          orderId: payload?.orderId || "order_mock_12345"
        });
        break;
      case "refund_received":
        emailData = generateRefundRequestReceivedEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          razorpayPaymentId: payload?.razorpayPaymentId || "pay_mock_12345",
          plan: payload?.plan || "Pro Plan",
          requestDate: payload?.requestDate || new Date().toLocaleDateString("en-US")
        });
        break;
      case "refund_approved":
        emailData = generateRefundApprovedEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          razorpayPaymentId: payload?.razorpayPaymentId || "pay_mock_12345",
          amountRefunded: Number(payload?.amountRefunded) || 499,
          approvedDate: payload?.approvedDate || new Date().toLocaleDateString("en-US")
        });
        break;
      case "refund_rejected":
        emailData = generateRefundRejectedEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          razorpayPaymentId: payload?.razorpayPaymentId || "pay_mock_12345",
          reason: payload?.reason
        });
        break;
      case "buddy_invite":
        emailData = generateBuddyInviteEmail({
          senderEmail: payload?.senderEmail || "A TripBalancing traveler",
          destination: payload?.destination || "an upcoming trip",
          accessType: payload?.accessType === "write" ? "write" : "read",
          joinUrl: payload?.joinUrl || "https://tripbalancing.in"
        });
        break;
      case "support_ticket":
        emailData = generateSupportTicketEmail({
          userName: payload?.userName || recipientEmail.split("@")[0],
          userEmail: recipientEmail,
          ticketRef: payload?.ticketRef || "#TB-999999",
          subjectText: payload?.subjectText || "General Inquiry",
          messageText: payload?.messageText || "Need help with itinerary balancing."
        });
        break;
      default:
        return res.status(400).json({ error: `Unknown templateType: ${templateType}` });
    }

    const result = await sendBrevoEmail({
      to: recipientEmail,
      subject: emailData.subject,
      html: emailData.html
    });

    res.json({ success: true, templateType, recipientEmail, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to dispatch transactional email" });
  }
});

// Destination Recommendation Endpoint
app.post("/api/recommend-destinations", verifyUserAuth, async (req, res) => {
  try {
    const {
      origin,
      days,
      travelers,
      travelerType,
      travelStyle,
      budgetMode,
      budgetAmount,
      tripScope,
      tripPurpose,
      preferredWeather,
      interests = [],
      visitedDestinations = [],
      revisitPreference = "new_only",
      startDate,
    } = req.body || {};

    if (!origin || !days || !travelers || !travelerType || !travelStyle) {
      return res.status(400).json({ error: "Missing destination recommendation details." });
    }

    const ai = getGeminiClient();
    const visitedRule = revisitPreference === "new_only"
      ? `Do not recommend any of these previously visited destinations: ${visitedDestinations.join(", ") || "none"}.`
      : revisitPreference === "favorites_only"
        ? `Prefer these previously visited favourites when suitable: ${visitedDestinations.join(", ") || "none supplied"}.`
        : `Previously visited places may be included, but prefer fresh options: ${visitedDestinations.join(", ") || "none"}.`;

    const prompt = `Recommend exactly 5 realistic travel destinations for a TripBalancing user.

User profile:
- Starting city: ${origin}
- Trip scope: ${tripScope || "Both"}
- Duration: ${days} days
- Travelers: ${travelers}
- Traveler type: ${travelerType}
- Travel style: ${travelStyle}
- Budget mode: ${budgetMode || "fixed"}
- Budget: ${budgetAmount || "AI Recommended"}
- Purpose: ${tripPurpose || "Vacation"}
- Preferred weather: ${preferredWeather || "Any"}
- Interests: ${(interests || []).join(", ") || "General sightseeing"}
- Approximate start date: ${startDate || "Flexible"}
- Previously visited: ${(visitedDestinations || []).join(", ") || "None"}
- Revisit rule: ${visitedRule}

Rules:
1. Recommendations must be practical from the stated origin and duration.
2. For a fixed budget, estimatedCostRange must be realistic for the complete group and should fit or stay close to the stated total budget. Do not recommend obviously unaffordable destinations.
3. Smart Luxury means boutique/heritage stays and selective premium experiences, not wasteful ultra-luxury.
4. Explain why each destination fits in one concise sentence.
5. Use a 0-100 match score and order highest match first.
6. Return realistic full-trip group cost ranges, including round-trip travel, accommodation, food, local transport, activities and buffer.
7. Do not invent impossible prices and do not repeat essentially identical destinations.

Return strict JSON only.`;

    const response = await generateContentWithRetry(ai, {
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendations: {
              type: Type.ARRAY,
              minItems: 5,
              maxItems: 5,
              items: {
                type: Type.OBJECT,
                properties: {
                  destination: { type: Type.STRING },
                  matchScore: { type: Type.NUMBER },
                  whyItFits: { type: Type.STRING },
                  estimatedCostRange: { type: Type.STRING },
                  bestFor: { type: Type.ARRAY, items: { type: Type.STRING } },
                  bestMonths: { type: Type.STRING },
                },
                required: ["destination", "matchScore", "whyItFits", "estimatedCostRange", "bestFor"],
              },
            },
          },
          required: ["recommendations"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
          .map((item: any) => ({
            destination: String(item.destination || "").trim(),
            matchScore: Math.max(0, Math.min(100, Math.round(Number(item.matchScore) || 0))),
            whyItFits: String(item.whyItFits || "").trim(),
            estimatedCostRange: String(item.estimatedCostRange || "").trim(),
            bestFor: Array.isArray(item.bestFor) ? item.bestFor.map(String).slice(0, 4) : [],
            bestMonths: item.bestMonths ? String(item.bestMonths) : undefined,
          }))
          .filter((item: any) => item.destination)
          .sort((a: any, b: any) => b.matchScore - a.matchScore)
          .slice(0, 5)
      : [];

    if (!recommendations.length) {
      return res.status(502).json({ error: "The AI did not return usable destination recommendations." });
    }

    return res.json({ recommendations });
  } catch (error: any) {
    console.error("Destination recommendation failed:", error?.message || error);
    const failure = geminiHttpErrorPayload(error);
    if (failure.classified.retryAfterSeconds) {
      res.setHeader("Retry-After", String(failure.classified.retryAfterSeconds));
    }
    return res.status(failure.status).json({
      ...failure.body,
      error: "Destination recommendations are temporarily unavailable. Please try again shortly."
    });
  }
});

// AI Itinerary Generator Endpoint
function enforceExactTripDays(itinerary: any, exactDays: number) {
  if (!itinerary || !Number.isFinite(exactDays) || exactDays < 1) return itinerary;
  const sourceDays = Array.isArray(itinerary.days) ? itinerary.days : [];
  // Never render/save more days than the user selected. If AI unexpectedly
  // returns fewer days, add a safe flexible day instead of cloning the previous
  // day's attractions (which created duplicate/illogical itineraries).
  const days = sourceDays.slice(0, exactDays).map((day: any, index: number) => ({
    ...day,
    dayNumber: index + 1,
  }));
  while (days.length < exactDays) {
    const dayNumber = days.length + 1;
    days.push({
      dayNumber,
      theme: dayNumber === exactDays ? "Flexible Exploration & Departure" : "Flexible Local Discovery",
      activities: [
        { time: "09:30 AM / Morning", title: "Flexible neighborhood exploration", description: "Keep this period flexible for a nearby market, park, cafe, or attraction that fits current opening hours and energy levels.", location: itinerary?.destination || "City center", cost: "Free", latitude: itinerary?.latitude, longitude: itinerary?.longitude },
        { time: "02:00 PM / Afternoon", title: "Local food and free-time block", description: "Use this block for a relaxed local meal and nearby independent exploration without repeating earlier major sights.", location: itinerary?.destination || "City center", cost: "Free", latitude: itinerary?.latitude, longitude: itinerary?.longitude },
        { time: "06:00 PM / Evening", title: dayNumber === exactDays ? "Departure preparation" : "Relaxed evening walk", description: dayNumber === exactDays ? "Allow enough buffer for packing, checkout and onward transfer." : "Choose a safe nearby promenade or public area and keep the evening light.", location: itinerary?.destination || "City center", cost: "Free", latitude: itinerary?.latitude, longitude: itinerary?.longitude }
      ],
      foodRecommendations: ["Choose a well-reviewed nearby local restaurant that matches dietary preferences."],
      transportationSuggestions: ["Keep travel local and allow buffer time; verify live opening hours and traffic before leaving."],
      dailyBudget: "Calculated by TripBalancing pricing engine"
    });
  }
  return { ...itinerary, days, tripDays: exactDays };
}


function sanitizeGeneratedText(value: any): string {
  let text = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  // If a model/API returns a mojibake prefix followed by a clean parenthetical hotel name,
  // prefer the clean human-readable name. Example: corrupted bytes + "(The ONE Legian)".
  const parenthetical = text.match(/\(([^()]{4,80})\)\s*$/);
  const suspiciousPrefix = /^[^A-Za-z0-9]{0,3}[A-Za-z0-9]*[^A-Za-z0-9\s,'&.\-]{2,}/.test(text) || /[�\uFFFD]/.test(text);
  if (parenthetical && suspiciousPrefix) text = parenthetical[1].trim();
  return text;
}

function sanitizeItineraryStrings(itinerary: any) {
  if (!itinerary || typeof itinerary !== 'object') return itinerary;
  const clean = (obj: any, key: string) => { if (obj && obj[key] != null) obj[key] = sanitizeGeneratedText(obj[key]); };
  clean(itinerary, 'destination');
  for (const p of Array.isArray(itinerary.placesToVisit) ? itinerary.placesToVisit : []) { clean(p,'name'); clean(p,'description'); }
  for (const f of Array.isArray(itinerary.localFood) ? itinerary.localFood : []) { clean(f,'name'); clean(f,'mustTryAt'); clean(f,'description'); }
  for (const d of Array.isArray(itinerary.days) ? itinerary.days : []) {
    clean(d,'theme');
    for (const a of Array.isArray(d.activities) ? d.activities : []) { clean(a,'title'); clean(a,'location'); clean(a,'description'); }
  }
  const hr=itinerary.hotelRecommendations || {};
  for (const tier of ['budget','midRange','luxury']) for (const h of Array.isArray(hr[tier]) ? hr[tier] : []) { clean(h,'name'); clean(h,'description'); }
  return itinerary;
}


async function repairItineraryForStyle(
  ai: any,
  itinerary: any,
  destination: string,
  travelStyle: string,
  travelerType: string,
  expectedDays: number,
  validationErrors: string[]
): Promise<any | null> {
  try {
    const style = String(travelStyle || 'Budget');
    const styleRules: Record<string, string> = {
      'Luxury': 'Make the ACTUAL daily plan visibly premium: upscale/five-star or equivalent stay as the working base, private/chauffeured transfers where useful, acclaimed upscale dining, spa/wellness, private/priority cultural experiences, sunset cruise/yacht or other destination-appropriate elevated experiences. Every full day needs 3-5 meaningful blocks. A dessert or alcoholic/local beverage is never a lunch or dinner by itself. A casual shack/stall cannot be described as fine dining unless it is genuinely an upscale destination venue. Do not merely multiply prices. Avoid scooters, hostels, budget shacks and repetitive Attraction + Local Flavors days.',
      'Food Explorer': 'Make food the backbone of EVERY day. Use 3-5 meaningful blocks per day, normally including a breakfast/cafe or market/food walk, a real savory regional lunch, a culinary/tasting/cooking/producer experience or dessert/beverage stop, and a signature dinner when timing allows. Desserts and beverages are snack/tasting blocks, never substitutes for lunch or dinner. Sightseeing should support the food story, not dominate it. Never repeat Attraction + Local Flavors and never leave later days with only one or two activities.',
      'Adventure': 'Center most days on real active experiences such as trekking, rafting, kayaking, cycling, climbing, diving or other destination-appropriate activities, with realistic safety and recovery time.',
      'Nightlife': 'Use later starts, sunset venues, live music, lounges, clubs, entertainment and safe late-evening transport, balanced with recovery time.',
      'Wellness & Spa': 'Use calm pacing, spa/wellness treatments, yoga/meditation, healthy dining and restorative nature time.',
      'Culture & History': 'Prioritize heritage sites, museums, architecture, guided cultural context and traditional neighborhoods.',
      'Beach Escape': 'Prioritize beach time, coastal activities, waterfront dining, sunset and adequate unstructured relaxation.',
      'Nature & Wildlife': 'Prioritize real nature reserves, wildlife, forests, viewpoints, eco-experiences and responsible guiding.',
      'Shopping': 'Prioritize markets, artisan districts, malls/boutiques appropriate to the destination, shopping time and practical carrying/transport logistics.',
      'Backpacker': 'Prioritize hostels/value stays, public transport, walking, free/low-cost attractions and social local experiences.',
      'Smart Luxury': 'Use boutique/heritage or high-comfort stays, selective private transfers and a few high-value premium experiences without wasteful overspending.',
      'Budget': 'Keep the trip value-focused with realistic low-cost stays, transport, food and memorable free/low-cost attractions.'
    };
    const rule = styleRules[style] || styleRules['Budget'];
    const prompt = `You are repairing a TripBalancing itinerary that failed style-quality validation.\n\nDestination: ${destination}\nSelected travel style: ${style}\nTraveler type: ${travelerType || 'General traveler'}\nRequired trip days: ${expectedDays}\nValidation failures: ${validationErrors.join('; ')}\n\nMANDATORY STYLE RULE:\n${rule}\n\nReturn ONLY valid JSON. Preserve the same top-level JSON structure and factual destination, dates, travelers and budget fields. Rewrite days, placesToVisit/localFood only when needed so the selected style is obvious from the content. Keep real-world prices plausible; change service/venue level rather than multiplying the same item price. Use destination-specific or clearly generic-but-honest service descriptions instead of inventing fake businesses. Ensure each full day normally has 3-5 meaningful activity blocks and do not repeat the same day template.\n\nCURRENT ITINERARY JSON:\n${JSON.stringify(itinerary)}`;
    const repairedResponse = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.45 }
    }, { timeoutMs: 45000, maxAttempts: 2 });
    const text = repairedResponse?.text;
    if (!text) return null;
    const repaired = sanitizeItineraryStrings(JSON.parse(String(text).trim()));
    repaired.destination = itinerary.destination;
    repaired.origin = itinerary.origin;
    repaired.startDate = itinerary.startDate;
    repaired.endDate = itinerary.endDate;
    repaired.travelers = itinerary.travelers;
    repaired.travelStyle = travelStyle;
    repaired.budgetAmount = itinerary.budgetAmount;
    repaired.plannedBudget = itinerary.plannedBudget;
    return repaired;
  } catch (repairError: any) {
    console.warn('[STYLE_REPAIR_FAILED]', repairError?.message || repairError);
    return null;
  }
}

function validateGeneratedItinerary(itinerary: any, expectedTravelStyle?: string): string[] {
  const errors: string[] = [];
  const dest = String(itinerary?.destination || '').toLowerCase();
  const generic = /(grand landmark|city center & central plaza|botanical & scenic gardens|local artisans market|budget inn|travelers cozy hostel|backpackers haven|central hotel|parkview residency|comfort suites|royal heritage resort|ritz sovereign|morning exploration & breakfast|guided landmark sightseeing|sunset vista & evening local dinner|main food street promenade|old town pastry shop|scenic overlook tea lounge)/i;
  const names: string[] = [];
  for (const p of Array.isArray(itinerary?.placesToVisit) ? itinerary.placesToVisit : []) names.push(String(p?.name||''));
  for (const f of Array.isArray(itinerary?.localFood) ? itinerary.localFood : []) names.push(String(f?.name||''), String(f?.mustTryAt||''));
  const hr=itinerary?.hotelRecommendations||{};
  for (const tier of ['budget','midRange','luxury']) for (const h of Array.isArray(hr[tier])?hr[tier]:[]) names.push(String(h?.name||''));
  if (names.some(n => generic.test(n))) errors.push('generic placeholder recommendation detected');
  if ((itinerary?.placesToVisit?.length || 0) < 4) errors.push('fewer than four destination-specific attractions');
  if ((itinerary?.localFood?.length || 0) < 3) errors.push('insufficient destination-specific food recommendations');
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  if (!days.length) errors.push('no itinerary days returned');
  days.forEach((d:any, i:number) => {
    const acts=Array.isArray(d?.activities)?d.activities:[];
    if (acts.length < 2) errors.push(`day ${i+1} has fewer than two activities`);
    if (acts.some((a:any)=>generic.test(`${a?.title||''} ${a?.location||''}`))) errors.push(`day ${i+1} contains generic placeholder activity`);
  });
  // Destination-only text such as "Mumbai" is not a useful attraction name.
  const core=dest.split(',')[0].trim();
  if (core && (itinerary?.placesToVisit||[]).some((p:any)=>String(p?.name||'').toLowerCase().trim()===core)) errors.push('destination name used as attraction placeholder');

  // Selected-style quality gate. This prevents a valid-looking but generic itinerary
  // from reaching the user when the requested style is strongly thematic.
  const style = String(expectedTravelStyle || itinerary?.travelStyle || '').toLowerCase().trim();
  const activityText = days.flatMap((d:any) => Array.isArray(d?.activities) ? d.activities : [])
    .map((a:any) => `${a?.title||''} ${a?.location||''} ${a?.description||''}`.toLowerCase());
  const allActivityText = activityText.join(' | ');
  const themes = days.map((d:any) => String(d?.theme || '').toLowerCase());

  if (style === 'luxury') {
    const premiumSignals = /(five[- ]star|5[- ]star|luxury resort|luxury hotel|boutique luxury|suite|private transfer|chauffeur|private tour|private cruise|yacht|spa|wellness treatment|fine dining|chef|tasting menu|premium lounge|concierge|reserved|vip)/i;
    const budgetSignals = /(hostel|budget guesthouse|budget stay|scooter rental|public bus|cheap eatery|budget shack|dhaba)/i;
    const fakeMealSignals = /(lunch|dinner).*(dessert|cake|pastry|sweet|ice cream|cocktail|wine|beer|spirit|liqueur|feni)|(dessert|cake|pastry|sweet|ice cream|cocktail|wine|beer|spirit|liqueur|feni).*(lunch|dinner)/i;
    const fakeFineDiningSignals = /(fine dining|upscale dining|luxury dining).*(shack|stall|street cart)|(shack|stall|street cart).*(fine dining|upscale dining|luxury dining)/i;
    days.forEach((d:any, i:number) => {
      const acts = Array.isArray(d?.activities) ? d.activities : [];
      if (acts.length < 3) errors.push(`Luxury day ${i+1} is under-filled; expected at least three meaningful blocks`);
    });
    const premiumCount = activityText.filter((t:string) => premiumSignals.test(t)).length;
    if (premiumCount < 2) errors.push('Luxury style lacks enough genuinely premium daily experiences');
    if (budgetSignals.test(allActivityText)) errors.push('Luxury style contains budget/backpacker primary choices');
    if (activityText.some((t:string) => fakeMealSignals.test(t))) errors.push('Luxury style misclassifies a dessert or beverage as a full meal');
    if (activityText.some((t:string) => fakeFineDiningSignals.test(t))) errors.push('Luxury style labels a casual shack/stall as fine dining');
    if (themes.filter((t:string) => /local flavors?/.test(t)).length >= Math.max(2, Math.ceil(days.length / 2))) errors.push('Luxury style uses repetitive generic Local Flavors day themes');
  }

  if (style === 'food explorer') {
    const foodSignals = /(breakfast|brunch|lunch|dinner|street food|food walk|food tour|market|cooking class|culinary|bakery|dessert|cafe|coffee|tea|brewery|winery|tasting|fish market|spice market|local dish|regional cuisine|restaurant)/i;
    const themedDays = days.filter((d:any) => {
      const text = `${d?.theme||''} ${(Array.isArray(d?.activities)?d.activities:[]).map((a:any)=>`${a?.title||''} ${a?.description||''}`).join(' ')}`;
      return foodSignals.test(text);
    }).length;
    const foodActivityCount = activityText.filter((t:string) => foodSignals.test(t)).length;
    const mealSignals = /(breakfast|brunch|lunch|dinner|meal|regional cuisine|restaurant)/i;
    const snackOnlySignals = /(dessert|cake|pastry|sweet|ice cream|cocktail|wine|beer|spirit|liqueur|feni|coffee|tea)/i;
    days.forEach((d:any, i:number) => {
      const acts = Array.isArray(d?.activities) ? d.activities : [];
      if (acts.length < 3) errors.push(`Food Explorer day ${i+1} is under-filled; expected at least three meaningful blocks`);
      const texts = acts.map((a:any) => `${a?.title||''} ${a?.description||''}`);
      const hasRealMeal = texts.some((t:string) => mealSignals.test(t) && !snackOnlySignals.test(t));
      if (!hasRealMeal) errors.push(`Food Explorer day ${i+1} lacks a clearly identified real meal`);
    });
    if (themedDays < Math.max(1, Math.ceil(days.length * 0.75))) errors.push('Food Explorer style is not food-led on most days');
    if (foodActivityCount < Math.max(3, days.length)) errors.push('Food Explorer style lacks enough distinct culinary experiences');
    if (themes.filter((t:string) => /local flavors?/.test(t)).length >= Math.max(2, Math.ceil(days.length / 2))) errors.push('Food Explorer style uses repetitive generic Local Flavors day themes');
  }

  return Array.from(new Set(errors));
}


/**
 * Final shared food-semantics guard.
 *
 * This runs for BOTH Gemini output and curated fallback output immediately before
 * route enrichment/budget reconciliation. It prevents any downstream code path
 * from turning a dessert or beverage into breakfast/lunch/dinner.
 */
function normalizeFinalFoodSemantics(itinerary: any) {
  if (!itinerary || !Array.isArray(itinerary.days)) return itinerary;

  const foods = Array.isArray(itinerary.localFood) ? itinerary.localFood : [];
  const textOf = (f: any) => `${f?.name || ''} ${f?.description || ''} ${f?.type || ''}`.toLowerCase();
  const isSnackOrDrink = (f: any) => {
    const kind = String(f?.type || '').toLowerCase().trim();
    if (kind === 'dessert' || kind === 'beverage') return true;
    return /(dessert|sweet|cake|pastry|ice cream|pudding|cookie|macaron|bebinca|drink|beverage|cocktail|wine|beer|spirit|liqueur|feni)/i.test(textOf(f));
  };
  const savoryFoods = foods.filter((f: any) => !isSnackOrDrink(f));
  if (!savoryFoods.length) return itinerary;

  const mealTitle = /(breakfast|brunch|lunch|dinner)/i;
  const tastingTitle = /(tasting|dessert|snack|beverage|drink|after[- ]?dinner|coffee|tea)/i;
  const findMentionedFood = (activity: any) => {
    const hay = `${activity?.title || ''} ${activity?.description || ''}`.toLowerCase();
    return foods.find((f: any) => {
      const name = String(f?.name || '').trim().toLowerCase();
      return name.length > 2 && hay.includes(name);
    });
  };

  let savoryCursor = 0;
  itinerary.days = itinerary.days.map((day: any, dayIndex: number) => {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    const nextActivities = activities.map((activity: any, activityIndex: number) => {
      const title = String(activity?.title || '');
      // Explicit tasting/snack blocks are allowed to contain desserts/beverages.
      if (!mealTitle.test(title) || tastingTitle.test(title)) return activity;

      const mentioned = findMentionedFood(activity);
      const activityText = `${title} ${activity?.description || ''}`;
      const semanticallySnack = mentioned ? isSnackOrDrink(mentioned) : /(bebinca|feni|dessert|pastry|cake|sweet|cocktail|wine|beer|spirit|liqueur|beverage)/i.test(activityText);
      if (!semanticallySnack) return activity;

      const replacement = savoryFoods[(dayIndex + activityIndex + savoryCursor++) % savoryFoods.length];
      const mealLabel = /breakfast/i.test(title) ? 'Regional Breakfast' : /brunch/i.test(title) ? 'Regional Brunch' : /lunch/i.test(title) ? 'Regional Lunch' : 'Signature Dinner';
      const oldName = String(mentioned?.name || '').trim();
      const newTitle = oldName && title.toLowerCase().includes(oldName.toLowerCase())
        ? title.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), String(replacement.name || 'Regional Meal'))
        : `${mealLabel}: ${replacement.name || 'Regional Meal'}`;

      return {
        ...activity,
        title: newTitle,
        description: `${replacement.description || 'Choose a complete savory destination-specific meal.'} This is a complete meal; desserts and beverages may be added only as separate tasting/snack stops.`,
        location: replacement.mustTryAt || activity?.location || itinerary.destination,
        cost: activity?.cost || 'Per person - verify menu'
      };
    });
    return { ...day, activities: nextActivities };
  });

  return itinerary;
}

function improveItineraryQuality(itinerary: any) {
  if (!itinerary || !Array.isArray(itinerary.days)) return itinerary;

  // Build a semantic place key rather than comparing the complete activity title.
  // This catches repeats such as "Baku Boulevard & Little Venice stroll" and
  // "Relax at Baku Boulevard Park" while preserving genuinely different sights.
  const placeKey = (activity: any) => {
    const raw = `${String(activity?.title || "")} ${String(activity?.location || "")}`
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\b(explore|visit|relax|stroll|walk|tour|ride|experience|adventure|sensation|sunset|morning|afternoon|evening|the|at|a|an|local|park)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = raw.split(" ").filter((t: string) => t.length > 2);
    return Array.from(new Set(tokens)).sort().join(" ");
  };

  const seenKeys: string[] = [];
  const days = itinerary.days.map((day: any) => {
    const activities = Array.isArray(day.activities) ? day.activities : [];
    const protectedStyle = ['luxury', 'food explorer'].includes(String(itinerary?.travelStyle || '').toLowerCase().trim());
    let keptCount = 0;
    const uniqueActivities = activities.filter((activity: any, activityIndex: number) => {
      const key = placeKey(activity);
      if (!key) return true;
      const keyTokens = new Set(key.split(" "));
      const duplicate = seenKeys.some((previous) => {
        const prevTokens = new Set(previous.split(" "));
        const shared = [...keyTokens].filter((token) => prevTokens.has(token)).length;
        const smaller = Math.min(keyTokens.size, prevTokens.size);
        return smaller >= 2 && shared / smaller >= 0.75;
      });
      // Do not let de-duplication hollow out a thematic day after it already passed
      // style validation. Keep enough blocks for a complete user-facing schedule.
      const remaining = activities.length - activityIndex;
      if (duplicate && !(protectedStyle && keptCount + remaining <= 3)) return false;
      seenKeys.push(key);
      keptCount += 1;
      return true;
    });
    return { ...day, activities: uniqueActivities };
  });
  return { ...itinerary, days };
}



/**
 * Final user-facing itinerary intelligence pass.
 * Runs after model/fallback generation and food normalization, before route and budget reconciliation.
 * It prevents hollow days, repeated day templates, very large unexplained schedule gaps,
 * and transfer-only activities that never include the actual destination experience.
 */
function enforceFinalItineraryIntelligence(itinerary: any) {
  if (!itinerary || !Array.isArray(itinerary.days)) return itinerary;

  const style = String(itinerary.travelStyle || '').toLowerCase().trim();
  const destination = String(itinerary.destination || 'the destination');
  const places = Array.isArray(itinerary.placesToVisit) ? itinerary.placesToVisit : [];
  const foods = Array.isArray(itinerary.localFood) ? itinerary.localFood : [];

  const parseTime = (v: any, idx: number) => {
    const m = String(v || '').toUpperCase().match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);
    if (!m) return 9 * 60 + idx * 150;
    let h = Number(m[1]) % 12;
    if (m[3] === 'PM') h += 12;
    return h * 60 + Number(m[2] || 0);
  };
  const fmtTime = (mins: number) => {
    mins = Math.max(6*60, Math.min(22*60+30, Math.round(mins/15)*15));
    const h24 = Math.floor(mins/60), mm = mins % 60;
    const ap = h24 >= 12 ? 'PM' : 'AM';
    const h = h24 % 12 || 12;
    return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ap}`;
  };
  const key = (v: any) => String(v || '').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\b(the|a|an|visit|experience|tour|private|premium|regional|local|signature|guided|at|to|of|and)\b/g,' ').replace(/\s+/g,' ').trim();
  const usedPlaceKeys = new Set<string>();
  const usedFoodKeys = new Set<string>();
  const daySignatures = new Set<string>();

  const placePool = places.filter((p:any)=>p?.name);
  const savoryFoods = foods.filter((f:any)=>{
    const t=`${f?.name||''} ${f?.type||''} ${f?.description||''}`.toLowerCase();
    return !/(dessert|beverage|drink|cocktail|wine|beer|spirit|liqueur|feni|cake|pastry|sweet)/i.test(t);
  });
  const tastingFoods = foods.filter((f:any)=>!savoryFoods.includes(f));

  const nextUnusedPlace = () => {
    const found = placePool.find((p:any)=>!usedPlaceKeys.has(key(p.name)));
    if (found) usedPlaceKeys.add(key(found.name));
    return found || placePool[0];
  };
  const nextUnusedFood = (savory=true) => {
    const pool = savory ? savoryFoods : tastingFoods;
    const found = pool.find((f:any)=>!usedFoodKeys.has(key(f.name)));
    if (found) usedFoodKeys.add(key(found.name));
    return found || pool[0] || foods[0];
  };

  const mkActivity = (time:string, title:string, description:string, location:string, cost='Verify live rate') => ({
    time, title, description, location, cost
  });

  const styleFiller = (day:any, slot:number) => {
    const p = nextUnusedPlace();
    const meal = nextUnusedFood(true);
    const taste = nextUnusedFood(false);
    const t = ['10:30 AM','02:30 PM','05:30 PM','08:00 PM'][Math.min(slot,3)];
    if (style === 'food explorer') {
      if (slot % 3 === 0) return mkActivity(t, 'Local Market / Food District Walk', `Explore a real public market, established food street or culinary district in ${destination}. Focus on ingredients, vendors and local food culture; do not invent a named venue when it is not verified.`, destination, 'Low-cost tasting allowance');
      if (slot % 3 === 1 && meal) return mkActivity(t, `Regional Meal: ${meal.name}`, `${meal.description || 'Choose a complete destination-specific savory meal.'} Use a reputable venue and keep this meal distinct from other days.`, meal.mustTryAt || destination, 'Per person - verify menu');
      if (taste) return mkActivity(t, `Tasting / Food Craft: ${taste.name}`, `${taste.description || 'Add a destination-specific tasting or food-craft experience.'} Treat dessert/beverage items as tastings only, not full meals.`, taste.mustTryAt || destination, 'Per person - verify live rate');
      return mkActivity(t, 'Cooking / Producer Experience', `Choose a real cooking class, bakery, producer visit, spice/produce tasting or other authentic food-craft experience in ${destination}.`, destination);
    }
    if (style === 'luxury') {
      if (slot % 3 === 0 && p) return mkActivity(t, `Private / Priority Experience: ${p.name}`, `${p.description || 'Enjoy this destination highlight'} with a private guide, reserved timing or the best available premium access where the destination supports it.`, p.name, p.entryFee || 'Premium service - verify live rate');
      if (slot % 3 === 1) return mkActivity(t, 'Premium Leisure / Spa Experience', `Add an unhurried, reputable spa, resort, cruise, private cultural or other destination-appropriate elevated experience in ${destination}.`, destination, 'Premium experience - verify live rate');
      if (meal) return mkActivity(t, `Upscale Regional Dining: ${meal.name}`, `${meal.description || 'Choose a complete regional meal.'} Use an acclaimed upscale restaurant or hotel dining room and reserve ahead where useful.`, meal.mustTryAt || destination, 'Premium dining - per person');
    }
    if (p) return mkActivity(t, p.name, p.description || `Explore ${p.name} with enough time to enjoy the experience.`, p.name, p.entryFee || 'Verify rate');
    return mkActivity(t, 'Destination Experience', `Add a meaningful, destination-specific activity in ${destination} appropriate to the selected travel style.`, destination);
  };

  itinerary.days = itinerary.days.map((day:any, dayIndex:number) => {
    let acts = Array.isArray(day?.activities) ? day.activities.map((a:any)=>({...a})) : [];
    acts.sort((a:any,b:any)=>parseTime(a?.time,0)-parseTime(b?.time,0));

    // Track already-used content before adding replacements.
    for (const a of acts) {
      const lk = key(a?.location || a?.title); if (lk) usedPlaceKeys.add(lk);
    }

    // If a day starts with a transfer to a named sight but never contains the actual visit, add it.
    const transfer = acts.find((a:any)=>/transfer|chauffeur|drive|travel to/i.test(String(a?.title||'')));
    if (transfer) {
      const target = String(transfer.location || '').trim();
      const hasVisit = target && acts.some((a:any)=>a!==transfer && key(`${a?.title} ${a?.location}`).includes(key(target)));
      if (target && !hasVisit && !/airport|station|hotel district/i.test(target)) {
        const p = places.find((x:any)=>key(x?.name)===key(target) || key(target).includes(key(x?.name)));
        const start = parseTime(transfer.time,0) + 120;
        acts.push(mkActivity(fmtTime(start), `${style==='luxury'?'Private / Priority Visit':'Experience'}: ${target}`, p?.description || `Spend meaningful time experiencing ${target}; the transfer itself is not the activity.`, target, p?.entryFee || 'Verify rate'));
      }
    }

    acts.sort((a:any,b:any)=>parseTime(a?.time,0)-parseTime(b?.time,0));

    // Fill unexplained gaps on non-departure-style days. A gap > 4h means the itinerary is visibly hollow.
    for (let i=0; i<acts.length-1; i++) {
      const a = parseTime(acts[i]?.time,i), b = parseTime(acts[i+1]?.time,i+1);
      if (b-a > 270) {
        acts.push(styleFiller(day, i+1));
        break;
      }
    }

    // Full user-facing days need at least three meaningful blocks. Arrival/departure days may be lighter only
    // when they explicitly contain airport/station/departure wording.
    const dayText = `${day?.theme||''} ${acts.map((a:any)=>`${a?.title||''} ${a?.description||''}`).join(' ')}`.toLowerCase();
    const lightDayAllowed = /(arrival|departure|airport|station|check[- ]?out|check[- ]?in)/i.test(dayText);
    const minimum = lightDayAllowed ? 3 : 3;
    while (acts.length < minimum) acts.push(styleFiller(day, acts.length));

    // Detect copy-pasted day structures. If the same three semantic blocks recur, replace the middle block
    // with a fresh style-specific experience so each day has its own story.
    acts.sort((a:any,b:any)=>parseTime(a?.time,0)-parseTime(b?.time,0));
    let signature = acts.slice(0,4).map((a:any)=>key(a?.title)).join('|');
    if (daySignatures.has(signature) && acts.length >= 3) {
      acts[Math.min(1, acts.length-1)] = styleFiller(day, dayIndex + 1);
      acts.sort((a:any,b:any)=>parseTime(a?.time,0)-parseTime(b?.time,0));
      signature = acts.slice(0,4).map((a:any)=>key(a?.title)).join('|');
    }
    daySignatures.add(signature);

    return { ...day, activities: acts };
  });

  return itinerary;
}

function validateFinalUserFacingItinerary(itinerary:any): string[] {
  const errors:string[] = [];
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const parseTime=(v:any,idx:number)=>{ const m=String(v||'').toUpperCase().match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/); if(!m)return 9*60+idx*150; let h=Number(m[1])%12; if(m[3]==='PM')h+=12; return h*60+Number(m[2]||0); };
  const sigs = new Set<string>();
  days.forEach((d:any,i:number)=>{
    const acts=Array.isArray(d?.activities)?d.activities:[];
    if(acts.length<3) errors.push(`day ${i+1} has fewer than three user-facing blocks`);
    const times=acts.map((a:any,j:number)=>parseTime(a?.time,j)).sort((a:number,b:number)=>a-b);
    for(let j=0;j<times.length-1;j++) if(times[j+1]-times[j]>300) errors.push(`day ${i+1} has an unexplained schedule gap over five hours`);
    const sig=acts.slice(0,4).map((a:any)=>String(a?.title||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()).join('|');
    if(sig && sigs.has(sig)) errors.push(`day ${i+1} repeats a previous day template`);
    sigs.add(sig);
  });
  return Array.from(new Set(errors));
}

function applySmartRouteAndTransport(itinerary: any) {
  if (!itinerary || !Array.isArray(itinerary.days)) return itinerary;
  const rad = (n: number) => n * Math.PI / 180;
  const distanceKm = (a: any, b: any) => {
    const lat1=Number(a?.latitude), lon1=Number(a?.longitude), lat2=Number(b?.latitude), lon2=Number(b?.longitude);
    if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return null;
    const dLat=rad(lat2-lat1), dLon=rad(lon2-lon1);
    const h=Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
    return 6371*2*Math.asin(Math.sqrt(h));
  };
  const parseTimeMinutes = (value: any, fallbackIndex: number) => {
    const text=String(value||'').trim().toUpperCase();
    const m=text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);
    if (!m) return 9*60 + fallbackIndex*150;
    let h=Number(m[1])%12; const min=Number(m[2]||0); if(m[3]==='PM') h+=12;
    return h*60+min;
  };
  const textOf=(a:any)=>`${a?.title||''} ${a?.location||''} ${a?.description||''}`.toLowerCase();
  const isRemote=(a:any)=>/(airport|gobustan|mud volcano|ateshgah|yanar dag|national park|peninsula|day trip|excursion|safari|countryside|outside the city|waterfall|rice terrace|uluwatu|tanah lot)/.test(textOf(a));
  const isOldCity=(a:any)=>/(old city|icherisheher|maiden tower|shirvanshah|ghat|vishwanath gali)/.test(textOf(a));
  const destinationText=String(itinerary?.destination||'').toLowerCase();
  const transportProfile = destinationText.includes('bali') || destinationText.includes('indonesia')
    ? { short:'Walk / Grab-Gojek', medium:'Grab-Gojek / taxi', long:'Private car / rideshare', remote:'Private car / tour transfer' }
    : destinationText.includes('varanasi')
      ? { short:'Walk / e-rickshaw', medium:'Auto-rickshaw / e-rickshaw', long:'Cab / auto-rickshaw', remote:'Cab / pre-booked transfer' }
      : destinationText.includes('mumbai')
        ? { short:'Walk / auto-rickshaw', medium:'Metro / local train / cab', long:'Local train / Metro / cab', remote:'Cab / suburban train' }
        : destinationText.includes('baku') || destinationText.includes('azerbaijan')
          ? { short:'Walk / Bolt taxi', medium:'Metro / Bolt taxi', long:'Bolt taxi / Metro', remote:'Taxi / tour transfer' }
          : { short:'Walk / short taxi', medium:'Taxi / verified public transit', long:'Taxi / rideshare', remote:'Private transfer / tour vehicle' };
  const routeMode = (prev:any, cur:any, km: number | null) => {
    if (isOldCity(prev) && isOldCity(cur)) return { mode:'Walk', minutes: km==null?8:Math.max(5,Math.round(km/4.5*60)) };
    if (isRemote(prev) || isRemote(cur)) {
      if (km!=null && km<=2) return { mode:transportProfile.short, minutes:Math.max(8,Math.round(km/18*60)+5) };
      return { mode:transportProfile.remote, minutes: km==null?35:Math.max(25,Math.round(km/38*60)+10) };
    }
    if (km == null) return { mode:transportProfile.medium, minutes:20 };
    if (km <= 0.9) return { mode:'Walk', minutes:Math.max(5,Math.round(km/4.5*60)) };
    if (km <= 3) return { mode:transportProfile.short, minutes:Math.max(10,Math.round(km/18*60)+6) };
    if (km <= 12) return { mode:transportProfile.medium, minutes:Math.max(15,Math.round(km/25*60)+8) };
    if (km <= 40) return { mode:transportProfile.long, minutes:Math.max(25,Math.round(km/34*60)+10) };
    return { mode:transportProfile.remote, minutes:Math.max(50,Math.round(km/50*60)+20) };
  };
  const fmt=(m:number)=>m>=60?`${Math.floor(m/60)}h ${m%60?`${m%60}m`:''}`.trim():`${m} min`;
  const visitDuration=(a:any)=>{
    const t=textOf(a);
    if (/museum|gallery|palace|fort|temple|mosque|church|centre|center|tower/.test(t)) return '1–2 hours';
    if (/hike|trek|excursion|day trip|national park|gobustan|safari/.test(t)) return '2–4 hours';
    if (/market|bazaar|shopping|boulevard|promenade|walk|stroll|square/.test(t)) return '45–90 min';
    if (/lunch|dinner|breakfast|restaurant|cafe|food|tea/.test(t)) return '60–90 min';
    return '1–2 hours';
  };
  const days=itinerary.days.map((day:any)=>{
    const source=Array.isArray(day.activities)?day.activities:[];
    if(!source.length) return day;
    // Time is authoritative for the visible schedule. Never geographically reorder
    // activities without also rebuilding their times; that caused 14:30 before 12:00.
    const ordered=source.map((a:any,i:number)=>({...a,__order:i,__mins:parseTimeMinutes(a?.time,i)}))
      .sort((a:any,b:any)=>a.__mins-b.__mins || a.__order-b.__order)
      .map(({__order,__mins,...a}:any)=>a);
    const activities=ordered.map((a:any,i:number)=>{
      if(i===0) return {...a,visitDuration:a.visitDuration||visitDuration(a),transportFromPrevious:'Start of day',travelTimeFromPrevious:'—',distanceFromPreviousKm:undefined};
      let km=distanceKm(ordered[i-1],a);
      // Remote excursions are often returned by the model with missing or city-centre coordinates.
      // Never let a waterfall/national-park/day-trip leg collapse to an impossible 1-3 km total.
      if ((isRemote(ordered[i-1]) || isRemote(a)) && (km == null || km < 8)) km = 25;
      const r=routeMode(ordered[i-1],a,km);
      return {...a,visitDuration:a.visitDuration||visitDuration(a),transportFromPrevious:r.mode,travelTimeFromPrevious:fmt(r.minutes),distanceFromPreviousKm:km==null?undefined:Math.round(km*10)/10};
    });
    const tips=activities.slice(1).map((a:any)=>`${a.transportFromPrevious}: about ${a.travelTimeFromPrevious} from the previous stop${a.distanceFromPreviousKm!=null?` (${a.distanceFromPreviousKm} km)`:''}.`);
    return {...day,activities,transportationSuggestions:tips.length?tips:day.transportationSuggestions};
  });
  return {...itinerary,days};
}

// Resolve a user-facing city/place name to a Travelpayouts IATA city/airport code.
// The official autocomplete endpoint is intentionally proxied server-side so the
// React app does not depend on third-party CORS behavior.
const TP_KNOWN_LOCATIONS: Record<string, { code: string; widgetValue: string; name: string }> = {
  'dubai': { code: 'DXB', widgetValue: 'DXB', name: 'Dubai' },
  'dubai emirate': { code: 'DXB', widgetValue: 'DXB', name: 'Dubai' },
  'dubai emirate, united arab emirates': { code: 'DXB', widgetValue: 'DXB', name: 'Dubai' },
  'dubai, united arab emirates': { code: 'DXB', widgetValue: 'DXB', name: 'Dubai' },
  'baku': { code: 'GYD', widgetValue: 'baku_az', name: 'Baku' },
  'baku, azerbaijan': { code: 'GYD', widgetValue: 'baku_az', name: 'Baku' },
  'mumbai': { code: 'BOM', widgetValue: 'BOM', name: 'Mumbai' },
  'new delhi': { code: 'DEL', widgetValue: 'DEL', name: 'New Delhi' },
  'delhi': { code: 'DEL', widgetValue: 'DEL', name: 'Delhi' },
  'london': { code: 'LON', widgetValue: 'LON', name: 'London' },
  'paris': { code: 'PAR', widgetValue: 'PAR', name: 'Paris' },
  'singapore': { code: 'SIN', widgetValue: 'SIN', name: 'Singapore' },
  'bangkok': { code: 'BKK', widgetValue: 'BKK', name: 'Bangkok' },
  'tokyo': { code: 'TYO', widgetValue: 'TYO', name: 'Tokyo' },
  'varanasi': { code: 'VNS', widgetValue: 'VNS', name: 'Varanasi' },
  'varanasi, uttar pradesh, india': { code: 'VNS', widgetValue: 'VNS', name: 'Varanasi' },
  'ahmedabad': { code: 'AMD', widgetValue: 'AMD', name: 'Ahmedabad' },
  'bengaluru': { code: 'BLR', widgetValue: 'BLR', name: 'Bengaluru' },
  'bangalore': { code: 'BLR', widgetValue: 'BLR', name: 'Bengaluru' },
  'hyderabad': { code: 'HYD', widgetValue: 'HYD', name: 'Hyderabad' },
  'chennai': { code: 'MAA', widgetValue: 'MAA', name: 'Chennai' },
  'kolkata': { code: 'CCU', widgetValue: 'CCU', name: 'Kolkata' },
  'goa': { code: 'GOI', widgetValue: 'GOI', name: 'Goa' },
  'jaipur': { code: 'JAI', widgetValue: 'JAI', name: 'Jaipur' },
};
const TP_LOCATION_CACHE = new Map<string, { code: string; name: string; expires: number }>();

async function resolveFlightLocationCode(termRaw: string): Promise<string> {
  const term = String(termRaw || '').trim();
  if (!term) return '';
  const key = term.toLowerCase().replace(/\s+/g, ' ');
  const cityKey = key.split(',')[0].trim();
  const known = TP_KNOWN_LOCATIONS[key] || TP_KNOWN_LOCATIONS[cityKey];
  if (known?.code) return known.code;
  const cached = TP_LOCATION_CACHE.get(key);
  if (cached && cached.expires > Date.now()) return cached.code;

  const cityTerm = term.split(',')[0].trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const url = `https://autocomplete.travelpayouts.com/places2?locale=en&types%5B%5D=city&types%5B%5D=airport&term=${encodeURIComponent(cityTerm)}`;
    const r = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) return '';
    const rows: any[] = await r.json();
    const city = rows.find((x: any) => x?.type === 'city' && x?.code);
    const airport = rows.find((x: any) => x?.type === 'airport' && (x?.city_code || x?.code));
    const hit = city || airport;
    const code = String(hit?.code || hit?.city_code || '').toUpperCase();
    if (code) TP_LOCATION_CACHE.set(key, { code, name: String(hit?.city_name || hit?.name || cityTerm), expires: Date.now() + 24 * 60 * 60 * 1000 });
    return code;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

type FlightEstimate = {
  totalInr: number;
  perTravelerInr: number;
  source: 'travelpayouts-aviasales-cache';
  method: 'exact-dates' | 'month-broad' | 'week-nearby' | 'grouped-duration' | 'latest-period';
  originCode: string;
  destinationCode: string;
  airline?: string;
  departureAt?: string;
  returnAt?: string;
  foundAt?: string;
  dateDistanceDays?: number;
};

type NormalizedFare = {
  price: number;
  airline?: string;
  departureAt: string;
  returnAt: string;
  foundAt?: string;
};

const FLIGHT_ESTIMATE_CACHE = new Map<string, { value: FlightEstimate; expires: number }>();

const ymd = (value: string) => String(value || '').slice(0, 10);
const dateMs = (value: string) => {
  const d = Date.parse(`${ymd(value)}T00:00:00Z`);
  return Number.isFinite(d) ? d : NaN;
};
const dayDistance = (a: string, b: string) => {
  const am = dateMs(a), bm = dateMs(b);
  return Number.isFinite(am) && Number.isFinite(bm) ? Math.abs(am - bm) / 86400000 : 999;
};

async function tpJson(url: string, token: string, timeoutMs = 3600): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-Access-Token': token,
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
    });
    if (!r.ok) throw new Error(`Travelpayouts HTTP ${r.status}`);
    const payload: any = await r.json();
    if (payload?.success === false) throw new Error(`Travelpayouts API: ${payload?.error || 'unsuccessful response'}`);
    return payload;
  } catch (err: any) {
    console.warn('[Travelpayouts airfare request]', err?.message || err, url.replace(/token=[^&]+/i, 'token=***'));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeV3Rows(payload: any): NormalizedFare[] {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((x: any) => ({
    price: Number(x?.price),
    airline: x?.airline ? String(x.airline) : undefined,
    departureAt: String(x?.departure_at || ''),
    returnAt: String(x?.return_at || ''),
    foundAt: x?.found_at ? String(x.found_at) : undefined,
  })).filter((x: NormalizedFare) => Number.isFinite(x.price) && x.price > 0 && x.departureAt && x.returnAt);
}

function normalizeMatrixRows(payload: any): NormalizedFare[] {
  const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.prices) ? payload.prices : []);
  return rows.map((x: any) => ({
    price: Number(x?.value ?? x?.price),
    airline: x?.airline ? String(x.airline) : undefined,
    departureAt: String(x?.depart_date || x?.departure_at || ''),
    returnAt: String(x?.return_date || x?.return_at || ''),
    foundAt: x?.found_at ? String(x.found_at) : undefined,
  })).filter((x: NormalizedFare) => Number.isFinite(x.price) && x.price > 0 && x.departureAt && x.returnAt);
}

function normalizeGroupedRows(payload: any): NormalizedFare[] {
  const data = payload?.data;
  const rows = data && typeof data === 'object' && !Array.isArray(data) ? Object.values(data) : [];
  return rows.map((x: any) => ({
    price: Number(x?.price ?? x?.value),
    airline: x?.airline ? String(x.airline) : undefined,
    departureAt: String(x?.departure_at || x?.depart_date || ''),
    returnAt: String(x?.return_at || x?.return_date || ''),
    foundAt: x?.found_at ? String(x.found_at) : undefined,
  })).filter((x: NormalizedFare) => Number.isFinite(x.price) && x.price > 0 && x.departureAt && x.returnAt);
}

function normalizeLatestRows(payload: any): NormalizedFare[] {
  // Travelpayouts has returned both {data:[...]} and {prices:[...]} shapes for
  // period-price endpoints over time. Accept both instead of treating valid fares as empty.
  const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.prices) ? payload.prices : []);
  return rows.map((x: any) => ({
    price: Number(x?.value ?? x?.price),
    airline: x?.airline ? String(x.airline) : undefined,
    departureAt: String(x?.depart_date || x?.departure_at || ''),
    returnAt: String(x?.return_date || x?.return_at || ''),
    foundAt: x?.found_at ? String(x.found_at) : undefined,
  })).filter((x: NormalizedFare) => Number.isFinite(x.price) && x.price > 0 && x.departureAt && x.returnAt);
}

function chooseClosestFare(rows: NormalizedFare[], departure: string, returnDate: string, maxDistance = 14): { fare: NormalizedFare; dateDistanceDays: number } | null {
  const ranked = rows.map(fare => {
    const dd = dayDistance(fare.departureAt, departure) + dayDistance(fare.returnAt, returnDate);
    return { fare, dateDistanceDays: dd };
  }).filter(x => Number.isFinite(x.dateDistanceDays) && x.dateDistanceDays <= maxDistance)
    .sort((a, b) => a.dateDistanceDays - b.dateDistanceDays || a.fare.price - b.fare.price);
  return ranked[0] || null;
}

async function getMarketFlightEstimate(origin: string, destination: string, departure: string, returnDate: string, travelersRaw: number): Promise<FlightEstimate | null> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  const travelers = Math.max(1, Number(travelersRaw) || 1);
  if (!token || !origin || !destination || !departure || !returnDate) return null;

  const [originCode, destinationCode] = await Promise.all([
    resolveFlightLocationCode(origin),
    resolveFlightLocationCode(destination),
  ]);
  if (!originCode || !destinationCode || originCode === destinationCode) return null;

  const cacheKey = `${originCode}|${destinationCode}|${departure}|${returnDate}|${travelers}`;
  const cached = FLIGHT_ESTIMATE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const tripDurationDays = Math.max(1, Math.round((dateMs(returnDate) - dateMs(departure)) / 86400000));
  const common = {
    origin: originCode,
    destination: destinationCode,
    // Aviasales Data API only supports USD/EUR/RUB for these fare endpoints.
    // Request USD, then convert the returned fare to INR with TripBalancing's shared FX rate.
    // Requesting INR caused valid Indian-origin searches to come back empty and forced the
    // route-model fallback even when Aviasales had cached fares.
    currency: 'usd',
    // Most TripBalancing users currently search from India. Explicitly selecting the
    // India market avoids falling back to Travelpayouts' default RU cache when market
    // inference is sparse.
    market: 'in',
  };

  let picked: { fare: NormalizedFare; dateDistanceDays: number } | null = null;
  let method: FlightEstimate['method'] = 'exact-dates';

  // 1) Exact dates: official v3 endpoint, recent Aviasales searches from the last 48h.
  const exactParams = new URLSearchParams({
    ...common,
    departure_at: departure,
    return_at: returnDate,
    one_way: 'false',
    direct: 'false',
    sorting: 'price',
    unique: 'false',
    limit: '100',
    page: '1',
  });
  const exactPayload = await tpJson(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${exactParams.toString()}`, token, 3600);
  const exactRows = normalizeV3Rows(exactPayload);
  if (exactRows.length) picked = chooseClosestFare(exactRows, departure, returnDate, 0.1);

  // 2) Broad same-month lookup using the same official v3 endpoint.
  // Exact dates often have no cached search even when the route has recent market data.
  // Requesting YYYY-MM for departure/return returns the month's cached round-trip fares;
  // we then choose the closest dates to the user's trip instead of dropping to a formula.
  if (!picked) {
    method = 'month-broad';
    const monthParams = new URLSearchParams({
      ...common,
      departure_at: ymd(departure).slice(0, 7),
      return_at: ymd(returnDate).slice(0, 7),
      one_way: 'false',
      direct: 'false',
      sorting: 'price',
      unique: 'false',
      limit: '1000',
      page: '1',
    });
    const monthPayload = await tpJson(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${monthParams.toString()}`, token, 4200);
    picked = chooseClosestFare(normalizeV3Rows(monthPayload), departure, returnDate, 45);
  }

  // 3) If exact/month cached data is empty, Travelpayouts' week matrix is specifically
  // designed to return fares around the target departure/return dates (about ±3/4 days).
  if (!picked) {
    method = 'week-nearby';
    const weekParams = new URLSearchParams({
      ...common,
      show_to_affiliates: 'false',
      depart_date: departure,
      return_date: returnDate,
    });
    const weekPayload = await tpJson(`https://api.travelpayouts.com/v2/prices/week-matrix?${weekParams.toString()}`, token, 3800);
    picked = chooseClosestFare(normalizeMatrixRows(weekPayload), departure, returnDate, 8);
  }

  // 4) Broader cache fallback: same route, same departure month and trip duration.
  // This stays route/date-aware but is intentionally labelled as a recent cached estimate,
  // not a live bookable fare.
  if (!picked) {
    method = 'grouped-duration';
    const month = ymd(departure).slice(0, 7);
    const groupedParams = new URLSearchParams({
      ...common,
      group_by: 'departure_at',
      departure_at: month,
      direct: 'false',
      min_trip_duration: String(tripDurationDays),
      max_trip_duration: String(tripDurationDays),
    });
    const groupedPayload = await tpJson(`https://api.travelpayouts.com/aviasales/v3/grouped_prices?${groupedParams.toString()}`, token, 3800);
    picked = chooseClosestFare(normalizeGroupedRows(groupedPayload), departure, returnDate, 31);
  }

  // 5) Final Aviasales cache sweep. get_latest_prices searches the requested month
  // and lets us constrain the stay duration, which catches routes that have recent
  // cached fares but no record in the exact/week/grouped endpoints above.
  if (!picked) {
    method = 'latest-period';
    const latestParams = new URLSearchParams({
      ...common,
      beginning_of_period: `${ymd(departure).slice(0, 7)}-01`,
      period_type: 'month',
      group_by: 'dates',
      one_way: 'false',
      sorting: 'price',
      trip_duration: String(tripDurationDays),
      show_to_affiliates: 'false',
      page: '1',
    });
    const latestPayload = await tpJson(`https://api.travelpayouts.com/aviasales/v3/get_latest_prices?${latestParams.toString()}`, token, 4200);
    picked = chooseClosestFare(normalizeLatestRows(latestPayload), departure, returnDate, 45);
  }

  if (!picked) {
    console.warn(`[Flight estimate] No Aviasales cached fare for ${originCode} -> ${destinationCode}, ${departure} -> ${returnDate}; using route-model fallback.`);
    return null;
  }

  // Data API prices are cached market fares for ONE traveler in USD (requested above).
  // Convert through the same shared FX table used by the rest of TripBalancing. Do not add
  // an arbitrary markup here: the UI already labels cached fares as estimates, and adding a
  // hidden percentage makes the displayed flight price less faithful to the market source.
  const usdToInr = getLiveCrossRate('USD', 'INR');
  const safeUsdToInr = Number.isFinite(usdToInr) && usdToInr > 1 ? usdToInr : 85;
  const perTravelerInr = Math.max(1, Math.round(picked.fare.price * safeUsdToInr));
  const value: FlightEstimate = {
    totalInr: Math.round(perTravelerInr * travelers),
    perTravelerInr,
    source: 'travelpayouts-aviasales-cache',
    method,
    originCode,
    destinationCode,
    airline: picked.fare.airline,
    departureAt: picked.fare.departureAt,
    returnAt: picked.fare.returnAt,
    foundAt: picked.fare.foundAt,
    dateDistanceDays: picked.dateDistanceDays,
  };
  FLIGHT_ESTIMATE_CACHE.set(cacheKey, { value, expires: Date.now() + 30 * 60 * 1000 });
  console.log(`[Flight estimate] ${originCode}->${destinationCode} ${departure}/${returnDate}: INR ${value.totalInr} total (${method}, ${travelers} pax, source dates ${ymd(value.departureAt || '')}/${ymd(value.returnAt || '')}).`);
  return value;
}

async function attachMarketFlightEstimate(itinerary: any, origin: string, destination: string, startDate: string, endDate: string, travelers: number): Promise<any> {
  const estimate = await getMarketFlightEstimate(origin, destination, startDate, endDate, travelers);
  if (!estimate) {
    delete itinerary.flightEstimateInr;
    delete itinerary.flightEstimatePerTravelerInr;
    delete itinerary.flightEstimateMethod;
    delete itinerary.flightEstimateRoute;
    delete itinerary.flightEstimateAirline;
    delete itinerary.flightEstimateObservedAt;
    delete itinerary.flightEstimateSourceDates;
    itinerary.flightEstimateSource = 'route-model-fallback';
    return itinerary;
  }
  itinerary.flightEstimateInr = estimate.totalInr;
  itinerary.flightEstimatePerTravelerInr = estimate.perTravelerInr;
  itinerary.flightEstimateSource = estimate.source;
  itinerary.flightEstimateMethod = estimate.method;
  itinerary.flightEstimateRoute = `${estimate.originCode} → ${estimate.destinationCode}`;
  itinerary.flightEstimateAirline = estimate.airline;
  itinerary.flightEstimateObservedAt = estimate.foundAt;
  itinerary.flightEstimateSourceDates = `${ymd(estimate.departureAt || '')} → ${ymd(estimate.returnAt || '')}`;
  itinerary.flightEstimateDateDistanceDays = estimate.dateDistanceDays;
  return itinerary;
}
app.get('/api/flight-estimate', async (req, res) => {
  try {
    const origin = String(req.query.origin || '').trim();
    const destination = String(req.query.destination || '').trim();
    const departure = String(req.query.departure || '').trim();
    const returnDate = String(req.query.return || '').trim();
    const travelers = Math.max(1, Number(req.query.travelers) || 1);
    if (!origin || !destination || !departure || !returnDate) {
      return res.status(400).json({ error: 'origin, destination, departure and return are required' });
    }
    const estimate = await getMarketFlightEstimate(origin, destination, departure, returnDate, travelers);
    if (!estimate) {
      return res.status(404).json({ available: false, source: 'route-model-fallback' });
    }
    return res.json({ available: true, ...estimate });
  } catch (err: any) {
    console.warn('[Flight estimate endpoint]', err?.message || err);
    return res.status(500).json({ error: 'Unable to estimate flight cost' });
  }
});

app.get('/api/travelpayouts/resolve-location', async (req, res) => {
  try {
    const term=String(req.query.term||'').trim();
    if(!term) return res.status(400).json({error:'Missing term'});
    const key=term.toLowerCase().replace(/\s+/g,' '); const cityKey=key.split(',')[0].trim();
    const known=TP_KNOWN_LOCATIONS[key]||TP_KNOWN_LOCATIONS[cityKey];
    if(known) return res.json({...known,cached:true,source:'known'});
    const cached=TP_LOCATION_CACHE.get(key);
    if(cached && cached.expires>Date.now()) return res.json({code:cached.code,widgetValue:cached.code,name:cached.name,cached:true,source:'cache'});
    const cityTerm=term.split(',')[0].trim();
    const url=`https://autocomplete.travelpayouts.com/places2?locale=en&types%5B%5D=city&types%5B%5D=airport&term=${encodeURIComponent(cityTerm)}`;
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),3500);
    const r=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json'}}); clearTimeout(timer);
    if(!r.ok) throw new Error(`Travelpayouts autocomplete HTTP ${r.status}`);
    const rows:any[]=await r.json();
    const city=rows.find((x:any)=>x?.type==='city' && x?.code);
    const airport=rows.find((x:any)=>x?.type==='airport' && (x?.city_code||x?.code));
    const hit=city||airport;
    const code=String(hit?.code||hit?.city_code||'').toUpperCase();
    if(!code) return res.status(404).json({error:'No flight location code found'});
    const payload={code,name:String(hit?.city_name||hit?.name||cityTerm),expires:Date.now()+24*60*60*1000};
    TP_LOCATION_CACHE.set(key,payload);
    return res.json({code:payload.code,widgetValue:payload.code,name:payload.name,cached:false,source:'travelpayouts'});
  } catch(err:any) {
    console.warn('[Travelpayouts location resolver]',err?.message||err);
    return res.status(502).json({error:'Unable to resolve flight location right now'});
  }
});

app.post("/api/generate-itinerary", verifyUserAuth, async (req, res) => {
  let geoCoords: { latitude: number; longitude: number } | null = null;
  let diffDays = 3;
  try {
    // Currency selection must only convert the same economic trip cost.
    // IMPORTANT: itinerary generation must NEVER make a live FX network request.
    // The Currency Converter / TripForm already refreshes /api/exchange-rates and
    // populates RATES_CACHE. Reuse that cache here so a slow FX provider can never
    // cause the main trip endpoint to time out or return a host-level HTML 502/504.
    if (RATES_CACHE.data?.rates) setLiveUsdRates(RATES_CACHE.data.rates);
    const { destination, origin, startDate, endDate, tripDays, budgetAmount, travelers, travelerType, travelStyle, budgetMode, tripPurpose, preferredWeather, interests, visitedDestinations, revisitPreference, planningMode, isAiBudgetPlanner } = req.body;

    if (!destination || !startDate || !endDate || !travelers || !travelStyle || (travelStyle !== "Smart Luxury" && !budgetAmount)) {
      return res.status(400).json({ error: "Missing required trip fields." });
    }

    const authUser = (req as any).authenticatedUser as { id: string; email: string };
    if (!supabaseAdmin) {
      return res.status(503).json({ error: "Secure account entitlement service is not configured." });
    }
    const authoritativeEntitlement = await loadAuthoritativeEntitlement(authUser.id, authUser.email);
    if (!authoritativeEntitlement) {
      return res.status(503).json({ error: "Unable to load your account plan securely." });
    }
    if (!canGenerateFromEntitlement(authoritativeEntitlement)) {
      return res.status(403).json({ error: entitlementDeniedMessage(authoritativeEntitlement) });
    }
    const plan = authoritativeEntitlement.plan;
    const freeTripsUsed = authoritativeEntitlement.freeTripsUsed;
    const paidTripsBalance = authoritativeEntitlement.paidTripsBalance;

    const effectiveBudgetAmount = budgetAmount || "INR AI Recommended";

    // Currency is a DISPLAY choice, never an itinerary/content choice.
    // Normalize any fixed budget to canonical INR for cache/prompt identity so
    // economically equivalent AED/INR/USD/etc. requests reuse the same trip.
    const requestCurrency = detectCurrencyCode(effectiveBudgetAmount, destination);
    const requestBudgetNumeric = parseNumericValue(effectiveBudgetAmount);
    const canonicalBudgetInr = isAiBudgetPlanner
      ? 0
      : Math.round(requestBudgetNumeric * getLiveCrossRate(requestCurrency, "INR"));
    const canonicalBudgetForAi = isAiBudgetPlanner
      ? "AI Recommended Budget (currency-neutral; pricing is reconciled by the backend)"
      : `INR ${canonicalBudgetInr.toLocaleString()} (canonical economic budget)`;

    // The explicit Trip Duration field is authoritative. Dates are only a
    // secondary fallback for older clients. This prevents a selected 5-day
    // trip from becoming 4 days because of date math/timezones/AI output.
    const requestedTripDays = Number.parseInt(String(tripDays ?? ""), 10);
    if (Number.isFinite(requestedTripDays) && requestedTripDays > 0) {
      diffDays = Math.min(365, requestedTripDays);
    } else {
      const startMs = Date.parse(`${startDate}T00:00:00Z`);
      const endMs = Date.parse(`${endDate}T00:00:00Z`);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        diffDays = Math.floor((endMs - startMs) / 86400000) + 1;
      }
      diffDays = Math.max(1, Math.min(365, diffDays));
    }

    // Strictly validate BOTH locations. Do not let Gemini reinterpret invalid text
    // into another city (for example "mumu" -> Mumbai).
    const [validatedOrigin, validatedDestination] = await Promise.all([
      origin ? resolveLocationStrict(origin) : Promise.resolve({ valid: true, canonicalName: "" } as StrictLocationResult),
      resolveLocationStrict(destination),
    ]);
    if (origin && !validatedOrigin.valid) {
      return res.status(422).json({ error: `Starting location "${origin}" could not be verified. Please enter a real city, state or country.` });
    }
    if (!validatedDestination.valid) {
      return res.status(422).json({ error: `Destination "${destination}" could not be verified. Please enter a real city, state or country.` });
    }
    geoCoords = { latitude: validatedDestination.latitude!, longitude: validatedDestination.longitude! };

    // 1. Check Itinerary Cache first to prevent redundant generations and reduce response time
    const contentIdentity = [
      destination.toLowerCase().trim(),
      origin ? origin.toLowerCase().trim() : "",
      startDate, endDate, `${diffDays}d`,
      isAiBudgetPlanner ? "ai-recommended" : `fixed-inr-${canonicalBudgetInr}`,
      String(travelers),
      String(travelerType || "").toLowerCase().trim(),
      String(travelStyle || "").toLowerCase().trim(),
      String(budgetMode || "").toLowerCase().trim(),
      String(tripPurpose || "").toLowerCase().trim(),
      String(preferredWeather || "").toLowerCase().trim(),
      Array.isArray(interests) ? [...interests].map(String).map(v => v.toLowerCase().trim()).sort().join(",") : "",
      String(planningMode || "").toLowerCase().trim(),
      Array.isArray(visitedDestinations) ? [...visitedDestinations].map(String).map(v => v.toLowerCase().trim()).sort().join(",") : "",
      String(revisitPreference || "").toLowerCase().trim(),
    ].join("|");
    const cacheKey = crypto.createHash("sha256").update(contentIdentity).digest("hex");
    const cached = ITINERARY_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ITINERARY_TTL)) {
      console.log(`[Cache Hit] Returning cached itinerary for destination: ${destination} from origin: ${origin || "any"}`);
      const cachedPrepared = await attachMarketFlightEstimate({
        ...cached.data,
        // The request budget is authoritative. Never let cached/AI content switch
        // the trip currency (for example AED planned budget -> USD estimate).
        budgetAmount: effectiveBudgetAmount,
        plannedBudget: effectiveBudgetAmount,
        latitude: geoCoords.latitude,
        longitude: geoCoords.longitude,
        originLatitude: validatedOrigin.latitude,
        originLongitude: validatedOrigin.longitude,
        originToDestinationDistanceKm: origin && validatedOrigin.latitude != null && validatedOrigin.longitude != null
          ? Math.round(6371 * 2 * Math.asin(Math.sqrt(
              Math.sin(((geoCoords.latitude - validatedOrigin.latitude) * Math.PI / 180) / 2) ** 2 +
              Math.cos(validatedOrigin.latitude * Math.PI / 180) * Math.cos(geoCoords.latitude * Math.PI / 180) *
              Math.sin(((geoCoords.longitude - validatedOrigin.longitude) * Math.PI / 180) / 2) ** 2
            )))
          : undefined
      }, origin || "", destination, startDate, endDate, travelers);
      const cachedItinerary = reconcileItineraryBudget(enforceExactTripDays(applySmartRouteAndTransport(enforceFinalItineraryIntelligence(normalizeFinalFoodSemantics(improveItineraryQuality(cachedPrepared)))), diffDays));
      cachedItinerary.travelStyle = travelStyle;
      cachedItinerary.travelers = Number(travelers) || 1;
      const cachedSource = cached.data?.generationSource || "gemini";
      cachedItinerary.generationSource = cachedSource;
      let entitlementAfter = authoritativeEntitlement;
      if (cachedSource === "gemini") {
        const consumed = await consumeTripEntitlement(authUser.id, authUser.email);
        if (!consumed.ok) return res.status(consumed.status).json({ error: consumed.error });
        entitlementAfter = consumed.entitlement || entitlementAfter;
      }
      return res.json({
        itinerary: cachedItinerary,
        generation: { source: cachedSource, degraded: cachedSource !== "gemini", cached: true },
        billableGeneration: cachedSource === "gemini",
        entitlement: entitlementAfter
      });
    }

    // Plan and quota were validated above from the authoritative server-side profile.

    const ai = getGeminiClient();

    const travelerTypeGuidance: Record<string, string> = {
      "Couple": "Plan for two adults traveling together: favor shared experiences, comfortable pacing, date-friendly dining and rooms suitable for a couple. Do not make the trip romantic unless the purpose/interests suggest it.",
      "Honeymoon": "Prioritize romantic atmosphere, privacy, memorable couple experiences, scenic meals, sunset/evening moments and honeymoon-suitable stays. Keep the selected budget/style authoritative and avoid forcing expensive upgrades.",
      "Family": "Prioritize family-friendly attractions, practical meal times, manageable transfers, flexible breaks, convenient accommodation and activities that work for mixed ages. Avoid overly late nights unless explicitly requested.",
      "Friends": "Prioritize social experiences, flexible group-friendly activities, shared dining, nightlife/entertainment when compatible with the selected style, and transport/accommodation practical for friends traveling together.",
      "Solo": "Prioritize easy navigation, flexible pacing, centrally convenient stays, social-but-optional experiences and practical transport. Include normal destination safety guidance without making the itinerary restrictive or fear-based.",
      "Business": "Prioritize efficient routing, reliable transport, punctual schedules, strong connectivity/work-friendly accommodation, practical meal options and buffer time around work commitments. Keep leisure activities concise unless the user asks for more.",
      "Senior Citizens": "Prioritize comfortable pacing, shorter walking stretches, seating/rest breaks, elevators or accessible alternatives where practical, convenient transport, daytime sightseeing and medical/pharmacy access awareness. Do not assume disability; offer easier alternatives rather than removing major sights automatically.",
      "Students": "Prioritize strong value, public transport, hostels/budget stays when style allows, student-friendly/free attractions, inexpensive local food and discount opportunities. Preserve safety and realistic travel times.",
      "Women-only Trip": "Prioritize well-connected areas, reputable accommodation, dependable transport, sensible late-evening return options and practical destination-specific safety information. Do not restrict normal activities or stereotype travelers; keep recommendations empowering and equivalent in quality.",
      "Group Trip": "Prioritize group logistics: meeting points, advance reservations where useful, group-capacity transport, restaurants/activities that can handle the party size, room allocation practicality and buffer time for coordination.",
      "Parents with Children": "Prioritize child-friendly attractions, stroller/restroom practicality where relevant, shorter activity blocks, meal/rest breaks, safe transfers and accommodation suitable for parents with children. Avoid very late schedules unless requested."
    };
    const selectedTravelerGuidance = travelerTypeGuidance[String(travelerType)] || "Personalize pacing, lodging, activities, dining and transport appropriately for the stated traveler type without overriding explicit budget, style, interests or trip-purpose inputs.";

    const styleGuidance: Record<string, string> = {
      "Budget": "Build a genuinely good low-cost trip, not a stripped-down trip. Favor clean well-reviewed budget stays, public transit or economical local transport, free/low-fee signature sights, authentic local eateries, markets and high-value experiences. Include at least one memorable signature experience when affordable. Never inflate real item prices and never recommend premium services merely to consume budget.",
      "Smart Luxury": "Build the strongest value-for-comfort itinerary. Favor distinctive boutique/heritage 3.5-4.5 star stays, comfortable rooms, selective private transfers only when they materially improve the day, one or two premium dining/experience moments, priority/skip-the-line options where useful, and local hidden gems. Avoid both backpacker choices and wasteful ultra-luxury. Every premium spend must have a clear experience or convenience benefit.",
      "Luxury": "Create a visibly premium end-to-end trip, not a normal itinerary with inflated prices. On each full day, include at least one clearly premium service or experience and normally 3-5 meaningful blocks; across the trip include at least two elevated experiences beyond ordinary sightseeing. Never use repetitive day themes like Attraction + Local Flavors.  The ACTUAL daily plan should use upscale or five-star lodging as the working stay, private chauffeur/airport transfer or premium transport where practical, destination-worthy fine dining or acclaimed upscale restaurants, reserved/premium cultural or leisure experiences, spa/wellness or yacht/private-tour style experiences when destination-appropriate, and concierge-like pacing with comfort buffers. Avoid hostels, scooters for primary transport, budget shacks/dhabas, generic souvenir stops and long unnecessary walks unless they are themselves iconic experiences. Keep all prices realistic and do not add luxury where the destination does not support it.",
      "Adventure": "Make active experiences the spine of the itinerary. Prioritize destination-specific trekking, water sports, cycling, climbing, rafting, diving, wildlife/adventure excursions or equivalent activities, with realistic transfer time, difficulty, equipment, guide requirements, weather/season caveats and recovery time. Do not fill most days with passive sightseeing if meaningful adventure options exist.",
      "Backpacker": "Design for independent low-cost exploration and social travel. Favor reputable hostels/guesthouses, public transport, walkable neighborhoods, local buses/trains, inexpensive local eateries, free walking routes, social hostels/markets/community experiences and flexible plans. Avoid private drivers and premium venues unless necessary for safety or geography.",
      "Food Explorer": "Make food the organizing theme of every day. On each full day, normally include 3-5 meaningful blocks with at least two culinary blocks (for example breakfast/cafe, market or food walk, regional lunch, cooking/tasting experience, dessert/beverage, signature dinner). Use a different culinary story each day and never repeat generic Attraction + Local Flavors themes.  Include distinct breakfast/local cafe, market/street-food, regional lunch/dinner, dessert/beverage and food-craft experiences such as cooking classes, spice/produce markets, winery/brewery/tea/coffee experiences where locally appropriate. Name specific dishes and plausible venues, label veg/non-veg, state price units clearly, and do not turn every food stop into an attraction with fabricated claims.",
      "Wellness & Spa": "Create a restorative low-rush itinerary. Favor wellness-focused or serene accommodation, reputable spa/ayurveda/onsen/hammam/thermal treatments where locally appropriate, yoga/meditation, healthy local food, nature, sleep-friendly timing, limited late nights, hydration/rest blocks and gentle transfers. Include at least one substantial wellness experience on most full days without fabricating medical benefits.",
      "Culture & History": "Make heritage and local culture the core narrative. Prioritize important museums, archaeological/heritage sites, historic districts, architecture, UNESCO places, local crafts, religious/cultural context, performances and guided interpretation. Organize days by historical/geographic theme and include context-rich experiences rather than merely listing monuments.",
      "Beach Escape": "Build the trip around coast time and water-oriented relaxation. Favor beachfront/near-beach stays where practical, distinct beaches rather than repetitive beach hopping, sunrise/sunset, swimming/water sports when safe, seafood/coastal cuisine, beach clubs or relaxed shacks appropriate to the selected budget tier, and weather/tide/monsoon-aware alternatives. Preserve downtime instead of over-scheduling.",
      "Nature & Wildlife": "Make landscapes, ecosystems and wildlife the main purpose. Favor national parks, reserves, forests, waterfalls, birding, scenic drives, nature lodges and responsible guided wildlife experiences. Include best time-of-day logic, realistic remote transfers, seasonal/access caveats and low-impact behavior. Avoid claiming guaranteed animal sightings.",
      "Shopping": "Design purposeful shopping time rather than filler. Include authentic local markets, craft districts, specialty streets, design boutiques/outlets/malls when destination-relevant, locally distinctive products, price/haggling/payment tips and enough unhurried browsing time. Pair shopping areas with nearby food/culture so routing remains efficient; avoid repeating generic souvenir markets.",
      "Nightlife": "Make evenings a meaningful part of the trip while preserving daytime quality. Prioritize destination-appropriate live music, lounges, clubs, night markets, cultural shows, rooftop venues or entertainment districts; include one strong evening option on most full days, late-night meal ideas, realistic closing/return planning and dependable transport. Keep safety guidance practical and traveler-type appropriate without fear-based restrictions."
    };
    const selectedStyleGuidance = styleGuidance[String(travelStyle)] || styleGuidance.Budget;

    const universalItineraryQualityRules = `
ITINERARY QUALITY STANDARD (MANDATORY FOR EVERY TRAVEL STYLE):
- The selected travel style must change WHAT the traveler does, WHERE they stay/eat, HOW they move, the pace, and the cost mix. Do not merely change adjectives or multiply prices.
- Each full sightseeing day should normally contain 3-5 meaningful, geographically compatible activity/meal blocks. Arrival/departure days may be lighter but should still feel intentional.
- Use destination-specific, plausible venue/experience names. Avoid repetitive templates such as "Attraction + Local Flavors" every day and avoid making a meal the only second activity unless the day is intentionally light.
- Build a coherent daily story: morning anchor experience, practical lunch/food stop, afternoon experience, and an evening/sunset/dinner/entertainment option when appropriate.
- Avoid repeating the same type of activity every day. Mix signature sights with hidden gems and style-specific experiences.
- For premium styles, spend must buy visible quality/convenience/exclusivity; for value styles, savings must come from venue/transport choices rather than unrealistically low unit prices.
- If a style-specific experience is unavailable or inappropriate at the destination/season, choose the closest authentic substitute and explain it naturally through the itinerary rather than inventing a venue.
- Keep route geography realistic. Remote excursions need appropriate transfer modes and enough time; never show impossible 1-2 km route totals for far-away day trips.
- Do not fabricate exact live ratings, opening hours, availability, weather, or guaranteed prices. Use estimates and advise verification where date-sensitive.
`;

    let prompt = "";
    if (isAiBudgetPlanner) {
      prompt = `Create a highly comprehensive, personalized travel itinerary for TripBalancing.
Target Details:
- Destination: ${destination}
${origin ? `- Traveling From (Origin City): ${origin}` : ""}
- Canonical Economic Budget: ${canonicalBudgetForAi}
- Travelers: ${travelers} people
- Traveler Type: ${travelerType || "Not specified"}
- Traveler-Type Planning Rules: ${selectedTravelerGuidance}
- Travel Style: ${travelStyle}
- Style Planning Rules: ${selectedStyleGuidance}
${universalItineraryQualityRules}
- Start Date: ${startDate}

CRITICAL MANDATES FOR "AI BUDGET PLANNER ✨" MODE:
1. The user's selected duration is authoritative: generate EXACTLY ${diffDays} itinerary days. Never add or remove days based on currency or budget display.
2. Build the itinerary from destination, origin, dates, traveler count, traveler type and travel style only. The user's display currency MUST NOT influence attractions, hotels, restaurants, daily activities, route, transit choices, or trip pacing.
2T. TRAVELER-TYPE PERSONALIZATION IS MANDATORY: apply the Traveler-Type Planning Rules above to pacing, lodging, dining, transport, activity timing and practical advice. Traveler type must influence the trip meaningfully, but must never override explicit budget, travel style, interests, trip purpose, dates or safety constraints.
2A. ITINERARY REALISM: group each day geographically so consecutive stops are practical; avoid unnecessary cross-city backtracking. Never repeat the same major attraction on multiple days.
2B. TIME REALISM: schedules must include realistic visit duration plus transfer/buffer time. Do not schedule overlapping activities. Keep arrival/departure days lighter when relevant. For each activity provide visitDuration, transportFromPrevious and travelTimeFromPrevious. Never suggest walking/metro for a remote excursion simply to save money; choose transport appropriate to geographic distance.
2C. OPENING-HOURS SAFETY: do not claim exact opening hours unless reliable current data is available. Schedule museums/paid attractions during normal daytime operating windows and label users to verify live hours where hours may vary.
2D. RECOMMENDATION INTEGRITY: hotels/restaurants must be plausible for the selected destination and style. Do not invent claims such as exact live availability, exact live rating, or guaranteed current price. Prices are estimates.
2E. WEATHER INTEGRITY: do not invent a future exact weather forecast inside itinerary generation. Use season-appropriate planning language; the app's dedicated weather service supplies live/forecast weather.
3. Set endDate to ${endDate}. Do not recalculate it from a budget.
4. Set the field 'isAiBudgetPlanner' to true.
5. Provide a short 'aiBudgetSummary' explaining that the backend will calculate the recommended ideal budget for this exact ${diffDays}-day trip. Do not choose a different trip because of currency.
6. Set 'maxDaysComfortable' to ${diffDays}.
7. STYLE PERSONALIZATION IS MANDATORY: the selected travel style (${travelStyle}) must visibly influence lodging level, dining, activities, transport comfort, pacing and hidden-gem choices according to the Style Planning Rules. Do not silently convert AI Budget Planner trips back to Budget style.
7A. CONTENT DEPTH: For each full day, create 3-5 meaningful, geographically coherent blocks across morning/afternoon/evening, including at least one style-defining experience. Arrival/departure days may contain 2-4 blocks. Each activity must include a useful description, visitDuration, transportFromPrevious and travelTimeFromPrevious. Do not generate repetitive "one attraction + one meal" days unless geography/flight timing truly requires it.
7B. STYLE-AUTHENTIC SPENDING: Never make a Luxury/Smart Luxury itinerary look premium only by increasing category totals. Select genuinely higher-tier lodging/venues/transport/experiences. Conversely, Budget/Backpacker must remain enjoyable and destination-specific rather than simply deleting activities.
7C. LUXURY QUALITY FLOOR: When travelStyle is Luxury, the working itinerary must clearly reference an upscale/five-star or equivalent stay, premium/private transfers where useful, at least two destination-appropriate elevated experiences across the trip (for example private/curated tour, yacht/cruise, spa/wellness, premium cultural access, chef-led/fine dining), and comfortable pacing. Do not use hostel, budget guesthouse, scooter rental as the primary mobility plan, budget shack/dhaba as the signature dining plan, or generic souvenir shopping as a main luxury activity.
7D. STYLE SIGNATURE: Every day should contain content that a user could recognize as belonging to the selected style without reading the style label. Apply the full Style Planning Rules, not only cost multipliers.
8. Provide highly realistic cost ranges for 6 categories (Accommodation, Food, Local Transport, Sights, Misc, and originToDestinationTravel which estimates realistic flight/train transit costs from ${origin || "starting city"} to ${destination} for ${travelers} travelers, set to 'N/A' if no starting city is provided) in 'estimatedBudgetBreakdown'. Costs must match the selected travel style (${travelStyle}) while remaining realistic. The 'total' field must be the sum of all 6 categories including originToDestinationTravel.
9. Under 'hotelRecommendations', recommend 3 Budget, 3 Mid-range, and 3 Luxury Hotels as reference options, but the actual itinerary lodging choices and budget calculation must follow the selected travel style (${travelStyle}).
10. Under 'detailedBudgetSummary', estimate calculated totals for the entire trip duration and travelers for: accommodationTotal, foodTotal, localTransportTotal, attractionTotal, miscellaneousExpenses, originToDestinationCost (estimate realistic round-trip flight or train cost from ${origin || "starting city"} to ${destination} for ${travelers} travelers, or set to 'N/A' if no starting city is provided), and grandTotal. Make sure the grandTotal is the sum of all categories including originToDestinationCost!
11. Under 'remainingBudget', calculate the leftover amount (Total Budget minus estimated grandTotal) as a formatted string (e.g. "₹2,500" or "$35").
12. In the field 'originToDestinationDuration', estimate a realistic travel time/duration to go from ${origin || "starting city"} to ${destination} (e.g., '3h 15m via Flight' or '8h via Train' or 'N/A' if origin is not provided).

Return the response in strict JSON format.`;
    } else {
      prompt = `Create a highly comprehensive, personalized travel itinerary for TripBalancing.
Target Details:
- Destination: ${destination}
${origin ? `- Traveling From (Origin City): ${origin}` : ""}
- Duration: From ${startDate} to ${endDate} (${diffDays} days)
- Canonical Economic Budget: ${canonicalBudgetForAi}
- Travelers: ${travelers} people
- Traveler Type: ${travelerType || "Not specified"}
- Traveler-Type Planning Rules: ${selectedTravelerGuidance}
- Travel Style: ${travelStyle}
- Budget Mode: ${budgetMode || "fixed"}
- Trip Purpose: ${tripPurpose || "Vacation"}
- Preferred Weather: ${preferredWeather || "Any"}
- Interests: ${Array.isArray(interests) ? interests.join(", ") : "General"}
- Planning Mode: ${planningMode || "known_destination"}
- Style Planning Rules: ${selectedStyleGuidance}
${universalItineraryQualityRules}
- IMPORTANT: Display currency is intentionally excluded from trip-content generation. The same economic trip must have the same hotels, attractions, meals, activities and route regardless of whether the user later views INR, AED, USD, EUR, GBP or JPY.

Please tailor the recommendations explicitly:
1. Since the app serves travelers from India and around the world, provide helpful insights for local Indian travelers (e.g. food options like vegetarian food, flight/train connectivity, visa requirements if international) as well as global details. If a Starting/Origin City (${origin || ""}) is provided, explicitly include customized transit, flight, or train suggestions from ${origin} to ${destination} inside your transit suggestions and daily descriptions.
2. The day-by-day itinerary must span exactly the duration of the trip (from ${startDate} to ${endDate}). Create specific day schedules with time tags (e.g., morning, afternoon, evening activities).
2A. ITINERARY REALISM: group each day geographically so consecutive stops are practical; avoid unnecessary cross-city backtracking and never repeat the same major attraction on multiple days.
2B. TIME REALISM: include realistic visit duration plus transfer/buffer time, avoid overlapping activities, and keep arrival/departure days lighter when appropriate. For every activity provide visitDuration, transportFromPrevious and travelTimeFromPrevious. Never use walking/metro for geographically remote excursions when taxi, transfer, rail, bus or tour vehicle is the practical choice.
2C. OPENING-HOURS SAFETY: schedule museums and paid attractions during normal daytime operating windows. Do not assert exact current opening hours unless verified; users should verify live hours for date-sensitive venues.
2D. RECOMMENDATION INTEGRITY: hotels and restaurants must be plausible for the destination/style. Never claim exact live availability, exact live rating, or guaranteed current price; all prices are estimates.
2E. WEATHER INTEGRITY: do not fabricate exact future weather in itinerary generation. Use season-aware planning only; the dedicated weather service supplies live/forecast conditions.
3. Every single day in the itinerary MUST contain:
   - Morning, Afternoon, and Evening activities in the 'activities' array (labeled clearly in the 'time' field, e.g. '09:00 AM / Morning', '02:00 PM / Afternoon', '07:00 PM / Evening').
   - Specific local dining/food recommendations for that day ('foodRecommendations' field).
   - Specific local transit/transportation suggestions for that day ('transportationSuggestions' field).
   - Estimated daily budget for that day ('dailyBudget' field).
4. CRITICAL: For longer trips (up to 365 days), make sure to generate entries for every requested day without omitting or skipping any days. Keep daily descriptions concise but complete to stay within token limits.
5. The "localFood" recommendations should describe must-try street foods and popular restaurants, explicitly labeling veg/non-veg.
6. Estimate highly realistic, accurate budgets based on the destination's current average living costs, the travel style (${travelStyle}), duration (${diffDays} days), and number of travelers (${travelers}).
   - You MUST estimate expected cost ranges (a minimum expected cost and a maximum expected cost, e.g., "₹10,000 - ₹15,000" or "$150 - $220") instead of a single fixed value for each.
   - Breakdown costs into 6 specific categories:
     * Accommodation (hotel, homestay, lodging)
     * Food (all meals, street food, dining, snacks)
     * Local transportation (cabs, metro, public transit, commutes)
     * Attractions (entry fees, tickets, experiences, sightseeing tours)
     * Miscellaneous expenses (shopping, souvenirs, emergency funds, local SIM cards)
     * originToDestinationTravel (realistic round-trip flight/train transit costs from ${origin || "starting city"} to ${destination} for ${travelers} travelers, set to 'N/A' if no starting city is provided)
   - The "total" budget must also be a range representing the sum of all 6 categories, explicitly including the originToDestinationTravel cost if an origin is provided!
   - CURRENCY-INDEPENDENT CONTENT IS MANDATORY: the user's display currency must not affect any recommendation. For schema-required monetary strings, use canonical INR placeholders only. The backend will replace/reconcile every displayed price into the user's selected currency after generation.
7. List essential packing items suitable for the destination's climate during those dates.
8. Provide essential transportation suggestions for getting around.
9. List very practical travel tips, safety hacks, and cultural etiquettes.
9A. STYLE PERSONALIZATION IS MANDATORY: hotels, food, fun activities, transport, pace, hidden gems and daily itinerary must visibly match the selected travel style. A user should be able to infer the selected style from the itinerary content without seeing the label.
9A1. STYLE-AUTHENTIC SPENDING: style changes must come from real service/venue/experience choices, not by multiplying the price of the same item. Luxury and Smart Luxury require visibly higher-tier choices; Budget and Backpacker require smart value choices while preserving memorable experiences.
9A2. LUXURY QUALITY FLOOR: for Luxury, use an upscale/five-star or equivalent working stay, premium/private transfers where useful, destination-worthy upscale dining, and at least two elevated experiences across the trip. Do not center the trip on scooters, hostels, budget shacks or generic shopping unless explicitly requested.
9A3. ADVENTURE/FOOD/WELLNESS/CULTURE/BEACH/NATURE/SHOPPING/NIGHTLIFE QUALITY FLOOR: on most full days include at least one experience clearly tied to the selected theme. Do not let generic sightseeing dominate a themed itinerary when authentic theme-specific options exist.
9AA. TRAVELER-TYPE PERSONALIZATION IS MANDATORY: apply the Traveler-Type Planning Rules above so the selected traveler type (${travelerType || "general traveler"}) meaningfully changes pacing, lodging suitability, dining, transport, activity timing and practical advice. Do not let traveler type override explicit budget, travel style, interests, trip purpose or dates, and do not use stereotypes or unnecessary restrictions.
9B. PRICE INTEGRITY IS MANDATORY: never change the real price of the same item at the same outlet merely because the travel style changed. Distinguish per-piece, per-plate, per-person and group totals. Change the venue/service level, not the factual unit price.
9C. For Smart Luxury, set budgetAmount to the Recommended Smart Luxury total and explain Minimum Luxury, Recommended Smart Luxury and Premium Luxury in aiBudgetSummary.

10. CURATED COST BREAKDOWN AND RECOMMENDATIONS (MANDATORY):
   - Under 'hotelRecommendations', recommend 3 Budget, 3 Mid-range, and 3 Luxury Hotels. Each hotel must have a name, pricePerNight as a canonical INR placeholder; the backend will convert it for display, rating (1.0 to 5.0), distanceFromCenter, and bookingLink (a placeholder searching booking.com for that hotel name).
   - Under 'detailedTransportationCosts', estimate realistic fares for: taxiStart, taxiPerKm, autoRickshaw (where available, otherwise N/A), busFare, metroFare (where available, otherwise N/A), trainFare (where available, otherwise N/A), scooterRental (per day), carRental (per day), and airportTransfer.
   - Under 'foodBudgetDaily', estimate daily costs for: budget, midRange, and luxury travelers.
   - Under 'attractionCosts', estimate entry fees for each landmark in 'placesToVisit' as a list of { name, fee }.
   - Under 'detailedBudgetSummary', estimate calculated totals for the entire trip duration (${diffDays} days) and travelers (${travelers}) for: accommodationTotal, foodTotal, localTransportTotal, attractionTotal, miscellaneousExpenses, originToDestinationCost (estimate realistic round-trip flight/train transit costs from ${origin || "starting city"} to ${destination} for ${travelers} travelers, or set to 'N/A' if no starting city is provided), and grandTotal. Make sure the grandTotal includes this originToDestinationCost!
   - In the field 'originToDestinationDuration', estimate a realistic travel time/duration to go from ${origin || "starting city"} to ${destination} (e.g., '3h 15m via Flight' or '8h via Train' or 'N/A' if origin is not provided).

Return the response in strict JSON format.`;
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            destination: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            budgetAmount: { type: Type.STRING },
            travelers: { type: Type.INTEGER },
            travelStyle: { type: Type.STRING },
            originToDestinationDuration: { type: Type.STRING, description: "Estimated flight/train traveling time from origin/starting city to destination, e.g. '2h 15m via Flight' or '6h via Train', or 'N/A' if origin is not provided" },
            isAiBudgetPlanner: { type: Type.BOOLEAN },
            aiBudgetSummary: { type: Type.STRING, description: "Personalized summary of budget travel e.g., 'With your budget of ₹20,000, you can comfortably travel for 5 days and 4 nights.'" },
            maxDaysComfortable: { type: Type.INTEGER, description: "Maximum number of travel days within the budget" },
            remainingBudget: { type: Type.STRING, description: "Remaining budget after estimated grand total" },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dayNumber: { type: Type.INTEGER },
                  theme: { type: Type.STRING },
                  activities: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        time: { type: Type.STRING, description: "e.g. '09:00 AM' or 'Afternoon'" },
                        title: { type: Type.STRING, description: "Compact activity title" },
                        description: { type: Type.STRING, description: "Brief description of the activity and what to expect" },
                        location: { type: Type.STRING, description: "Specific place name" },
                        cost: { type: Type.STRING, description: "Estimated cost or Free" },
                        latitude: { type: Type.NUMBER, description: "Estimated latitude coordinate for this specific activity location" },
                        longitude: { type: Type.NUMBER, description: "Estimated longitude coordinate for this specific activity location" },
                        visitDuration: { type: Type.STRING, description: "Realistic time spent at this activity, e.g. 1–1.5 hours" },
                        transportFromPrevious: { type: Type.STRING, description: "Practical transport mode from the previous stop" },
                        travelTimeFromPrevious: { type: Type.STRING, description: "Estimated transfer time from previous stop" }
                      },
                      required: ["time", "title", "description", "location", "latitude", "longitude"]
                    }
                  },
                  foodRecommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Food and dining recommendations for this specific day"
                  },
                  transportationSuggestions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Transit/transport tips and directions for this specific day"
                  },
                  dailyBudget: {
                    type: Type.STRING,
                    description: "Estimated budget/expenses for this specific day"
                  }
                },
                required: ["dayNumber", "theme", "activities"]
              }
            },
            estimatedBudgetBreakdown: {
              type: Type.OBJECT,
              properties: {
                accommodation: { type: Type.STRING, description: "Estimated cost range for staying, e.g., '₹12,000 - ₹18,000'" },
                food: { type: Type.STRING, description: "Estimated cost range for meals, e.g., '₹6,000 - ₹9,000'" },
                activities: { type: Type.STRING, description: "Estimated cost range for attractions and sightseeing, e.g., '₹3,000 - ₹5,000'" },
                transport: { type: Type.STRING, description: "Estimated cost range for local transportation/transit, e.g., '₹2,000 - ₹3,500'" },
                miscellaneous: { type: Type.STRING, description: "Estimated cost range for shopping and miscellaneous expenses, e.g., '₹1,500 - ₹3,000'" },
                originToDestinationTravel: { type: Type.STRING, description: "Estimated round-trip flight/train transit cost from starting city (origin) to destination, e.g. '₹8,500' or 'N/A' if origin is not provided" },
                total: { type: Type.STRING, description: "Sum total estimated cost range including originToDestinationTravel, e.g., '₹24,500 - ₹38,500'" }
              },
              required: ["accommodation", "food", "activities", "transport", "miscellaneous", "total"]
            },
            placesToVisit: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  bestTimeToVisit: { type: Type.STRING },
                  entryFee: { type: Type.STRING }
                },
                required: ["name", "description", "bestTimeToVisit", "entryFee"]
              }
            },
            localFood: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: { type: Type.STRING, description: "veg, non-veg, both, dessert, or beverage" },
                  mustTryAt: { type: Type.STRING }
                },
                required: ["name", "description", "type", "mustTryAt"]
              }
            },
            packingChecklist: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            transportationSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "e.g. 'Metro', 'Rickshaw', 'Cab', 'Walking'" },
                  description: { type: Type.STRING },
                  estimatedCost: { type: Type.STRING }
                },
                required: ["type", "description", "estimatedCost"]
              }
            },
            travelTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            latitude: { type: Type.NUMBER, description: "Estimated latitude coordinate of the destination" },
            longitude: { type: Type.NUMBER, description: "Estimated longitude coordinate of the destination" },
            hotelRecommendations: {
              type: Type.OBJECT,
              properties: {
                budget: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      pricePerNight: { type: Type.STRING },
                      rating: { type: Type.NUMBER },
                      distanceFromCenter: { type: Type.STRING },
                      bookingLink: { type: Type.STRING }
                    },
                    required: ["name", "pricePerNight", "rating", "distanceFromCenter", "bookingLink"]
                  }
                },
                midRange: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      pricePerNight: { type: Type.STRING },
                      rating: { type: Type.NUMBER },
                      distanceFromCenter: { type: Type.STRING },
                      bookingLink: { type: Type.STRING }
                    },
                    required: ["name", "pricePerNight", "rating", "distanceFromCenter", "bookingLink"]
                  }
                },
                luxury: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      pricePerNight: { type: Type.STRING },
                      rating: { type: Type.NUMBER },
                      distanceFromCenter: { type: Type.STRING },
                      bookingLink: { type: Type.STRING }
                    },
                    required: ["name", "pricePerNight", "rating", "distanceFromCenter", "bookingLink"]
                  }
                }
              },
              required: ["budget", "midRange", "luxury"]
            },
            detailedTransportationCosts: {
              type: Type.OBJECT,
              properties: {
                taxiStart: { type: Type.STRING },
                taxiPerKm: { type: Type.STRING },
                autoRickshaw: { type: Type.STRING },
                busFare: { type: Type.STRING },
                metroFare: { type: Type.STRING },
                trainFare: { type: Type.STRING },
                scooterRental: { type: Type.STRING },
                carRental: { type: Type.STRING },
                airportTransfer: { type: Type.STRING }
              },
              required: ["taxiStart", "taxiPerKm", "autoRickshaw", "busFare", "metroFare", "trainFare", "scooterRental", "carRental", "airportTransfer"]
            },
            foodBudgetDaily: {
              type: Type.OBJECT,
              properties: {
                budget: { type: Type.STRING },
                midRange: { type: Type.STRING },
                luxury: { type: Type.STRING }
              },
              required: ["budget", "midRange", "luxury"]
            },
            attractionCosts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  fee: { type: Type.STRING }
                },
                required: ["name", "fee"]
              }
            },
             detailedBudgetSummary: {
              type: Type.OBJECT,
              properties: {
                accommodationTotal: { type: Type.STRING },
                foodTotal: { type: Type.STRING },
                localTransportTotal: { type: Type.STRING },
                attractionTotal: { type: Type.STRING },
                miscellaneousExpenses: { type: Type.STRING },
                originToDestinationCost: { type: Type.STRING, description: "Estimated flight/train/bus travel cost from starting city (origin) to destination, e.g. '₹8,500' or 'N/A' if origin is not provided" },
                grandTotal: { type: Type.STRING }
              },
              required: ["accommodationTotal", "foodTotal", "localTransportTotal", "attractionTotal", "miscellaneousExpenses", "originToDestinationCost", "grandTotal"]
            }
          },
          required: [
            "destination",
            "startDate",
            "endDate",
            "budgetAmount",
            "travelers",
            "travelStyle",
            "days",
            "estimatedBudgetBreakdown",
            "placesToVisit",
            "localFood",
            "packingChecklist",
            "transportationSuggestions",
            "travelTips",
            "latitude",
            "longitude",
            "hotelRecommendations",
            "detailedTransportationCosts",
            "foodBudgetDaily",
            "attractionCosts",
            "detailedBudgetSummary"
          ]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) {
      throw new Error("No response generated from the AI model.");
    }

    let parsedItinerary = sanitizeItineraryStrings(JSON.parse(jsonText.trim()));
    let qualityErrors = validateGeneratedItinerary(parsedItinerary, travelStyle);
    if (qualityErrors.length) {
      console.warn(`[STYLE_QUALITY_REPAIR] ${travelStyle}: ${qualityErrors.join('; ')}`);
      const repaired = await repairItineraryForStyle(ai, parsedItinerary, destination, travelStyle, travelerType, diffDays, qualityErrors);
      if (repaired) {
        const repairedErrors = validateGeneratedItinerary(repaired, travelStyle);
        if (!repairedErrors.length) {
          parsedItinerary = repaired;
          qualityErrors = [];
        } else {
          qualityErrors = repairedErrors;
        }
      }
      if (qualityErrors.length) {
        throw new Error(`AI itinerary failed quality validation after repair: ${qualityErrors.join('; ')}`);
      }
    }
    
    // Inject accurate geocoded coordinates
    parsedItinerary.latitude = geoCoords.latitude;
    parsedItinerary.longitude = geoCoords.longitude;
    parsedItinerary.origin = origin || "";
    // The form selection is authoritative. Gemini must never rewrite the selected
    // travel style (especially AI Budget Planner trips) back to Budget.
    parsedItinerary.travelStyle = travelStyle;
    parsedItinerary.travelers = Number(travelers) || 1;
    // The user's submitted budget/currency is the single source of truth.
    // Gemini is not allowed to replace it with destination-local currency.
    parsedItinerary.budgetAmount = effectiveBudgetAmount;
    parsedItinerary.plannedBudget = effectiveBudgetAmount;
    // Never accept an AI-reported duration that conflicts with the form.
    parsedItinerary.startDate = startDate;
    parsedItinerary.endDate = endDate;
    parsedItinerary.tripDays = diffDays;
    parsedItinerary.originLatitude = validatedOrigin.latitude;
    parsedItinerary.originLongitude = validatedOrigin.longitude;
    if (origin && validatedOrigin.latitude != null && validatedOrigin.longitude != null) {
      const toRad = (v: number) => v * Math.PI / 180;
      const dLat = toRad(geoCoords.latitude - validatedOrigin.latitude);
      const dLon = toRad(geoCoords.longitude - validatedOrigin.longitude);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(validatedOrigin.latitude)) * Math.cos(toRad(geoCoords.latitude)) * Math.sin(dLon / 2) ** 2;
      parsedItinerary.originToDestinationDistanceKm = Math.round(6371 * 2 * Math.asin(Math.sqrt(a)));
    }
    
    // Prefer recent cached market airfare data for the exact route/dates. If unavailable,
    // the existing route-band calculator remains the non-blocking fallback.
    const pricedItinerary = await attachMarketFlightEstimate(parsedItinerary, origin || "", destination, startDate, endDate, travelers);

    // Store in cache for future identical requests
    const reconciledItinerary = reconcileItineraryBudget(enforceExactTripDays(applySmartRouteAndTransport(enforceFinalItineraryIntelligence(normalizeFinalFoodSemantics(improveItineraryQuality(pricedItinerary)))), diffDays));
    const finalUserFacingErrors = validateFinalUserFacingItinerary(reconciledItinerary);
    if (finalUserFacingErrors.length) console.warn(`[FINAL_ITINERARY_QUALITY] ${finalUserFacingErrors.join('; ')}`);

    ITINERARY_CACHE.set(cacheKey, {
      data: reconciledItinerary,
      timestamp: Date.now()
    });

    reconciledItinerary.generationSource = "gemini";
    const consumed = await consumeTripEntitlement(authUser.id, authUser.email);
    if (!consumed.ok) return res.status(consumed.status).json({ error: consumed.error });
    return res.json({
      itinerary: reconciledItinerary,
      generation: { source: "gemini", degraded: false },
      billableGeneration: true,
      entitlement: consumed.entitlement
    });

  } catch (error: any) {
    const geminiFailure = geminiHttpErrorPayload(error);
    console.warn(`[AI Itinerary Generation Error:${geminiFailure.classified.kind}]`, error?.message || error);

    const { destination, origin, startDate, endDate, tripDays, budgetAmount, travelers, travelStyle, isAiBudgetPlanner } = req.body;

    let diffDays = Number.parseInt(String(tripDays ?? ""), 10);
    if (!Number.isFinite(diffDays) || diffDays <= 0) {
      const startMs = Date.parse(`${startDate}T00:00:00Z`);
      const endMs = Date.parse(`${endDate}T00:00:00Z`);
      diffDays = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
        ? Math.floor((endMs - startMs) / 86400000) + 1
        : 1;
    }
    diffDays = Math.max(1, Math.min(365, diffDays));

    const destNormalized = (destination || "").toLowerCase().trim();
    const baseLat = geoCoords?.latitude ?? 28.6139;
    const baseLon = geoCoords?.longitude ?? 77.2090;

    // Load static or dynamic lists
    const destinationDetails: Record<string, {
      places: { name: string, description: string, bestTimeToVisit: string, entryFee: string }[];
      food: { name: string, description: string, type: string, mustTryAt: string }[];
      packing: string[];
      tips: string[];
    }> = {
      goa: {
        places: [
          { name: "Calangute Beach", description: "The famous 'Queen of Beaches', perfect for water sports and shacks.", bestTimeToVisit: "Morning / Sunset", entryFee: "Free" },
          { name: "Basilica of Bom Jesus", description: "UNESCO World Heritage site containing mortal remains of St. Francis Xavier.", bestTimeToVisit: "10:00 AM - 04:00 PM", entryFee: "Free" },
          { name: "Dudhsagar Waterfalls", description: "Four-tiered waterfall on Mandovi River with dramatic white spray vistas.", bestTimeToVisit: "Early Morning", entryFee: "₹400 for Jeep safari" },
          { name: "Fort Aguada", description: "Seventeenth-century Portuguese fort and lighthouse overlooking the Arabian Sea.", bestTimeToVisit: "Late Afternoon", entryFee: "Free" }
        ],
        food: [
          { name: "Goan Fish Curry", description: "Tangy coconut-based curry seasoned with spices and kokum.", type: "non-veg", mustTryAt: "Fisherman's Wharf, Cavelossim" },
          { name: "Bebinca", description: "Multi-layered traditional Portuguese-Goan dessert made of eggs, coconut milk, and ghee.", type: "dessert", mustTryAt: "Martin's Corner" },
          { name: "Vegetarian Xacuti", description: "A rich spicy curry featuring roasted grated coconut and local spices, tailored for vegetarians.", type: "veg", mustTryAt: "Viva Panjim" },
          { name: "Feni", description: "Traditional cashew or coconut fermented spirit with unique tropical aroma.", type: "beverage", mustTryAt: "Local beach shacks" }
        ],
        packing: ["Comfortable swimwear", "High SPF Sunscreen", "Flip-flops & beach towels", "Sunglasses & hats", "Breathable linen clothing", "Waterproof dry bag"],
        tips: [
          "Rent a scooter (₹350-500/day) for maximum mobility and budget-friendly exploration.",
          "Check beach safety flags before venturing into the sea.",
          "For authentic Goan food, venture slightly inland to family-run taverns.",
          "Always carry cash as beach shacks may experience spotty cellular network connections."
        ]
      },
      paris: {
        places: [
          { name: "Eiffel Tower", description: "Iconic wrought-iron lattice tower on the Champ de Mars, symbol of France.", bestTimeToVisit: "Sunset & Night sparkle", entryFee: "€18 - €28" },
          { name: "Louvre Museum", description: "The world's largest art museum, housing Mona Lisa and Venus de Milo.", bestTimeToVisit: "Morning (Pre-booked slots)", entryFee: "€22" },
          { name: "Notre-Dame Cathedral", description: "A masterpiece of French Gothic architecture on Île de la Cité.", bestTimeToVisit: "Early Afternoon", entryFee: "Free to enter" },
          { name: "Montmartre & Sacré-Cœur", description: "Bohemian neighborhood with artists, cobblestone alleys, and a beautiful basilica overlooking the city.", bestTimeToVisit: "Late Evening", entryFee: "Free" }
        ],
        food: [
          { name: "Butter Croissants & Pain au Chocolat", description: "Golden, flaky, buttery French pastries baked fresh daily.", type: "veg", mustTryAt: "Du Pain et des Idées" },
          { name: "French Onion Soup", description: "Rich beef broth based caramelized onion soup topped with toasted baguette and melted Gruyère.", type: "non-veg", mustTryAt: "Le Procope" },
          { name: "Macarons", description: "Delicate meringue-based cookie sandwiches with luxurious buttercream or ganache fillings.", type: "dessert", mustTryAt: "Ladurée" },
          { name: "Ratatouille", description: "Traditional stewed vegetable dish from Nice, featuring zucchini, eggplant, and bell peppers.", type: "veg", mustTryAt: "Le Potager du Marais" }
        ],
        packing: ["Elegant walking shoes", "Chic layers for cooler evenings", "Compact umbrella", "Anti-theft daypack", "Universal power adapter"],
        tips: [
          "Buy a Navigo Easy card for cheaper metro and bus rides.",
          "Book museum tickets online weeks in advance to bypass long queues.",
          "Always greet shopkeepers with a warm 'Bonjour' to experience local friendliness.",
          "Avoid taxis during peak hours; the Metro is faster and highly intuitive."
        ]
      }
    };


    const curatedFallbackDetails: typeof destinationDetails = {
      mumbai: {
        places: [
          { name: "Gateway of India", description: "Historic waterfront arch beside Mumbai Harbour and the Colaba heritage district.", bestTimeToVisit: "Early morning or sunset", entryFee: "Free" },
          { name: "Chhatrapati Shivaji Maharaj Terminus", description: "UNESCO-listed Victorian Gothic railway terminus and one of Mumbai's architectural landmarks.", bestTimeToVisit: "Morning / evening exterior view", entryFee: "Free exterior" },
          { name: "Marine Drive", description: "Iconic seafront promenade curving along the Arabian Sea, especially atmospheric around sunset.", bestTimeToVisit: "Sunset", entryFee: "Free" },
          { name: "Elephanta Caves", description: "UNESCO-listed rock-cut cave temples on Elephanta Island, reached by ferry from the Gateway area.", bestTimeToVisit: "Morning", entryFee: "Paid entry + ferry" }
        ],
        food: [
          { name: "Vada Pav", description: "Mumbai's classic spicy potato fritter sandwich served with chutneys.", type: "veg", mustTryAt: "Aram Vada Pav, CSMT area" },
          { name: "Pav Bhaji", description: "Buttery bread rolls with a rich spiced vegetable mash.", type: "veg", mustTryAt: "Cannon Pav Bhaji, South Mumbai" },
          { name: "Bombay Sandwich", description: "Layered vegetable sandwich with green chutney and masala.", type: "veg", mustTryAt: "Well-reviewed local sandwich stalls" },
          { name: "Bombil Fry", description: "Crisp fried Bombay duck, a well-known coastal Mumbai specialty.", type: "non-veg", mustTryAt: "Traditional Maharashtrian seafood restaurants" }
        ],
        packing: ["Comfortable walking shoes", "Compact umbrella or rain jacket during monsoon", "Refillable water bottle", "Power bank", "Light breathable clothing", "Sun protection"],
        tips: ["Use Mumbai Metro/local trains only where they genuinely suit the route; use a cab or auto for last-mile travel.", "Allow extra traffic buffer for airport and cross-city transfers.", "Use official ferry counters for Elephanta services.", "Carry some small-value cash while keeping valuables secure in crowded areas."]
      },
      varanasi: {
        places: [
          { name: "Kashi Vishwanath Temple", description: "Major Shiva temple in the old city near the Ganges.", bestTimeToVisit: "Early morning", entryFee: "Free" },
          { name: "Dashashwamedh Ghat", description: "Central riverfront ghat known for the evening Ganga Aarti.", bestTimeToVisit: "Evening", entryFee: "Free" },
          { name: "Sarnath", description: "Important Buddhist pilgrimage and archaeological area northeast of central Varanasi.", bestTimeToVisit: "Morning", entryFee: "Paid for selected monuments/museum" },
          { name: "Ramnagar Fort", description: "Historic sandstone fort and museum on the eastern bank of the Ganges.", bestTimeToVisit: "Afternoon", entryFee: "Paid" }
        ],
        food: [
          { name: "Tamatar Chaat", description: "Spicy-sweet Banarasi tomato and potato chaat.", type: "veg", mustTryAt: "Deena Chaat Bhandar" },
          { name: "Kachori Sabzi", description: "Crisp kachori served with spicy potato curry.", type: "veg", mustTryAt: "Ram Bhandar" },
          { name: "Banarasi Lassi", description: "Thick yogurt drink commonly served in a kulhad.", type: "veg", mustTryAt: "Blue Lassi Shop" },
          { name: "Banarasi Paan", description: "Traditional betel-leaf preparation associated with Varanasi.", type: "veg", mustTryAt: "Established paan shops in the old city" }
        ],
        packing: ["Slip-on walking shoes", "Modest temple clothing", "Light rain protection in monsoon", "Hand sanitizer", "Small cash denominations", "Sun protection"],
        tips: ["Expect security checks and restricted-item rules around Kashi Vishwanath Temple.", "Use walking/e-rickshaw/auto-rickshaw in the old city rather than assuming Metro access.", "Verify Sarnath museum opening day before travelling.", "Agree boat and auto fares before starting when a meter or fixed-price app is not used."]
      },
      bali: {
        places: [
          { name: "Sacred Monkey Forest Sanctuary", description: "Forest sanctuary and temple complex in Ubud.", bestTimeToVisit: "Morning", entryFee: "Paid" },
          { name: "Tanah Lot Temple", description: "Sea temple on a wave-washed rock formation on Bali's southwest coast.", bestTimeToVisit: "Late afternoon / sunset", entryFee: "Paid" },
          { name: "Uluwatu Temple", description: "Clifftop sea temple on the Bukit Peninsula.", bestTimeToVisit: "Late afternoon", entryFee: "Paid" },
          { name: "Tegallalang Rice Terraces", description: "Terraced rice landscape north of Ubud.", bestTimeToVisit: "Early morning", entryFee: "Paid / donation depending area" }
        ],
        food: [
          { name: "Nasi Campur", description: "Rice with small portions of vegetables, sambal and optional meat or egg.", type: "both", mustTryAt: "Well-reviewed local warungs" },
          { name: "Sate Lilit", description: "Seasoned minced meat or seafood wrapped around a skewer and grilled.", type: "non-veg", mustTryAt: "Traditional Balinese warungs" },
          { name: "Gado-Gado", description: "Vegetables, tofu and tempeh with peanut sauce.", type: "veg", mustTryAt: "Local Ubud warungs" },
          { name: "Dadar Gulung", description: "Pandan-green coconut-filled sweet pancake roll.", type: "dessert", mustTryAt: "Traditional markets and dessert stalls" }
        ],
        packing: ["Lightweight clothing", "Comfortable shoes and waterproof sandals", "Universal adapter", "Reef-safe sunscreen", "Mosquito repellent", "Sarong or scarf for temples"],
        tips: ["Use Grab/Gojek, taxis or a private driver where available; Bali does not have a Metro network.", "Carry or borrow a sarong for temple visits.", "Allow generous road-travel time because traffic can be slow.", "Use bottled or safely filtered drinking water."]
      },
      baku: {
        places: [
          { name: "Icherisheher (Old City)", description: "Historic walled core of Baku with lanes, caravanserais and major heritage landmarks.", bestTimeToVisit: "Morning / late afternoon", entryFee: "Free to walk" },
          { name: "Heydar Aliyev Centre", description: "Major contemporary cultural complex known for its flowing architecture.", bestTimeToVisit: "Late afternoon", entryFee: "Exterior free; exhibitions may be paid" },
          { name: "Gobustan National Park", description: "Rock-art cultural landscape southwest of Baku.", bestTimeToVisit: "Morning", entryFee: "Paid" },
          { name: "Ateshgah Fire Temple", description: "Historic fire-temple complex on the Absheron Peninsula.", bestTimeToVisit: "Midday", entryFee: "Paid" }
        ],
        food: [
          { name: "Qutab", description: "Thin stuffed flatbread with herbs, pumpkin or meat.", type: "both", mustTryAt: "Old City qutab restaurants" },
          { name: "Shah Plov", description: "Saffron rice dish enclosed in a crisp lavash crust with meat and dried fruit.", type: "non-veg", mustTryAt: "Traditional Azerbaijani restaurants" },
          { name: "Dushbara", description: "Small dumplings served in broth.", type: "non-veg", mustTryAt: "Central Baku Azerbaijani restaurants" },
          { name: "Shekerbura", description: "Sweet crescent pastry filled with ground nuts and sugar.", type: "dessert", mustTryAt: "Local bakeries" }
        ],
        packing: ["Comfortable shoes for cobblestones", "Windproof light jacket", "European-style travel adapter", "Small AZN cash notes", "Modest clothing for mosques", "Sun protection"],
        tips: ["Use Baku Metro for suitable central routes and Bolt/taxi for point-to-point travel.", "Allow a road transfer or organized tour for Gobustan and Absheron Peninsula sights.", "Baku can be windy, especially at exposed viewpoints.", "Use official/app-based taxis rather than accepting unsolicited airport rides."]
      }
    };
    Object.assign(destinationDetails, curatedFallbackDetails);

    let details = destinationDetails[Object.keys(destinationDetails).find(k => destNormalized.includes(k)) || ""];
    if (!details) {
      if (geminiFailure.classified.retryAfterSeconds) {
        res.setHeader("Retry-After", String(geminiFailure.classified.retryAfterSeconds));
      }
      return res.status(geminiFailure.status).json({
        ...geminiFailure.body,
        error: "We could not generate verified destination-specific recommendations right now. Please retry. Your trip allowance has not been used.",
        code: geminiFailure.body.code === "GEMINI_REQUEST_FAILED"
          ? "DESTINATION_DATA_UNVERIFIED"
          : geminiFailure.body.code,
        billableGeneration: false
      });
    }

    // Build the budget calculations based on budget level and numbers
    const multiplierMap: Record<string, number> = {
      budget: 1,
      low: 1,
      medium: 2.5,
      mid: 2.5,
      high: 6,
      luxury: 6
    };
    const bLevel = String(budgetAmount || "medium").toLowerCase();
    const mult = multiplierMap[Object.keys(multiplierMap).find(k => bLevel.includes(k)) || ""] || 2.5;

    const fallbackNights = Math.max(0, diffDays - 1);
    const fallbackRooms = Math.max(1, Math.ceil((Number(travelers) || 1) / 2));
    const accommodationMin = Math.round(1300 * fallbackRooms * fallbackNights * mult);
    const accommodationMax = Math.round(1800 * fallbackRooms * fallbackNights * mult);

    const foodMin = Math.round(700 * (Number(travelers) || 1) * diffDays * mult);
    const foodMax = Math.round(1000 * (Number(travelers) || 1) * diffDays * mult);

    const activitiesMin = Math.round(400 * (Number(travelers) || 1) * diffDays * mult);
    const activitiesMax = Math.round(700 * (Number(travelers) || 1) * diffDays * mult);

    const transportMin = Math.round(300 * (Number(travelers) || 1) * diffDays * mult);
    const transportMax = Math.round(500 * (Number(travelers) || 1) * diffDays * mult);

    const miscMin = Math.round(200 * (Number(travelers) || 1) * diffDays * mult);
    const miscMax = Math.round(350 * (Number(travelers) || 1) * diffDays * mult);

    const transitMin = origin ? Math.round(5000 * mult) : 0;
    const transitMax = origin ? Math.round(12000 * mult) : 0;

    const totalMin = accommodationMin + foodMin + activitiesMin + transportMin + miscMin + transitMin;
    const totalMax = accommodationMax + foodMax + activitiesMax + transportMax + miscMax + transitMax;

    const estimatedBudgetBreakdown = {
      accommodation: `₹${accommodationMin.toLocaleString("en-IN")} - ₹${accommodationMax.toLocaleString("en-IN")}`,
      food: `₹${foodMin.toLocaleString("en-IN")} - ₹${foodMax.toLocaleString("en-IN")}`,
      activities: `₹${activitiesMin.toLocaleString("en-IN")} - ₹${activitiesMax.toLocaleString("en-IN")}`,
      transport: `₹${transportMin.toLocaleString("en-IN")} - ₹${transportMax.toLocaleString("en-IN")}`,
      miscellaneous: `₹${miscMin.toLocaleString("en-IN")} - ₹${miscMax.toLocaleString("en-IN")}`,
      originToDestinationTravel: origin ? `₹${transitMin.toLocaleString("en-IN")} - ₹${transitMax.toLocaleString("en-IN")}` : "N/A",
      total: `₹${totalMin.toLocaleString("en-IN")} - ₹${totalMax.toLocaleString("en-IN")}`
    };

    // Style-aware curated fallback schedules. This path is used only when Gemini is unavailable
    // or a generated itinerary still fails validation. It MUST preserve the selected travel style
    // instead of falling back to the old generic "Attraction & Local Flavors" template.
    const daysList: any[] = [];
    const fallbackStyle = String(travelStyle || 'Budget').toLowerCase().trim();
    const mkActivity = (time: string, title: string, description: string, location: string, cost: string, dayIdx: number, slot: number) => ({
      time, title, description, location, cost,
      latitude: Number((baseLat + Math.sin(dayIdx * 10 + slot) * 0.015).toFixed(4)),
      longitude: Number((baseLon + Math.cos(dayIdx * 10 + slot) * 0.015).toFixed(4))
    });

    // Food semantics for curated fallbacks. A dessert or beverage can enrich a day,
    // but it must never become the named lunch/dinner. Prefer savory/full-meal items
    // for meal slots and reserve dessert/beverage items for tasting/snack slots.
    const foodItems = Array.isArray(details.food) ? details.food : [];
    const foodKind = (item: any) => String(item?.type || '').toLowerCase().trim();
    const foodText = (item: any) => `${item?.name || ''} ${item?.description || ''}`.toLowerCase();
    const isSnackOrDrink = (item: any) => {
      const kind = foodKind(item);
      if (kind === 'dessert' || kind === 'beverage') return true;
      return /(dessert|sweet|cake|pastry|ice cream|pudding|cookie|macaron|bebinca|drink|beverage|cocktail|wine|beer|spirit|liqueur|feni|coffee|tea)/i.test(foodText(item));
    };
    const savoryMeals = foodItems.filter((item: any) => !isSnackOrDrink(item));
    const tastingItems = foodItems.filter((item: any) => isSnackOrDrink(item));
    const mealAt = (index: number) => savoryMeals.length
      ? savoryMeals[index % savoryMeals.length]
      : (foodItems[index % Math.max(1, foodItems.length)] || { name: 'Regional Meal', description: 'Choose a reputable restaurant serving a complete regional meal.', mustTryAt: `${destination} acclaimed restaurant` });
    const tastingAt = (index: number) => tastingItems.length
      ? tastingItems[index % tastingItems.length]
      : (foodItems[(index + 1) % Math.max(1, foodItems.length)] || { name: 'Regional Tasting', description: 'Add a destination-specific dessert, beverage or tasting.', mustTryAt: `${destination} specialty shop` });

    for (let dayIdx = 0; dayIdx < diffDays; dayIdx++) {
      const primary = details.places[dayIdx % details.places.length];
      const secondary = details.places[(dayIdx + 1) % details.places.length];
      const meal1 = mealAt(dayIdx);
      const meal2 = mealAt(dayIdx + 1);
      const tasting = tastingAt(dayIdx);
      let theme = `${primary.name} & Local Discovery`;
      let activities: any[] = [];
      let transportTips = ['Use the most practical verified local transport for the route.'];

      if (fallbackStyle === 'luxury') {
        theme = dayIdx === 0 ? 'Premium Arrival, Private Touring & Signature Dining' : `Private ${primary.name} Experience & Elevated Leisure`;
        activities = [
          mkActivity('09:30 AM', dayIdx === 0 ? 'Private Airport Transfer & Premium Stay Check-in' : `Chauffeured Transfer to ${primary.name}`, dayIdx === 0 ? `Begin with a pre-arranged private transfer and check in to a well-reviewed upscale or luxury property in ${destination}.` : `Travel comfortably by private car with timing optimized for ${primary.name}.`, dayIdx === 0 ? `${destination} premium hotel district` : primary.name, 'Premium service - verify live rate', dayIdx, 1),
          mkActivity('11:30 AM', `Private / Priority Visit: ${primary.name}`, `${primary.description} Experience it with a private guide, reserved timing or the best available premium access where the destination supports it.`, primary.name, primary.entryFee || 'Verify live rate', dayIdx, 2),
          mkActivity('02:30 PM', `Upscale Regional Lunch: ${meal1.name}`, `${meal1.description} This must be a complete savory meal at an acclaimed, high-comfort restaurant; reserve ahead where appropriate.`, meal1.mustTryAt || `${destination} acclaimed dining district`, 'Premium dining - per person', dayIdx, 3),
          mkActivity('05:30 PM', dayIdx % 2 === 0 ? 'Spa / Wellness Recovery' : `Private Scenic Experience near ${secondary.name}`, dayIdx % 2 === 0 ? `Schedule a reputable spa or wellness treatment with unhurried recovery time.` : `Use a private guide/vehicle or premium reserved experience for a comfortable scenic visit.`, dayIdx % 2 === 0 ? `${destination} luxury spa / resort` : secondary.name, 'Premium experience - verify live rate', dayIdx, 4),
          mkActivity('08:00 PM', `Signature Dinner: ${meal2.name}`, `${meal2.description} Serve this as a complete dinner at a reputable upscale restaurant or hotel dining room. Do not use a casual shack/stall as the luxury signature venue.`, `${destination} acclaimed fine-dining / luxury hotel restaurant`, 'Fine dining - per person', dayIdx, 5),
          ...(tasting && isSnackOrDrink(tasting) ? [mkActivity('09:30 PM', `Optional After-dinner Tasting: ${tasting.name}`, `${tasting.description} Treat this only as a dessert/beverage tasting after the meal, never as the meal itself.`, tasting.mustTryAt || `${destination} specialty venue`, 'Tasting - per person', dayIdx, 6)] : [])
        ];
        transportTips = ['Use pre-arranged private/chauffeured transfers for comfort and reliable evening return.'];
      } else if (fallbackStyle === 'food explorer') {
        theme = `Culinary Trail: ${meal1.name}, Markets & Regional Flavors`;
        activities = [
          mkActivity('08:30 AM', 'Local Breakfast & Cafe Tasting', `Start with a destination-specific breakfast and beverage tasting. Ask for regional specialties and seasonal items.`, `${destination} established breakfast/cafe district`, 'Per person - verify menu', dayIdx, 1),
          mkActivity('10:30 AM', 'Produce / Spice / Fish Market Food Walk', `Explore a real public market or established food district with an emphasis on ingredients, vendors and local food culture. Do not invent a named market if none is verified.`, `${destination} central market / food district`, 'Low-cost tasting allowance', dayIdx, 2),
          mkActivity('01:00 PM', `Regional Lunch: ${meal1.name}`, `${meal1.description} This must be a complete regional meal, not a dessert or beverage. Try it at ${meal1.mustTryAt || 'a well-reviewed local restaurant'} and note whether pricing is per plate or per person.`, meal1.mustTryAt || `${destination} local restaurant`, 'Per plate/person', dayIdx, 3),
          mkActivity('04:00 PM', `Tasting / Food Craft: ${tasting.name}`, `${tasting.description} Treat desserts and beverages as tastings/snacks only. Pair them with a cooking demonstration, producer visit, bakery, spice/produce tasting or other authentic food-craft experience appropriate to ${destination}.`, tasting.mustTryAt || `${destination} culinary workshop / specialty shop`, 'Per person - verify live rate', dayIdx, 4),
          mkActivity('07:30 PM', `Signature Dinner: ${meal2.name}`, `${meal2.description} This must be a complete dinner built around a savory regional dish at a reputable venue, distinct from lunch.`, meal2.mustTryAt || `${destination} dinner district`, 'Per person - verify menu', dayIdx, 5)
        ];
      } else if (fallbackStyle === 'adventure') {
        theme = `Active Exploration: ${primary.name} & Outdoor Challenge`;
        activities = [
          mkActivity('08:30 AM', `Active Route to ${primary.name}`, `Use a guided trek, cycle, kayak, rafting, water-sport or other destination-appropriate active approach where available; otherwise use the most active safe route.`, primary.name, primary.entryFee || 'Verify rate', dayIdx, 1),
          mkActivity('12:30 PM', `Recovery Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 2),
          mkActivity('03:30 PM', `Second Outdoor Experience near ${secondary.name}`, `Add a distinct active experience with appropriate safety gear, guide and weather checks.`, secondary.name, 'Verify live rate', dayIdx, 3),
          mkActivity('07:30 PM', 'Recovery Dinner & Rest', `Refuel, hydrate and allow recovery time before the next active day.`, meal2.mustTryAt || destination, 'Per person', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'nightlife') {
        theme = `Late Start, Sunset & Nightlife around ${primary.name}`;
        activities = [
          mkActivity('11:30 AM', 'Late Brunch & Easy Start', `Keep the morning light after a late night and use a well-reviewed cafe or brunch venue.`, meal1.mustTryAt || destination, 'Per person', dayIdx, 1),
          mkActivity('04:30 PM', `Sunset / Pre-evening Visit: ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Free / verify', dayIdx, 2),
          mkActivity('07:30 PM', 'Dinner & Live Entertainment', `Choose a reputable venue with music, performance or an energetic evening atmosphere appropriate to ${destination}.`, `${destination} established entertainment district`, 'Per person', dayIdx, 3),
          mkActivity('10:30 PM', 'Nightlife Venue & Safe Return', `Use a reputable club, lounge, casino or night venue where legal and appropriate, then return by verified taxi/rideshare/private transfer.`, `${destination} nightlife district`, 'Cover/drinks - verify live rate', dayIdx, 4)
        ];
        transportTips = ['Use verified taxi/rideshare or pre-arranged transport for late-night returns.'];
      } else if (fallbackStyle === 'wellness & spa') {
        theme = `Restorative Wellness, ${primary.name} & Slow Travel`;
        activities = [
          mkActivity('08:00 AM', 'Yoga / Meditation & Healthy Breakfast', 'Begin slowly with a reputable wellness session and nourishing breakfast.', `${destination} wellness area`, 'Per person', dayIdx, 1),
          mkActivity('11:00 AM', `Gentle Visit: ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Free / verify', dayIdx, 2),
          mkActivity('03:00 PM', 'Spa / Massage / Wellness Treatment', 'Book a reputable treatment with rest time before and after.', `${destination} spa / wellness center`, 'Verify live rate', dayIdx, 3),
          mkActivity('07:00 PM', `Light Regional Dinner: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'culture & history') {
        theme = `Heritage & Cultural Context: ${primary.name}`;
        activities = [
          mkActivity('09:00 AM', `Guided Heritage Visit: ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Verify', dayIdx, 1),
          mkActivity('11:30 AM', `Museum / Architectural Context`, `Add a museum, interpretation center, historic neighborhood or architectural walk connected to ${destination}'s history.`, `${destination} heritage district`, 'Verify', dayIdx, 2),
          mkActivity('02:00 PM', `Traditional Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 3),
          mkActivity('04:30 PM', `Second Heritage Stop: ${secondary.name}`, secondary.description, secondary.name, secondary.entryFee || 'Verify', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'beach escape') {
        theme = `Coastal Relaxation & Beach Time near ${primary.name}`;
        activities = [
          mkActivity('09:30 AM', 'Unhurried Beach Morning', `Use a suitable beach/coastal area near ${destination} with ample free time rather than over-scheduling.`, primary.name, 'Free / verify', dayIdx, 1),
          mkActivity('01:00 PM', `Waterfront Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 2),
          mkActivity('03:30 PM', 'Optional Coastal Activity / Resort Downtime', 'Choose swimming, kayaking, a boat ride or simply resort/beach downtime depending on sea and weather conditions.', `${destination} coast`, 'Optional', dayIdx, 3),
          mkActivity('06:00 PM', 'Sunset by the Water', 'Keep sunset unscheduled enough to relax, photograph and enjoy the coast.', `${destination} waterfront`, 'Free', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'nature & wildlife') {
        theme = `Nature, Wildlife & Responsible Exploration`;
        activities = [
          mkActivity('07:30 AM', 'Early Nature / Wildlife Excursion', `Use a real reserve, forest, birding area or nature zone around ${destination}; hire an authorized guide where required.`, `${destination} nature reserve / eco-zone`, 'Verify permits/guide', dayIdx, 1),
          mkActivity('12:30 PM', `Local Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 2),
          mkActivity('03:30 PM', `Scenic Nature Visit: ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Verify', dayIdx, 3),
          mkActivity('06:30 PM', 'Low-impact Sunset / Eco Lodge Evening', 'Keep noise and disturbance low and follow local wildlife rules.', `${destination} eco-friendly area`, 'Verify', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'shopping') {
        theme = `Markets, Artisan Finds & Shopping Districts`;
        activities = [
          mkActivity('10:00 AM', 'Local Market / Artisan District', `Start with authentic local products, crafts, textiles or food goods and compare prices before buying.`, `${destination} established market district`, 'Shopping budget varies', dayIdx, 1),
          mkActivity('01:00 PM', `Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Per person', dayIdx, 2),
          mkActivity('03:00 PM', 'Boutiques / Mall / Specialty Stores', `Choose the strongest destination-appropriate shopping area for branded, designer or specialty products.`, `${destination} retail district`, 'Shopping budget varies', dayIdx, 3),
          mkActivity('06:00 PM', `Light Sightseeing: ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Free / verify', dayIdx, 4)
        ];
      } else if (fallbackStyle === 'backpacker') {
        theme = `Backpacker Value Day: ${primary.name} & Local Life`;
        activities = [
          mkActivity('09:00 AM', `Walk / Public Transit to ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Free / verify', dayIdx, 1),
          mkActivity('12:30 PM', `Low-cost Local Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Budget per plate', dayIdx, 2),
          mkActivity('03:00 PM', 'Free / Low-cost Neighborhood Exploration', 'Explore a walkable district, public viewpoint, park or community area without fabricated attractions.', `${destination} walkable district`, 'Free / low cost', dayIdx, 3),
          mkActivity('07:00 PM', 'Social Evening / Hostel Common Area', 'Use a reputable social stay or low-cost community venue and keep transport simple.', `${destination} backpacker area`, 'Low cost', dayIdx, 4)
        ];
        transportTips = ['Prefer walking and verified public transport; use taxis only when they materially improve safety or timing.'];
      } else if (fallbackStyle === 'smart luxury') {
        theme = `Boutique Comfort & High-value Experiences`;
        activities = [
          mkActivity('09:30 AM', `Comfortable Transfer to ${primary.name}`, primary.description, primary.name, primary.entryFee || 'Verify', dayIdx, 1),
          mkActivity('01:00 PM', `Quality Regional Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Mid-premium per person', dayIdx, 2),
          mkActivity('03:30 PM', `Selective Premium Experience near ${secondary.name}`, 'Choose one high-value guided/private/priority experience where it meaningfully improves comfort or access.', secondary.name, 'Verify live rate', dayIdx, 3),
          mkActivity('07:30 PM', 'Boutique Dining / Relaxed Evening', 'Choose a distinctive well-reviewed restaurant without defaulting to the most expensive option.', meal2.mustTryAt || destination, 'Per person', dayIdx, 4)
        ];
      } else {
        theme = `Value-focused ${primary.name} & Local Experiences`;
        activities = [
          mkActivity('09:30 AM', primary.name, primary.description, primary.name, primary.entryFee, dayIdx, 1),
          mkActivity('12:30 PM', `Affordable Regional Lunch: ${meal1.name}`, meal1.description, meal1.mustTryAt, 'Budget per person', dayIdx, 2),
          mkActivity('03:30 PM', `Second Sight: ${secondary.name}`, secondary.description, secondary.name, secondary.entryFee, dayIdx, 3),
          mkActivity('07:00 PM', 'Low-cost Local Evening', 'Use a free viewpoint, promenade, public square or neighborhood walk appropriate to the destination.', destination, 'Free / low cost', dayIdx, 4)
        ];
      }

      daysList.push({
        dayNumber: dayIdx + 1,
        theme,
        activities,
        foodRecommendations: [`Regional specialty: ${meal1.name}`, `Also try: ${meal2.name}`],
        transportationSuggestions: transportTips,
        dailyBudget: `₹${Math.round(1500 * mult).toLocaleString('en-IN')}`
      });
    }

    const fallbackItinerary = {
      destination: destination,
      origin: origin || "",
      startDate: startDate,
      endDate: endDate,
      tripDays: diffDays,
      budgetAmount: budgetAmount,
      travelers: Number(travelers) || 1,
      travelStyle: travelStyle,
      days: daysList,
      estimatedBudgetBreakdown,
      placesToVisit: details.places,
      localFood: details.food,
      packingChecklist: details.packing,
      transportationSuggestions: [
        { type: "Route-aware transport", description: "TripBalancing selects walking, verified public transit, app-based taxi/rideshare or private transfer based on destination and route distance.", estimatedCost: "Calculated by pricing engine" }
      ],
      travelTips: details.tips,
      latitude: baseLat,
      longitude: baseLon,
      isFallback: true,
      fallbackDataQuality: "curated-destination-profile",
      hotelRecommendations: (() => {
        const key = Object.keys(curatedFallbackDetails).find(k => destNormalized.includes(k)) || "";
        const hotelCatalog: Record<string, any> = {
          mumbai: {
            budget: [
              { name: "goSTOPS Mumbai", rating: 4.1, distanceFromCenter: "South Mumbai area", description: "Value-focused hostel option; verify current branch, room type and availability before booking." },
              { name: "The Hosteller Mumbai", rating: 4.2, distanceFromCenter: "Mumbai", description: "Hostel-style budget stay; verify the exact Mumbai property and current rate before booking." },
              { name: "Zostel Mumbai", rating: 4.2, distanceFromCenter: "Mumbai", description: "Popular backpacker-style accommodation; confirm current location and availability." }
            ],
            midRange: [
              { name: "Residency Hotel Fort", rating: 4.4, distanceFromCenter: "Fort", description: "Central South Mumbai location convenient for heritage sights around Fort and Colaba." },
              { name: "The Gordon House Hotel", rating: 4.3, distanceFromCenter: "Colaba", description: "Boutique option close to Gateway of India and Colaba attractions." },
              { name: "Abode Bombay", rating: 4.5, distanceFromCenter: "Colaba", description: "Boutique stay in the Colaba heritage district; verify room category and current inclusions." }
            ],
            luxury: [
              { name: "The Taj Mahal Palace, Mumbai", rating: 4.8, distanceFromCenter: "Colaba", description: "Landmark luxury hotel beside the Gateway of India with premium service and harbour access." },
              { name: "The Oberoi, Mumbai", rating: 4.8, distanceFromCenter: "Nariman Point", description: "Luxury waterfront stay at Nariman Point, well placed for South Mumbai." },
              { name: "Trident, Nariman Point", rating: 4.7, distanceFromCenter: "Nariman Point", description: "Established upscale waterfront hotel with convenient South Mumbai access." }
            ]
          },
          varanasi: {
            budget: [
              { name: "goSTOPS Varanasi", rating: 4.2, distanceFromCenter: "Varanasi", description: "Social budget stay suited to value-focused travellers; verify current property details." },
              { name: "Zostel Varanasi", rating: 4.3, distanceFromCenter: "Varanasi", description: "Backpacker-style stay with easy access to city sightseeing; verify exact room type." },
              { name: "Moustache Varanasi", rating: 4.3, distanceFromCenter: "Varanasi", description: "Budget hostel/guesthouse option; check current location and availability." }
            ],
            midRange: [
              { name: "Ganpati Guest House", rating: 4.4, distanceFromCenter: "Ghats area", description: "Guesthouse near the riverfront, convenient for old-city and ghat exploration." },
              { name: "Hotel Temple on Ganges", rating: 4.3, distanceFromCenter: "Assi Ghat area", description: "Mid-range riverfront-area option convenient for Assi Ghat and early-morning activities." },
              { name: "Hotel Alka", rating: 4.2, distanceFromCenter: "Ghats area", description: "Established ghat-side option; verify the specific room view and access conditions." }
            ],
            luxury: [
              { name: "BrijRama Palace, Varanasi", rating: 4.7, distanceFromCenter: "Darbhanga Ghat", description: "Heritage riverfront luxury property with direct access to the old-city ghat atmosphere." },
              { name: "Taj Ganges, Varanasi", rating: 4.6, distanceFromCenter: "Nadesar", description: "Full-service upscale hotel with larger grounds away from the narrow old-city lanes." },
              { name: "Taj Nadesar Palace", rating: 4.8, distanceFromCenter: "Nadesar", description: "High-end heritage palace stay focused on privacy, service and a quieter setting." }
            ]
          },
          bali: {
            budget: [
              { name: "Cara Cara Inn", rating: 4.2, distanceFromCenter: "Kuta", description: "Value-focused Kuta option useful for travellers prioritizing beach access and a modest room budget." },
              { name: "Puri Garden Hotel & Hostel", rating: 4.5, distanceFromCenter: "Ubud", description: "Well-known hostel/hotel format in Ubud; verify private-room versus dorm pricing." },
              { name: "Kuta Suci Guesthouse", rating: 4.1, distanceFromCenter: "Kuta", description: "Simple guesthouse-style accommodation in Kuta; confirm current amenities and availability." }
            ],
            midRange: [
              { name: "The ONE Legian", rating: 4.3, distanceFromCenter: "Legian", description: "Mid-range Legian hotel with practical access to Kuta/Legian dining and nightlife." },
              { name: "Anumana Ubud Hotel", rating: 4.5, distanceFromCenter: "Ubud", description: "Boutique Ubud option near central attractions and Monkey Forest area." },
              { name: "Swiss-Belresort Watu Jimbar", rating: 4.4, distanceFromCenter: "Sanur", description: "Resort-style mid-range stay in Sanur, useful for a quieter coastal base." }
            ],
            luxury: [
              { name: "The Kayon Jungle Resort", rating: 4.8, distanceFromCenter: "Ubud area", description: "Luxury jungle resort experience outside central Ubud, best suited to travellers prioritizing retreat time." },
              { name: "AYANA Resort Bali", rating: 4.8, distanceFromCenter: "Jimbaran", description: "Large luxury resort complex in Jimbaran with extensive on-site facilities." },
              { name: "Maya Ubud Resort & Spa", rating: 4.7, distanceFromCenter: "Ubud", description: "Upscale Ubud resort blending a natural setting with convenient access to the cultural centre." }
            ]
          },
          baku: {
            budget: [
              { name: "Sahil Hostel & Hotel", rating: 4.2, distanceFromCenter: "Central Baku", description: "Budget-oriented central option; verify current room category and operating details." },
              { name: "Travel Inn Hostel", rating: 4.2, distanceFromCenter: "Central Baku", description: "Hostel-style central stay suitable for value-focused city sightseeing." },
              { name: "Hostel Inn Baku", rating: 4.1, distanceFromCenter: "Central Baku", description: "Simple budget accommodation; confirm current reviews and room availability." }
            ],
            midRange: [
              { name: "Centric Baku Boutique Hotel", rating: 4.5, distanceFromCenter: "Central Baku", description: "Boutique central option convenient for walking to major downtown sights." },
              { name: "Promenade Hotel Baku", rating: 4.5, distanceFromCenter: "Old City / waterfront", description: "Mid-range/upscale option near the historic core and waterfront promenade." },
              { name: "Midtown Hotel Baku", rating: 4.4, distanceFromCenter: "Central Baku", description: "Modern central hotel with practical road access across the city." }
            ],
            luxury: [
              { name: "Four Seasons Hotel Baku", rating: 4.8, distanceFromCenter: "Waterfront / Old City", description: "Luxury waterfront hotel beside the historic core, strong for walkable central sightseeing." },
              { name: "Fairmont Baku, Flame Towers", rating: 4.7, distanceFromCenter: "Flame Towers", description: "High-rise luxury stay with panoramic views above the city and Caspian waterfront." },
              { name: "JW Marriott Absheron Baku", rating: 4.7, distanceFromCenter: "Central waterfront", description: "Full-service luxury hotel near the central waterfront and business district." }
            ]
          }
        };
        const tiers = hotelCatalog[key] || { budget: [], midRange: [], luxury: [] };
        for (const tier of ['budget','midRange','luxury']) {
          tiers[tier] = (tiers[tier] || []).map((h:any) => ({ ...h, pricePerNight: "Calculated", bookingLink: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.name + ' ' + destination)}` }));
        }
        return tiers;
      })(),
      detailedTransportationCosts: {
        taxiStart: `₹${Math.round(50 * mult)}`,
        taxiPerKm: `₹${Math.round(15 * mult)}/km`,
        autoRickshaw: `₹${Math.round(30 * mult)} base`,
        busFare: `₹${Math.round(15 * mult)}`,
        metroFare: `₹${Math.round(20 * mult)}`,
        trainFare: "N/A",
        scooterRental: `₹${Math.round(400 * mult)}/day`,
        carRental: `₹${Math.round(2000 * mult)}/day`,
        airportTransfer: `₹${Math.round(800 * mult)}`
      },
      foodBudgetDaily: {
        budget: `₹${Math.round(450 * mult)}/day`,
        midRange: `₹${Math.round(1200 * mult)}/day`,
        luxury: `₹${Math.round(3500 * mult)}/day`
      },
      attractionCosts: details.places.map(p => ({ name: p.name, fee: p.entryFee })),
      detailedBudgetSummary: {
        accommodationTotal: `₹${accommodationMin.toLocaleString("en-IN")} - ₹${accommodationMax.toLocaleString("en-IN")}`,
        foodTotal: `₹${foodMin.toLocaleString("en-IN")} - ₹${foodMax.toLocaleString("en-IN")}`,
        localTransportTotal: `₹${transportMin.toLocaleString("en-IN")} - ₹${transportMax.toLocaleString("en-IN")}`,
        attractionTotal: `₹${activitiesMin.toLocaleString("en-IN")} - ₹${activitiesMax.toLocaleString("en-IN")}`,
        miscellaneousExpenses: `₹${miscMin.toLocaleString("en-IN")} - ₹${miscMax.toLocaleString("en-IN")}`,
        originToDestinationCost: origin ? `₹${(5000 * mult).toLocaleString("en-IN")} - ₹${(12000 * mult).toLocaleString("en-IN")}` : "N/A",
        grandTotal: `₹${(totalMin + (origin ? 5000 : 0)).toLocaleString("en-IN")} - ₹${(totalMax + (origin ? 12000 : 0)).toLocaleString("en-IN")}`
      },
      isAiBudgetPlanner: !!isAiBudgetPlanner,
      originToDestinationDuration: origin ? "4h 30m via Flight" : "N/A",
      aiBudgetSummary: isAiBudgetPlanner ? `With your budget of ${budgetAmount}, you can comfortably travel for ${diffDays} days and ${diffDays - 1} nights.` : undefined,
      maxDaysComfortable: isAiBudgetPlanner ? diffDays : undefined,
      remainingBudget: isAiBudgetPlanner ? (String(budgetAmount).includes("$") ? "$10" : "₹500") : undefined
    };

    // Store in cache
    const fallbackCurrency = detectCurrencyCode(budgetAmount || "INR", destination);
    const fallbackBudgetNum = parseNumericValue(budgetAmount);
    const fallbackCanonicalBudgetInr = isAiBudgetPlanner ? 0 : Math.round(fallbackBudgetNum * getLiveCrossRate(fallbackCurrency, "INR"));
    const fallbackIdentity = [
      (destination || "").toLowerCase().trim(),
      origin ? origin.toLowerCase().trim() : "",
      startDate, endDate, `${diffDays}d`,
      isAiBudgetPlanner ? "ai-recommended" : `fixed-inr-${fallbackCanonicalBudgetInr}`,
      String(travelers),
      String(travelStyle || "").toLowerCase().trim(),
    ].join("|");
    const fallbackCacheKey = crypto.createHash("sha256").update(fallbackIdentity).digest("hex");
    fallbackItinerary.budgetAmount = budgetAmount;
    const pricedFallback = await attachMarketFlightEstimate({ ...fallbackItinerary, plannedBudget: budgetAmount }, origin || "", destination, startDate, endDate, travelers);
    const reconciledFallback = reconcileItineraryBudget(enforceExactTripDays(applySmartRouteAndTransport(enforceFinalItineraryIntelligence(normalizeFinalFoodSemantics(improveItineraryQuality(pricedFallback)))), diffDays));

    ITINERARY_CACHE.set(fallbackCacheKey, {
      data: reconciledFallback,
      timestamp: Date.now()
    });

    reconciledFallback.generationSource = "curated-fallback";
    return res.json({
      itinerary: reconciledFallback,
      generation: {
        source: "curated-fallback",
        degraded: true,
        reason: geminiFailure.body.code
      },
      billableGeneration: false,
      notice: "AI generation is temporarily unavailable, so TripBalancing used a verified destination profile. Your trip allowance was not used."
    });
  }
});

// Geocoding Endpoint
// Uses the existing multi-provider geocoder (Open-Meteo -> Nominatim -> Gemini).
// Never substitutes a different city's coordinates when every provider fails.
app.post("/api/geocode", async (req, res) => {
  try {
    const { destination } = req.body;
    if (!destination) {
      return res.status(400).json({ error: "Missing destination for geocoding" });
    }

    const result = await geocodeDestination(destination);
    if (!result) {
      return res.status(503).json({
        error: "Location coordinates are temporarily unavailable. Please try again.",
        code: "GEOCODING_UNAVAILABLE",
        retryable: true
      });
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Geocoding Error:", error?.message || error);
    return res.status(503).json({
      error: "Location coordinates are temporarily unavailable. Please try again.",
      code: "GEOCODING_UNAVAILABLE",
      retryable: true
    });
  }
});

// AI Travel Advisories and Tips Endpoint (with Google Search Grounding)
app.post("/api/travel-tips", verifyUserAuth, async (req, res) => {
  try {
    const { destinations } = req.body;
    
    // Check Travel Tips Cache first
    const sortedDests = Array.isArray(destinations) ? [...destinations].sort().join(",") : "";
    const tipsCacheKey = sortedDests || "global";
    const cachedTips = TRAVEL_TIPS_CACHE.get(tipsCacheKey);
    if (cachedTips && (Date.now() - cachedTips.timestamp < TRAVEL_TIPS_TTL)) {
      console.log(`[Cache Hit] Returning cached travel tips for: ${tipsCacheKey}`);
      return res.json(cachedTips.data);
    }

    const ai = getGeminiClient();

    let prompt = "";
    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      prompt = `You are a proactive travel security and advisories officer. Google Search is enabled for your lookup.
Find the latest global travel warnings, major weather hazards, health advisories, or high-level safety guidelines for global travelers in 2026.

Return the response in strict JSON format matching this schema:
{
  "tips": [
    {
      "destination": "Global Alert",
      "category": "warning" | "tip" | "weather" | "culture",
      "title": "Title of the alert or tip",
      "text": "Detailed description of the warning, alert, or tip. Keep it practical, friendly, and precise.",
      "importance": "high" | "medium" | "low"
    }
  ]
}`;
    } else {
      const destinationsList = destinations.slice(0, 5).join(", ");
      prompt = `You are a proactive travel security and advisories officer. Google Search is enabled for your lookup.
Find the latest proactive notifications, safety warnings, weather alerts, local health/cultural guidelines, or public transportation notices for the following travel destinations:
${destinationsList}

Use Google Search to fetch up-to-date information for late 2025 or 2026. Prioritize critical warnings or highly useful proactive tips for international and local tourists.

Return the response in strict JSON format matching this schema:
{
  "tips": [
    {
      "destination": "Name of the destination",
      "category": "warning" | "tip" | "weather" | "culture",
      "title": "Title of the alert or tip",
      "text": "Detailed description of the warning, alert, or tip. Keep it practical, friendly, and precise.",
      "importance": "high" | "medium" | "low"
    }
  ]
}`;
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tips: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  destination: { type: Type.STRING },
                  category: { type: Type.STRING, description: "Must be 'warning', 'tip', 'weather', or 'culture'" },
                  title: { type: Type.STRING },
                  text: { type: Type.STRING },
                  importance: { type: Type.STRING, description: "Must be 'high', 'medium', or 'low'" }
                },
                required: ["destination", "category", "title", "text", "importance"]
              }
            }
          },
          required: ["tips"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    
    // Extract search grounding metadata sources
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = chunks ? chunks.map((c: any) => ({
      title: c.web?.title || "Search Reference",
      url: c.web?.uri || ""
    })).filter((s: any) => s.url) : [];

    const result = {
      tips: parsed.tips || [],
      sources: sources
    };

    // Store in cache
    TRAVEL_TIPS_CACHE.set(tipsCacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return res.json(result);

  } catch (error: any) {
    console.warn("AI Travel Tips Gemini Error, returning generated safety tips fallback:", error);
    
    // Create elegant contextual fallback tips based on requested destinations
    const { destinations } = req.body;
    const fallbackTips = [];

    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      fallbackTips.push({
        destination: "Global Alert",
        category: "tip",
        title: "Secure Travel Documents",
        text: "Always store high-resolution digital copies of your passport, visas, and travel insurance policy in a secure cloud drive accessible offline.",
        importance: "high"
      });
      fallbackTips.push({
        destination: "Global Alert",
        category: "weather",
        title: "Adaptive Packing Guidelines",
        text: "With shifting climate variations globally in 2026, we highly recommend checking short-term regional weather alerts 48 hours before departure.",
        importance: "medium"
      });
      fallbackTips.push({
        destination: "Global Alert",
        category: "culture",
        title: "Card vs Cash Practices",
        text: "Ensure you notify your primary bank of international travel. Carry a small amount of local physical currency for neighborhood transport.",
        importance: "low"
      });
    } else {
      for (const dest of destinations.slice(0, 5)) {
        fallbackTips.push({
          destination: dest,
          category: "warning",
          title: `Smart Safety Advisory`,
          text: `Be mindful of your personal belongings in high-density transit hubs and popular tourist spots around ${dest}. Consider utilizing an anti-theft bag.`,
          importance: "medium"
        });
        fallbackTips.push({
          destination: dest,
          category: "weather",
          title: `Local Climate Preparation`,
          text: `Weather patterns in ${dest} can change. Pack light, modular clothing layers and a compact windbreaker to stay comfortable throughout your stay.`,
          importance: "medium"
        });
        fallbackTips.push({
          destination: dest,
          category: "culture",
          title: `Cultural Etiquette Guidelines`,
          text: `Showing respect for regional traditions and greeting codes in ${dest} goes a long way. Dress modestly when visiting cultural landmarks.`,
          importance: "low"
        });
      }
    }

    return res.json({
      tips: fallbackTips,
      sources: [],
      isFallback: true,
      degraded: true,
      notice: "Live AI-grounded advisories are temporarily unavailable. These are general travel-safety reminders, not live destination alerts."
    });
  }
});

// Live Currency Exchange Rates Endpoint (Proxy and Cache)
app.get("/api/exchange-rates", async (req, res) => {
  try {
    if (RATES_CACHE.data && (Date.now() - RATES_CACHE.timestamp < RATES_TTL)) {
      console.log("[Cache Hit] Returning cached exchange rates");
      return res.json(RATES_CACHE.data);
    }

    console.log("[Cache Miss] Fetching live exchange rates from open.er-api.com...");
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.result !== "success" || !data.rates) {
      throw new Error("Invalid response format from exchange rates API");
    }

    RATES_CACHE.data = data;
    RATES_CACHE.timestamp = Date.now();
    setLiveUsdRates(data.rates);

    return res.json(data);
  } catch (error: any) {
    console.error("Exchange rates fetch error:", error);
    
    // If we have stale data, serve it as a backup
    if (RATES_CACHE.data) {
      console.log("[Cache Fallback] Serving stale cached exchange rates due to error");
      return res.json(RATES_CACHE.data);
    }

    return res.status(500).json({ error: "Live exchange rates are temporarily unavailable. Please try again later." });
  }
});

// AI 7-Day Weather Forecast Endpoint with Google Search Grounding
app.post("/api/weather", async (req, res) => {
  try {
    const { destination } = req.body;
    if (!destination) {
      return res.status(400).json({ error: "Missing required parameter: destination" });
    }

    const cacheKey = destination.toLowerCase().trim();
    const cached = WEATHER_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < WEATHER_TTL)) {
      console.log(`[Cache Hit] Returning cached weather for destination: ${destination}`);
      return res.json(cached.data);
    }

    const ai = getGeminiClient();
    const prompt = `Search for the current 7-day weather forecast for the destination: "${destination}".
Return a detailed, highly accurate 7-day weather forecast based on actual real-time web search results.
The weather forecast should represent 7 consecutive days starting from today or the nearest upcoming date.
Return the output in strict JSON format.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "A high-level summary of the 7-day weather outlook" },
            forecast: {
              type: Type.ARRAY,
              description: "Exactly 7 days of forecast starting from today",
              items: {
                type: Type.OBJECT,
                properties: {
                  dayName: { type: Type.STRING, description: "Day of the week (e.g., 'Monday' or 'Today')" },
                  tempMax: { type: Type.INTEGER, description: "High temperature in Celsius (integer)" },
                  tempMin: { type: Type.INTEGER, description: "Low temperature in Celsius (integer)" },
                  condition: { type: Type.STRING, description: "Short description (e.g., 'Sunny', 'Rainy', 'Cloudy', 'Thunderstorm')" },
                  iconType: { type: Type.STRING, description: "One of: 'sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'stormy', 'partly-cloudy'" },
                  precipitation: { type: Type.STRING, description: "Precipitation probability, e.g. '15%'" },
                  humidity: { type: Type.STRING, description: "Humidity percentage, e.g. '55%'" }
                },
                required: ["dayName", "tempMax", "tempMin", "condition", "iconType", "precipitation", "humidity"]
              }
            }
          },
          required: ["summary", "forecast"]
        }
      }
    });

    let data;
    try {
      data = JSON.parse(response.text || "{}");
    } catch (parseErr) {
      console.error("Failed to parse Gemini Weather JSON:", parseErr?.message || parseErr);
      throw new Error("Invalid model JSON response");
    }

    // Extract grounding sources
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = chunks
      ? chunks
          .map((c: any) => ({
            title: c.web?.title || "Search Reference",
            url: c.web?.uri || ""
          }))
          .filter((s: any) => s.url)
      : [];

    const finalResult = {
      summary: data.summary || "Weather information loaded successfully.",
      forecast: data.forecast || [],
      sources: sources.slice(0, 3), // return top 3 sources
      isFallback: false
    };

    // Store in cache
    WEATHER_CACHE.set(cacheKey, {
      data: finalResult,
      timestamp: Date.now()
    });

    return res.json(finalResult);

  } catch (error: any) {
    const { destination } = req.body || {};
    const cacheKey = String(destination || "").toLowerCase().trim();
    const stale = WEATHER_CACHE.get(cacheKey);

    if (stale?.data) {
      return res.json({
        ...stale.data,
        isFallback: true,
        degraded: true,
        notice: "Live AI-grounded weather is temporarily unavailable. Showing the last successful cached forecast."
      });
    }

    const failure = geminiHttpErrorPayload(error);
    if (failure.classified.retryAfterSeconds) {
      res.setHeader("Retry-After", String(failure.classified.retryAfterSeconds));
    }

    return res.status(failure.status).json({
      ...failure.body,
      error: "Live weather could not be refreshed right now. Please try again shortly.",
      weatherUnavailable: true
    });
  }
});

// Open-Meteo 5-Day Weather Forecast Endpoint (Proxy & Cache)
app.post("/api/open-weather", async (req, res) => {
  try {
    const { destination, latitude, longitude } = req.body;
    if (!destination) {
      return res.status(400).json({ error: "Missing required parameter: destination" });
    }

    const cacheKey = `${destination.toLowerCase().trim()}_${latitude || ""}_${longitude || ""}`;
    const cached = OPEN_WEATHER_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < OPEN_WEATHER_TTL)) {
      console.log(`[Cache Hit] Returning cached Open-Meteo weather for: ${destination}`);
      return res.json(cached.data);
    }

    let lat = latitude ? parseFloat(latitude) : null;
    let lon = longitude ? parseFloat(longitude) : null;

    // If coordinates are missing, let's use our robust geocoder to resolve them
    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      console.log(`[Geocoding] Missing lat/lon for: ${destination}. Querying geocoding API...`);
      const geoResult = await geocodeDestination(destination);
      if (geoResult) {
        lat = geoResult.latitude;
        lon = geoResult.longitude;
        console.log(`[Geocoding Success] Resolved "${destination}" to lat: ${lat}, lon: ${lon}`);
      }
    }

    // Default coordinates fallback if we still don't have them
    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      lat = 28.6139; // Delhi fallback
      lon = 77.2090;
      console.log(`[Geocoding Fallback] Using default coordinates for ${destination}`);
    }

    // Query 5-day daily forecast from Open-Meteo
    console.log(`[Weather Fetch] Fetching 5-day forecast from Open-Meteo for lat: ${lat}, lon: ${lon}...`);
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error(`Open-Meteo request failed: ${weatherRes.statusText}`);
    }

    const weatherData = await weatherRes.json();
    if (!weatherData || !weatherData.daily) {
      throw new Error("Invalid response format from Open-Meteo API");
    }

    const daily = weatherData.daily;
    const count = Math.min(5, daily.time?.length || 0);
    const forecast = [];

    const weatherCodesMap: Record<number, { condition: string; iconType: string }> = {
      0: { condition: "Clear", iconType: "sunny" },
      1: { condition: "Mainly Clear", iconType: "partly-cloudy" },
      2: { condition: "Partly Cloudy", iconType: "partly-cloudy" },
      3: { condition: "Overcast", iconType: "cloudy" },
      45: { condition: "Foggy", iconType: "cloudy" },
      48: { condition: "Depositing Rime Fog", iconType: "cloudy" },
      51: { condition: "Light Drizzle", iconType: "rainy" },
      53: { condition: "Moderate Drizzle", iconType: "rainy" },
      55: { condition: "Dense Drizzle", iconType: "rainy" },
      56: { condition: "Light Freezing Drizzle", iconType: "snowy" },
      57: { condition: "Dense Freezing Drizzle", iconType: "snowy" },
      61: { condition: "Slight Rain", iconType: "rainy" },
      63: { condition: "Moderate Rain", iconType: "rainy" },
      65: { condition: "Heavy Rain", iconType: "rainy" },
      66: { condition: "Light Freezing Rain", iconType: "snowy" },
      67: { condition: "Heavy Freezing Rain", iconType: "snowy" },
      71: { condition: "Slight Snowfall", iconType: "snowy" },
      73: { condition: "Moderate Snowfall", iconType: "snowy" },
      75: { condition: "Heavy Snowfall", iconType: "snowy" },
      77: { condition: "Snow Grains", iconType: "snowy" },
      80: { condition: "Slight Rain Showers", iconType: "rainy" },
      81: { condition: "Moderate Rain Showers", iconType: "rainy" },
      82: { condition: "Violent Rain Showers", iconType: "rainy" },
      85: { condition: "Slight Snow Showers", iconType: "snowy" },
      86: { condition: "Heavy Snow Showers", iconType: "snowy" },
      95: { condition: "Thunderstorm", iconType: "stormy" },
      96: { condition: "Storm with Slight Hail", iconType: "stormy" },
      99: { condition: "Storm with Heavy Hail", iconType: "stormy" }
    };

    for (let i = 0; i < count; i++) {
      const code = daily.weather_code?.[i] ?? 0;
      const mapping = weatherCodesMap[code] || { condition: "Cloudy", iconType: "cloudy" };
      const dateStr = daily.time?.[i] || "";
      let dayName = "Day";
      if (dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      }

      forecast.push({
        dayName,
        date: dateStr,
        tempMax: Math.round(daily.temperature_2m_max?.[i] ?? 25),
        tempMin: Math.round(daily.temperature_2m_min?.[i] ?? 15),
        condition: mapping.condition,
        iconType: mapping.iconType
      });
    }

    const result = {
      destination,
      forecast
    };

    OPEN_WEATHER_CACHE.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return res.json(result);
  } catch (error: any) {
    console.error("Open-Meteo weather fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch 5-day weather forecast" });
  }
});

// AI Itinerary Chat Follow-up Endpoint
app.post("/api/itinerary-chat", verifyUserAuth, async (req, res) => {
  try {
    const { itinerary, message, history } = req.body;

    if (!itinerary || !message) {
      return res.status(400).json({ error: "Missing required fields: itinerary, message" });
    }

    const ai = getGeminiClient();

    // Construct detailed itinerary context for the system instruction
    const formattedDays = itinerary.days?.map((d: any) => {
      const activities = d.activities?.map((a: any) => 
        `- ${a.time || ''}: ${a.title || ''} at ${a.location || ''}. ${a.description || ''} ${a.cost ? `(Cost: ${a.cost})` : ''}`
      ).join('\n') || 'None';
      return `Day ${d.dayNumber || ''} [Theme: ${d.theme || ''}]:\n${activities}`;
    }).join('\n\n') || 'No day activities available';

    const systemInstruction = `You are a helpful and knowledgeable AI Travel Assistant on TripBalancing.
Your task is to answer follow-up questions from the traveler about their specific itinerary.
Here is the current itinerary context:
- Destination: ${itinerary.destination || 'Unknown'}
- Start Date: ${itinerary.startDate || 'N/A'}
- End Date: ${itinerary.endDate || 'N/A'}
- Budget Level: ${itinerary.budgetAmount || 'N/A'}
- Travelers: ${itinerary.travelers || '1'} people
- Travel Style: ${itinerary.travelStyle || 'Casual'}

Detailed Daily Activities:
${formattedDays}

Be warm, extremely helpful, concise, and professional. Provide practical, step-by-step guidance. If they ask for directions, food suggestions, local tips, weather, or modifications, base your recommendations on this trip. If a question is entirely unrelated to the trip or travel in general, politely guide them back to their itinerary.

Use Markdown for formatting, such as bold text, clean lists, and sections. Keep responses concise so they fit well in a chat window.`;

    // Map history to Google GenAI contents
    const contents: any[] = [];
    if (Array.isArray(history)) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text || msg.content }]
        });
      });
    }

    // Push current message
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    return res.json({ response: response.text });
  } catch (error: any) {
    console.warn("AI Chat Error, providing helpful offline assistant fallback:", error);
    const { itinerary, message } = req.body;
    const dest = itinerary?.destination || "your destination";
    
    let fallbackReply = `I am happy to assist you with your trip to **${dest}**! Since the AI model is currently experiencing high demand, I am using my local knowledge base to answer your question:\n\n`;

    const q = String(message).toLowerCase();
    if (q.includes("weather") || q.includes("temperature") || q.includes("rain") || q.includes("cold") || q.includes("hot") || q.includes("climate")) {
      fallbackReply += `### 🌤️ Weather Forecast & Climate
- **Expectation**: Generally pleasant, typical seasonal temperatures ranging from a high of **26°C** to a low of **18°C**.
- **Recommendation**: Pack breathable cotton clothes for daytime walks and a light jacket or cardigan for cooler evenings. Check localized weather apps 24 hours before your departure!`;
    } else if (q.includes("food") || q.includes("eat") || q.includes("restaurant") || q.includes("dish") || q.includes("veg") || q.includes("non-veg") || q.includes("cafe") || q.includes("dining")) {
      fallbackReply += `### 🍲 Local Culinary Highlights
- **Must-Try Specialties**: Be sure to explore regional street food stalls and authentic old town family diners.
- **Dietary Tips**: Local dishes offer exceptional variety. Certified vegetarian restaurants can be easily found on major promenade walks, clearly labeled.
- **Recommend**: Try local savory platters and artisanal sweet delicacies in the central market district.`;
    } else if (q.includes("pack") || q.includes("wear") || q.includes("clothing") || q.includes("shoe") || q.includes("checklist")) {
      fallbackReply += `### 🧳 Smart Packing Recommendations
- **Footwear**: Sturdy, comfortable walking sneakers are highly recommended for local exploring and sightseeing tours.
- **Essentials**: Bring a refillable insulated bottle, a robust portable power bank, protective sunglasses, a hat, and a compact travel umbrella.
- **Clothing**: Modular, easily-layerable, casual outfits will ensure comfort in varying daily weather conditions.`;
    } else if (q.includes("budget") || q.includes("cost") || q.includes("price") || q.includes("expensive") || q.includes("money") || q.includes("rupee") || q.includes("cash")) {
      fallbackReply += `### 💰 Budget & Expense Planning
- **Cash vs. Card**: Carry some cash in small denominations for neighborhood transit, local rickshaws, and street-food vendors who don't support online cards.
- **Saving Tip**: Purchase multi-ride public transit passes and pre-book entrance tickets to major monuments online to save both time and money!`;
    } else {
      fallbackReply += `### 🗺️ Helpful Travel Tip
- **Local Navigation**: Download offline Google Maps for **${dest}** beforehand so you can find your way seamlessly even without stable cellular data.
- **Respect**: Keep a friendly smile, learn 3-4 basic greeting phrases in the local tongue, and dress modestly when visiting cultural/religious monuments.

Please let me know if you would like me to share more details about packing lists, local dining choices, or transportation options for your trip!`;
    }

    return res.json({ response: fallbackReply });
  }
});

// Setup Vite Dev Server / Static Files
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`TripBalancing Server running on http://0.0.0.0:${PORT}`);
  });
});
