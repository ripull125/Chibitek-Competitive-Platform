// Shared utility for connected-platforms state (localStorage-backed)

const STORAGE_KEY = "chibitek:connectedPlatforms";

// Default: all platforms disconnected
const DEFAULT_STATE = {
    x: false,
    linkedin: false,
    instagram: false,
    tiktok: false,
    reddit: false,
    youtube: false,
};

export function getConnectedPlatforms() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

export function setConnectedPlatforms(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Dispatch storage event so other components on the same page can react
    window.dispatchEvent(new Event("connectedPlatformsChanged"));
}

export function togglePlatform(key) {
    const current = getConnectedPlatforms();
    current[key] = !current[key];
    setConnectedPlatforms(current);
    return current;
}
