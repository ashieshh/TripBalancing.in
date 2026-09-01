import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import zlib from "zlib";
import { Readable } from "stream";

export interface AgodaHotelResult {
  hotelId: number;
  hotelName: string;
  starRating: number;
  reviewScore: number;
  reviewCount?: number;
  currency: string;
  dailyRate: number;
  crossedOutRate?: number;
  discountPercentage?: number;
  imageURL?: string;
  landingURL: string;
  includeBreakfast?: boolean;
  freeWifi?: boolean;
}

type CityRecord = { cityId: number; cityName: string; country?: string };

const cityIndex = new Map<string, CityRecord[]>();
let cityIndexReady = false;
let cityIndexLoading: Promise<void> | null = null;
let cityIndexError = "";
const hotelSearchCache = new Map<string, { at: number; data: AgodaHotelResult[] }>();
const SEARCH_TTL = 15 * 60 * 1000;

function normalizeName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function addCity(record: CityRecord) {
  if (!record.cityId || !record.cityName) return;
  const cityKey = normalizeName(record.cityName);
  if (!cityKey) return;
  const fullKey = normalizeName(`${record.cityName} ${record.country || ""}`);
  for (const key of new Set([cityKey, fullKey])) {
    if (!key) continue;
    const current = cityIndex.get(key) || [];
    if (!current.some((x) => x.cityId === record.cityId)) {
      current.push(record);
      cityIndex.set(key, current);
    }
  }
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out;
}

function detectDelimiter(line: string): string {
  const candidates = ["\t", "|", ",", ";"];
  return candidates
    .map((d) => ({ d, n: splitCsvLine(line, d).length }))
    .sort((a, b) => b.n - a.n)[0]?.d || ",";
}

