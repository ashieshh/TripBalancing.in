import { useState, useEffect } from "react";
import { MapPin, ZoomIn, ZoomOut, Compass, Info, Calendar, Sparkles } from "lucide-react";
import { TripRecord } from "../types";

interface WorldMapProps {
  trips: TripRecord[];
  onSelectTrip: (trip: TripRecord) => void;
}

interface MapCoordinate {
  tripId: string;
  destination: string;
  latitude: number;
  longitude: number;
  tripRecord: TripRecord;
}

// Check if coordinates lie roughly on global landmasses to generate a beautiful dotted background
function isGlobalLand(lat: number, lon: number): boolean {
  // North America
  if (lat >= 15 && lat <= 75 && lon >= -168 && lon <= -52) {
    // Exclude Gulf of Mexico
    if (lat >= 15 && lat <= 30 && lon >= -98 && lon <= -82) return false;
    return true;
  }
  // Central America
  if (lat >= 7 && lat < 15 && lon >= -95 && lon <= -75) return true;
  // South America
  if (lat >= -56 && lat < 12 && lon >= -82 && lon <= -34) {
    if (lat >= -56 && lat <= -35 && lon >= -55) return false; // Narrowing southern tip
    return true;
  }
  // Africa
  if (lat >= -35 && lat <= 37 && lon >= -18 && lon <= 51) {
    // Red Sea cutout
    if (lat >= 12 && lat <= 30 && lon >= 32 && lon <= 43) return false;
    return true;
  }
  // Europe & Asia (Eurasia)
  if (lat >= 10 && lat <= 78 && lon >= -10 && lon <= 180) {
    // Cutout Indian Ocean / Arabian Sea
    if (lat >= 10 && lat <= 24 && lon >= 50 && lon <= 72) return false;
    // Bay of Bengal cutout
    if (lat >= 10 && lat <= 20 && lon >= 78 && lon <= 92) return false;
    return true;
  }
  // India (Explicit subcontinent overlay for precision)
  if (lat >= 8 && lat <= 36 && lon >= 68 && lon <= 97) return true;
  // United Kingdom & Ireland
  if (lat >= 50 && lat <= 61 && lon >= -11 && lon <= 2) return true;
  // Japan & Koreas
  if (lat >= 30 && lat <= 46 && lon >= 124 && lon <= 146) return true;
  // Indonesia, Philippines, Malaysia, Southeast Asia islands
  if (lat >= -11 && lat <= 22 && lon >= 95 && lon <= 142) return true;
  // Australia
  if (lat >= -40 && lat <= -10 && lon >= 113 && lon <= 154) return true;
  // New Zealand
  if (lat >= -48 && lat <= -34 && lon >= 165 && lon <= 179) return true;
  // Madagascar
  if (lat >= -26 && lat <= -12 && lon >= 43 && lon <= 51) return true;
  // Greenland
  if (lat >= 60 && lat <= 84 && lon >= -73 && lon <= -12) return true;

  return false;
}

