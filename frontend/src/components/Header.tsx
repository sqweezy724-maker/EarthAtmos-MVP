import { motion } from "framer-motion";
import { RiSunLine, RiMoonLine, RiTranslate2 } from "react-icons/ri";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { t } from "../i18n/translations";

export function Header() {
  const { theme, toggle } = useTheme();
  const { lang, setLang } = useLang();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: 800,
        padding: "0 4px",
      }}
    >
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)" }}>
          {t(lang, "appName")}
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
          {t(lang, "appDesc")}
        </p>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {/* Language toggle */}
        <button
          onClick={() => setLang(lang === "en" ? "ru" : "en")}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", borderRadius: 8,
            background: "var(--bg-input)", color: "var(--text-2)",
            fontSize: 12, fontWeight: 500,
            border: "1px solid var(--border)",
            transition: "all 0.2s",
          }}
        >
          <RiTranslate2 style={{ fontSize: 14 }} />
          {lang === "en" ? "RU" : "EN"}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 8,
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
            fontSize: 16,
            transition: "all 0.2s",
          }}
        >
          {theme === "light" ? <RiMoonLine /> : <RiSunLine />}
        </button>
      </div>
    </motion.header>
  );
}