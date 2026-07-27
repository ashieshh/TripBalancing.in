import { useState, useEffect } from "react";
import { CheckSquare, Square, Luggage, Sparkles, Check, RotateCcw, Info, HelpCircle } from "lucide-react";
import { TripRecord } from "../types";

interface GlobalPackingChecklistProps {
  trips: TripRecord[];
}

interface AggregatedItem {
  name: string;
  count: number;
  trips: string[]; // List of destination names this item belongs to
}

export default function GlobalPackingChecklist({ trips }: GlobalPackingChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("tripbalancing_global_packing_checked");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save checked states to localStorage
  useEffect(() => {
    localStorage.setItem("tripbalancing_global_packing_checked", JSON.stringify(checkedItems));
  }, [checkedItems]);

  if (trips.length === 0) {
    return null;
  }

  // Get current date relative to the user's current session date (July 7, 2026)
  const today = new Date("2026-07-07");

  // Filter for upcoming trips
  const upcomingTrips = trips.filter((trip) => {
    const endDate = new Date(trip.endDate);
    return endDate >= today;
  });

  // Fallback to all trips if no upcoming trips are found
  const isUsingFallback = upcomingTrips.length === 0;
  const activeTripsList = isUsingFallback ? trips : upcomingTrips;

  // Aggregate packing list items
  const itemMap: Record<string, AggregatedItem> = {};

  activeTripsList.forEach((trip) => {
    const list = trip.itinerary.packingChecklist || [];
    list.forEach((rawItem) => {
      const cleanName = rawItem.trim();
      if (!cleanName) return;

      const key = cleanName.toLowerCase();
      if (itemMap[key]) {
        itemMap[key].count += 1;
        if (!itemMap[key].trips.includes(trip.destination)) {
          itemMap[key].trips.push(trip.destination);
        }
      } else {
        itemMap[key] = {
          name: cleanName,
          count: 1,
          trips: [trip.destination],
        };
      }
    });
  });

  // Convert map to sorted array
  const aggregatedItems = Object.values(itemMap).sort((a, b) => {
    // Sort by frequency (descending) first
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  const toggleItem = (name: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset your packed items?")) {
      setCheckedItems({});
    }
  };

  const totalItems = aggregatedItems.length;
  const packedCount = aggregatedItems.filter((item) => checkedItems[item.name]).length;
  const packedPercentage = totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0;

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl p-4 sm:p-6 space-y-6 shadow-sm transition-all overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <Luggage className="w-4 h-4" />
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Global Packing Checklist</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isUsingFallback
              ? "Aggregating essential items across all of your saved travel plans."
              : "Consolidated list of packing essentials for your upcoming adventures."}
          </p>
        </div>

        {totalItems > 0 && (
          <button
            id="reset-checklist-btn"
            onClick={handleReset}
            className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Checklist
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100/50 dark:border-slate-900/60 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
          <span>Packing Completion</span>
          <span className="text-teal-600 dark:text-teal-400">{packedCount} of {totalItems} items packed ({packedPercentage}%)</span>
        </div>
        <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
            style={{ width: `${packedPercentage}%` }}
          />
        </div>
      </div>

      {/* Contributing Trips Badges */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
          Trips Consolidated:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {activeTripsList.map((trip) => {
            const isUpcoming = new Date(trip.endDate) >= today;
            return (
              <span
                key={trip.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-xl border ${
                  isUpcoming
                    ? "bg-teal-50/50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900/35 text-teal-700 dark:text-teal-400"
                    : "bg-slate-50 dark:bg-slate-900/25 border-slate-150 dark:border-slate-850 text-slate-500 dark:text-slate-400"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isUpcoming ? "bg-teal-500" : "bg-slate-400"}`} />
                {trip.destination.split(",")[0]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Checklist Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] w-full max-w-full min-w-0 gap-5 max-h-[300px] overflow-y-auto pr-1">
        {aggregatedItems.map((item) => {
          const isChecked = !!checkedItems[item.name];
          const isCommon = item.count > 1;

          return (
            <div
              key={item.name}
              onClick={() => toggleItem(item.name)}
              className={`p-3.5 border rounded-2xl flex items-start gap-3 cursor-pointer select-none transition-all group ${
                isChecked
                  ? "bg-teal-50/10 dark:bg-teal-950/10 border-teal-100/40 dark:border-teal-900/30 opacity-65"
                  : "bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-900 hover:border-teal-200 dark:hover:border-teal-900 shadow-sm"
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {isChecked ? (
                  <div className="w-4 h-4 bg-teal-500 text-white rounded flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-4 h-4 border border-slate-300 dark:border-slate-750 rounded group-hover:border-teal-500 transition-colors" />
                )}
              </div>

              <div className="space-y-1 min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight break-words whitespace-normal ${
                    isChecked ? "line-through text-slate-400 dark:text-slate-500" : ""
                  }`}
                >
                  {item.name}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isCommon && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/30 text-purple-600 dark:text-purple-400 text-[9px] font-extrabold uppercase rounded-md tracking-wider">
                      <Sparkles className="w-2 h-2" />
                      Common x{item.count}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 font-bold dark:text-slate-500 break-words whitespace-normal" title={item.trips.join(", ")}>
                    For: {item.trips.map(t => t.split(",")[0]).join(", ")}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
