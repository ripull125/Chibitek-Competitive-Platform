import { supabase } from "../supabaseClient";

const STORAGE_KEY = "chibitek.auth.session";
const ALLOWED_DOMAIN = "chibitek.com";
const ALLOWED_EMAILS = new Set([
  "puhalenthirv@gmail.com",
  "matousposp8@gmail.com",
  "evanchin0322@gmail.com",
  "ethan.j.cha@gmail.com",
  "davidpaul.villarosa@gmail.com",
  "andreasbratu26@gmail.com",
]);

export function isAuthorizedEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  if (ALLOWED_EMAILS.has(normalized)) return true;
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return false;
  const domain = normalized.slice(atIndex + 1);
  return domain === ALLOWED_DOMAIN;
}

export function isSessionAuthorized(session) {
  return isAuthorizedEmail(session?.user?.email);
}

export function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeSession(session) {
  // Store only what's needed for quick gating.
  // The source of truth remains Supabase; this is just for page refresh + redirects.
  const snapshot = session
    ? {
        access_token: session.access_token,
        expires_at: session.expires_at,
        user: session.user ? { id: session.user.id, email: session.user.email } : null,
      }
    : null;

  try {
    if (!snapshot) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
  }
}

export function isSessionValid(stored) {
  if (!stored?.access_token) return false;
  if (!stored?.expires_at) return true;
  // expires_at is in seconds since epoch
  return stored.expires_at * 1000 > Date.now();
}

export async function getSupabaseSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session ?? null;
}

export function onAuthStateChange(handler) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange(handler);
  return data?.subscription ?? { unsubscribe: () => {} };
}
