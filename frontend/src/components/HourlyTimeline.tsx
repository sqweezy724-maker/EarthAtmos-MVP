import { motion } from "framer-motion";
import type { HourlyData } from "../types/weather";
import { WeatherIcon } from "./WeatherIcon";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";

interface Props {
  hourly: HourlyData[];
}

export function HourlyTimeline({ hourly }: Props) {
  const { lang } = useLang();

  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", marginBottom: 10 }}>
        {t(lang, "hourlyForecast")}
      </h3>
      <div style={{
        display: "flex", gap: 6, overflowX: "auto",
        paddingBottom: 6, scrollbarWidth: "none",
      }}>
        {hourly.map((h) => (
          <motion.div
            key={h.hour}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: h.hour * 0.015 }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 4, minWidth: 50, padding: "8px 6px",
              borderRadius: 10, background: "var(--bg-card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500 }}>{h.time}</span>
            <WeatherIcon type={h.weather_type} hour={h.hour} size={20} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{Math.round(h.temperature)}°</span>
            {h.precipitation_probability > 5 && (
              <span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 600 }}>
                {h.precipitation_probability}%
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}