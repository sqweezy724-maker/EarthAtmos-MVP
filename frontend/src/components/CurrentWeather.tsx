import { motion } from "framer-motion";
import { RiMapPinLine, RiTimeLine } from "react-icons/ri";
import { WiSunrise, WiSunset } from "react-icons/wi";
import type { DayForecast, ForecastResponse } from "../types/weather";
import { WeatherIcon } from "./WeatherIcon";
import { useLang } from "../context/LangContext";
import { t, WEATHER_NAMES, WEEKDAYS_SHORT, MONTHS } from "../i18n/translations";

interface Props {
  data: ForecastResponse;
  day: DayForecast;
  tz: { timezone: string; localTime: string };
}

export function CurrentWeather({ data, day, tz }: Props) {
  const { lang } = useLang();
  const s = day.summary;
  const d = new Date(day.date);

  const dateStr = lang === "ru"
    ? `${d.getDate()} ${MONTHS.ru[d.getMonth()]}, ${WEEKDAYS_SHORT.ru[d.getDay()]}`
    : `${WEEKDAYS_SHORT.en[d.getDay()]}, ${MONTHS.en[d.getMonth()]} ${d.getDate()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 24,
        boxShadow: "var(--shadow)",
      }}
    >
      {/* Location + Date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
            <RiMapPinLine style={{ color: "var(--accent)" }} />
            {data.city}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            {dateStr}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-3)" }}>
            <RiTimeLine />
            {tz.localTime} · {tz.timezone}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <WeatherIcon type={s.weather_type} size={64} />
        <div>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, color: "var(--text-1)" }}>
            {Math.round(s.temperature_mean)}°
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
            {WEATHER_NAMES[lang][s.weather_type] ?? s.weather_type}
            <span style={{ color: "var(--text-3)", fontSize: 11 }}>
              {" "}· {Math.round(s.weather_confidence * 100)}% {t(lang, "confidence")}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>
            ↑{Math.round(s.temperature_max)}° ↓{Math.round(s.temperature_min)}°
          </div>
        </div>
      </div>

      {/* Sunrise / Sunset */}
      <div style={{
        display: "flex", gap: 20, marginTop: 20, paddingTop: 16,
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <WiSunrise style={{ fontSize: 22, color: "#f59e0b" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{t(lang, "sunrise")}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{data.sunrise}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <WiSunset style={{ fontSize: 22, color: "#f97316" }} />
          <div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{t(lang, "sunset")}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{data.sunset}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}