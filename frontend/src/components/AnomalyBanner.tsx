import { motion } from "framer-motion";
import { RiAlertLine, RiCheckLine } from "react-icons/ri";
import type { AnomalyData } from "../types/weather";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";

interface Props {
  anomaly: AnomalyData;
}

export function AnomalyBanner({ anomaly }: Props) {
  const { lang } = useLang();

  if (anomaly.level === "normal") {
    return null; // Don't show banner for normal weather
  }

  const severe = anomaly.level === "severe";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: "var(--radius)",
        background: severe ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
        border: `1px solid ${severe ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
      }}
    >
      <RiAlertLine style={{ fontSize: 18, color: severe ? "var(--red)" : "var(--yellow)", flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: severe ? "var(--red)" : "var(--yellow)" }}>
          {severe ? t(lang, "severeAnomaly") : t(lang, "mildAnomaly")}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {t(lang, "anomalyScore")}: {Math.round(anomaly.score * 100)}%
        </div>
      </div>
    </motion.div>
  );
}