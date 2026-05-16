import { motion } from "framer-motion";
import { WiHumidity, WiStrongWind, WiBarometer } from "react-icons/wi";
import {
  RiMapPinLine,
  RiCalendarLine,
  RiEyeLine,
  RiTimeLine,
} from "react-icons/ri";
import type { DayForecast, ForecastResponse } from "../types/weather";
import { WeatherIcon } from "./WeatherIcon";
import { AnomalyBadge } from "./AnomalyBadge";
import { localizeDate } from "../api/weather";

interface WeatherCardProps {
  data: ForecastResponse;
  day: DayForecast;
  timezone: string;
  tzOffset: number;
  localTime: string;
}

export function WeatherCard({
  data,
  day,
  timezone,
  tzOffset,
  localTime,
}: WeatherCardProps) {
  const { summary, anomaly } = day;
  const { fullDate } = localizeDate(day.date, timezone, tzOffset);

  const stats = [
    {
      icon: <WiHumidity />,
      label: "Humidity",
      value: `${summary.humidity_avg}%`,
      color: "#3b82f6",
    },
    {
      icon: <WiStrongWind />,
      label: "Wind",
      value: `${summary.wind_speed_avg} m/s`,
      color: "#10b981",
    },
    {
      icon: <WiBarometer />,
      label: "Pressure",
      value: `${summary.pressure_avg} hPa`,
      color: "#8b5cf6",
    },
    {
      icon: <RiEyeLine />,
      label: "Precip.",
      value: `${summary.precipitation_probability}%`,
      color: "#06b6d4",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        padding: 28,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Top */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#64748b",
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <RiMapPinLine />
            {data.city} · {data.location.lat.toFixed(2)}°N,{" "}
            {data.location.lon.toFixed(2)}°E
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            <RiCalendarLine />
            {fullDate}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "#64748b",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            <RiTimeLine />
            {timezone} · Local time: {localTime}
          </div>
        </div>
        <AnomalyBadge anomaly={anomaly} />
      </div>

      {/* Main Temperature */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <motion.div
          key={summary.weather_type}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
        >
          <WeatherIcon type={summary.weather_type} size={80} />
        </motion.div>

        <div>
          <motion.div
            key={summary.temperature_mean}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1,
              background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {summary.temperature_mean}°
          </motion.div>

          <div style={{ color: "#64748b", fontSize: 15, marginTop: 6 }}>
            <span style={{ color: "#ef4444" }}>
              ↑{summary.temperature_max}°
            </span>
            {" / "}
            <span style={{ color: "#3b82f6" }}>
              ↓{summary.temperature_min}°
            </span>
          </div>

          <div
            style={{
              color: "#94a3b8",
              fontSize: 14,
              marginTop: 4,
              textTransform: "capitalize",
            }}
          >
            {summary.weather_type}
            <span style={{ color: "#64748b", fontSize: 12 }}>
              {" "}
              ({Math.round(summary.weather_confidence * 100)}% confidence)
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14,
            }}
          >
            <span style={{ fontSize: 24, color: s.color }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{s.label}</div>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}
              >
                {s.value}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Anomaly detail */}
      {anomaly.level !== "normal" && anomaly.observed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#ef4444",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            ⚠ Weather Anomaly Detected
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 6,
            }}
          >
            {Object.entries(anomaly.observed).map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, color: "#94a3b8" }}>
                <span style={{ color: "#64748b" }}>{k}: </span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div
            style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}
          >
            Anomaly score: {Math.round(anomaly.score * 100)}% ·{" "}
            {anomaly.level}
          </div>
        </motion.div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#475569",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          paddingTop: 12,
        }}
      >
        <span>Data: NASA POWER · {data.data_days} days</span>
        <span>Last obs: {data.latest_observation}</span>
      </div>
    </motion.div>
  );
}