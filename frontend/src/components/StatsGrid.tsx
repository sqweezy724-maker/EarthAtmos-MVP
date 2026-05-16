import { motion } from "framer-motion";
import { WiHumidity, WiStrongWind, WiBarometer, WiRaindrop } from "react-icons/wi";
import type { DailySummary } from "../types/weather";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";

interface Props {
  summary: DailySummary;
}

export function StatsGrid({ summary: s }: Props) {
  const { lang } = useLang();

  const items = [
    { icon: <WiHumidity />, label: t(lang, "humidity"), value: `${s.humidity_avg}%`, color: "#3b82f6" },
    { icon: <WiStrongWind />, label: t(lang, "wind"), value: `${s.wind_speed_avg} m/s`, color: "#10b981" },
    { icon: <WiBarometer />, label: t(lang, "pressure"), value: `${Math.round(s.pressure_avg)} hPa`, color: "#8b5cf6" },
    { icon: <WiRaindrop />, label: t(lang, "precipitation"), value: `${s.precipitation_probability}%`, color: "#06b6d4" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderRadius: "var(--radius)",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <span style={{ fontSize: 24, color: item.color }}>{item.icon}</span>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{item.label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{item.value}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}