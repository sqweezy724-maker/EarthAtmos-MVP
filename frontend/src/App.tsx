import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { fetchForecast, getTimezone } from "./api/weather";
import type { ForecastResponse } from "./types/weather";
import { useLang } from "./context/LangContext";
import { t } from "./i18n/translations";

import { Header } from "./components/Header";
import { SearchBar } from "./components/SearchBar";
import { DayStrip } from "./components/DayStrip";
import { CurrentWeather } from "./components/CurrentWeather";
import { StatsGrid } from "./components/StatsGrid";
import { AnomalyBanner } from "./components/AnomalyBanner";
import { HourlyTimeline } from "./components/HourlyTimeline";
import { HourlyChart } from "./components/HourlyChart";
import { MapModal } from "./components/MapModal";
import { EmptyState } from "./components/EmptyState";

interface TzInfo {
  timezone: string;
  offset: number;
  localTime: string;
}

export default function App() {
  const { lang } = useLang();
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [tz, setTz] = useState<TzInfo>({ timezone: "UTC", offset: 0, localTime: "--:--" });
  const [mapOpen, setMapOpen] = useState(false);

  const handleSearch = async (city: string) => {
    setLoading(true);
    setError(null);
    setSelected(0);
    try {
      const result = await fetchForecast(city);
      setData(result);
      const tzData = await getTimezone(result.location.lat, result.location.lon);
      setTz(tzData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  // Refresh local time every minute
  useEffect(() => {
    if (!data) return;
    const id = setInterval(async () => {
      try {
        const tzData = await getTimezone(data.location.lat, data.location.lon);
        setTz(tzData);
      } catch {}
    }, 60000);
    return () => clearInterval(id);
  }, [data]);

  const day = data?.forecast[selected];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
      padding: "28px 16px 60px", gap: 20,
    }}>
      <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
        <Header />
        <SearchBar onSearch={handleSearch} onOpenMap={() => setMapOpen(true)} loading={loading} />

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 32 }}
            >
              <div style={{
                width: 32, height: 32, border: "3px solid var(--border)",
                borderTop: "3px solid var(--accent)", borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }} />
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>{t(lang, "loading")}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {error && !loading && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                padding: "12px 16px", borderRadius: "var(--radius)",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "var(--red)", fontSize: 13, textAlign: "center",
              }}
            >
              ⚠ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <AnimatePresence>
          {data && !loading && day && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <DayStrip forecast={data.forecast} selected={selected} onSelect={setSelected} />
              <CurrentWeather data={data} day={day} tz={tz} />
              <AnomalyBanner anomaly={day.anomaly} />
              <StatsGrid summary={day.summary} />
              <HourlyTimeline hourly={day.hourly} />
              <HourlyChart hourly={day.hourly} />

              {/* Footer */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 11, color: "var(--text-3)", padding: "4px 0",
              }}>
                <span>{t(lang, "dataSource")} · {data.data_days} {t(lang, "days")}</span>
                <span>{t(lang, "lastObs")}: {data.latest_observation}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!data && !loading && !error && <EmptyState />}
      </div>

      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onSelect={handleSearch}
        center={data?.location}
      />
    </div>
  );
}