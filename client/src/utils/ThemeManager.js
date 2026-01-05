// client/src/utils/ThemeManager.js
// Plain JS (no JSX). Drop-in to follow system light/dark for ALL UI.
// Usage: import ThemeManager from '../utils/ThemeManager.js'; new ThemeManager();

class ThemeManager {
  constructor() {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // HMR / multiple instantiation guard
    if (window.__ThemeManagerSingleton) return window.__ThemeManagerSingleton;
    window.__ThemeManagerSingleton = this;

    this.mm =
      (window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)")) ||
      null;
    this._onMediaChange = this._onMediaChange.bind(this);

    // Apply now and again after DOM is ready (in case <meta> not present yet)
    this.apply();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.apply(), { once: true });
    }

    // Listen for OS changes
    if (this.mm) {
      if (typeof this.mm.addEventListener === "function") {
        this.mm.addEventListener("change", this._onMediaChange);
      } else if (typeof this.mm.addListener === "function") {
        this.mm.addListener(this._onMediaChange);
      }
    }
  }

  _onMediaChange() {
    this.apply();
  }

  isDark() {
    return !!(this.mm && this.mm.matches);
  }

  apply() {
    const scheme = this.isDark() ? "dark" : "light";
    const root = document.documentElement;

    // 1) Mantine components use this to pick tokens
    root.setAttribute("data-mantine-color-scheme", scheme);

    // 2) Your existing CSS hooks
    root.classList.toggle("dark-mode", scheme === "dark");
    root.classList.toggle("light-mode", scheme === "light");

    // 3) Native form controls / scrollbars
    root.style.colorScheme = scheme;

    // 4) Browser UI (mobile address bar / PWA)
    this._applyMetaThemeColor(scheme);
  }

  _applyMetaThemeColor(scheme) {
    const desired = scheme === "dark" ? "#0b0b0c" : "#ffffff";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    if (meta.getAttribute("content") !== desired) {
      meta.setAttribute("content", desired);
    }
  }

  // Optional: call if you ever need to tear down (rare in Vite apps)
  destroy() {
    if (this.mm) {
      if (typeof this.mm.removeEventListener === "function") {
        this.mm.removeEventListener("change", this._onMediaChange);
      } else if (typeof this.mm.removeListener === "function") {
        this.mm.removeListener(this._onMediaChange);
      }
    }
    if (window.__ThemeManagerSingleton === this) {
      window.__ThemeManagerSingleton = null;
    }
  }
}

export default ThemeManager;
