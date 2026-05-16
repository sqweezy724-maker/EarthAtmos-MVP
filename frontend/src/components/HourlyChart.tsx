import { useState } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import type { HourlyData } from "../types/weather";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";
import { useTheme } from "../context/ThemeContext";

interface Props {
  hourly: HourlyData[];
}

type Mode = "temperature" | "humidity" | "wind_speed" | "pressure";

const CFG: Record<Mode, { color: string; unit: string; labelKey: string }> = {
  temperature: { color: "#f59e0b", unit: "°C", labelKey: "temperature" },
  humidity:    { color: "#3b82f6", unit: "%",   labelKey: "humidity" },
  wind_speed:  { color: "#10b981", unit: "m/s", labelKey: "wind" },
  pressure:    { color: "#8b5cf6", unit: "hPa", labelKey: "pressure" },
};

export function HourlyChart({ hourly }: Props) {
  const [mode, setMode] = useState<Mode>("temperature");
  const { lang } = useLang();
  const { theme } = useTheme();
  const cfg = CFG[mode];

  const chartData = hourly.map((h) => ({
    hour: h.hour,
    value: h[mode] as number,
  }));

  const gridColor = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const tickColor = theme === "dark" ? "#475569" : "#9ca3af";

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: 20,
      boxShadow: "var(--shadow)",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {(Object.keys(CFG) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: mode === m ? "var(--accent)" : "var(--bg-input)",
              color: mode === m ? "#fff" : "var(--text-2)",
              border: mode === m ? "none" : "1px solid var(--border)",
              transition: "all 0.2s",
            }}
          >
            {t(lang, CFG[m].labelKey as any)}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={cfg.color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
            tick={{ fill: tickColor, fontSize: 10 }}
            axisLine={false} tickLine={false} interval={3}
          />
          <YAxis
            tick={{ fill: tickColor, fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8, fontSize: 12,
              boxShadow: "var(--shadow-lg)",
            }}
            formatter={(value: number) => [`${value}${cfg.unit}`, t(lang, cfg.labelKey as any)]}
            labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
          />
          <Area
            type="monotone" dataKey="value"
            stroke={cfg.color} strokeWidth={2}
            fill="url(#grad)" dot={false}
            activeDot={{ r: 4, fill: cfg.color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}