import { useRef, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RiSearchLine,
  RiTimeLine,
  RiMapPin2Line,
  RiMapPinLine,
  RiLoader4Line,
  RiGlobalLine,
} from "react-icons/ri";
import { useLang }          from "../context/LangContext";
import { t }                from "../i18n/translations";
import { useCitySearch }    from "../hooks/useCitySearch";
import type { GeocodeSuggestion } from "../api/geocode";

interface Props {
  onSearch:  (city: string) => void;
  onOpenMap: () => void;
  loading:   boolean;
}

export function SearchBar({ onSearch, onOpenMap, loading }: Props) {
  const { lang } = useLang();
  const {
    query, setQuery,
    suggestions, searching,
    recent,
    selectSuggestion, selectRecent, addRecent,
  } = useCitySearch(lang);

  const [focused,       setFocused]       = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Submit by typing ───────────────────────────────────────────────────────
  const submitQuery = () => {
    const val = query.trim();
    if (!val) return;
    addRecent({ name: val, localName: val, lat: 0, lon: 0 });
    setQuery("");
    setFocused(false);
    setSelectedIndex(-1);
    onSearch(val);
  };

  // ── Submit from suggestion ─────────────────────────────────────────────────
  const handleSuggestionClick = async (s: GeocodeSuggestion) => {
    const english = await selectSuggestion(s);
    setFocused(false);
    setSelectedIndex(-1);
    onSearch(english);
  };

  // ── Submit from recent ─────────────────────────────────────────────────────
  const handleRecentClick = (city: { name: string }) => {
    const name = selectRecent(city as any);
    setFocused(false);
    setSelectedIndex(-1);
    onSearch(name);
  };

  // ── Keyboard navigation ────────────────────────────────────────────────────
  const totalItems =
    suggestions.length + (query.trim().length < 2 ? recent.length : 0);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((p) => (p + 1) % Math.max(totalItems, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((p) => (p - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1));
        break;
      case "Enter":
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else if (
          query.trim().length < 2 &&
          selectedIndex >= suggestions.length &&
          selectedIndex < suggestions.length + recent.length
        ) {
          handleRecentClick(recent[selectedIndex - suggestions.length]);
        } else {
          submitQuery();
        }
        setSelectedIndex(-1);
        break;
      case "Escape":
        setFocused(false);
        setSelectedIndex(-1);
        break;
      default:
        setSelectedIndex(-1);
    }
  };

  const showDropdown =
    focused &&
    (suggestions.length > 0 ||
      searching ||
      (query.trim().length < 2 && recent.length > 0) ||
      (query.trim().length < 2 && recent.length === 0));

  return (
    <div style={{ position: "relative", width: "100%" }}>

      {/* ── Input row ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-card)",
          border: `1.5px solid ${focused ? "var(--border-focus)" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          padding: "10px 14px",
          boxShadow: focused ? "0 0 0 3px var(--accent-soft)" : "var(--shadow)",
          transition: "all 0.2s",
        }}
      >
        {searching
          ? <RiLoader4Line style={{ fontSize: 18, color: "var(--accent)", flexShrink: 0, animation: "spin 1s linear infinite" }} />
          : <RiSearchLine  style={{ fontSize: 18, color: "var(--text-3)", flexShrink: 0 }} />
        }

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 250)}
          onKeyDown={handleKey}
          placeholder={t(lang, "search")}
          style={{ flex: 1, fontSize: 14, color: "var(--text-1)" }}
        />

        {/* Map button */}
        <button
          onClick={onOpenMap}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "5px 10px", borderRadius: 8,
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-2)", fontSize: 12,
            transition: "all 0.2s",
          }}
        >
          <RiMapPinLine style={{ fontSize: 14 }} />
          {t(lang, "pickOnMap")}
        </button>

        {/* Search button */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={submitQuery}
          disabled={loading || !query.trim()}
          style={{
            padding: "6px 16px", borderRadius: 8,
            background: loading || !query.trim() ? "var(--bg-input)" : "var(--accent)",
            color:      loading || !query.trim() ? "var(--text-3)" : "#fff",
            fontSize: 13, fontWeight: 600,
            opacity: loading || !query.trim() ? 0.6 : 1,
            transition: "all 0.2s",
          }}
        >
          {loading ? "..." : t(lang, "searchBtn")}
        </motion.button>
      </div>

      {/* ── Dropdown ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 50, overflow: "hidden",
              maxHeight: 360, overflowY: "auto",
            }}
          >

            {/* Searching spinner */}
            {searching && suggestions.length === 0 && (
              <div style={{
                padding: "14px", display: "flex", alignItems: "center",
                gap: 8, color: "var(--text-3)", fontSize: 13,
              }}>
                <RiLoader4Line style={{ animation: "spin 1s linear infinite" }} />
                {t(lang, "searching")}
              </div>
            )}

            {/* ── Live suggestions ─────────────────────────────────────────── */}
            {suggestions.map((s, i) => (
              <button
                key={`suggestion-${s.lat.toFixed(4)}-${s.lon.toFixed(4)}-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSuggestionClick(s)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  width: "100%", padding: "10px 14px", textAlign: "left",
                  color: "var(--text-1)", fontSize: 14,
                  background: selectedIndex === i ? "var(--bg-hover)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <RiMapPin2Line style={{
                  fontSize: 16, color: "var(--accent)",
                  marginTop: 2, flexShrink: 0,
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{s.localName}</div>
                  <div style={{
                    fontSize: 11, color: "var(--text-3)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {s.country && <span>{s.country} · </span>}
                    {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°
                  </div>
                </div>
              </button>
            ))}

            {/* No results message */}
            {!searching && query.trim().length >= 2 && suggestions.length === 0 && (
              <div style={{
                padding: "14px", color: "var(--text-3)",
                fontSize: 13, textAlign: "center",
              }}>
                {t(lang, "noResults")}
              </div>
            )}

            {/* ── Recent searches (shown when query is empty) ───────────────── */}
            {query.trim().length < 2 && recent.length > 0 && (
              <div style={{ padding: "8px 14px 10px" }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-3)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  marginBottom: 6,
                }}>
                  {t(lang, "recentSearches")}
                </div>
                {recent.map((city, i) => (
                  <button
                    key={`recent-${city.name}-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleRecentClick(city)}
                    onMouseEnter={() => setSelectedIndex(suggestions.length + i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "8px 4px", textAlign: "left",
                      color: "var(--text-1)", fontSize: 13,
                      background: selectedIndex === suggestions.length + i
                        ? "var(--bg-hover)" : "transparent",
                      borderRadius: 6,
                      transition: "background 0.1s",
                    }}
                  >
                    <RiTimeLine style={{ color: "var(--text-3)", fontSize: 14 }} />
                    <span>{city.localName || city.name}</span>
                    {city.localName && city.localName !== city.name && (
                      <span style={{ color: "var(--text-3)", fontSize: 11 }}>
                        ({city.name})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Empty state hint ─────────────────────────────────────────── */}
            {query.trim().length < 2 && recent.length === 0 && (
              <div style={{
                padding: "14px", display: "flex", alignItems: "center",
                gap: 8, color: "var(--text-3)", fontSize: 12,
              }}>
                <RiGlobalLine style={{ fontSize: 16 }} />
                {t(lang, "typeToSearch")}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}