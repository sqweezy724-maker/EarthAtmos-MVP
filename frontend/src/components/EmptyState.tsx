import { motion } from "framer-motion";
import { WiDaySunny } from "react-icons/wi";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";

export function EmptyState() {
  const { lang } = useLang();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        marginTop: 60, gap: 8,
      }}
    >
      <WiDaySunny style={{ fontSize: 56, color: "var(--text-3)", opacity: 0.4 }} />
      <p style={{ fontSize: 15, color: "var(--text-2)" }}>{t(lang, "emptyTitle")}</p>
      <p style={{ fontSize: 12, color: "var(--text-3)" }}>{t(lang, "emptyDesc")}</p>
    </motion.div>
  );
}