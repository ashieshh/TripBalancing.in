import { useState, useEffect } from "react";
import { 
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, Snowflake, 
  CloudLightning, Wind, Droplets, ThermometerSun, AlertCircle, Calendar, Sparkles, Thermometer,
  Info
} from "lucide-react";

interface DestinationWeatherProps {
  destination: string;
  latitude?: number;
  longitude?: number;
  startDate?: string;
  endDate?: string;
}

interface WeatherDay {
  dayName: string;
  tempMax: number;
  tempMin: number;
  condition: string;
  iconType: string;
  precipitation: string;
  humidity: string;
}

interface WeatherSource {
  title: string;
  url: string;
}

// Map custom icon types to lucide icons and tailwind styles
function getWeatherIcon(iconType: string) {
  const normalized = (iconType || "").toLowerCase().trim();
  switch (normalized) {
    case "sunny":
      return { icon: Sun, color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30" };
    case "partly-cloudy":
      return { icon: CloudSun, color: "text-sky-500 bg-sky-50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900/30" };
    case "cloudy":
      return { icon: Cloud, color: "text-slate-600 bg-slate-50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-900" };
    case "rainy":
      return { icon: CloudRain, color: "text-blue-500 bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30" };
    case "snowy":
      return { icon: Snowflake, color: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-100 dark:border-cyan-900/30" };
    case "windy":
      return { icon: Wind, color: "text-teal-500 bg-teal-50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900/30" };
    case "stormy":
    case "thunderstorm":
      return { icon: CloudLightning, color: "text-purple-500 bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30" };
    default:
      return { icon: Cloud, color: "text-slate-600 bg-slate-50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-900" };
  }
}

export default function DestinationWeather({ destination, startDate, endDate }: DestinationWeatherProps) {
  const [summary, setSummary] = useState<string>("");
  const [forecast, setForecast] = useState<WeatherDay[]>([]);
  const [sources, setSources] = useState<WeatherSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchWeather() {
      // Check client-side weather cache first to prevent redundant network requests and load instantly
      const cacheKey = `weather_grounded_${destination.toLowerCase().trim()}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const { timestamp, data } = JSON.parse(cached);
          // Cache weather for 3 hours
          if (Date.now() - timestamp < 3 * 60 * 60 * 1000) {
            setForecast(data.forecast);
            setSummary(data.summary);
            setSources(data.sources || []);
            setIsFallback(data.isFallback || false);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("Failed to parse weather cache:", e);
        }
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/weather", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destination, startDate, endDate }),
        });

        if (!response.ok) {
          throw new Error("Failed to load weather forecast from the AI server.");
        }

        const data = await response.json();
        
        if (active) {
          setForecast(data.forecast || []);
          setSummary(data.summary || "7-Day Weather Forecast loaded successfully.");
          setSources(data.sources || []);
          setIsFallback(data.isFallback || false);

          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              data
            }));
          } catch (e) {
            console.warn("Failed to write weather cache:", e);
          }
        }
      } catch (err: any) {
        console.error("Weather load error:", err);
        if (active) {
          setError(err.message || "Failed to query weather API.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchWeather();

    return () => {
      active = false;
    };
  }, [destination, startDate, endDate]);

  // Generate a smart recommendation based on weather conditions
  const getSmartRecommendation = () => {
    if (forecast.length === 0) return null;

    let rainyDays = 0;
    let highTempDays = 0;
    let coldDays = 0;

    forecast.forEach((day) => {
      const isRainy = day.condition.toLowerCase().includes("rain") || day.condition.toLowerCase().includes("shower") || day.condition.toLowerCase().includes("storm");
      if (isRainy) rainyDays++;
      if (day.tempMax > 32) highTempDays++;
      if (day.tempMin < 12) coldDays++;
    });

    if (rainyDays >= 3) {
      return {
        title: "Pack Wet-Weather Essentials",
        tip: "Heavy rains or showers are forecasted over the next few days. Keep umbrellas and waterproof jackets handy, and consider focusing more on indoor sightseeing or cozy museum visits."
      };
    }
    if (highTempDays >= 3) {
      return {
        title: "Extreme Heat Advisory",
        tip: "High temperatures exceeding 32°C are anticipated. Stay fully hydrated, use sunscreen, and schedule outdoor hikes or walking tours for early morning hours."
      };
    }
    if (coldDays >= 3) {
      return {
        title: "Cold Temperature Warning",
        tip: "Chillier conditions expected down to under 12°C. Make sure to pack warm thermal layers, a windproof outer jacket, and warm socks for evening excursions."
      };
    }

    return {
      title: "Excellent Travel Conditions",
      tip: "The forecast shows balanced, pleasant weather! Perfect for active city exploration, local walking tours, outdoor photography, and dining on street food paths."
    };
  };

  const smartRec = getSmartRecommendation();

  return (
    <div id="grounded-weather-widget" className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl p-6 space-y-6 shadow-sm transition-all">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-55 dark:border-slate-900 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="p-1.5 bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 rounded-lg">
              <ThermometerSun className="w-4 h-4" />
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">AI Grounded Weather Forecast</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Real-time conditions and smart packing recommendations powered by Google Search for &ldquo;{destination}&rdquo;.
          </p>
        </div>

        {/* Date Context Badge */}
        {!loading && forecast.length > 0 && (
          <div className="flex-shrink-0">
            {isFallback ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-2xl" title="Showing typical seasonal weather as fallback">
                <Info className="w-3.5 h-3.5 text-amber-500" />
                Seasonal Estimate
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900 rounded-2xl">
                <Calendar className="w-3.5 h-3.5 text-teal-500" />
                7-Day Grounded Forecast
              </span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider animate-pulse">Searching Google for Live Weather...</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Retrieving real-time forecasts, temperatures & conditions...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 bg-amber-50/50 dark:bg-amber-950/15 border border-amber-100/45 dark:border-amber-900/35 rounded-2xl text-amber-700 dark:text-amber-400 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : forecast.length === 0 ? (
        <div className="text-center py-6 text-xs text-slate-400 font-bold">
          No weather forecast details currently available.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Box */}
          <div className="p-4 bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-900 rounded-2xl text-xs font-semibold text-slate-650 dark:text-slate-350 leading-relaxed">
            <span className="font-black text-teal-600 dark:text-teal-400 block mb-1">Live Summary:</span>
            {summary}
          </div>

          {/* Weather Grid */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] w-full max-w-full min-w-0 gap-4">
            {forecast.map((day, idx) => {
              const conditionObj = getWeatherIcon(day.iconType || day.condition);
              const WeatherIcon = conditionObj.icon;
              
              return (
                <div 
                  key={idx}
                  className="p-4 border rounded-2xl flex flex-col items-center text-center space-y-3 transition-all bg-slate-50/30 hover:bg-slate-50 dark:bg-slate-900/10 dark:hover:bg-slate-900/35 border-slate-100 dark:border-slate-900/60 shadow-sm"
                >
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 block">
                    {day.dayName}
                  </span>

                  <div className={`p-3 rounded-2xl border ${conditionObj.color}`}>
                    <WeatherIcon className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200 block truncate w-full max-w-[100px]" title={day.condition}>
                      {day.condition}
                    </span>
                    <div className="flex items-center justify-center gap-1.5 text-xs">
                      <span className="font-black text-slate-850 dark:text-slate-100">{day.tempMax}°C</span>
                      <span className="text-slate-400 dark:text-slate-500">/</span>
                      <span className="font-bold text-slate-500 dark:text-slate-400">{day.tempMin}°C</span>
                    </div>
                  </div>

                  {/* Extras info */}
                  <div className="w-full border-t border-slate-100 dark:border-slate-900 pt-2 flex items-center justify-around text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                    <span className="flex items-center gap-0.5" title="Precipitation Probability">
                      <Droplets className="w-3 h-3 text-blue-400" />
                      {day.precipitation}
                    </span>
                    <span className="flex items-center gap-0.5" title="Humidity">
                      <Thermometer className="w-3 h-3 text-teal-400" />
                      {day.humidity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Smart Weather Insight Box */}
          {smartRec && (
            <div className="flex gap-4 p-5 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 dark:from-teal-950/15 dark:to-emerald-950/15 border border-teal-100/40 dark:border-teal-900/20 rounded-2xl items-start">
              <span className="p-2 bg-teal-500/10 dark:bg-teal-500/25 rounded-xl text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </span>
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  {smartRec.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                  {smartRec.tip}
                </p>
              </div>
            </div>
          )}

          {/* Grounding Sources */}
          {sources && sources.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-900 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-450 dark:text-slate-500">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                <Sparkles className="w-3.5 h-3.5 text-teal-500 animate-pulse" />
                <span>AI Grounded via Google Search</span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[10px]">References:</span>
                {sources.map((src: any, i: number) => (
                  <a 
                    key={i} 
                    href={src.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-teal-600 dark:text-teal-400 hover:underline font-bold flex items-center gap-1 text-[11px]"
                  >
                    {src.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
