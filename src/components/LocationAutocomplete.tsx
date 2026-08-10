import { ReactNode, useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";

export interface LocationSuggestion {
  canonicalName: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface LocationAutocompleteProps {
  label: string;
  icon?: ReactNode;
  value: string;
  confirmed: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: LocationSuggestion) => void;
}

export default function LocationAutocomplete({
  label,
  icon,
  value,
  confirmed,
  placeholder = "Start typing a city...",
  onChange,
  onSelect,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const requestId = useRef(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (confirmed || query.length < 2) {
      setSuggestions([]);
      setMessage("");
      return;
    }

    const currentRequest = ++requestId.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch(`/api/location-suggestions?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (currentRequest !== requestId.current) return;
        const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(next);
        setMessage(next.length === 0 ? "No matching city found. Try a different spelling." : "");
        setOpen(true);
      } catch {
        if (currentRequest === requestId.current) {
          setSuggestions([]);
          setMessage("Location search is temporarily unavailable.");
          setOpen(true);
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value, confirmed]);

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
        {icon || <MapPin className="h-4 w-4 text-teal-500" />}
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={value}
          onFocus={() => !confirmed && value.trim().length >= 2 && setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`input-field !pl-10 !pr-10 ${confirmed ? "border-teal-500/70 ring-2 ring-teal-500/10" : ""}`}
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
          ) : confirmed ? (
            <Check className="h-4 w-4 text-teal-500" />
          ) : value ? (
            <button type="button" onClick={() => onChange("")} className="text-slate-400 hover:text-slate-600" aria-label={`Clear ${label}`}>
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {confirmed && <p className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">✓ Location selected</p>}

      {open && !confirmed && value.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.canonicalName}-${suggestion.latitude}-${suggestion.longitude}`}
              type="button"
              onClick={() => {
                onSelect(suggestion);
                setOpen(false);
                setSuggestions([]);
              }}
              className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-teal-50 dark:border-slate-900 dark:hover:bg-teal-950/20"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{suggestion.name}</div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {[suggestion.admin1, suggestion.country].filter(Boolean).join(", ")}
                </div>
              </div>
            </button>
          ))}
          {!loading && message && <div className="px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-400">{message}</div>}
        </div>
      )}
    </div>
  );
}
