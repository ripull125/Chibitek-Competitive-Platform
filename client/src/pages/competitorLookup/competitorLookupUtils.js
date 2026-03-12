const LOOKUP_CACHE_KEY = 'competitorLookup_cache';

export function loadLookupCache() {
  try {
    const raw = sessionStorage.getItem(LOOKUP_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveLookupCache(data) {
  try { sessionStorage.setItem(LOOKUP_CACHE_KEY, JSON.stringify(data)); } catch { }
}

export function fmtNum(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

export function parseDuration(iso) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const h = m[1] ? `${m[1]}:` : "";
  const min = (m[2] || "0").padStart(h ? 2 : 1, "0");
  const sec = (m[3] || "0").padStart(2, "0");
  return `${h}${min}:${sec}`;
}
