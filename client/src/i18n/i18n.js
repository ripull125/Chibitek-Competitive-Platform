// client/src/i18n/i18n.js
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import resources from "./resources";

export const SUPPORTED_LANGUAGES = ["en", "ja", "fr", "de", "es"];
export const LANGUAGE_STORAGE_KEY = "app_language";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      supportedLngs: SUPPORTED_LANGUAGES,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ["localStorage"],
      },
    });
}

export default i18n;