function normalizedHeader(v: string) {
  return normalizeName(v).replace(/\s+/g, "");
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  const wanted = candidates.map((x) => normalizeName(x).replace(/\s+/g, ""));
  return headers.findIndex((h) => wanted.includes(normalizedHeader(h)));
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(zipPath: string): ZipEntry[] {
  const fd = fs.openSync(zipPath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const tailSize = Math.min(stat.size, 66_000);
    const tail = Buffer.alloc(tailSize);
    fs.readSync(fd, tail, 0, tailSize, stat.size - tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Agoda hotel data ZIP directory was not found.");
    const totalEntries = tail.readUInt16LE(eocd + 10);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    let offset = centralOffset;
    for (let i = 0; i < totalEntries; i++) {
      const header = Buffer.alloc(46);
      fs.readSync(fd, header, 0, 46, offset);
      if (header.readUInt32LE(0) !== 0x02014b50) break;
      const method = header.readUInt16LE(10);
      const compressedSize = header.readUInt32LE(20);
      const uncompressedSize = header.readUInt32LE(24);
      const fileNameLength = header.readUInt16LE(28);
      const extraLength = header.readUInt16LE(30);
      const commentLength = header.readUInt16LE(32);
      const localHeaderOffset = header.readUInt32LE(42);
      const nameBuf = Buffer.alloc(fileNameLength);
      fs.readSync(fd, nameBuf, 0, fileNameLength, offset + 46);
      entries.push({
        name: nameBuf.toString("utf8"), method, compressedSize, uncompressedSize, localHeaderOffset
      });
      offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

function entryDataStream(zipPath: string, entry: ZipEntry): Readable {
  const fd = fs.openSync(zipPath, "r");
  const local = Buffer.alloc(30);
  fs.readSync(fd, local, 0, 30, entry.localHeaderOffset);
  fs.closeSync(fd);
  if (local.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid Agoda hotel data ZIP entry.");
  const fileNameLength = local.readUInt16LE(26);
  const extraLength = local.readUInt16LE(28);
  const start = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const end = start + entry.compressedSize - 1;
  const source = fs.createReadStream(zipPath, { start, end });
  if (entry.method === 0) return source;
  if (entry.method === 8) return source.pipe(zlib.createInflateRaw());
  throw new Error(`Unsupported Agoda ZIP compression method ${entry.method}.`);
}

async function buildCityIndexFromDelimited(zipPath: string, entry: ZipEntry) {
  const rl = readline.createInterface({ input: entryDataStream(zipPath, entry), crlfDelay: Infinity });
  let delimiter = ",";
  let headers: string[] | null = null;
  let cityIdIdx = -1;
  let cityNameIdx = -1;
  let countryIdx = -1;
  let rows = 0;
  for await (const raw of rl) {
    const line = String(raw || "").replace(/^\uFEFF/, "").trim();
    if (!line) continue;
    if (!headers) {
      delimiter = detectDelimiter(line);
      headers = splitCsvLine(line, delimiter);
      cityIdIdx = findHeaderIndex(headers, ["cityid", "city id", "city_id"]);
      cityNameIdx = findHeaderIndex(headers, ["city", "cityname", "city name", "city_name"]);
      countryIdx = findHeaderIndex(headers, ["country", "countryname", "country name", "country_name"]);
      if (cityIdIdx < 0 || cityNameIdx < 0) {
        throw new Error(`Agoda hotel data headers not recognized in ${entry.name}.`);
      }
      continue;
    }
    const cols = splitCsvLine(line, delimiter);
    const cityId = Number.parseInt(cols[cityIdIdx] || "", 10);
    const cityName = String(cols[cityNameIdx] || "").trim();
    const country = countryIdx >= 0 ? String(cols[countryIdx] || "").trim() : "";
    if (Number.isFinite(cityId) && cityId > 0 && cityName) addCity({ cityId, cityName, country });
    rows++;
  }
  return rows;
}

async function downloadHotelData(url: string, destination: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`Hotel data download failed (${response.status}).`);
    const file = fs.createWriteStream(destination);
    await new Promise<void>((resolve, reject) => {
      Readable.fromWeb(response.body as any).pipe(file).on("finish", resolve).on("error", reject);
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function getAgodaStatus() {
  return {
    configured: !!(process.env.AGODA_SITE_ID && process.env.AGODA_API_KEY),
    cityFeedConfigured: !!process.env.AGODA_HOTEL_DATA_URL,
    cityIndexReady,
    cityKeys: cityIndex.size,
    cityIndexError: cityIndexError || undefined,
  };
}

export async function warmAgodaCityIndex(force = false): Promise<void> {
  if (cityIndexReady && !force) return;
  if (cityIndexLoading && !force) return cityIndexLoading;
  cityIndexLoading = (async () => {
    const feedUrl = String(process.env.AGODA_HOTEL_DATA_URL || "").trim();
    if (!feedUrl) throw new Error("AGODA_HOTEL_DATA_URL is not configured.");
    const zipPath = path.join(os.tmpdir(), "tripbalancing-agoda-hoteldata.zip");
    try {
      cityIndex.clear();
      cityIndexReady = false;
      cityIndexError = "";
      if (force || !fs.existsSync(zipPath)) await downloadHotelData(feedUrl, zipPath);
      const entries = readZipEntries(zipPath)
        .filter((e) => /\.(csv|txt|tsv)$/i.test(e.name) && e.uncompressedSize > 0)
        .sort((a, b) => b.uncompressedSize - a.uncompressedSize);
      if (!entries.length) throw new Error("No supported CSV/TXT file was found inside the Agoda hotel data ZIP.");
      let parsed = false;
      let lastError: unknown;
      for (const entry of entries.slice(0, 6)) {
        try {
          await buildCityIndexFromDelimited(zipPath, entry);
          if (cityIndex.size > 0) { parsed = true; break; }
        } catch (err) { lastError = err; }
      }
      if (!parsed) throw lastError || new Error("Could not build the Agoda city index.");
      cityIndexReady = true;
      console.log(`[Agoda] City index ready with ${cityIndex.size} searchable keys.`);
    } catch (err: any) {
      cityIndexError = err?.message || String(err);
      console.warn("[Agoda] City index unavailable:", cityIndexError);
    }
  })().finally(() => { cityIndexLoading = null; });
  return cityIndexLoading;
}

export function resolveAgodaCity(destination: string): CityRecord | null {
  if (!cityIndexReady) return null;
  const normalized = normalizeName(destination);
  const direct = cityIndex.get(normalized);
  if (direct?.length) return direct[0];
  const parts = normalized.split(" ").filter(Boolean);
  for (let len = Math.min(parts.length, 5); len >= 1; len--) {
    for (let i = 0; i <= parts.length - len; i++) {
      const key = parts.slice(i, i + len).join(" ");
      const matches = cityIndex.get(key);
      if (matches?.length) return matches[0];
    }
  }
  return null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function searchAgodaHotels(input: {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  adults?: number;
  children?: number;
  currency?: string;
  maxResult?: number;
}): Promise<{ city: CityRecord; hotels: AgodaHotelResult[] }> {
  const siteId = String(process.env.AGODA_SITE_ID || "").trim();
  const apiKey = String(process.env.AGODA_API_KEY || "").trim();
  if (!siteId || !apiKey) throw new Error("Agoda API credentials are not configured.");
  if (!validDate(input.checkInDate) || !validDate(input.checkOutDate)) throw new Error("Invalid Agoda stay dates.");
  if (!cityIndexReady) await warmAgodaCityIndex(false);
  const city = resolveAgodaCity(input.destination);
  if (!city) throw new Error(`Agoda city ID not found for ${input.destination}.`);

  const adults = Math.max(1, Math.min(20, Math.floor(Number(input.adults) || 2)));
  const children = Math.max(0, Math.min(10, Math.floor(Number(input.children) || 0)));
  const currency = /^[A-Z]{3}$/.test(String(input.currency || "").toUpperCase()) ? String(input.currency).toUpperCase() : "USD";
  const maxResult = Math.max(1, Math.min(30, Math.floor(Number(input.maxResult) || 12)));
  const cacheKey = [city.cityId, input.checkInDate, input.checkOutDate, adults, children, currency, maxResult].join("|");
  const cached = hotelSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_TTL) return { city, hotels: cached.data };

  const endpoint = String(process.env.AGODA_API_URL || "http://affiliateapi7643.agoda.com/affiliateservice/lt_v1").trim();
  const body = {
    criteria: {
      additional: {
        currency,
        dailyRate: { minimum: 0, maximum: 100000 },
        discountOnly: false,
        language: "en-us",
        maxResult,
        minimumReviewScore: 0,
        minimumStarRating: 0,
        occupancy: { numberOfAdult: adults, numberOfChildren: children },
        sortBy: "Recommended"
      },
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      cityId: city.cityId
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip,deflate",
        "Authorization": `${siteId}:${apiKey}`
      },
      body: JSON.stringify(body)
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* handled below */ }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`Agoda search failed: ${detail}`);
  }
  if (payload?.error) throw new Error(`Agoda search failed: ${payload.error.message || payload.error.id || "unknown error"}`);
  const hotels: AgodaHotelResult[] = Array.isArray(payload?.results)
    ? payload.results.filter((h: any) => h?.hotelId && h?.hotelName && h?.landingURL).map((h: any) => ({
        hotelId: Number(h.hotelId),
        hotelName: String(h.hotelName),
        starRating: Number(h.starRating) || 0,
        reviewScore: Number(h.reviewScore) || 0,
        reviewCount: Number(h.reviewCount) || undefined,
        currency: String(h.currency || currency),
        dailyRate: Number(h.dailyRate) || 0,
        crossedOutRate: Number(h.crossedOutRate) || undefined,
        discountPercentage: Number(h.discountPercentage ?? h.discountPercent) || undefined,
        imageURL: h.imageURL ? String(h.imageURL).replace(/^http:/i, "https:") : undefined,
        landingURL: String(h.landingURL),
        includeBreakfast: Boolean(h.includeBreakfast),
        freeWifi: Boolean(h.freeWifi),
      }))
    : [];
  hotelSearchCache.set(cacheKey, { at: Date.now(), data: hotels });
  return { city, hotels };
}
