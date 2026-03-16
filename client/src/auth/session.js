import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";

const STORAGE_KEY = "chibitek.auth.session";
const ADMIN_EMAILS = new Set([
  "erick.grau@chibitek.com",
  "puhalenthirv@gmail.com",
  "evanchin0322@gmail.com",
]);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

export function isAuthorizedEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return isAdminEmail(normalized);
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
      access: session.access || null,
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

export async function resolveSessionAccess(session) {
  const email = normalizeEmail(session?.user?.email);
  const localAccess = {
    email,
    authorized: isAuthorizedEmail(email),
    isAdmin: isAdminEmail(email),
  };

  const token = session?.access_token;
  if (!token) return localAccess;

  try {
    const response = await fetch(apiUrl("/api/auth/access"), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return localAccess;

    const payload = await response.json();
    return {
      email: normalizeEmail(payload?.email || email),
      authorized: Boolean(payload?.authorized),
      isAdmin: Boolean(payload?.isAdmin),
    };
  } catch {
    return localAccess;
  }
}

export function onAuthStateChange(handler) {
  if (!supabase) return { unsubscribe: () => { } };
  const { data } = supabase.auth.onAuthStateChange(handler);
  return data?.subscription ?? { unsubscribe: () => { } };
}
