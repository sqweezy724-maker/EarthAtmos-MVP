import { motion } from "framer-motion";
import type { DayForecast } from "../types/weather";
import { WeatherIcon } from "./WeatherIcon";
import { localizeDate } from "../api/weather";

interface DaySelectorProps {
  forecast: DayForecast[];
  selectedDay: number;
  onSelect: (index: number) => void;
  timezone: string;
  tzOffset: number;
}

export function DaySelector({
  forecast,
  selectedDay,
  onSelect,
  timezone,
  tzOffset,
}: DaySelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${forecast.length}, 1fr)`,
        gap: 8,
        width: "100%",
      }}
    >
      {forecast.map((day, i) => {
        const isToday = i === 0;
        const selected = i === selectedDay;

        const { dayName, dayNum } = localizeDate(day.date, timezone, tzOffset);
        const displayName = isToday ? "Today" : dayName;

        return (
          <motion.button
            key={day.date}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(i)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "14px 8px",
              borderRadius: 14,
              background: selected
                ? "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(6,182,212,0.15))"
                : "rgba(255,255,255,0.04)",
              border: selected
                ? "1px solid rgba(59,130,246,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              transition: "all 0.2s",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: selected ? "#3b82f6" : "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {displayName}
            </span>

            <WeatherIcon type={day.summary.weather_type} size={28} />

            <span
              style={{
                fontSize: 13,
                color: "#f1f5f9",
                fontWeight: selected ? 700 : 400,
              }}
            >
              {dayNum}
            </span>

            <span style={{ fontSize: 12, color: "#64748b" }}>
              {day.summary.temperature_min}° / {day.summary.temperature_max}°
            </span>

            {day.summary.precipitation_probability > 10 && (
              <span
                style={{
                  fontSize: 11,
                  color: "#3b82f6",
                  fontWeight: 600,
                }}
              >
                {day.summary.precipitation_probability}%
              </span>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}