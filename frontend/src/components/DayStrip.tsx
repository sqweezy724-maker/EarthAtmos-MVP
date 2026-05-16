import { motion } from "framer-motion";
import type { DayForecast } from "../types/weather";
import { WeatherIcon } from "./WeatherIcon";
import { useLang } from "../context/LangContext";
import { t, WEEKDAYS_SHORT } from "../i18n/translations";

interface Props {
  forecast: DayForecast[];
  selected: number;
  onSelect: (i: number) => void;
}

export function DayStrip({ forecast, selected, onSelect }: Props) {
  const { lang } = useLang();

  return (
    <div style={{
      display: "flex", gap: 6, overflowX: "auto",
      paddingBottom: 4, scrollbarWidth: "none",
    }}>
      {forecast.map((day, i) => {
        const d = new Date(day.date);
        const sel = i === selected;
        const label = i === 0 ? t(lang, "today") : i === 1 ? t(lang, "tomorrow") : WEEKDAYS_SHORT[lang][d.getDay()];

        return (
          <motion.button
            key={day.date}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSelect(i)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 4, padding: "10px 14px", borderRadius: "var(--radius)",
              minWidth: 72, flexShrink: 0,
              background: sel ? "var(--accent)" : "var(--bg-card)",
              border: sel ? "none" : "1px solid var(--border)",
              color: sel ? "#fff" : "var(--text-1)",
              boxShadow: sel ? "0 2px 8px rgba(59,130,246,0.25)" : "var(--shadow)",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {label}
            </span>
            <WeatherIcon type={day.summary.weather_type} size={26} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {Math.round(day.summary.temperature_mean)}°
            </span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              {Math.round(day.summary.temperature_min)}° / {Math.round(day.summary.temperature_max)}°
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}