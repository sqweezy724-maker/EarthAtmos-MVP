import { useState, useEffect, useCallback, useRef } from "react";
import { searchCities, getEnglishName, type GeocodeSuggestion } from "../api/geocode";
import type { Lang } from "../i18n/translations";

const STORAGE_KEY = "ea-recent-cities";
const MAX_RECENT  = 5;
const DEBOUNCE_MS = 350;

export interface RecentCity {
  name:      string;   // English name for backend
  localName: string;   // Display name in user's language
  lat:       number;
  lon:       number;
}

// ── Safely parse whatever is in localStorage ──────────────────────────────────
// Old format: string[]  →  "Almaty", "Moscow"
// New format: RecentCity[]
function loadRecent(): RecentCity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: unknown): RecentCity | null => {
        // New format — object with name field
        if (item && typeof item === "object" && "name" in item) {
          const r = item as Record<string, unknown>;
          const name = typeof r.name === "string" ? r.name : "";
          if (!name) return null;
          return {
            name,
            localName: typeof r.localName === "string" ? r.localName : name,
            lat:       typeof r.lat === "number" ? r.lat : 0,
            lon:       typeof r.lon === "number" ? r.lon : 0,
          };
        }

        // Old format — plain string
        if (typeof item === "string" && item.trim()) {
          return {
            name:      item.trim(),
            localName: item.trim(),
            lat:       0,
            lon:       0,
          };
        }

        return null;
      })
      .filter((x): x is RecentCity => x !== null)
      .slice(0, MAX_RECENT);

  } catch {
    return [];
  }
}

function saveRecent(list: RecentCity[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

export function useCitySearch(lang: Lang) {
  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching,   setSearching]   = useState(false);
  const [recent,      setRecent]      = useState<RecentCity[]>(loadRecent);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Debounced Nominatim search ─────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();

    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchCities(q, lang);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, lang]);

  // ── Add to recent list ─────────────────────────────────────────────────────
  const addRecent = useCallback((city: RecentCity) => {
    if (!city?.name) return;

    setRecent((prev) => {
      const filtered = prev.filter(
        (c) => c.name.toLowerCase() !== city.name.toLowerCase()
      );
      const next = [city, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  // ── Select a Nominatim suggestion ─────────────────────────────────────────
  const selectSuggestion = useCallback(
    async (suggestion: GeocodeSuggestion): Promise<string> => {
      // Fetch English name for backend
      const englishName = suggestion.lat !== 0 && suggestion.lon !== 0
        ? await getEnglishName(suggestion.lat, suggestion.lon)
        : suggestion.localName;

      addRecent({
        name:      englishName,
        localName: suggestion.localName,
        lat:       suggestion.lat,
        lon:       suggestion.lon,
      });

      setQuery("");
      setSuggestions([]);

      return englishName;
    },
    [addRecent]
  );

  // ── Select from recent list ────────────────────────────────────────────────
  const selectRecent = useCallback((city: RecentCity): string => {
    setQuery("");
    setSuggestions([]);
    return city.name; // Already English
  }, []);

  // ── Clear old/corrupt localStorage on mount ────────────────────────────────
  useEffect(() => {
    // Re-save in new format (fixes old string[] format)
    const loaded = loadRecent();
    if (loaded.length > 0) {
      saveRecent(loaded);
      setRecent(loaded);
    }
  }, []);

  return {
    query,
    setQuery,
    suggestions,
    searching,
    recent,
    addRecent,
    selectSuggestion,
    selectRecent,
  };
}