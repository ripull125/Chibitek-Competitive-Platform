import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";

const STORAGE_KEY = "chibitek.auth.session";

const ROLE_OWNER = "owner";
const ROLE_ADMIN = "admin";
const ROLE_USER = "user";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "regular") return ROLE_USER;
  if (normalized === ROLE_OWNER || normalized === ROLE_ADMIN || normalized === ROLE_USER) {
    return normalized;
  }
  return ROLE_USER;
}

export function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLE_OWNER || normalized === ROLE_ADMIN;
}

export function isSessionAuthorized(session) {
  return Boolean(session?.access?.authorized);
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
    authorized: false,
    role: ROLE_USER,
    isAdmin: false,
    canManageRegularUsers: false,
    canManageAdmins: false,
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
    const role = normalizeRole(payload?.role);
    const isAdmin = Boolean(payload?.isAdmin) || isAdminRole(role);
    const canManageRegularUsers =
      typeof payload?.canManageRegularUsers === "boolean"
        ? payload.canManageRegularUsers
        : isAdmin;
    const canManageAdmins =
      typeof payload?.canManageAdmins === "boolean"
        ? payload.canManageAdmins
        : role === ROLE_OWNER;

    return {
      email: normalizeEmail(payload?.email || email),
      authorized: Boolean(payload?.authorized),
      role,
      isAdmin,
      canManageRegularUsers,
      canManageAdmins,
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