export default function WorldMap({ trips, onSelectTrip }: WorldMapProps) {
  const [coordinates, setCoordinates] = useState<MapCoordinate[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredTrip, setHoveredTrip] = useState<MapCoordinate | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Map settings
  const width = 800;
  const height = 400;

  // Projection formula: Linear Equirectangular projection
  // Maps longitude [-180, 180] to [0, width]
  // Maps latitude [-60, 80] (cropped for better density) to [0, height]
  const getCoordinates = (lat: number, lon: number) => {
    const x = ((lon + 180) * width) / 360;
    // Scale latitude between -60 and 85 to vertical height
    const latMin = -60;
    const latMax = 82;
    const y = height - ((lat - latMin) * height) / (latMax - latMin);
    return { x, y };
  };

  // Resolve coordinates for all trips on mount or changes
  useEffect(() => {
    let active = true;

    async function resolveAllCoordinates() {
      setLoading(true);
      const resolved: MapCoordinate[] = [];

      for (const trip of trips) {
        // 1. Check if itinerary already has latitude and longitude
        if (trip.itinerary.latitude !== undefined && trip.itinerary.longitude !== undefined) {
          resolved.push({
            tripId: trip.id,
            destination: trip.destination,
            latitude: trip.itinerary.latitude,
            longitude: trip.itinerary.longitude,
            tripRecord: trip,
          });
          continue;
        }

        // 2. Geocode on the fly via Express API
        try {
          const res = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination: trip.destination }),
          });
          if (res.ok) {
            const data = await res.json();
            resolved.push({
              tripId: trip.id,
              destination: trip.destination,
              latitude: data.latitude,
              longitude: data.longitude,
              tripRecord: trip,
            });
          }
        } catch (err) {
          console.error(`Geocoding failed for ${trip.destination}`, err);
        }
      }

      if (active) {
        setCoordinates(resolved);
        setLoading(false);
      }
    }

    resolveAllCoordinates();

    return () => {
      active = false;
    };
  }, [trips]);

  // Generate dotted background matrix
  const dots: { x: number; y: number }[] = [];
  const latStep = 4.5;
  const lonStep = 4.5;

  for (let lat = -60; lat <= 82; lat += latStep) {
    for (let lon = -180; lon <= 180; lon += lonStep) {
      if (isGlobalLand(lat, lon)) {
        const { x, y } = getCoordinates(lat, lon);
        dots.push({ x, y });
      }
    }
  }

  return (
    <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl p-6 space-y-4 shadow-sm relative overflow-hidden transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-55 dark:border-slate-900 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <Compass className="w-4 h-4 animate-spin-slow" />
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Your Global Footprint Map</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interactive map visualizing your saved travel plans and explored destinations worldwide.
          </p>
        </div>

        {loading && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 text-xs font-bold animate-pulse">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
            Geolocating Trip Pins...
          </span>
        )}
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl text-slate-400 dark:text-slate-600">
            <Compass className="w-10 h-10" />
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            No saved trip locations to display on the map yet.
          </p>
        </div>
      ) : (
        <div className="relative w-full select-none">
          <div className="w-full max-w-full relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto bg-slate-50/50 dark:bg-slate-900/10 rounded-2xl border border-slate-100 dark:border-slate-900/40"
              style={{ maxHeight: "380px" }}
            >
              {/* Grid Lines */}
              <g className="stroke-slate-100/50 dark:stroke-slate-900/30 stroke-[0.5]" strokeDasharray="3 3">
                {Array.from({ length: 5 }).map((_, i) => {
                  const x = (width / 6) * (i + 1);
                  return <line key={`vl-${i}`} x1={x} y1={0} x2={x} y2={height} />;
                })}
                {Array.from({ length: 3 }).map((_, i) => {
                  const y = (height / 4) * (i + 1);
                  return <line key={`hl-${i}`} x1={0} y1={y} x2={width} y2={y} />;
                })}
              </g>

              {/* Dotted World Map Base */}
              <g className="fill-slate-300/45 dark:fill-slate-800/45">
                {dots.map((dot, idx) => (
                  <circle key={`dot-${idx}`} cx={dot.x} cy={dot.y} r={1.6} />
                ))}
              </g>

              {/* Connections (flight lines) from a common reference or simply connecting adjacent points */}
              {coordinates.length > 1 && (
                <g className="stroke-teal-500/15 dark:stroke-teal-500/10 fill-none stroke-[1.2]" strokeDasharray="4 4">
                  {coordinates.map((coord, idx) => {
                    if (idx === 0) return null;
                    const prev = getCoordinates(coordinates[idx - 1].latitude, coordinates[idx - 1].longitude);
                    const curr = getCoordinates(coord.latitude, coord.longitude);
                    
                    // Create a beautiful curved arc for path connectivity
                    const dx = curr.x - prev.x;
                    const dy = curr.y - prev.y;
                    const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; // Arc curve size
                    return (
                      <path
                        key={`arc-${idx}`}
                        d={`M ${prev.x} ${prev.y} A ${dr} ${dr} 0 0 1 ${curr.x} ${curr.y}`}
                      />
                    );
                  })}
                </g>
              )}

              {/* Trip Location Markers */}
              {coordinates.map((coord) => {
                const { x, y } = getCoordinates(coord.latitude, coord.longitude);
                const isHovered = hoveredTrip?.tripId === coord.tripId;

                return (
                  <g
                    key={`pin-${coord.tripId}`}
                    className="cursor-pointer group"
                    onClick={() => onSelectTrip(coord.tripRecord)}
                    onMouseEnter={(e) => {
                      const svgRect = e.currentTarget.getBoundingClientRect();
                      const parentRect = e.currentTarget.parentElement?.getBoundingClientRect();
                      if (parentRect) {
                        setTooltipPos({
                          x: svgRect.left - parentRect.left + svgRect.width / 2,
                          y: svgRect.top - parentRect.top - 12,
                        });
                      }
                      setHoveredTrip(coord);
                    }}
                    onMouseLeave={() => setHoveredTrip(null)}
                  >
                    {/* Glowing outer aura for hovered item */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 16 : 10}
                      className="fill-teal-500/20 dark:fill-teal-400/25 animate-ping transition-all"
                    />

                    {/* Outer border ring */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 8 : 5.5}
                      className="fill-teal-50 dark:fill-teal-950 stroke-teal-500 dark:stroke-teal-400 stroke-2 transition-all"
                    />

                    {/* Core glowing center point */}
                    <circle
                      cx={x}
                      cy={y}
                      r={2.5}
                      className="fill-teal-600 dark:fill-teal-300"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Custom Floating World Map Tooltip */}
            {hoveredTrip && (
              <div
                className="absolute z-30 bg-slate-900/95 dark:bg-slate-950/95 text-white p-3.5 rounded-2xl shadow-xl border border-slate-800 pointer-events-none w-56 text-left transition-all duration-150 animate-fade-in"
                style={{
                  left: `${tooltipPos.x}px`,
                  top: `${tooltipPos.y}px`,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <span className="inline-block px-2 py-0.5 bg-teal-500/25 text-teal-300 text-[9px] font-extrabold uppercase rounded-full tracking-wider">
                      {hoveredTrip.tripRecord.travelStyle} Style
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      🧭 View
                    </span>
                  </div>
                  
                  <h4 className="text-xs font-bold tracking-tight line-clamp-1 text-slate-100 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    {hoveredTrip.destination}
                  </h4>

                  <div className="flex items-center gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>
                      {new Date(hoveredTrip.tripRecord.startDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      -{" "}
                      {new Date(hoveredTrip.tripRecord.endDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="text-[10px] font-bold text-slate-300">
                    Budget: <span className="text-teal-300">{hoveredTrip.tripRecord.budgetAmount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
