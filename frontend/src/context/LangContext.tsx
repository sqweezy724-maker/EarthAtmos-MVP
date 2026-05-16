import { createContext, useContext, useState, type ReactNode } from "react";
import type { Lang } from "../i18n/translations";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("ea-lang") as Lang | null;
    if (saved) return saved;
    return navigator.language.startsWith("ru") ? "ru" : "en";
  });

  const handleSet = (l: Lang) => {
    setLang(l);
    localStorage.setItem("ea-lang", l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang: handleSet }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);