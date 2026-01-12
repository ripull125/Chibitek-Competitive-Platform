// client/src/i18n/useAppLanguage.js
import { useCallback, useEffect } from "react";
import i18n, { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY } from "./i18n.js";

function normalizeLng(lng) {
  const v = String(lng || "").toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(v)) return v;
  const base = v.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : "en";
}

export function useAppLanguage() {
  useEffect(() => {
    const lang = normalizeLng(i18n.resolvedLanguage || i18n.language);
    document.documentElement.lang = lang;
  }, []);

  const setLanguage = useCallback(async (lng) => {
    const next = normalizeLng(lng);
    await i18n.changeLanguage(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.lang = next;
  }, []);

  return {
    language: normalizeLng(i18n.resolvedLanguage || i18n.language),
    setLanguage,
    supported: SUPPORTED_LANGUAGES,
  };
}
