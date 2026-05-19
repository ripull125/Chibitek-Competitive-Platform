// Shared utility for connected-platforms state.
// The app now treats every supported source as available by default.

const ALL_CONNECTED = {
  x: true,
  linkedin: true,
  instagram: true,
  tiktok: true,
  reddit: true,
  youtube: true,
};

export function getConnectedPlatforms() {
  return { ...ALL_CONNECTED };
}

export function setConnectedPlatforms() {
  try {
    localStorage.setItem("chibitek:connectedPlatforms", JSON.stringify(ALL_CONNECTED));
  } catch {
    // Ignore storage issues; all platforms remain available in memory.
  }
  window.dispatchEvent(new Event("connectedPlatformsChanged"));
}

export function togglePlatform() {
  setConnectedPlatforms();
  return getConnectedPlatforms();
}
