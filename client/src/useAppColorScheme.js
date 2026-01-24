// client/src/useAppColorScheme.js
import { useCallback, useEffect, useState } from "react";

export const COLOR_SCHEME_STORAGE_KEY = "chibitek-color-scheme";

function normalizeColorScheme(value) {
  return value === "dark" ? "dark" : "light";
}

export function getStoredColorScheme() {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    return normalizeColorScheme(stored);
  } catch {
    return "light";
  }
}

export function applyColorScheme(value) {
  if (typeof document === "undefined") return;
  const scheme = normalizeColorScheme(value);
  document.documentElement.dataset.mantineColorScheme = scheme;
  document.documentElement.style.colorScheme = scheme;
}

export function useAppColorScheme() {
  const [colorScheme, setColorSchemeState] = useState(() => getStoredColorScheme());

  const setColorScheme = useCallback((value) => {
    const next = normalizeColorScheme(value);
    setColorSchemeState(next);
    try {
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    applyColorScheme(next);
  }, []);

  const toggleColorScheme = useCallback(() => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme, setColorScheme]);

  useEffect(() => {
    applyColorScheme(colorScheme);
  }, [colorScheme]);

  return {
    colorScheme,
    setColorScheme,
    toggleColorScheme,
  };
}
