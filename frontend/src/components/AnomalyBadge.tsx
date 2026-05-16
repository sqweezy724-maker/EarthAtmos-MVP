import { motion } from "framer-motion";
import { RiAlertLine, RiCheckLine, RiErrorWarningLine } from "react-icons/ri";
import type { AnomalyData } from "../types/weather";

interface AnomalyBadgeProps {
  anomaly: AnomalyData;
}

export function AnomalyBadge({ anomaly }: AnomalyBadgeProps) {
  const config = {
    normal: {
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.25)",
      icon: <RiCheckLine />,
      label: "Normal",
    },
    mild: {
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.12)",
      border: "rgba(245, 158, 11, 0.25)",
      icon: <RiErrorWarningLine />,
      label: "Mild Anomaly",
    },
    severe: {
      color: "#ef4444",
      bg: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.25)",
      icon: <RiAlertLine />,
      label: "Severe Anomaly",
    },
    unknown: {
      color: "#64748b",
      bg: "rgba(100, 116, 139, 0.12)",
      border: "rgba(100, 116, 139, 0.25)",
      icon: <RiAlertLine />,
      label: "Unknown",
    },
  }[anomaly.level] ?? {
    color: "#64748b",
    bg: "rgba(100,116,139,0.12)",
    border: "rgba(100,116,139,0.25)",
    icon: <RiAlertLine />,
    label: "Unknown",
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 20,
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 14 }}>{config.icon}</span>
      {config.label}
      {anomaly.score > 0 && (
        <span style={{ opacity: 0.7 }}>
          ({Math.round(anomaly.score * 100)}%)
        </span>
      )}
    </motion.div>
  );
}