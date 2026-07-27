import { useEffect, useRef, useState } from "react";
import { Activity } from "../types";
import { MapPin, Navigation, RefreshCw, ZoomIn } from "lucide-react";

interface ItineraryMapProps {
  activities: Activity[];
  destinationLat?: number;
  destinationLng?: number;
  destinationName: string;
  dayNumber: number;
}

export default function ItineraryMap({
  activities,
  destinationLat,
  destinationLng,
  destinationName,
  dayNumber
}: ItineraryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to hash location names into stable deterministic coordinates around the destination if they are missing
  const getCoordinates = (activity: Activity, index: number): [number, number] => {
    if (activity.latitude && activity.longitude && !isNaN(activity.latitude) && !isNaN(activity.longitude)) {
      return [activity.latitude, activity.longitude];
    }

    // Deterministic fallback using a hash of the location name
    const locName = activity.location || activity.title || "";
    let hash = 0;
    for (let i = 0; i < locName.length; i++) {
      hash = locName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Spread markers reasonably (approx 1-10km from city center)
    const latOffset = ((hash % 15) / 300) - 0.025 + (index * 0.005);
    const lngOffset = (((hash >> 4) % 15) / 300) - 0.025 + (index * 0.005);
    
    return [destinationLat + latOffset, destinationLng + lngOffset];
  };

  useEffect(() => {
    // Check if Leaflet L is loaded from unpkg
    const L = (window as any).L;
    if (!L) {
      const checkInterval = setInterval(() => {
        if ((window as any).L) {
          clearInterval(checkInterval);
          setMapLoaded(true);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    } else {
      setMapLoaded(true);
    }
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!mapLoaded || !L || !mapContainerRef.current) return;

    if (!destinationLat || !destinationLng || isNaN(destinationLat) || isNaN(destinationLng)) {
      setError("Location not found. Please enter a more specific destination.");
      return;
    }
    setError(null);

    try {
      // 1. Clean up old map instance to prevent "Map container is already initialized" error
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Filter activities with location or coordinate details
      const validActivities = activities.filter(a => a.location || a.latitude);
      if (validActivities.length === 0) {
        // Render simple map centered at destination
        const map = L.map(mapContainerRef.current, {
          center: [destinationLat, destinationLng],
          zoom: 13,
          zoomControl: false
        });
        
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Add destination center marker
        const centerIcon = L.divIcon({
          html: `
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-teal-500/20 border-2 border-teal-500 animate-pulse">
              <div class="w-4 h-4 rounded-full bg-teal-600 shadow-md"></div>
            </div>
          `,
          className: 'destination-center-icon',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        L.marker([destinationLat, destinationLng], { icon: centerIcon })
          .addTo(map)
          .bindPopup(`<b>${destinationName}</b><br/>City Center`)
          .openPopup();

        mapInstanceRef.current = map;
        return;
      }

      // 2. Initialize new map centered at first activity
      const points: [number, number][] = validActivities.map((act, idx) => getCoordinates(act, idx));
      const firstPoint = points[0] || [destinationLat, destinationLng];

      const map = L.map(mapContainerRef.current, {
        center: firstPoint,
        zoom: 14,
        zoomControl: false
      });

      // CartoDB Voyager style tiles (beautiful, clean light theme style ideal for trips)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(map);

      // Re-position zoom buttons to bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersGroup: any[] = [];

      // 3. Add activity markers
      validActivities.forEach((activity, idx) => {
        const coords = points[idx];
        
        // Premium customized numbered pin with Tailwind styles
        const customIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-extrabold text-xs shadow-lg border-2 border-white transition-all transform hover:scale-110">
              ${idx + 1}
              <div class="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-emerald-500 rotate-45 border-r border-b border-white/50"></div>
            </div>
          `,
          className: 'custom-trip-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });

        const popupContent = `
          <div class="p-1 font-sans">
            <span class="inline-block px-1.5 py-0.5 mb-1 text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-600 rounded">
              Stop ${idx + 1} • ${activity.time}
            </span>
            <h5 class="m-0 text-sm font-extrabold text-slate-800">${activity.title}</h5>
            <p class="m-1 text-xs text-slate-500 font-medium">${activity.location || "Local sightseeing"}</p>
            ${activity.cost ? `<span class="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">Est: ${activity.cost}</span>` : ""}
          </div>
        `;

        const marker = L.marker(coords, { icon: customIcon })
          .addTo(map)
          .bindPopup(popupContent);

        markersGroup.push(marker);
      });

      // 4. Connect the route with a premium visual dashed line (Polyline)
      if (points.length > 1) {
        // Main route line (solid/semi-transparent background)
        L.polyline(points, {
          color: "#0d9488", // teal-600
          weight: 4,
          opacity: 0.8,
          lineJoin: 'round'
        }).addTo(map);

        // Glowing dash overlay to suggest directional tracking
        L.polyline(points, {
          color: "#10b981", // emerald-500
          weight: 2,
          opacity: 0.9,
          dashArray: "6, 10",
          lineJoin: 'round'
        }).addTo(map);
      }

      // 5. Fit map bounds perfectly to include all trip stops with padding
      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 16
        });
      }

      mapInstanceRef.current = map;
    } catch (err: any) {
      console.error("Leaflet map initialization failed:", err);
      setError(err?.message || "Map failed to initialize");
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapLoaded, activities, destinationLat, destinationLng]);

  const fitAllMarkers = () => {
    const L = (window as any).L;
    if (!mapInstanceRef.current || !L) return;
    
    const validActivities = activities.filter(a => a.location || a.latitude);
    if (validActivities.length === 0) {
      mapInstanceRef.current.setView([destinationLat, destinationLng], 13);
      return;
    }

    const points = validActivities.map((act, idx) => getCoordinates(act, idx));
    const bounds = L.latLngBounds(points);
    mapInstanceRef.current.fitBounds(bounds, {
      padding: [40, 40]
    });
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/40 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-850/50 flex flex-col h-[350px] relative shadow-inner group">
      {/* Map Element */}
      <div 
        ref={mapContainerRef} 
        id={`leaflet-map-day-${dayNumber}`}
        className="w-full h-full z-10" 
      />

      {/* Loading Overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/95 flex flex-col items-center justify-center gap-3 z-30">
          <RefreshCw className="w-8 h-8 text-teal-500 animate-spin" />
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Loading Map Engine...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 bg-rose-50/90 dark:bg-rose-950/20 flex flex-col items-center justify-center p-6 text-center gap-2 z-30">
          <MapPin className="w-8 h-8 text-rose-500" />
          <h4 className="text-sm font-black text-rose-600 dark:text-rose-400">Map Error</h4>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      )}

      {/* Overlay Information Hub */}
      {mapLoaded && !error && (
        <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-1.5 max-w-[260px] sm:max-w-[320px]">
          <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm px-3.5 py-2.5 rounded-2xl shadow-md border border-slate-100/80 dark:border-slate-850/80 flex items-start gap-2.5">
            <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 rounded-xl text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5">
              <Navigation className="w-3.5 h-3.5" />
            </span>
            <div className="space-y-0.5 pointer-events-auto">
              <h5 className="text-xs font-black text-slate-800 dark:text-slate-100">Day {dayNumber} Route Visualizer</h5>
              <p className="text-[10px] font-semibold text-slate-450 dark:text-slate-400 leading-normal">
                {activities.filter(a => a.location || a.latitude).length} sequential stops plotted for this day's journey.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions (Reset Bounds) */}
      {mapLoaded && !error && (
        <button
          onClick={fitAllMarkers}
          className="absolute bottom-4 left-4 z-20 p-2.5 bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 rounded-2xl shadow-md border border-slate-100 dark:border-slate-850 cursor-pointer transition-all flex items-center justify-center gap-1.5 text-[11px] font-black active:scale-95"
          title="Fit Route to Viewport"
        >
          <ZoomIn className="w-4 h-4" />
          <span>Fit Route</span>
        </button>
      )}
    </div>
  );
}
