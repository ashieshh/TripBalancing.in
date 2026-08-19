import React, { useEffect, useMemo, useRef } from "react";
import { PlaneTakeoff, ExternalLink } from "lucide-react";
import { Itinerary } from "../types";

const currencyFromBudget = (value?: string) => {
  const text = String(value || "").toUpperCase();
  if (text.includes("AED")) return "aed";
  if (text.includes("EUR") || text.includes("€")) return "eur";
  if (text.includes("GBP") || text.includes("£")) return "gbp";
  if (text.includes("JPY") || text.includes("¥")) return "jpy";
  if (text.includes("USD") || text.includes("$")) return "usd";
  return "inr";
};

// Travelpayouts accepts city/airport names in from_name/to_name. Keep the user's
// real trip locations rather than maintaining a fragile hard-coded airport list.
const widgetLocation = (value?: string) => String(value || "").trim();

export default function LiveFlightSearch({ itinerary }: { itinerary: Itinerary }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const origin = widgetLocation(itinerary.origin);
  const destination = widgetLocation(itinerary.destination);
  const currency = currencyFromBudget(itinerary.budgetAmount || itinerary.estimatedBudgetBreakdown?.total);

  const src = useMemo(() => {
    if (!origin || !destination || !itinerary.startDate || !itinerary.endDate) return "";
    const params = new URLSearchParams({
      currency,
      trs: "563908",
      shmarker: "766498",
      powered_by: "true",
      locale: "en",
      from_name: origin,
      to_name: destination,
      departure: itinerary.startDate,
      return: itinerary.endDate,
      show_header: "true",
      limit: "3",
      primary_color: "00AE98",
      results_background_color: "FFFFFF",
      form_background_color: "FFFFFF",
      campaign_id: "111",
      promo_id: "4478",
    });
    return `https://tpemd.com/content?${params.toString()}`;
  }, [origin, destination, itinerary.startDate, itinerary.endDate, currency]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) return;
    host.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    script.charset = "utf-8";
    script.setAttribute("data-tripbalancing-flight-widget", "true");
    host.appendChild(script);
    return () => { host.innerHTML = ""; };
  }, [src]);

  if (!src) return null;

  return (
    <section className="space-y-4 border-t border-slate-100 dark:border-slate-900 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PlaneTakeoff className="w-5 h-5 text-teal-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Check Live Flights</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {origin} → {destination} · {itinerary.startDate} to {itinerary.endDate} · {itinerary.travelers || 1} traveler{(itinerary.travelers || 1) === 1 ? "" : "s"}
          </p>
        </div>
        <ExternalLink className="w-4 h-4 text-slate-400" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white min-h-[260px]">
        <div ref={hostRef} className="w-full" />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Live search results are provided by Kiwi.com through Travelpayouts. Prices and availability can change at booking. The planned budget above remains TripBalancing's estimate until a live fare is selected.
      </p>
    </section>
  );
}
