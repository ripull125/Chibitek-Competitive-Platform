import { getUserIdByUsername, fetchPostsByUserId, fetchUserMentions, fetchFollowers, fetchFollowing, fetchTweetById, searchRecentTweets } from "./xApi.js";
import { normalizeXPost } from "./utils/normalizeXPost.js";
import { scrapeCreators, scrapeCreatorsPaginated } from "./utils/scrapeCreators.js";
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import { supabase, supabaseAuth } from './supabase.js';
import { categorizeTone } from './tone.js';
import { suggestKeywordsForBooks } from './keywords.js';

dotenv.config();

function extractYouTubeVideoId(input) {
  if (!input) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname.includes("youtube.com")) {
      return url.searchParams.get("v");
    }
    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Detect whether a freeform input is a URL, an @handle, or a keyword.
 * Returns { type: 'url'|'handle'|'keyword', value }
 */
function detectInputType(input) {
  const s = String(input || '').trim();
  if (!s) return { type: null, value: '' };
  try {
    // If it parses as a URL, consider it a URL type
    new URL(s);
    return { type: 'url', value: s };
  } catch { }

  if (s.startsWith('@')) return { type: 'handle', value: s.replace(/^@/, '') };

  // If the input is a single token without spaces, treat it as a possible
  // handle for platforms (will be interpreted as handle by platform helpers).
  if (!/\s/.test(s) && /^[\w.@-]+$/.test(s)) return { type: 'handle', value: s };

  return { type: 'keyword', value: s };
}

// Ensure Reddit platform row exists
let REDDIT_PLATFORM_ID = 6; // default, will be confirmed/created at startup
async function ensureRedditPlatform() {
  const { data } = await supabase
    .from('platforms')
    .select('id')
    .ilike('name', 'reddit')
    .maybeSingle();
  if (data) { REDDIT_PLATFORM_ID = data.id; return data.id; }

  // Create with id=6 since it's unused in the DB
  const { data: created, error } = await supabase
    .from('platforms')
    .insert({ name: 'Reddit' })
    .select('id')
    .single();
  if (error) throw error;
  REDDIT_PLATFORM_ID = created.id;
  return created.id;
}

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
}));
app.use(express.json({ limit: '10mb' }));

const {
  GITHUB_TOKEN,
  GITHUB_TOKENS,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  CHAT_MODEL,
  CHAT_MODEL_GITHUB,
  CHAT_MODEL_CEREBRAS,
  CHAT_MODEL_OPENAI,
  CEREBRAS_MODEL,
  CEREBRAS_API_KEY,
  CEREBRAS_BASE_URL,
  LLM_PROVIDER,
  CHAT_DEBUG,
} = process.env;

const githubAiEndpoint = 'https://models.github.ai/inference';
const cerebrasEndpoint = CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';
const cerebrasEndpointAlt = 'https://api.cerebras.ai';
const openaiEndpoint = OPENAI_BASE_URL || 'https://api.openai.com/v1';
const githubFallbackModel = process.env.CHAT_MODEL_GITHUB_FALLBACK || 'openai/gpt-4o-mini';
const cerebrasFallbackModel = process.env.CHAT_MODEL_CEREBRAS_FALLBACK || 'llama3.1-8b';

function loadIndexedEnvValues(prefix, { start = 1, end = 20 } = {}) {
  const values = [];
  for (let i = start; i <= end; i++) {
    const value = process.env[`${prefix}${i}`];
    if (value) values.push(value);
  }
  return values;
}

function resolveRequestedProvider(rawProvider) {
  const normalized = String(rawProvider || '').trim().toLowerCase();
  if (normalized === 'github' || normalized === 'cerebras' || normalized === 'openai') {
    return normalized;
  }

  const envProvider = String(LLM_PROVIDER || 'auto').trim().toLowerCase();
  if (envProvider === 'github' || envProvider === 'cerebras' || envProvider === 'openai') {
    return envProvider;
  }

  if (GITHUB_KEYS.length) return 'github';
  if (CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY1) return 'cerebras';
  return 'openai';
}

const GITHUB_KEYS = [
  GITHUB_TOKEN,
  ...(GITHUB_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ...loadIndexedEnvValues('GITHUB_TOKEN', { start: 1, end: 20 }),
].filter(Boolean);

let githubKeyIndex = 0;
function nextGithubKey() {
  if (!GITHUB_KEYS.length) return null;
  const index = githubKeyIndex % GITHUB_KEYS.length;
  githubKeyIndex++;
  return GITHUB_KEYS[index];
}

const CEREBRAS_KEYS = [
  CEREBRAS_API_KEY,
  ...(process.env.CEREBRAS_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean),
  ...loadIndexedEnvValues('CEREBRAS_API_KEY', { start: 1, end: 20 }),
].filter(Boolean);

let cerebrasKeyIndex = 0;
function nextCerebrasKey() {
  if (!CEREBRAS_KEYS.length) return null;
  const index = cerebrasKeyIndex % CEREBRAS_KEYS.length;
  cerebrasKeyIndex++;
  return CEREBRAS_KEYS[index];
}

function parseModelSelection(rawModel) {
  const value = String(rawModel || '').trim();
  if (!value) return { provider: null, model: '' };

  const match = value.match(/^(github|cerebras|openai):(.*)$/i);
  if (!match) {
    return { provider: null, model: value };
  }

  return {
    provider: String(match[1] || '').toLowerCase(),
    model: String(match[2] || '').trim(),
  };
}

function normalizeCerebrasModel(model) {
  const raw = String(model || '').trim();
  if (!raw) return raw;

  const aliases = {
    'llama-3.1-8b': 'llama3.1-8b',
    'llama-3.1-70b': 'llama3.1-70b',
    'llama-3.3-70b': 'llama-3.3-70b',
    'meta/llama-3.1-8b-instruct': 'llama3.1-8b',
    'meta/llama-3.1-70b-instruct': 'llama3.1-70b',
  };

  const key = raw.toLowerCase();
  return aliases[key] || raw;
}

function getCerebrasModelCandidates(primaryModel) {
  const base = normalizeCerebrasModel(primaryModel);
  const fallback = normalizeCerebrasModel(cerebrasFallbackModel);
  const candidates = [
    base,
    fallback,
    'llama3.1-8b',
    'llama3.1-70b',
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function resolveChatConfig({ requestedProvider, requestedModel } = {}) {
  const parsedModel = parseModelSelection(requestedModel);
  const provider = resolveRequestedProvider(parsedModel.provider || requestedProvider);
  const modelOverride = parsedModel.model;

  if (provider === 'github') {
    const model = modelOverride || CHAT_MODEL_GITHUB || CHAT_MODEL || 'openai/gpt-5-nano';
    return {
      provider,
      model,
      baseUrl: githubAiEndpoint,
      apiKey: nextGithubKey(),
      missingEnv: 'GITHUB_TOKEN',
    };
  }

  if (provider === 'cerebras') {
    const model = normalizeCerebrasModel(modelOverride || CHAT_MODEL_CEREBRAS || CEREBRAS_MODEL || 'llama3.1-8b');
    return {
      provider,
      model,
      baseUrl: cerebrasEndpoint,
      apiKey: nextCerebrasKey(),
      missingEnv: 'CEREBRAS_API_KEY',
    };
  }

  const model = modelOverride || CHAT_MODEL_OPENAI || CHAT_MODEL || 'gpt-4o-mini';
  return {
    provider: 'openai',
    model,
    baseUrl: openaiEndpoint,
    apiKey: OPENAI_API_KEY || null,
    missingEnv: 'OPENAI_API_KEY',
  };
}

const getUserIdFromRequest = (req) =>
  req.body?.user_id || req.query?.user_id || req.get('x-user-id') || null;

const ROLE_OWNER = 'owner';
const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const normalizeRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'regular') return ROLE_USER;
  if (normalized === ROLE_OWNER || normalized === ROLE_ADMIN || normalized === ROLE_USER) {
    return normalized;
  }
  return ROLE_USER;
};

const canManageRegularUsers = (role) => {
  const normalized = normalizeRole(role);
  return normalized === ROLE_OWNER || normalized === ROLE_ADMIN;
};

const canManageAdmins = (role) => normalizeRole(role) === ROLE_OWNER;

const makeAdminCreatedProviderUserId = (email) => {
  const normalized = normalizeEmail(email);
  const salt = process.env.ADMIN_USER_ID_SALT || 'chibitek-admin-user-id';
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
};

const isMissingTableError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
};

const isDuplicateKeyError = (error) => String(error?.code || '') === '23505';

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function getRequestAuthContext(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing bearer token.' };
  }

  let data, error;
  try {
    const resp = await supabaseAuth.auth.getUser(token);
    data = resp.data;
    error = resp.error;
  } catch (err) {
    console.warn('[Auth] supabaseAuth.getUser failed:', err?.message || err);
    // Treat as unauthenticated rather than crashing the server.
    return { ok: false, status: 503, error: 'Authentication service unavailable' };
  }

  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Invalid or expired token.' };
  }

  const email = normalizeEmail(data.user.email);
  if (!email) {
    return { ok: false, status: 401, error: 'Authenticated user has no email.' };
  }

  return {
    ok: true,
    token,
    user: data.user,
    email,
    isAdmin: false,
    verified: true,
  };
}

async function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, name, provider, created_at, updated_at')
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  if (!data) return null;
  return {
    ...data,
    role: normalizeRole(data.role),
  };
}

async function ensureVerifiedUserRow(authCtx) {
  if (!authCtx?.verified || !authCtx?.user || !authCtx?.email) return null;

  const existing = await getUserByEmail(authCtx.email);
  if (existing) return existing;

  const meta = authCtx.user.user_metadata || {};
  const displayName = String(meta.full_name || meta.name || '').trim() || null;
  const provider = String(authCtx.user.app_metadata?.provider || authCtx.user.aud || 'google').trim();

  const { data, error } = await supabase
    .from('users')
    .insert({
      email: authCtx.email,
      name: displayName,
      provider,
      provider_user_id: String(authCtx.user.id || makeAdminCreatedProviderUserId(authCtx.email)),
      role: ROLE_USER,
    })
    .select('id, email, role, name, provider, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    role: normalizeRole(data.role),
  };
}

async function getAuthRoleByEmail(email) {
  const user = await getUserByEmail(email);
  if (!user) {
    return {
      authorized: false,
      role: ROLE_USER,
      canManageRegularUsers: false,
      canManageAdmins: false,
      user: null,
    };
  }

  const role = normalizeRole(user.role);
  return {
    authorized: true,
    role,
    canManageRegularUsers: canManageRegularUsers(role),
    canManageAdmins: canManageAdmins(role),
    user,
  };
}

app.get('/api/auth/access', async (req, res) => {
  try {
    // Always re-check Supabase state; avoid stale auth results from browser/proxy cache.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    const auth = await getRequestAuthContext(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    let access = {
      authorized: false,
      role: ROLE_USER,
      canManageRegularUsers: false,
      canManageAdmins: false,
    };

    try {
      access = await getAuthRoleByEmail(auth.email);
    } catch (lookupErr) {
      // Do not fail login checks hard if DB lookup has transient/schema issues.
      console.warn('User access lookup failed, treating as unauthorized:', lookupErr?.message || lookupErr);
    }

    return res.json({
      email: auth.email,
      authorized: access.authorized,
      role: access.role,
      isAdmin: access.role === ROLE_OWNER || access.role === ROLE_ADMIN,
      canManageRegularUsers: access.canManageRegularUsers,
      canManageAdmins: access.canManageAdmins,
    });
  } catch (err) {
    console.error('Access check failed:', err);
    return res.status(500).json({ error: 'Failed to verify access.' });
  }
});

async function requireRoleAccess(req, res) {
  const auth = await getRequestAuthContext(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return null;
  }

  if (!auth.verified) {
    res.status(401).json({ error: 'Access requires a valid token.' });
    return null;
  }

  const access = await getAuthRoleByEmail(auth.email);
  if (!access.authorized) {
    res.status(403).json({ error: 'Access denied.' });
    return null;
  }

  return {
    ...auth,
    role: access.role,
    isAdmin: access.role === ROLE_OWNER || access.role === ROLE_ADMIN,
    canManageRegularUsers: access.canManageRegularUsers,
    canManageAdmins: access.canManageAdmins,
  };
}

async function requireRegularManager(req, res) {
  const auth = await requireRoleAccess(req, res);
  if (!auth) return null;
  if (!auth.canManageRegularUsers) {
    res.status(403).json({ error: 'Admin or owner access required.' });
    return null;
  }
  return auth;
}

async function requireOwner(req, res) {
  const auth = await requireRoleAccess(req, res);
  if (!auth) return null;
  if (!auth.canManageAdmins) {
    res.status(403).json({ error: 'Owner access required.' });
    return null;
  }
  return auth;
}

app.get('/api/admin/users', async (req, res) => {
  try {
    const auth = await requireRegularManager(req, res);
    if (!auth) return;

    const { data, error } = await supabase
      .from('users')
      .select('email, name, provider, role, created_at, updated_at')
      .not('email', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({ users: data || [] });
  } catch (err) {
    console.error('List users failed:', err);
    return res.status(500).json({ error: 'Failed to list users.' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const auth = await requireRegularManager(req, res);
    if (!auth) return;

    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim() || null;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const { data: existingUser, error: existingUserErr } = await supabase
      .from('users')
      .select('email, name, provider, role, created_at, updated_at')
      .eq('email', email)
      .maybeSingle();

    if (existingUserErr) {
      throw existingUserErr;
    }

    if (existingUser) {
      return res.json({ user: existingUser, existed: true });
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        name,
        provider: 'admin_created',
        provider_user_id: makeAdminCreatedProviderUserId(email),
        role: ROLE_USER,
      })
      .select('email, name, provider, role, created_at, updated_at')
      .single();

    if (error) {
      throw error;
    }

    return res.json({ user: data, existed: false });
  } catch (err) {
    console.error('Create user failed:', err);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
});

app.delete('/api/admin/users', async (req, res) => {
  try {
    const auth = await requireRegularManager(req, res);
    if (!auth) return;

    const email = normalizeEmail(req.body?.email || req.query?.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const targetUser = await getUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const targetRole = normalizeRole(targetUser.role);
    if (targetRole === ROLE_OWNER) {
      return res.status(403).json({ error: 'Owner users cannot be deleted.' });
    }
    if (targetRole === ROLE_ADMIN) {
      return res.status(403).json({ error: 'Admins cannot be deleted from users endpoint.' });
    }

    const { data: userRow, error: userLookupError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', targetUser.id)
      .maybeSingle();

    if (userLookupError) {
      throw userLookupError;
    }
    if (!userRow?.id) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Clean dependent data first so FK constraints do not block user deletion.
    const { data: userPosts, error: userPostsErr } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', userRow.id);

    if (userPostsErr) {
      throw userPostsErr;
    }

    const postIds = (userPosts || []).map((p) => p.id).filter(Boolean);
    if (postIds.length) {
      const { error: metricsErr } = await supabase
        .from('post_metrics')
        .delete()
        .in('post_id', postIds);
      if (metricsErr) throw metricsErr;

      const { error: detailsErr } = await supabase
        .from('post_details_platform')
        .delete()
        .in('post_id', postIds);
      if (detailsErr) throw detailsErr;

      const { error: topicsErr } = await supabase
        .from('post_topics')
        .delete()
        .in('post_id', postIds);
      if (topicsErr) throw topicsErr;

      const { error: postsErr } = await supabase
        .from('posts')
        .delete()
        .in('id', postIds);
      if (postsErr) throw postsErr;
    }

    const { error: chatsErr } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('user_id', userRow.id);
    if (chatsErr) throw chatsErr;

    const { error: watchlistErr } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('user_id', userRow.id);
    if (watchlistErr) throw watchlistErr;

    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', userRow.id)
      .select('email');

    if (error) {
      throw error;
    }

    if (!data?.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ deleted: true, email });
  } catch (err) {
    console.error('Delete user failed:', err);
    if (String(err?.code || '') === '23503') {
      return res.status(409).json({ error: 'Cannot delete user due to related records. Delete dependencies first.' });
    }
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

app.get('/api/admin/admins', async (req, res) => {
  try {
    const auth = await requireRegularManager(req, res);
    if (!auth) return;

    const { data, error } = await supabase
      .from('users')
      .select('email, role, created_at, updated_at')
      .in('role', [ROLE_OWNER, ROLE_ADMIN])
      .not('email', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({ admins: data || [] });
  } catch (err) {
    console.error('List admins failed:', err);
    return res.status(500).json({ error: 'Failed to list admins.' });
  }
});

app.post('/api/admin/admins', async (req, res) => {
  try {
    const auth = await requireOwner(req, res);
    if (!auth) return;

    const email = normalizeEmail(req.body?.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const existing = await getUserByEmail(email);

    let data = null;
    let error = null;
    if (existing) {
      ({ data, error } = await supabase
        .from('users')
        .update({ role: ROLE_ADMIN })
        .eq('id', existing.id)
        .select('email, role, created_at, updated_at')
        .single());
    } else {
      ({ data, error } = await supabase
        .from('users')
        .insert({
          email,
          provider: 'admin_created',
          provider_user_id: makeAdminCreatedProviderUserId(email),
          role: ROLE_ADMIN,
        })
        .select('email, role, created_at, updated_at')
        .single());
    }

    if (error) {
      throw error;
    }

    return res.json({ admin: data });
  } catch (err) {
    console.error('Create admin failed:', err);
    return res.status(500).json({ error: 'Failed to create admin.' });
  }
});

app.delete('/api/admin/admins', async (req, res) => {
  try {
    const auth = await requireOwner(req, res);
    if (!auth) return;

    const email = normalizeEmail(req.body?.email || req.query?.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const targetUser = await getUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: 'Admin user not found.' });
    }

    if (normalizeRole(targetUser.role) !== ROLE_ADMIN) {
      return res.status(400).json({ error: 'Target user is not an admin.' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role: ROLE_USER })
      .eq('id', targetUser.id)
      .select('email, role, updated_at')
      .single();

    if (error) {
      throw error;
    }

    return res.json({ admin: data, downgraded: true });
  } catch (err) {
    console.error('Delete admin failed:', err);
    return res.status(500).json({ error: 'Failed to delete admin.' });
  }
});

const requireUserId = (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Missing user id.' });
    return null;
  }
  return String(userId);
};

async function fetchLatestPostsContext(userId) {
  try {
    let query = supabase
      .from('posts')
      .select('platform_id, competitor_id, platform_post_id, url, content, created_at, published_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Failed to load posts for LLM context:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to load posts for LLM context:', err);
    return [];
  }
}

app.get("/api/x/fetch/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const user = await getUserIdByUsername(username);
    const posts = await fetchPostsByUserId(user.id, 5);

    res.json({ success: true, username: user.username || username, userId: user.id, posts });
  } catch (err) {
    console.error("X fetch error:", err.message);

    if (String(err.message).includes("Rate limit")) {
      return res.status(429).json({ error: err.message });
    }

    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/x/search
 * Body: { options: { userLookup, followers, following, userTweets, userMentions, tweetLookup, searchTweets },
 *         inputs: { username, tweetsUsername, tweetUrl, searchQuery } }
 * Calls the relevant X API v2 endpoints in parallel and returns combined results.
 */
app.post('/api/x/search', async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(10, Number(rawLimit) || 10));
    let credits_remaining = null;
    const tasks = [];
    const labels = [];

    // Auto-route when caller passes a single freeform `q` and no options.
    if ((!options || Object.keys(options).length === 0 || Object.values(options).every(v => !v)) && inputs.q) {
      const detected = detectInputType(inputs.q);
      if (detected.type === 'handle') {
        options.userLookup = true;
        options.userTweets = true;
        inputs.username = detected.value;
        inputs.tweetsUsername = detected.value;
      } else if (detected.type === 'url') {
        const u = String(detected.value || '');
        if (/status\//i.test(u)) {
          options.tweetLookup = true;
          inputs.tweetUrl = u;
        } else {
          // Try to extract username from URL
          try {
            const parsed = new URL(u);
            const m = parsed.pathname.match(/\/@?([\w.]+)/);
            if (m) {
              const uname = m[1];
              options.userLookup = true;
              options.userTweets = true;
              inputs.username = uname;
              inputs.tweetsUsername = uname;
            }
          } catch { }
        }
      } else {
        options.searchTweets = true;
        inputs.searchQuery = detected.value;
      }
    }

    // Resolve user IDs where needed
    const cleanUsername = (u) => String(u || '').trim().replace(/^@/, '');
    const extractTweetId = (urlOrId) => {
      const m = String(urlOrId || '').match(/status\/(\d+)/);
      return m ? m[1] : String(urlOrId || '').trim();
    };

    // Profile-related (need username → user object)
    const profileUsername = cleanUsername(inputs.username);
    const tweetsUsername = cleanUsername(inputs.tweetsUsername || inputs.username);

    // User Lookup
    if (options.userLookup && profileUsername) {
      labels.push('userLookup');
      tasks.push(getUserIdByUsername(profileUsername));
    }

    // Followers
    if (options.followers && profileUsername) {
      labels.push('followers');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowers(u.id, limit))
      );
    }

    // Following
    if (options.following && profileUsername) {
      labels.push('following');
      tasks.push(
        getUserIdByUsername(profileUsername).then(u => fetchFollowing(u.id, limit))
      );
    }

    // User Tweets
    if (options.userTweets && tweetsUsername) {
      labels.push('userTweets');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchPostsByUserId(u.id, limit))
      );
    }

    // User Mentions
    if (options.userMentions && tweetsUsername) {
      labels.push('userMentions');
      tasks.push(
        getUserIdByUsername(tweetsUsername).then(u => fetchUserMentions(u.id, limit))
      );
    }

    // Single Tweet Lookup
    if (options.tweetLookup && inputs.tweetUrl) {
      labels.push('tweetLookup');
      const tweetId = extractTweetId(inputs.tweetUrl);
      tasks.push(fetchTweetById(tweetId));
    }

    // Search
    if (options.searchTweets && inputs.searchQuery) {
      labels.push('searchTweets');
      tasks.push(searchRecentTweets(inputs.searchQuery.trim(), limit));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No X options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors });
  } catch (err) {
    console.error('X search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Helper: Update tone in posts table ───────────────────────────────────
/**
 * Updates the tone field for a specific post in the database.
 * @param {string} post_id - The ID of the post to update
 * @param {string} user_id - The user ID (for ownership verification)
 * @param {string} tone - The tone label to set (e.g., "Professional")
 * @returns {Promise<Object>} - { success: boolean, error?: string }
 */
async function updatePostTone(post_id, user_id, tone) {
  if (!post_id || !user_id || !tone) {
    return { success: false, error: 'Missing post_id, user_id, or tone' };
  }

  try {
    const { error: updateErr } = await supabase
      .from('posts')
      .update({ tone })
      .eq('id', post_id)
      .eq('user_id', user_id);

    if (updateErr) {
      console.error('[updatePostTone] Failed to update tone in database:', updateErr);
      return { success: false, error: updateErr.message };
    }

    console.log('[updatePostTone] Tone updated in database for post', post_id, ':', tone);
    return { success: true };
  } catch (err) {
    console.error('[updatePostTone] Exception:', err);
    return { success: false, error: err.message };
  }
}

// ─── Tone Analysis Endpoint ───────────────────────────────────────────────
/**
 * POST /api/tone
 * Body: { message: string, post_id?: string, user_id?: string }
 * Analyzes tone of the message and optionally persists it to the database.
 */
app.post('/api/tone', async (req, res) => {
  try {
    const { message, post_id, user_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing message field' });
    }

    console.log(post_id + " " + user_id);

    const result = await categorizeTone(message, post_id, user_id);

    // If post_id and user_id are provided, persist the tone to the database

    if (post_id && user_id && result.normalized?.tone) {
      const updateResult = await updatePostTone(post_id, user_id, result.normalized.tone);
      console.warn('starting update');
      if (!updateResult.success) {
        console.warn('[/api/tone] Tone analysis succeeded but database update failed:', updateResult.error);
        // Don't fail the response; still return the tone value to the client
      } else {
        console.warn('[/api/tone] Tone analysis succeeded and database update succeeded:');
      }
    }

    return res.json({ success: true, result });
  } catch (err) {
    console.error('Tone API error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  try {
    const redditId = await ensureRedditPlatform();
    console.log(`Reddit platform ensured (id=${redditId})`);
  } catch (e) {
    console.error('Startup seed failed:', e.message);
  }
});

app.post("/write", async (req, res) => {
  const { message } = req.body;
  const { data, error } = await supabase
    .from("hello_world")
    .insert({ message })
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return res.status(500).json({ error: error.message });
  }


  res.json({ inserted: data });
});

app.get("/read", async (req, res) => {
  const { data, error } = await supabase
    .from("hello_world")
    .select("*");
  if (error) {
    console.error("Select error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ records: data });
});

app.post("/api/delete", async (req, res) => {
  const providedAuth = req.get("x-scraper-auth") || req.headers["x-scraper-auth"];
  if (process.env.SCRAPER_AUTH && providedAuth !== process.env.SCRAPER_AUTH) {
    console.warn(`Unauthorized delete attempt from ${req.ip}`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing id in body" });
  try {
    const { error } = await supabase.from("hello_world").delete().eq("id", id);
    if (error) {
      console.error("Delete error:", error);
      return res.status(500).json({ error: error.message });
    }
    console.log(`Deleted hello_world id=${id}`);
    res.json({ status: "deleted", id });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

app.post('/api/chat', async (req, res) => {
  const { llmProvider, chatModel: requestedModel } = req.body || {};
  let chatConfig = resolveChatConfig({ requestedProvider: llmProvider, requestedModel });

  if (!chatConfig.apiKey) {
    console.error(`Missing chat API key on server (${chatConfig.missingEnv}).`);
    return res.status(500).json({
      error: `Chat API key is not configured on the server (${chatConfig.missingEnv}).`,
    });
  }

  try {
    const { messages = [], attachments = [] } = req.body || {};
    const userId = getUserIdFromRequest(req);
    const latestPosts = await fetchLatestPostsContext(userId);

    const sanitizedMessages = Array.isArray(messages) ? messages.slice(-20) : [];

    const attachmentContext = (attachments || [])
      .filter((file) => file && file.name && file.content)
      .map((file) => {
        const preview = String(file.content).slice(0, 6000);
        return `Attachment: ${file.name} (${file.type || 'unknown type'})\n${preview}`;
      })
      .join('\n\n');

    const userMessages = attachmentContext
      ? [...sanitizedMessages, { role: 'user', content: `Attachment context:\n${attachmentContext}` }]
      : sanitizedMessages;

    const postsContext = latestPosts.length
      ? [
        'Latest posts from Supabase (most recent first):',
        JSON.stringify(
          latestPosts.slice(0, 20).map((post) => ({
            platform_id: post.platform_id,
            competitor_id: post.competitor_id,
            platform_post_id: post.platform_post_id,
            url: post.url,
            content: String(post.content || '').slice(0, 400),
            created_at: post.created_at,
            published_at: post.published_at,
          })),
          null,
          2
        ),
      ].join('\n')
      : null;

    const systemMessages = [
      {
        role: 'system',
        content:
          'You are ChibitekAI, a concise, helpful assistant for competitive intelligence. Use any provided attachment context to strengthen answers.',
      },
    ];
    if (postsContext) {
      systemMessages.push({
        role: 'system',
        content: postsContext,
      });
    }

    const maxAttempts = chatConfig.provider === 'github'
      ? Math.max(1, GITHUB_KEYS.length)
      : chatConfig.provider === 'cerebras'
        ? Math.max(1, CEREBRAS_KEYS.length || 1) * 4
        : 1;

    const cerebrasModelCandidates = chatConfig.provider === 'cerebras'
      ? getCerebrasModelCandidates(chatConfig.model)
      : [];
    let cerebrasModelIndex = 0;
    let triedCerebrasAltBase = false;

    let response;
    let lastError = null;
    let attemptedUnknownModelFallback = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const llmClient = new OpenAI({
          baseURL: chatConfig.baseUrl,
          apiKey: chatConfig.apiKey,
        });

        response = await llmClient.chat.completions.create({
          model: chatConfig.model,
          messages: [...systemMessages, ...userMessages],
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const unauthorized = error?.status === 401 || String(error?.message || '').includes('401');
        const rateLimited = error?.status === 429 || String(error?.message || '').includes('429');
        const unknownModel =
          error?.code === 'unknown_model' ||
          (error?.status === 404 && /unknown model/i.test(String(error?.message || '')));

        if (chatConfig.provider === 'github' && unknownModel && !attemptedUnknownModelFallback) {
          attemptedUnknownModelFallback = true;
          chatConfig = {
            ...chatConfig,
            model: githubFallbackModel,
          };
          continue;
        }

        if (chatConfig.provider === 'cerebras') {
          const cerebras404 = error?.status === 404 || String(error?.message || '').includes('404');

          if ((unknownModel || cerebras404) && cerebrasModelIndex < cerebrasModelCandidates.length - 1) {
            cerebrasModelIndex++;
            chatConfig = {
              ...chatConfig,
              model: cerebrasModelCandidates[cerebrasModelIndex],
              apiKey: nextCerebrasKey() || chatConfig.apiKey,
            };
            continue;
          }

          if (cerebras404 && !triedCerebrasAltBase) {
            triedCerebrasAltBase = true;
            chatConfig = {
              ...chatConfig,
              baseUrl: cerebrasEndpointAlt,
              apiKey: nextCerebrasKey() || chatConfig.apiKey,
            };
            continue;
          }

          const shouldRetryCerebras = (unauthorized || rateLimited) && attempt < maxAttempts - 1;
          if (shouldRetryCerebras) {
            chatConfig = {
              ...chatConfig,
              apiKey: nextCerebrasKey() || chatConfig.apiKey,
            };
            continue;
          }
        }

        const shouldRetryGithub = chatConfig.provider === 'github' && unauthorized && attempt < maxAttempts - 1;
        if (!shouldRetryGithub) {
          throw error;
        }
        chatConfig = resolveChatConfig({ requestedProvider: 'github', requestedModel });
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    const reply = response.choices?.[0]?.message?.content || 'No response from model.';
    return res.json({
      reply,
      provider: chatConfig.provider,
      model: chatConfig.model,
    });
  } catch (error) {
    const providerLabel = chatConfig.provider;
    const details = {
      message: error?.message,
      status: error?.status,
      name: error?.name,
      type: error?.type,
      code: error?.code,
      provider: providerLabel,
      baseUrl: chatConfig.baseUrl,
      model: chatConfig.model,
    };
    console.error('Chat completion error:', details);
    if (CHAT_DEBUG === 'true') {
      return res.status(500).json({
        error: 'Chat request failed.',
        details,
      });
    }
    const message = error?.message || 'Chat request failed.';
    const status = error?.status ? ` status=${error.status}` : '';
    return res.status(500).json({
      error: `${message} (provider=${providerLabel}${status})`,
    });
  }
});

app.get('/api/chat/health', (req, res) => {
  const chatConfig = resolveChatConfig();
  const keyPresent = Boolean(chatConfig.apiKey);
  res.json({
    ok: true,
    provider: chatConfig.provider,
    baseUrl: chatConfig.baseUrl,
    model: chatConfig.model,
    keyPresent,
    availableProviders: {
      github: Boolean(GITHUB_KEYS.length),
      cerebras: Boolean(CEREBRAS_KEYS.length),
      openai: Boolean(OPENAI_API_KEY),
    },
  });
});

app.post('/api/chat/conversations', async (req, res) => {
  const { title, conversation } = req.body || {};
  if (!Array.isArray(conversation) || !conversation.length) {
    return res.status(400).json({ error: 'conversation must be a non-empty array' });
  }

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        title: title || 'New chat',
        conversation,
        user_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Save conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Save conversation failed:', err);
    return res.status(500).json({ error: 'Failed to save conversation.' });
  }
});

app.get('/api/chat/conversations', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('List conversations error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversations: data || [] });
  } catch (err) {
    console.error('List conversations failed:', err);
    return res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

app.get('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Fetch conversation error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ conversation: data });
  } catch (err) {
    console.error('Fetch conversation failed:', err);
    return res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

app.delete('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

const deleteConversationById = async (id, req, res) => {
  if (!id) return res.status(400).json({ error: 'Missing conversation id.' });

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data, error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) {
      console.error('Delete conversation error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!data?.length) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    return res.json({ deleted: true, id });
  } catch (err) {
    console.error('Delete conversation failed:', err);
    return res.status(500).json({ error: 'Failed to delete conversation.' });
  }
};

app.post('/api/chat/conversations/:id/delete', async (req, res) => {
  const { id } = req.params;
  return deleteConversationById(id, req, res);
});

app.post('/api/chat/conversations/:id', async (req, res) => {
  const { id } = req.params;
  const methodOverride = req.get('x-http-method-override') || req.query?._method;
  if (String(methodOverride || '').toUpperCase() !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  return deleteConversationById(id, req, res);
});

app.post("/api/x/fetch-and-save/:username", async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const username = req.params.username;

    const platformUserId = await getUserIdByUsername(username);

    const PLATFORM_X = 1;

    // Find or create competitor
    let competitor;
    const { data: existingComp } = await supabase
      .from("competitors")
      .select("*")
      .eq("platform_id", PLATFORM_X)
      .eq("platform_user_id", platformUserId)
      .maybeSingle();

    if (existingComp) {
      competitor = existingComp;
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitors")
        .insert({
          platform_id: PLATFORM_X,
          platform_user_id: platformUserId,
          display_name: username,
          profile_url: `https://x.com/${username}`,
        })
        .select()
        .single();
      if (compErr) throw compErr;
      competitor = newComp;
    }

    const [tweet] = await fetchPostsByUserId(platformUserId);

    if (!tweet) {
      return res.json({ saved: false, reason: "No tweet found" });
    }

    const normalized = normalizeXPost(tweet, {
      platformId: PLATFORM_X,
      competitorId: competitor.id,
    });

    // Find or create post
    let post;
    const { data: existingPost } = await supabase
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform_id", PLATFORM_X)
      .eq("platform_post_id", normalized.post.platform_post_id)
      .maybeSingle();

    if (existingPost) {
      const { data: updated, error: updateErr } = await supabase
        .from("posts")
        .update({ content: normalized.post.content, published_at: normalized.post.published_at })
        .eq("id", existingPost.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      post = updated;
    } else {
      const { data: newPost, error: insertErr } = await supabase
        .from("posts")
        .insert({
          ...normalized.post,
          user_id: userId,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      post = newPost;
    }

    await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      ...normalized.metrics,
    });

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/posts", async (req, res) => {
  const {
    platform_id: rawPlatformId,
    platform_name,
    platform_user_id,
    username,
    platform_post_id,
    content,
    published_at,
    likes,
    shares,
    comments,
    user_id,
    title,
    description,
    channelTitle,
    videoId,
    views,
    author_name,
    author_handle,
  } = req.body;

  if ((!rawPlatformId && !platform_name) || !platform_user_id || !platform_post_id || !user_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Resolve platform_id: prefer platform_name (dynamic lookup/create) over raw numeric id
  const PLATFORM_NAME_MAP = { x: 'X', youtube: 'YouTube', reddit: 'Reddit', linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok' };
  let platform_id = rawPlatformId;
  const platformKey = String(platform_name || '').trim().toLowerCase();
  if (platform_name) {
    const resolvedName = PLATFORM_NAME_MAP[platform_name.toLowerCase()] || platform_name;
    platform_id = await ensurePlatform(resolvedName);
  }

  const platformPostId = String(platform_post_id).trim();
  const isYouTube = platformKey === 'youtube' || Number(platform_id) === 8;
  const isX = platformKey === 'x' || Number(platform_id) === 1;
  const isInstagram = platformKey === 'instagram' || Number(platform_id) === 3;
  const isTikTok = platformKey === 'tiktok' || Number(platform_id) === 5;
  const isReddit = platformKey === 'reddit' || Number(platform_id) === REDDIT_PLATFORM_ID;

  try {
    // Find or create competitor
    let profileUrl = `https://unknown/${username || platform_user_id}`;
    if (isX) profileUrl = `https://x.com/${username || platform_user_id}`;
    if (isInstagram) profileUrl = `https://www.instagram.com/${username || platform_user_id}`;
    if (isTikTok) profileUrl = `https://www.tiktok.com/@${username || platform_user_id}`;
    if (isYouTube) profileUrl = `https://www.youtube.com/channel/${platform_user_id}`;
    if (isReddit) profileUrl = `https://www.reddit.com/user/${username || platform_user_id}`;

    let competitor;
    const { data: existingComp, error: competitorError } = await supabase
      .from("competitors")
      .select("*")
      .eq("platform_id", platform_id)
      .eq("platform_user_id", platform_user_id)
      .maybeSingle();

    if (competitorError) throw competitorError;

    if (existingComp) {
      competitor = existingComp;
    } else {
      const { data: newComp, error: compErr } = await supabase
        .from("competitors")
        .insert({
          platform_id,
          platform_user_id,
          display_name: username || platform_user_id,
          profile_url: profileUrl,
        })
        .select()
        .single();
      if (compErr) throw compErr;
      competitor = newComp;
    }

    // Find or create post
    let post;
    const { data: existingPost, error: existingPostErr } = await supabase
      .from("posts")
      .select("*")
      .eq("platform_id", platform_id)
      .eq("platform_post_id", platformPostId)
      .maybeSingle();
    if (existingPostErr) throw existingPostErr;

    if (existingPost) {
      const { data: updated, error: updateErr } = await supabase
        .from("posts")
        .update({
          content,
          published_at,
          competitor_id: competitor.id,
          // Keep ownership stable when set, but backfill when empty.
          user_id: existingPost.user_id || user_id,
        })
        .eq("id", existingPost.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      post = updated;
    } else {
      const { data: newPost, error: insertErr } = await supabase
        .from("posts")
        .insert({
          platform_id,
          competitor_id: competitor.id,
          platform_post_id: platformPostId,
          content,
          published_at,
          user_id,
        })
        .select()
        .single();
      if (insertErr) {
        if (!isDuplicateKeyError(insertErr)) throw insertErr;

        // Concurrent saves can race on insert; resolve by loading the existing row.
        const { data: racedPost, error: racedPostErr } = await supabase
          .from('posts')
          .select('*')
          .eq('platform_id', platform_id)
          .eq('platform_post_id', platformPostId)
          .maybeSingle();
        if (racedPostErr) throw racedPostErr;
        if (!racedPost) throw insertErr;

        const { data: synced, error: syncedErr } = await supabase
          .from('posts')
          .update({
            content,
            published_at,
            competitor_id: competitor.id,
            user_id: racedPost.user_id || user_id,
          })
          .eq('id', racedPost.id)
          .select()
          .single();
        if (syncedErr) throw syncedErr;
        post = synced;
      } else {
        post = newPost;
      }
    }

    console.log('[POST /api/posts] Saving metrics – likes:', likes, 'shares:', shares, 'comments:', comments, 'views:', views);
    const { error: metricsErr } = await supabase.from("post_metrics").insert({
      post_id: post.id,
      snapshot_at: new Date(),
      likes,
      shares,
      comments,
      other_json: { views: views ?? 0 },
    });
    if (metricsErr) throw metricsErr;

    // For YouTube, save additional details
    if (isYouTube) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          title,
          description,
          channelTitle,
          videoId,
          views,
        },
      });
      if (detailsError && !isDuplicateKeyError(detailsError)) {
        console.error('Error saving post details:', detailsError);
      }
    }

    // For X (Twitter), save additional details
    if (isX) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          author_name: author_name || username,
          author_handle: author_handle || username,
          username,
          views: views ?? 0,
        },
      });
      if (detailsError && !isDuplicateKeyError(detailsError)) {
        console.error('Error saving X post details:', detailsError);
      }
    }

    // For Instagram, TikTok, Reddit — save author details + views
    if (isInstagram || isTikTok || isReddit) {
      const { error: detailsError } = await supabase.from("post_details_platform").insert({
        post_id: post.id,
        extra_json: {
          author_name: author_name || username,
          author_handle: author_handle || username,
          username,
          views: views ?? 0,
        },
      });
      if (detailsError && !isDuplicateKeyError(detailsError)) {
        console.error('Error saving post details:', detailsError);
      }
    }

    res.json({ saved: true, post_id: post.id });
  } catch (err) {
    console.error("Save post failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select(`
  id,
  platform_id,
  platform_post_id,
  url,
  content,
  published_at,
  tone,
  competitors(display_name),
  post_metrics(likes, shares, comments, other_json),
  post_details_platform(extra_json)
`)
      .eq("user_id", userId)
      .order("published_at", { ascending: false });

    if (error) throw error;

    const formattedPosts = posts.map((post) => {
      const extra = post.post_details_platform?.[0]?.extra_json || {};
      // Supabase returns an object (not array) for many-to-one FK joins
      const competitorName = post.competitors?.display_name
        ?? post.competitors?.[0]?.display_name
        ?? undefined;

      // Build best-effort author name from multiple sources
      const authorName = extra.author_name || extra.name || competitorName || extra.author?.name;
      const authorHandle = extra.author_handle || extra.username || competitorName;

      return {
        id: post.id,
        platform_id: post.platform_id || 0,
        platform_post_id: post.platform_post_id || null,
        url: post.url || null,
        content: post.content,
        published_at: post.published_at,
        tone: post.tone || null,
        likes: post.post_metrics?.[0]?.likes || 0,
        shares: post.post_metrics?.[0]?.shares || 0,
        comments: post.post_metrics?.[0]?.comments || 0,
        views: post.post_metrics?.[0]?.other_json?.views || extra.views || 0,
        username: authorHandle || undefined,
        extra: {
          ...extra,
          author_name: authorName || undefined,
          author_handle: authorHandle || undefined,
          username: authorHandle || undefined,
          title: extra.title,
          description: extra.description,
          channelTitle: extra.channelTitle,
          videoId: extra.videoId,
          views: post.post_metrics?.[0]?.other_json?.views || extra.views || 0,
        },
      };
    });

    res.json({ posts: formattedPosts });
  } catch (err) {
    console.error("Fetch posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/posts", async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw deleteError;
    res.json({ deleted: true });
  } catch (err) {
    console.error("Delete all posts failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  const postId = req.params.id;

  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    if (postError) throw postError;
    if (!post) return res.status(404).json({ error: "Post not found." });

    await supabase.from("post_metrics").delete().eq("post_id", postId);
    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", userId);

    if (deleteError) throw deleteError;

    res.json({ deleted: true, post_id: postId });
  } catch (err) {
    console.error("Delete post failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── LinkedIn ────────────────────────────────────────────────────────────────

// LinkedIn platform ID is resolved dynamically by ensureLinkedinPlatform()

// Ensure the LinkedIn platform row exists
async function ensurePlatform(name) {
  const { data } = await supabase
    .from('platforms')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (data) return data.id;

  const { data: created, error } = await supabase
    .from('platforms')
    .insert({ name })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureLinkedinPlatform() {
  return ensurePlatform('LinkedIn');
}

/**
 * Normalise LinkedIn inputs so the Scrape Creators API always receives a full URL.
 *   profile: "parrsam"         → "https://www.linkedin.com/in/parrsam"
 *   company: "shopify"         → "https://www.linkedin.com/company/shopify"
 *   post:    "/posts/abc-123"  → "https://www.linkedin.com/posts/abc-123"
 * Full URLs are passed through unchanged.
 */
function normalizeLinkedinUrl(raw, type) {
  if (!raw) return raw;
  let v = raw.trim();

  // Already a full URL
  if (/^https?:\/\//i.test(v)) return v;

  // Remove leading slashes / "linkedin.com" prefix without scheme
  v = v.replace(/^\/+/, '').replace(/^(www\.)?linkedin\.com\/?/i, '');

  switch (type) {
    case 'profile': {
      // Strip "in/" prefix if present, then wrap
      const slug = v.replace(/^in\//i, '').replace(/\/+$/, '');
      return `https://www.linkedin.com/in/${slug}`;
    }
    case 'company': {
      const slug = v.replace(/^company\//i, '').replace(/\/+$/, '');
      return `https://www.linkedin.com/company/${slug}`;
    }
    case 'post': {
      // Could be /posts/... or /pulse/... — just prefix LinkedIn base
      if (/^(posts|pulse|feed)\//i.test(v)) {
        return `https://www.linkedin.com/${v}`;
      }
      return `https://www.linkedin.com/posts/${v}`;
    }
    default:
      return v;
  }
}

/**
 * POST /api/linkedin/search
 * Body: { options: { profile, company, post }, inputs: { profile, company, post } }
 * Calls the relevant Scrape Creators endpoints in parallel and returns combined results.
 */
app.post('/api/linkedin/search', async (req, res) => {
  try {
    console.log('[Debug][LinkedIn] request body:', JSON.stringify(req.body).slice(0, 1000));
    const { options = {}, inputs = {} } = req.body;

    // If caller provided a single freeform query and no explicit options,
    // auto-route: @handle -> profile, URL -> direct lookup, keyword -> discovery
    if ((!options || Object.keys(options).length === 0 || Object.values(options).every(v => !v)) && (inputs.query || inputs.keyword)) {
      const free = inputs.query || inputs.keyword;
      const detected = detectInputType(free);
      if (detected.type === 'handle') {
        options.profile = true;
        inputs.profile = detected.value;
      } else if (detected.type === 'url') {
        // Let existing logic normalize URL types (profile/company/post)
        // Try to push the URL into profile/company/post depending on path
        const url = String(detected.value || '');
        if (/linkedin\.com\/(company)\//i.test(url)) {
          options.company = true; inputs.company = url;
        } else if (/linkedin\.com\/(posts|pulse|feed)\//i.test(url)) {
          options.post = true; inputs.post = url;
        } else {
          options.profile = true; inputs.profile = url;
        }
      } else {
        // keyword discovery
        options.profile = true; options.company = true; options.post = true; inputs.keyword = detected.value;
      }
    }

    const tasks = [];
    const labels = [];

    if (options.profile && inputs.profile) {
      const normalizedUrl = normalizeLinkedinUrl(inputs.profile, 'profile');
      console.log('[LinkedIn] Profile search →', normalizedUrl);
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/linkedin/profile', { url: normalizedUrl }));
    }
    if (options.company && inputs.company) {
      const normalizedUrl = normalizeLinkedinUrl(inputs.company, 'company');
      console.log('[LinkedIn] Company search →', normalizedUrl);
      labels.push('company');
      tasks.push(scrapeCreators('/v1/linkedin/company', { url: normalizedUrl }));
    }
    if (options.post && inputs.post) {
      const normalizedUrl = normalizeLinkedinUrl(inputs.post, 'post');
      console.log('[LinkedIn] Post search →', normalizedUrl);
      labels.push('post');
      tasks.push(scrapeCreators('/v1/linkedin/post', { url: normalizedUrl }));
    }

    // Keyword-based LinkedIn discovery: if a freeform keyword is provided,
    // perform a lightweight Google search and extract any linkedin.com links,
    // then enqueue matching LinkedIn endpoints.
    if (inputs.keyword && String(inputs.keyword).trim()) {
      try {
        const googleResp = await scrapeCreators('/v1/google/search', { query: String(inputs.keyword).trim() });
        const hits = googleResp?.results || googleResp?.data || [];
        let added = 0;
        for (const h of hits) {
          const url = (h.url || h.link || '').toString();
          if (!url) continue;
          if (!/linkedin\.com\//i.test(url)) continue;
          if (added >= 3) break; // limit follow-ups to 3 links
          // Determine endpoint type
          const endpoint = /\/company\//i.test(url)
            ? '/v1/linkedin/company'
            : (/\/posts\//i.test(url) || /\/pulse\//i.test(url))
              ? '/v1/linkedin/post'
              : '/v1/linkedin/profile';
          labels.push(`keyword_discovery_${added}`);
          tasks.push(scrapeCreators(endpoint, { url }));
          added++;
        }
      } catch (e) {
        console.warn('[LinkedIn] Keyword discovery failed:', e?.message || e);
      }
    }

    if (!tasks.length) {
      // If the caller provided a keyword for discovery but no linkedin.com
      // links were found, return a successful response with empty results
      // rather than a 400. This avoids client crashes in mock/offline mode.
      if (inputs.keyword && String(inputs.keyword).trim()) {
        return res.json({ success: true, results: {}, errors: [{ message: 'No discovery links found for keyword.' }] });
      }
      return res.status(400).json({ error: 'No LinkedIn options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        // Ensure we always return an object or array for the label so the
        // frontend rendering code can safely access expected keys.
        results[labels[i]] = s.value ?? {};
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        // Keep the error message concise but include endpoint label.
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
        results[labels[i]] = { error: s.reason?.message || String(s.reason) };
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('LinkedIn search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/linkedin/save
 * Body: { type: "profile"|"company"|"post", data: <raw api data>, user_id: string }
 * Saves data across competitors, posts, post_metrics, post_details_platform tables.
 */
app.post('/api/linkedin/save', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { type, data } = req.body;
    if (!type || !data) {
      return res.status(400).json({ error: 'Missing type or data.' });
    }

    const platformId = await ensureLinkedinPlatform();

    if (type === 'profile') {
      // Save person profile as a competitor + their recent posts
      const profileUrl = data.linkedInUrl || data.url || '';
      const displayName = data.name || 'Unknown';
      const platformUserId = profileUrl || displayName;

      // Upsert competitor
      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', platformUserId)
        .maybeSingle();

      if (existing) {
        competitor = existing;
        await supabase.from('competitors').update({
          display_name: displayName,
          profile_url: profileUrl,
        }).eq('id', existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: platformUserId,
            display_name: displayName,
            profile_url: profileUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save profile details as a "post" (type=profile_snapshot)
      const snapshotId = `profile_${platformUserId}_${Date.now()}`;
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform_id: platformId,
          competitor_id: competitor.id,
          platform_post_id: snapshotId,
          url: profileUrl,
          content: data.about || '',
          published_at: new Date(),
          user_id: userId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.followers || 0,
        shares: 0,
        comments: 0,
        other_json: { connections: data.connections },
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_profile',
          name: data.name,
          image: data.image,
          location: data.location,
          followers: data.followers,
          connections: data.connections,
          about: data.about,
          experience: data.experience,
          education: data.education,
          articles: data.articles,
        },
      });

      // Also save each recent post from activity if present
      const activityPosts = data.activity || data.recentPosts || [];
      for (const act of activityPosts.slice(0, 10)) {
        const actUrl = act.link || act.url || '';
        const actId = actUrl || `activity_${Date.now()}_${Math.random()}`;

        const { data: existingAct } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_id', platformId)
          .eq('platform_post_id', actId)
          .maybeSingle();

        if (!existingAct) {
          const { data: actPost, error: actErr } = await supabase
            .from('posts')
            .insert({
              platform_id: platformId,
              competitor_id: competitor.id,
              platform_post_id: actId,
              url: actUrl,
              content: act.title || act.text || '',
              published_at: act.datePublished || new Date(),
              user_id: userId,
            })
            .select()
            .single();

          if (!actErr && actPost) {
            // Insert metrics (even if 0) so post_metrics row exists
            await supabase.from('post_metrics').insert({
              post_id: actPost.id,
              snapshot_at: new Date(),
              likes: act.likeCount || act.numLikes || 0,
              shares: act.shareCount || act.numShares || 0,
              comments: act.commentCount || act.numComments || 0,
            });
            await supabase.from('post_details_platform').insert({
              post_id: actPost.id,
              extra_json: {
                type: 'linkedin_activity',
                activityType: act.activityType,
                image: act.image,
                link: act.link,
                author_name: data.name || 'Unknown',
              },
            });
          }
        }
      }

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    if (type === 'company') {
      const companyUrl = data.linkedInUrl || data.url || '';
      const displayName = data.name || 'Unknown Company';
      const platformUserId = data.id || companyUrl || displayName;

      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', String(platformUserId))
        .maybeSingle();

      if (existing) {
        competitor = existing;
        await supabase.from('competitors').update({
          display_name: displayName,
          profile_url: companyUrl,
        }).eq('id', existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: String(platformUserId),
            display_name: displayName,
            profile_url: companyUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save company page as a snapshot post
      const snapshotId = `company_${platformUserId}_${Date.now()}`;
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform_id: platformId,
          competitor_id: competitor.id,
          platform_post_id: snapshotId,
          url: companyUrl,
          content: data.description || '',
          published_at: new Date(),
          user_id: userId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.employeeCount || 0,
        shares: 0,
        comments: 0,
        other_json: { followers: data.followers },
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_company',
          name: data.name,
          logo: data.logo,
          coverImage: data.coverImage,
          slogan: data.slogan,
          industry: data.industry,
          size: data.size,
          founded: data.founded,
          headquarters: data.headquarters,
          companyType: data.type,
          specialties: data.specialties,
          website: data.website,
          employeeCount: data.employeeCount,
          funding: data.funding,
        },
      });

      // Save company posts
      const compPosts = data.posts || [];
      for (const cp of compPosts.slice(0, 10)) {
        const cpUrl = cp.url || '';
        const cpId = cpUrl || `comppost_${Date.now()}_${Math.random()}`;

        const { data: existingCp } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', userId)
          .eq('platform_id', platformId)
          .eq('platform_post_id', cpId)
          .maybeSingle();

        if (!existingCp) {
          const { data: cpPost, error: cpErr } = await supabase
            .from('posts')
            .insert({
              platform_id: platformId,
              competitor_id: competitor.id,
              platform_post_id: cpId,
              url: cpUrl,
              content: cp.text || '',
              published_at: cp.datePublished || new Date(),
              user_id: userId,
            })
            .select()
            .single();

          if (!cpErr && cpPost) {
            await supabase.from('post_metrics').insert({
              post_id: cpPost.id,
              snapshot_at: new Date(),
              likes: cp.likeCount || cp.numLikes || 0,
              shares: cp.shareCount || cp.numShares || 0,
              comments: cp.commentCount || cp.numComments || 0,
            });
            await supabase.from('post_details_platform').insert({
              post_id: cpPost.id,
              extra_json: {
                type: 'linkedin_company_post',
                image: cp.image,
                author_name: data.name || 'Unknown Company',
              },
            });
          }
        }
      }

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    if (type === 'post') {
      const authorName = data.author?.name || 'Unknown';
      const authorUrl = data.author?.url || '';
      const platformUserId = authorUrl || authorName;
      const postUrl = data.url || '';

      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', platformUserId)
        .maybeSingle();

      if (existing) {
        competitor = existing;
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: platformUserId,
            display_name: authorName,
            profile_url: authorUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      // Save the post
      const postPlatformId = postUrl || `post_${Date.now()}`;
      const { data: existingPost } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', userId)
        .eq('platform_id', platformId)
        .eq('platform_post_id', postPlatformId)
        .maybeSingle();

      let post;
      if (existingPost) {
        const { data: updated, error: upErr } = await supabase
          .from('posts')
          .update({
            content: data.description || data.headline || '',
            published_at: data.datePublished || new Date(),
          })
          .eq('id', existingPost.id)
          .select()
          .single();
        if (upErr) throw upErr;
        post = updated;
      } else {
        const { data: created, error: crErr } = await supabase
          .from('posts')
          .insert({
            platform_id: platformId,
            competitor_id: competitor.id,
            platform_post_id: postPlatformId,
            url: postUrl,
            content: data.description || data.headline || '',
            published_at: data.datePublished || new Date(),
            user_id: userId,
          })
          .select()
          .single();
        if (crErr) throw crErr;
        post = created;
      }

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.likeCount || 0,
        shares: 0,
        comments: data.commentCount || 0,
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: 'linkedin_post',
          title: data.name,
          headline: data.headline,
          author: data.author,
          commentCount: data.commentCount,
          likeCount: data.likeCount,
          topComments: (data.comments || []).slice(0, 5),
        },
      });

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    // Generic sub-item save for activity, companyPost, comment, article
    if (['activity', 'companyPost', 'comment', 'article'].includes(type)) {
      const authorName = data.author || data.profileName || data.companyName || 'LinkedIn';
      const platformUserId = authorName;
      const content = data.text || data.headline || data.body || '';
      const postUrl = data.url || data.link || '';

      let competitor;
      const { data: existing } = await supabase
        .from('competitors')
        .select('*')
        .eq('platform_id', platformId)
        .eq('platform_user_id', platformUserId)
        .maybeSingle();

      if (existing) {
        competitor = existing;
      } else {
        const { data: created, error } = await supabase
          .from('competitors')
          .insert({
            platform_id: platformId,
            platform_user_id: platformUserId,
            display_name: authorName,
            profile_url: postUrl,
          })
          .select()
          .single();
        if (error) throw error;
        competitor = created;
      }

      const postPlatformId = postUrl || `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          platform_id: platformId,
          competitor_id: competitor.id,
          platform_post_id: postPlatformId,
          url: postUrl,
          content,
          published_at: data.datePublished || new Date(),
          user_id: userId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      await supabase.from('post_metrics').insert({
        post_id: post.id,
        snapshot_at: new Date(),
        likes: data.likeCount || 0,
        shares: 0,
        comments: data.commentCount || 0,
      });

      await supabase.from('post_details_platform').insert({
        post_id: post.id,
        extra_json: {
          type: `linkedin_${type}`,
          author_name: authorName,
          ...data,
        },
      });

      return res.json({ saved: true, competitor_id: competitor.id, post_id: post.id });
    }

    return res.status(400).json({ error: `Unknown save type: ${type}` });
  } catch (err) {
    console.error('LinkedIn save error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End LinkedIn ────────────────────────────────────────────────────────────

// ─── Instagram ───────────────────────────────────────────────────────────────

/**
 * Helper – extract an Instagram shortcode from a URL or raw shortcode.
 */
function extractIgShortcode(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // URL like https://www.instagram.com/p/CODE/ or /reel/CODE/
  const m = trimmed.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  // Already a raw shortcode (11-char alphanumeric)
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed)) return trimmed;
  return trimmed; // pass through, let API decide
}

function extractIgUsername(input) {
  if (!input) return '';
  let u = input.trim().replace(/^@/, '');
  // URL like instagram.com/username
  const m = u.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (m) u = m[1];
  return u;
}

/**
 * POST /api/instagram/search
 * Body: { options: { profile, userPosts, singlePost, postComments,
 *                     reelsSearch, userReels, highlightDetail },
 *         inputs: { username, userPostsUsername, postUrl, reelsSearchTerm,
 *                   userReelsUsername, highlightUrl } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/instagram/profile        → { handle }
 *   /v2/instagram/user/posts     → { handle }
 *   /v1/instagram/post           → { url }   (full IG post URL)
 *   /v2/instagram/post/comments  → { url }   (full IG post URL)
 *   /v2/instagram/reels/search   → { query }
 *   /v1/instagram/user/reels     → { handle }
 *   /v1/instagram/user/highlights→ { handle }
 */
app.post('/api/instagram/search', async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(10, Number(rawLimit) || 10));
    // Auto-route when caller supplies a single freeform query and no options.
    // For Instagram, only treat @handles as account lookups; plain text
    // without @ should map to keyword search.
    if ((!options || Object.keys(options).length === 0 || Object.values(options).every(v => !v)) && (inputs.query || inputs.username || inputs.userReelsUsername || inputs.reelsSearchTerm)) {
      const free = String(inputs.query || inputs.username || inputs.userReelsUsername || inputs.reelsSearchTerm || '').trim();
      const isAtHandle = free.startsWith('@');
      let isUrl = false;
      try { new URL(free); isUrl = true; } catch { }

      if (isAtHandle) {
        const handleValue = free.replace(/^@/, '');
        options.profile = true;
        options.userPosts = true;
        inputs.username = handleValue;
        inputs.userPostsUsername = handleValue;
      } else if (isUrl) {
        const shortcode = extractIgShortcode(free);
        if (shortcode) {
          options.singlePost = true;
          inputs.postUrl = free;
        } else {
          const h = extractIgUsername(free);
          if (h) {
            options.profile = true;
            options.userPosts = true;
            inputs.username = h;
            inputs.userPostsUsername = h;
          }
        }
      } else if (free) {
        options.reelsSearch = true;
        inputs.reelsSearchTerm = free;
      }
    }
    const tasks = [];
    const labels = [];

    // ── Profile & Account ────────────────────────────────────────────────
    const handle = extractIgUsername(inputs.username);
    const postsHandle = extractIgUsername(inputs.userPostsUsername || inputs.username);

    // If both profile and userPosts/userReels are requested, fetch the
    // profile first and only paginate posts/reels if the profile indicates
    // there are media items. This avoids wasting pages on empty accounts
    // and prevents downstream loops when profiles report zero media.
    let deferUserPosts = false;
    let deferUserReels = false;

    if (options.profile && handle) {
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/instagram/profile', { handle }));

      if (options.userPosts && postsHandle) deferUserPosts = true;
      if (options.userReels && postsHandle) deferUserReels = true;
    } else {
      // If profile not requested, behave as before and enqueue posts/reels directly
      if (options.userPosts && postsHandle) {
        labels.push('userPosts');
        tasks.push(scrapeCreatorsPaginated('/v2/instagram/user/posts', { handle: postsHandle }, limit));
      }
      if (options.userReels && postsHandle) {
        labels.push('userReels');
        tasks.push(scrapeCreatorsPaginated('/v1/instagram/user/reels', { handle: postsHandle }, limit));
      }
    }

    // For single post & comments the API expects the full post URL
    const postUrl = inputs.postUrl?.trim();
    const shortcode = extractIgShortcode(postUrl);
    // Build a canonical URL so the API always receives a full URL
    const canonicalPostUrl = shortcode
      ? (postUrl?.startsWith('http') ? postUrl : `https://www.instagram.com/p/${shortcode}/`)
      : null;

    if (options.singlePost && canonicalPostUrl) {
      labels.push('singlePost');
      tasks.push(scrapeCreators('/v1/instagram/post', { url: canonicalPostUrl }));
    }

    // ── Reels ────────────────────────────────────────────────────────────
    if (options.reelsSearch && inputs.reelsSearchTerm?.trim()) {
      labels.push('reelsSearch');
      tasks.push(scrapeCreatorsPaginated('/v2/instagram/reels/search', { query: inputs.reelsSearchTerm.trim() }, limit));
    }

    const reelsHandle = extractIgUsername(inputs.userReelsUsername);
    if (options.userReels && reelsHandle) {
      labels.push('userReels');
      tasks.push(scrapeCreatorsPaginated('/v1/instagram/user/reels', { handle: reelsHandle }, limit));
    }

    // ── Highlights ───────────────────────────────────────────────────────
    const highlightHandle = extractIgUsername(inputs.highlightUrl);
    if (options.highlightDetail && highlightHandle) {
      labels.push('highlightDetail');
      tasks.push(scrapeCreators('/v1/instagram/user/highlights', { handle: highlightHandle }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No Instagram options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    // Map immediate results (profile may be present)
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    // If we deferred posts/reels because profile was requested, decide now
    if (results.profile && (deferUserPosts || deferUserReels)) {
      const profile = results.profile || {};
      const mediaCount = Number(profile.media_count || profile.mediaCount || (Array.isArray(profile.posts) ? profile.posts.length : 0));

      // If profile indicates zero media, return empty arrays instead of paginating
      if (mediaCount <= 0) {
        if (deferUserPosts) results.userPosts = { posts: [] };
        if (deferUserReels) results.userReels = { reels: [] };
      } else {
        // There may be posts embedded in the profile response already
        if (deferUserPosts) {
          const existing = profile.posts || profile.items || profile.posts || profile.media || profile.timeline;
          if (Array.isArray(existing) && existing.length > 0) {
            results.userPosts = { posts: existing.slice(0, limit) };
          } else {
            try {
              const postsResp = await scrapeCreatorsPaginated('/v2/instagram/user/posts', { handle: postsHandle, trim: true }, limit);
              results.userPosts = postsResp || { posts: [] };
              if (postsResp?.credits_remaining != null) credits_remaining = postsResp.credits_remaining;
            } catch (e) {
              errors.push({ endpoint: 'userPosts', error: e?.message || String(e) });
              results.userPosts = { posts: [] };
            }
          }
        }

        if (deferUserReels) {
          const existingReels = profile.reels || profile.itemList || profile.reel_items;
          if (Array.isArray(existingReels) && existingReels.length > 0) {
            results.userReels = { reels: existingReels.slice(0, limit) };
          } else {
            try {
              const reelsResp = await scrapeCreatorsPaginated('/v1/instagram/user/reels', { handle: postsHandle, trim: true }, limit);
              results.userReels = reelsResp || { reels: [] };
              if (reelsResp?.credits_remaining != null) credits_remaining = reelsResp.credits_remaining;
            } catch (e) {
              errors.push({ endpoint: 'userReels', error: e?.message || String(e) });
              results.userReels = { reels: [] };
            }
          }
        }
      }
    }

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('Instagram search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End Instagram ───────────────────────────────────────────────────────────

// ─── TikTok ──────────────────────────────────────────────────────────────────

/**
 * Extract a clean TikTok username from various input formats:
 *   @username, username, https://tiktok.com/@username, etc.
 */
function extractTkUsername(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  // URL: https://www.tiktok.com/@username/...
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/@?([\w.]+)/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  // @username or plain username
  return trimmed.replace(/^@/, '');
}

/**
 * POST /api/tiktok/search
 * Body: { options: { profile, following, followers, profileVideos,
 *                     transcript, comments,
 *                     searchUsers, searchHashtag, searchKeyword },
 *         inputs: { username, videosUsername, videoUrl,
 *                   userSearchQuery, hashtag, keyword } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/tiktok/profile          → { handle }
 *   /v1/tiktok/user/following   → { handle }
 *   /v1/tiktok/user/followers   → { handle }
 *   /v1/tiktok/video/transcript → { url }
 *   /v1/tiktok/video/comments   → { url }
 *   /v1/tiktok/search/users     → { query }
 *   /v1/tiktok/search/hashtag   → { hashtag }
 *   /v1/tiktok/search/keyword   → { query }
 */
app.post('/api/tiktok/search', async (req, res) => {
  try {
    console.log('[Debug][TikTok] request body:', JSON.stringify(req.body).slice(0, 1000));
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(10, Number(rawLimit) || 10));
    // If caller provided a single freeform query and no specific options,
    // auto-route based on whether it's an @handle, URL, or keyword.
    if ((!options || Object.keys(options).length === 0 || Object.values(options).every(v => !v)) && (inputs.query || inputs.username || inputs.keyword || inputs.videosUsername)) {
      const free = inputs.query || inputs.username || inputs.videosUsername || inputs.keyword;
      const detected = detectInputType(free);
      if (detected.type === 'handle') {
        options.profile = true;
        options.profileVideos = true;
        inputs.username = detected.value;
        inputs.videosUsername = detected.value;
      } else if (detected.type === 'url') {
        // If the URL looks like a video, route to video-specific endpoints
        const u = String(detected.value || '');
        if (/\/video\/|\/v\//i.test(u) || /video/i.test(u)) {
          options.transcript = true;
          inputs.videoUrl = u;
        } else {
          // Treat as profile URL
          const h = extractTkUsername(u);
          if (h) {
            options.profile = true;
            options.profileVideos = true;
            inputs.username = h;
            inputs.videosUsername = h;
          }
        }
      } else {
        options.searchKeyword = true;
        inputs.keyword = detected.value;
      }
    }
    const tasks = [];
    const labels = [];

    // ── Profile & Account ──────────────────────────────────────────────
    const handle = extractTkUsername(inputs.username);
    const videosHandle = extractTkUsername(inputs.videosUsername);

    // Deduplicate: if both profile and profileVideos target the same handle,
    // make ONE API call and reuse the result for both labels.
    const sameHandle = handle && videosHandle && handle === videosHandle;

    if (options.profile && handle) {
      labels.push('profile');
      tasks.push(scrapeCreators('/v1/tiktok/profile', { handle, trim: true }));
    }
    if (options.following && handle) {
      labels.push('following');
      tasks.push(scrapeCreators('/v1/tiktok/user/following', { handle }));
    }
    if (options.followers && handle) {
      labels.push('followers');
      tasks.push(scrapeCreators('/v1/tiktok/user/followers', { handle }));
    }

    // ── Videos & Content ───────────────────────────────────────────────
    // Profile videos: fetch via paginated search for the user's handle to
    // ensure we collect multiple pages of videos (more reliable for lots of
    // recent posts). Also still fetch profile metadata separately above.
    if (options.profileVideos && videosHandle && !(sameHandle && options.profile)) {
      labels.push('profileVideos');
      tasks.push(scrapeCreatorsPaginated('/v1/tiktok/search/keyword', { query: videosHandle, trim: true }, limit));
    }

    const videoUrl = inputs.videoUrl?.trim();
    if (options.transcript && videoUrl) {
      labels.push('transcript');
      tasks.push(scrapeCreators('/v1/tiktok/video/transcript', { url: videoUrl }));
    }

    // ── Search & Discovery ─────────────────────────────────────────────
    if (options.searchUsers && inputs.userSearchQuery?.trim()) {
      labels.push('searchUsers');
      tasks.push(scrapeCreators('/v1/tiktok/search/users', { query: inputs.userSearchQuery.trim() }));
    }
    if (options.searchHashtag && inputs.hashtag?.trim()) {
      labels.push('searchHashtag');
      const rawTag = inputs.hashtag.trim().replace(/^#/, '');
      tasks.push(scrapeCreatorsPaginated('/v1/tiktok/search/hashtag', { hashtag: rawTag }, limit));
    }
    if (options.searchKeyword && inputs.keyword?.trim()) {
      labels.push('searchKeyword');
      tasks.push(scrapeCreatorsPaginated('/v1/tiktok/search/keyword', { query: inputs.keyword.trim() }, limit));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No TikTok options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        // Capture latest credits_remaining from any successful response
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    // If we deduped the profile+profileVideos call, copy profile → profileVideos
    if (sameHandle && options.profile && options.profileVideos && results.profile && !results.profileVideos) {
      results.profileVideos = results.profile;
    }

    // Normalize profile/profileVideos shapes: some ScrapeCreators responses
    // return videos under different keys (search_item_list, item_list, aweme_list).
    try {
      const trimTo = limit || 10;

      // Helper to extract array from several known keys
      const extractVideoArray = (obj) => {
        if (!obj) return null;
        if (Array.isArray(obj.itemList)) return obj.itemList;
        if (Array.isArray(obj.search_item_list)) return obj.search_item_list.map(r => r?.data || r);
        if (Array.isArray(obj.item_list)) return obj.item_list;
        if (Array.isArray(obj.aweme_list)) return obj.aweme_list;
        if (Array.isArray(obj.posts)) return obj.posts;
        return null;
      };

      // Normalize profile -> itemList
      if (results.profile && !Array.isArray(results.profile.itemList)) {
        const arr = extractVideoArray(results.profile) || [];
        if (arr.length) results.profile.itemList = arr.slice(0, trimTo);
      } else if (Array.isArray(results.profile?.itemList)) {
        results.profile.itemList = results.profile.itemList.slice(0, trimTo);
      }

      // Normalize profileVideos -> itemList
      if (results.profileVideos && !Array.isArray(results.profileVideos.itemList)) {
        const arr = extractVideoArray(results.profileVideos) || [];
        if (arr.length) results.profileVideos.itemList = arr.slice(0, trimTo);
      } else if (Array.isArray(results.profileVideos?.itemList)) {
        results.profileVideos.itemList = results.profileVideos.itemList.slice(0, trimTo);
      }
    } catch (e) {
      // non-fatal
    }

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('TikTok search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End TikTok ──────────────────────────────────────────────────────────────

// ─── Reddit ──────────────────────────────────────────────────────────────────

/**
 * Normalize subreddit input: strips "r/", leading slashes, or full URLs.
 *   "r/reactjs"  →  "reactjs"
 *   "reactjs"    →  "reactjs"
 *   "https://www.reddit.com/r/reactjs/" → "reactjs"
 */
function extractSubreddit(input) {
  if (!input) return '';
  const trimmed = String(input).trim();
  try {
    const url = new URL(trimmed);
    const m = url.pathname.match(/\/r\/([\w]+)/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  return trimmed.replace(/^\/?r\//, '');
}

/**
 * POST /api/reddit/search
 * Body: { options: { subredditDetails, subredditPosts, subredditSearch,
 *                     postComments, search, searchAds, getAd },
 *         inputs: { subreddit, subredditQuery, postUrl, searchQuery,
 *                   adSearchQuery, adUrl } }
 *
 * Scrape Creators param mapping (discovered via testing):
 *   /v1/reddit/subreddit/details  → { subreddit }
 *   /v1/reddit/subreddit          → { subreddit }          (posts)
 *   /v1/reddit/subreddit/search   → { subreddit, query }
 *   /v1/reddit/post/comments      → { url }
 *   /v1/reddit/search             → { query }
 *   /v1/reddit/ads/search         → { query }
 *   /v1/reddit/ad                 → { id }
 */
app.post('/api/reddit/search', async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(10, Number(rawLimit) || 10));
    // If caller provided a freeform single query and no options, treat
    // plain words as a keyword search; subreddit-like inputs are handled
    // by extractSubreddit below when options.subreddit* are present.
    if ((!options || Object.keys(options).length === 0 || Object.values(options).every(v => !v)) && inputs.query) {
      const detected = detectInputType(inputs.query);
      if (detected.type === 'handle') {
        // Treat as subreddit name
        inputs.subreddit = detected.value.replace(/^r\//i, '');
        options.subredditDetails = true;
        options.subredditPosts = true;
      } else if (detected.type === 'url') {
        // Try to extract subreddit from URL
        inputs.subreddit = extractSubreddit(detected.value);
        options.subredditDetails = true;
        options.subredditPosts = true;
      } else {
        options.search = true;
        inputs.searchQuery = detected.value;
      }
    }
    const tasks = [];
    const labels = [];

    // ── Subreddit ──────────────────────────────────────────────────────
    const subreddit = extractSubreddit(inputs.subreddit);

    if (options.subredditDetails && subreddit) {
      labels.push('subredditDetails');
      tasks.push(scrapeCreators('/v1/reddit/subreddit/details', { subreddit, trim: true }));
    }
    if (options.subredditPosts && subreddit) {
      labels.push('subredditPosts');
      tasks.push(scrapeCreatorsPaginated('/v1/reddit/subreddit', { subreddit, trim: true }, limit));
    }
    if (options.subredditSearch && subreddit && inputs.subredditQuery?.trim()) {
      labels.push('subredditSearch');
      tasks.push(scrapeCreatorsPaginated('/v1/reddit/subreddit/search', { subreddit, query: inputs.subredditQuery.trim(), trim: true }, limit));
    }

    // ── Posts & Search ─────────────────────────────────────────────────
    if (options.postComments && inputs.postUrl?.trim()) {
      labels.push('postComments');
      tasks.push(scrapeCreators('/v1/reddit/post/comments', { url: inputs.postUrl.trim() }));
    }
    if (options.search && inputs.searchQuery?.trim()) {
      labels.push('search');
      tasks.push(scrapeCreatorsPaginated('/v1/reddit/search', { query: inputs.searchQuery.trim() }, limit));
    }

    // ── Ads ────────────────────────────────────────────────────────────
    if (options.searchAds && inputs.adSearchQuery?.trim()) {
      labels.push('searchAds');
      tasks.push(scrapeCreators('/v1/reddit/ads/search', { query: inputs.adSearchQuery.trim() }));
    }
    if (options.getAd && inputs.adUrl?.trim()) {
      labels.push('getAd');
      // Accept a full ad ID or URL – extract just the ID if possible
      const adId = inputs.adUrl.trim();
      tasks.push(scrapeCreators('/v1/reddit/ad', { id: adId }));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No Reddit options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];
    let credits_remaining = null;

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
        if (s.value?.credits_remaining != null) {
          credits_remaining = s.value.credits_remaining;
        }
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors, credits_remaining });
  } catch (err) {
    console.error('Reddit search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── End Reddit ──────────────────────────────────────────────────────────────

// ─── YouTube Helpers ─────────────────────────────────────────────────────────

const YT_BASE = 'https://www.googleapis.com/youtube/v3';

function ytKey() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error('YOUTUBE_API_KEY not configured');
  return k;
}

async function ytFetch(path, params = {}) {
  const url = new URL(path, YT_BASE);
  url.searchParams.set('key', ytKey());
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  const json = await resp.json();
  if (!resp.ok) {
    const msg = json?.error?.message || `YouTube API error ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

// Resolve @handle or channel URL → channelId
async function resolveChannelId(input) {
  const trimmed = String(input || '').trim();

  // Already a channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) return trimmed;

  // Handle @username format
  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) {
    const data = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handleMatch[0], type: 'channel', maxResults: 1 });
    if (data.items?.[0]?.snippet?.channelId) return data.items[0].snippet.channelId;
    // Try channels endpoint with forHandle
    const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handleMatch[1] });
    if (chData.items?.[0]?.id) return chData.items[0].id;
    throw new Error(`Could not find channel for ${handleMatch[0]}`);
  }

  // URL with /channel/UC...
  try {
    const url = new URL(trimmed);
    const chMatch = url.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (chMatch) return chMatch[1];

    // /c/name or /@name
    const nameMatch = url.pathname.match(/\/(c|user|@)([\w.-]+)/);
    if (nameMatch) {
      const handle = nameMatch[2];
      const chData = await ytFetch(`${YT_BASE}/channels`, { part: 'id', forHandle: handle });
      if (chData.items?.[0]?.id) return chData.items[0].id;
      // fallback to search
      const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: handle, type: 'channel', maxResults: 1 });
      if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
      throw new Error(`Could not find channel for ${handle}`);
    }
  } catch (e) {
    if (e.message.includes('Could not find')) throw e;
    // not a URL, try as search term
  }

  // Fallback: search for it
  const sData = await ytFetch(`${YT_BASE}/search`, { part: 'snippet', q: trimmed, type: 'channel', maxResults: 1 });
  if (sData.items?.[0]?.snippet?.channelId) return sData.items[0].snippet.channelId;
  throw new Error(`Could not find channel for "${trimmed}"`);
}

async function fetchChannelDetails(channelId) {
  const data = await ytFetch(`${YT_BASE}/channels`, {
    part: 'snippet,statistics,brandingSettings,contentDetails',
    id: channelId,
  });
  if (!data.items?.length) throw new Error('Channel not found');
  const ch = data.items[0];
  return {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    customUrl: ch.snippet.customUrl,
    publishedAt: ch.snippet.publishedAt,
    thumbnails: ch.snippet.thumbnails,
    country: ch.snippet.country,
    subscribers: Number(ch.statistics.subscriberCount || 0),
    totalViews: Number(ch.statistics.viewCount || 0),
    videoCount: Number(ch.statistics.videoCount || 0),
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads,
    bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl || null,
    keywords: ch.brandingSettings?.channel?.keywords || '',
  };
}

async function fetchChannelVideos(channelId, maxResults = 10) {
  // First get channel details to find uploads playlist
  const ch = await fetchChannelDetails(channelId);
  if (!ch.uploadsPlaylistId) return [];

  const data = await ytFetch(`${YT_BASE}/playlistItems`, {
    part: 'snippet,contentDetails',
    playlistId: ch.uploadsPlaylistId,
    maxResults: Math.min(maxResults, 50),
  });
  const videoIds = (data.items || []).map(i => i.contentDetails.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Fetch full video details for metrics
  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description || "",
    publishedAt: v.snippet.publishedAt,
    channelTitle: v.snippet.channelTitle,
    thumbnails: v.snippet.thumbnails,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
  }));
}

async function fetchVideoDetails(videoId) {
  const data = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails,topicDetails',
    id: videoId,
  });
  if (!data.items?.length) throw new Error('Video not found');
  const v = data.items[0];
  return {
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    thumbnails: v.snippet.thumbnails,
    tags: v.snippet.tags || [],
    categoryId: v.snippet.categoryId,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
    topics: v.topicDetails?.topicCategories || [],
  };
}

async function searchYouTube(query, maxResults = 10) {
  const data = await ytFetch(`${YT_BASE}/search`, {
    part: 'snippet',
    q: query,
    maxResults: Math.min(maxResults, 50),
    type: 'video',
    order: 'relevance',
  });
  const videoIds = (data.items || []).map(i => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Enrich with stats
  const vData = await ytFetch(`${YT_BASE}/videos`, {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });
  return (vData.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description || "",
    publishedAt: v.snippet.publishedAt,
    channelTitle: v.snippet.channelTitle,
    channelId: v.snippet.channelId,
    thumbnails: v.snippet.thumbnails,
    duration: v.contentDetails?.duration,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
  }));
}

/**
 * POST /api/youtube/search
 * Body: { options: { channelDetails, channelVideos, videoDetails, videoComments, search },
 *         inputs: { channelUrl, videoUrl, searchQuery } }
 */
app.post('/api/youtube/search', async (req, res) => {
  try {
    const { options = {}, inputs = {}, limit: rawLimit } = req.body;
    const limit = Math.min(100, Math.max(10, Number(rawLimit) || 10));
    const tasks = [];
    const labels = [];

    // Channel-related
    if ((options.channelDetails || options.channelVideos) && inputs.channelUrl) {
      const channelIdPromise = resolveChannelId(inputs.channelUrl);

      if (options.channelDetails) {
        labels.push('channelDetails');
        tasks.push(channelIdPromise.then(id => fetchChannelDetails(id)));
      }
      if (options.channelVideos) {
        labels.push('channelVideos');
        tasks.push(channelIdPromise.then(id => fetchChannelVideos(id, limit)));
      }
    }

    // Video-related
    const videoId = inputs.videoUrl ? extractYouTubeVideoId(inputs.videoUrl) : null;

    if (options.videoDetails && videoId) {
      labels.push('videoDetails');
      tasks.push(fetchVideoDetails(videoId));
    }

    // Search
    if (options.search && inputs.searchQuery) {
      labels.push('search');
      tasks.push(searchYouTube(inputs.searchQuery.trim(), limit));
    }

    if (!tasks.length) {
      return res.status(400).json({ error: 'No YouTube options selected or inputs provided.' });
    }

    const settled = await Promise.allSettled(tasks);
    const results = {};
    const errors = [];

    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results[labels[i]] = s.value;
      } else {
        errors.push({ endpoint: labels[i], error: s.reason?.message || String(s.reason) });
      }
    });

    return res.json({ success: true, results, errors });
  } catch (err) {
    console.error('YouTube search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   WATCHLIST — CRUD + Auto-fetch
   ═══════════════════════════════════════════════════════════════════════ */

// ---------- helpers --------------------------------------------------
// (extractSubreddit already defined above)

// ─── GET /api/platforms ───────────────────────────────────────────────────────
// Returns { platforms: { x: id, youtube: id, ... } } so the client can map
// platform keys → numeric IDs without hardcoding them.
app.get('/api/platforms', async (req, res) => {
  try {
    const { data, error } = await supabase.from('platforms').select('id, name');
    if (error) throw error;

    const NAME_TO_KEY = {
      'x': 'x', 'twitter': 'x',
      'youtube': 'youtube',
      'reddit': 'reddit',
      'linkedin': 'linkedin',
      'instagram': 'instagram',
      'tiktok': 'tiktok',
    };

    const platforms = {};
    for (const row of data || []) {
      const key = NAME_TO_KEY[row.name.toLowerCase()] || row.name.toLowerCase();
      platforms[key] = row.id;
    }

    res.json({ platforms });
  } catch (err) {
    console.error('[GET /api/platforms] error:', err.message);
    // Fall back to reasonable defaults so the client keeps working
    res.json({ platforms: { x: 1, youtube: 8, linkedin: 2, instagram: 3, tiktok: 5, reddit: 6 } });
  }
});

// ─── GET /api/keywords ────────────────────────────────────────────────────────
//
// Bayesian Keyword Performance Index across ALL saved posts.
//
// Engagement formula (platform-aware, shares dropped as universal signal):
//   weightedScore = comments × 5 + likes × 2 + log10(views + 1) × 1
//
// Views are log-scaled to prevent YouTube/TikTok from drowning out text-heavy
// platforms (Reddit, LinkedIn) where views don't exist.
//
// Per-account normalisation is applied so a small creator that outperforms their
// own baseline by 3× ranks equally to a large creator doing the same.
//
// Bayesian shrinkage, consistency (CV), and trend boost are then combined into
// a final KPI score (0–100). Each keyword also carries a `platforms` array so
// the UI can show which social networks it appears on.
// ─────────────────────────────────────────────────────────────────────────────
const KW_STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'another', 'back', 'been', 'before', 'being',
  'between', 'both', 'came', 'come', 'could', 'each', 'even', 'every', 'from', 'give',
  'going', 'good', 'great', 'have', 'here', 'into', 'just', 'keep', 'know', 'like',
  'look', 'make', 'more', 'most', 'much', 'need', 'never', 'next', 'once', 'only',
  'open', 'other', 'over', 'same', 'should', 'since', 'some', 'such', 'than', 'that',
  'them', 'then', 'there', 'these', 'think', 'those', 'through', 'time', 'very', 'want',
  'well', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'your',
  'people', 'way', 'day', 'how', 'our', 'use', 'now', 'may', 'new', 'you', 'all', 'can',
  'get', 'got', 'its', 'let', 'him', 'her', 'his', 'she', 'they', 'was', 'are', 'has',
  'had', 'does', 'did', 'the', 'and', 'for', 'not', 'but', 'this', 'from', 'they',
  'been', 'out', 'too', 'any', 'one', 'via', 'just', 'also', 'really', 'like', 'still',
]);

function extractPostKeywords(content, extraJson, platformName) {
  // Build the text to mine: always include the main content.
  // Add extra signal text based on platform so titles/hashtags surface.
  const parts = [content || ''];

  if (platformName === 'youtube') {
    // YouTube stores title + description in extra_json
    if (extraJson?.title) parts.push(extraJson.title);
    if (extraJson?.description) parts.push(extraJson.description.slice(0, 400));
  }
  if (platformName === 'reddit') {
    // Reddit posts have title as content and optionally subreddit in extra_json
    if (extraJson?.subreddit) parts.push(`r/${extraJson.subreddit}`);
  }
  if (platformName === 'linkedin') {
    if (extraJson?.name) parts.push(extraJson.name);
  }

  const combined = parts.join(' ');
  if (!combined.trim()) return [];

  const keywords = new Set();

  // Hashtags → strip # and keep as keywords
  (combined.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g) || [])
    .forEach(tag => keywords.add(tag.slice(1).toLowerCase()));

  // Regular words: clean URL/mentions/punctuation, filter short + stopwords
  combined
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#\w+/g, '')
    .replace(/@\w+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 3 && !KW_STOPWORDS.has(w))
    .forEach(w => keywords.add(w));

  // Long-form content (YouTube/Reddit) gets a higher keyword cap
  const cap = combined.length > 500 ? 80 : 30;
  return Array.from(keywords).slice(0, cap);
}

// Platform name lookup keyed by numeric ID (populated once from DB at query time)
const PLATFORM_DISPLAY = {
  x: { label: 'X', color: 'dark' },
  twitter: { label: 'X', color: 'dark' },
  youtube: { label: 'YouTube', color: 'red' },
  linkedin: { label: 'LinkedIn', color: 'blue' },
  instagram: { label: 'Instagram', color: 'pink' },
  tiktok: { label: 'TikTok', color: 'violet' },
  reddit: { label: 'Reddit', color: 'orange' },
};

app.get('/api/keywords', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    // 1. Fetch all saved posts with metrics + platform name
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select(`
        id,
        content,
        published_at,
        platform_id,
        competitor_id,
        post_metrics ( likes, shares, comments, other_json, snapshot_at ),
        post_details_platform ( extra_json ),
        platforms ( name )
      `)
      .eq('user_id', userId)
      .order('published_at', { ascending: true })
      .limit(500);

    if (postsError) throw postsError;
    if (!posts?.length) {
      return res.json({ keywords: [], totalPosts: 0, debug: 'No saved posts found.' });
    }

    // 2. Compute per-post weighted engagement score
    //    Formula: comments×5 + likes×2 + log10(views+1)×1
    //    (shares are skipped — not universally available across platforms)
    const scoredPosts = posts.map((p, idx) => {
      // Use the most-recent snapshot if multiple metrics rows exist
      const snapshots = Array.isArray(p.post_metrics) ? p.post_metrics : [];
      const m = snapshots.sort(
        (a, b) => new Date(b.snapshot_at || 0) - new Date(a.snapshot_at || 0)
      )[0] || {};

      const likes = Number(m.likes || 0);
      const comments = Number(m.comments || 0);
      const views = Number(m.other_json?.views || 0);

      const weightedScore =
        comments * 5 +
        likes * 2 +
        Math.log10(views + 1) * 1;  // log-scaled views avoid YouTube dominating

      const platformName = (p.platforms?.name || '').toLowerCase();
      const extraJson = p.post_details_platform?.[0]?.extra_json || {};

      return {
        id: p.id,
        weightedScore,
        likes,
        comments,
        views,
        platform_id: p.platform_id,
        platform_name: platformName,
        competitor_id: p.competitor_id,
        keywords: extractPostKeywords(p.content, extraJson, platformName),
        chronoIdx: idx,
      };
    });

    const totalPosts = scoredPosts.length;

    // 3. Per-account normalisation — prevents one mega-account flooding rankings.
    //    Each post score becomes: post_score / that_account's_mean_score.
    //    Measures relative outperformance within each account.
    const accountScores = {};
    scoredPosts.forEach(p => {
      if (!accountScores[p.competitor_id]) accountScores[p.competitor_id] = [];
      accountScores[p.competitor_id].push(p.weightedScore);
    });
    const accountMeans = {};
    Object.entries(accountScores).forEach(([id, scores]) => {
      accountMeans[id] = scores.reduce((s, v) => s + v, 0) / scores.length;
    });
    scoredPosts.forEach(p => {
      const mean = accountMeans[p.competitor_id] || 1;
      p.normalizedScore = mean > 0 ? p.weightedScore / mean : 1.0;
    });

    // 4. Trend split: newest 33% = recent, older 67% = baseline
    const recentCutoff = Math.floor(totalPosts * 0.67);
    const K = 10; // Bayesian confidence constant (shrinks toward globalMean=1.0)

    // 5. Aggregate per-keyword stats
    const kwData = {};
    scoredPosts.forEach(post => {
      const isRecent = post.chronoIdx >= recentCutoff;
      post.keywords.forEach(kw => {
        if (!kwData[kw]) {
          kwData[kw] = {
            scores: [], recentScores: [], olderScores: [],
            rawScores: [],
            totalLikes: 0, totalComments: 0, totalViews: 0,
            platforms: new Set(),
          };
        }
        const d = kwData[kw];
        d.scores.push(post.normalizedScore);
        d.rawScores.push(post.weightedScore);
        d.totalLikes += post.likes;
        d.totalComments += post.comments;
        d.totalViews += post.views;
        if (post.platform_name) d.platforms.add(post.platform_name);
        if (isRecent) d.recentScores.push(post.normalizedScore);
        else d.olderScores.push(post.normalizedScore);
      });
    });

    // 6. Score every keyword with the Bayesian KPI formula (in normalised space)
    const globalMean = 1.0; // always 1.0 after per-account normalisation
    const results = [];

    Object.entries(kwData).forEach(([kw, d]) => {
      const n = d.scores.length;
      const avg = d.scores.reduce((s, v) => s + v, 0) / n;
      const rawAvg = d.rawScores.reduce((s, v) => s + v, 0) / n;

      // Bayesian shrinkage toward globalMean (1.0)
      const bayesianAvg = (n * avg + K * globalMean) / (n + K);

      // Consistency: penalise high variance (CV = coefficient of variation)
      const variance = d.scores.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);
      const cv = avg > 0 ? stdDev / avg : 0;
      const consistency = 1 / (1 + Math.min(cv, 1.0));

      // Trend: compare recent vs older normalised performance
      const recentAvg = d.recentScores.length
        ? d.recentScores.reduce((s, v) => s + v, 0) / d.recentScores.length : avg;
      const olderAvg = d.olderScores.length
        ? d.olderScores.reduce((s, v) => s + v, 0) / d.olderScores.length : avg;
      const trendRatio = olderAvg > 0 ? recentAvg / olderAvg : 1;
      const trendBoost = trendRatio > 1 ? Math.min(Math.sqrt(trendRatio), 1.5) : 1.0;
      const trendDir = trendRatio >= 1.4 ? 'rising' : trendRatio <= 0.7 ? 'falling' : 'stable';

      const rawScore = bayesianAvg * consistency * trendBoost;

      // Resolve platform set → display labels for the UI
      const platforms = Array.from(d.platforms)
        .map(p => PLATFORM_DISPLAY[p] || { label: p, color: 'gray' })
        .filter((v, i, a) => a.findIndex(x => x.label === v.label) === i); // dedupe by label

      results.push({
        term: kw,
        rawScore,
        kpi: 0,          // filled in after normalisation below
        avgEngagement: Math.round(rawAvg),
        normalizedAvg: Math.round(avg * 100) / 100,
        sampleSize: n,
        consistency: Math.round(consistency * 100),
        trend: Math.round(trendRatio * 100) / 100,
        trendDir,
        totalLikes: d.totalLikes,
        totalComments: d.totalComments,
        totalViews: d.totalViews,
        platforms,
      });
    });

    // 7. Normalise rawScore → KPI 0–100
    results.sort((a, b) => b.rawScore - a.rawScore);
    const maxRaw = results[0]?.rawScore || 1;
    results.forEach(r => {
      r.kpi = Math.round((r.rawScore / maxRaw) * 100);
      delete r.rawScore;
    });

    // Filter single-occurrence words when there's enough data to be meaningful
    const minPosts = totalPosts >= 10 ? 2 : 1;
    const keywords = results.filter(r => r.sampleSize >= minPosts).slice(0, 50);

    // Build debug summary
    const platformCounts = {};
    scoredPosts.forEach(p => {
      const k = p.platform_name || 'unknown';
      platformCounts[k] = (platformCounts[k] || 0) + 1;
    });
    const platformSummary = Object.entries(platformCounts)
      .map(([k, v]) => `${k}:${v}`).join(' | ');

    console.log(`[keywords] user=${userId} posts=${totalPosts} (${platformSummary}) → ${keywords.length} keywords`);

    return res.json({
      keywords,
      totalPosts,
      debug: `${totalPosts} posts · ${platformSummary} · ${keywords.length} keywords`,
    });

  } catch (err) {
    console.error('[keywords] failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- GET  /api/posts/saved-ids — return platform_post_ids the user already saved --------
app.get('/api/posts/saved-ids', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { data, error } = await supabase
      .from('posts')
      .select('platform_post_id')
      .eq('user_id', userId);

    if (error) throw error;
    const ids = (data || []).map((r) => r.platform_post_id);
    return res.json({ ids });
  } catch (err) {
    console.error('saved-ids error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- GET  /api/watchlist — list all items for the user --------
app.get('/api/watchlist', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { data, error } = await supabase
      .from('watchlist_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ items: data });
  } catch (err) {
    console.error('watchlist list error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/watchlist — create a new item ------------------
app.post('/api/watchlist', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { platform, scrape_type, target, label, config } = req.body;
    if (!platform || !scrape_type || !target) {
      return res.status(400).json({ error: 'platform, scrape_type and target are required.' });
    }

    const { data, error } = await supabase
      .from('watchlist_items')
      .insert({ user_id: userId, platform, scrape_type, target, label: label || target, config: config || {} })
      .select()
      .single();

    if (error) throw error;
    return res.json({ item: data });
  } catch (err) {
    console.error('watchlist create error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- PATCH /api/watchlist/:id — toggle enabled / update -------
app.patch('/api/watchlist/:id', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const updates = {};
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
    if (req.body.label !== undefined) updates.label = req.body.label;
    if (req.body.target !== undefined) updates.target = req.body.target;
    if (req.body.scrape_type !== undefined) updates.scrape_type = req.body.scrape_type;
    if (req.body.config !== undefined) updates.config = req.body.config;

    const { data, error } = await supabase
      .from('watchlist_items')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return res.json({ item: data });
  } catch (err) {
    console.error('watchlist update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- DELETE /api/watchlist/:id --------------------------------
app.delete('/api/watchlist/:id', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) throw error;
    return res.json({ deleted: true });
  } catch (err) {
    console.error('watchlist delete error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---------- POST /api/watchlist/run — execute all enabled items ------
// Can also accept ?item_id=<uuid> to run a single item.
app.post('/api/watchlist/run', async (req, res) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const singleId = req.query.item_id || req.body.item_id;
    let query = supabase
      .from('watchlist_items')
      .select('*')
      .eq('user_id', userId)
      .eq('enabled', true);
    if (singleId) query = query.eq('id', singleId);

    const { data: items, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;
    if (!items?.length) return res.json({ results: [], message: 'Nothing to run.' });

    const results = [];

    for (const item of items) {
      try {
        const data = await executeWatchlistItem(item);
        results.push({ id: item.id, platform: item.platform, scrape_type: item.scrape_type, label: item.label, success: true, data });

        // stamp last_run_at + persist last_result (replaces previous result)
        const { error: updateErr } = await supabase.from('watchlist_items').update({
          last_run_at: new Date().toISOString(),
          last_result: { success: true, data, scrape_type: item.scrape_type },
        }).eq('id', item.id);
        if (updateErr) console.error('Failed to persist watchlist result:', updateErr.message);
      } catch (err) {
        results.push({ id: item.id, platform: item.platform, scrape_type: item.scrape_type, label: item.label, success: false, error: err.message });
        // persist error too so user sees it across sessions
        const { error: updateErr } = await supabase.from('watchlist_items').update({
          last_result: { success: false, error: err.message, scrape_type: item.scrape_type },
        }).eq('id', item.id);
        if (updateErr) console.error('Failed to persist watchlist error:', updateErr.message);
      }
    }

    return res.json({ results });
  } catch (err) {
    console.error('watchlist run error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Trim result arrays to respect the user's max_results setting (saves API credits).
 */
function trimToLimit(data, limit) {
  if (!data || !limit) return data;
  if (Array.isArray(data)) return data.slice(0, limit);
  if (typeof data !== 'object') return data;
  const arrayKeys = ['posts', 'tweets', 'items', 'itemList', 'search_item_list', 'children', 'comments', 'reels', 'videos', 'users'];
  for (const key of arrayKeys) {
    if (Array.isArray(data[key]) && data[key].length > limit) {
      return { ...data, [key]: data[key].slice(0, limit) };
    }
  }
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    for (const key of arrayKeys) {
      if (Array.isArray(data.data[key]) && data.data[key].length > limit) {
        return { ...data, data: { ...data.data, [key]: data.data[key].slice(0, limit) } };
      }
    }
  }
  return data;
}

/**
 * Core dispatcher — given a watchlist item, call the right API and return raw data.
 * Post-processes results to trim to the configured max_results.
 */
async function executeWatchlistItem(item) {
  const raw = await _executeWatchlistScrape(item);
  const limit = item.config?.max_results;
  return limit ? trimToLimit(raw, limit) : raw;
}

async function _executeWatchlistScrape(item) {
  const { platform, scrape_type, target, config = {} } = item;

  switch (platform) {
    /* ── X / Twitter ─────────────────────────────────────── */
    case 'x': {
      const username = target.replace(/^@/, '').trim();
      const user = await getUserIdByUsername(username);
      switch (scrape_type) {
        case 'user_posts':
          return fetchPostsByUserId(user.id, config.max_results || 10);
        case 'user_mentions':
          return fetchUserMentions(user.id, config.max_results || 10);
        case 'followers':
          return fetchFollowers(user.id, config.max_results || 20);
        case 'following':
          return fetchFollowing(user.id, config.max_results || 20);
        case 'search':
          return searchRecentTweets(target, config.max_results || 10);
        default:
          throw new Error(`Unknown X scrape_type: ${scrape_type}`);
      }
    }

    /* ── YouTube ─────────────────────────────────────────── */
    case 'youtube': {
      switch (scrape_type) {
        case 'channel_videos': {
          const channelId = await resolveChannelId(target);
          return fetchChannelVideos(channelId, config.max_results || 10);
        }
        case 'channel_details': {
          const channelId = await resolveChannelId(target);
          return fetchChannelDetails(channelId);
        }
        case 'video_details': {
          const vid = extractYouTubeVideoId(target);
          if (!vid) throw new Error('Invalid YouTube video URL or ID');
          return fetchVideoDetails(vid);
        }
        case 'search':
          return searchYouTube(target, config.max_results || 10);
        default:
          throw new Error(`Unknown YouTube scrape_type: ${scrape_type}`);
      }
    }

    /* ── Reddit ──────────────────────────────────────────── */
    case 'reddit': {
      const limit = config.max_results || 25;
      switch (scrape_type) {
        case 'subreddit_posts': {
          const sub = target.replace(/^r\//, '').trim();
          return scrapeCreatorsPaginated('/v1/reddit/subreddit', { subreddit: sub, trim: true }, limit);
        }
        case 'subreddit_details': {
          const sub = target.replace(/^r\//, '').trim();
          return scrapeCreators('/v1/reddit/subreddit/details', { subreddit: sub, trim: true });
        }
        case 'search':
          return scrapeCreatorsPaginated('/v1/reddit/search', { query: target, trim: true }, limit);
        default:
          throw new Error(`Unknown Reddit scrape_type: ${scrape_type}`);
      }
    }

    /* ── LinkedIn ────────────────────────────────────────── */
    case 'linkedin': {
      switch (scrape_type) {
        case 'profile':
          return scrapeCreators('/v1/linkedin/profile', { url: target });
        case 'company':
          return scrapeCreators('/v1/linkedin/company', { url: target });
        case 'post':
          return scrapeCreators('/v1/linkedin/post', { url: target });
        default:
          throw new Error(`Unknown LinkedIn scrape_type: ${scrape_type}`);
      }
    }

    /* ── Instagram ───────────────────────────────────────── */
    case 'instagram': {
      const handle = target.replace(/^@/, '').trim();
      switch (scrape_type) {
        case 'profile':
          return scrapeCreators('/v1/instagram/profile', { handle, trim: true });
        case 'user_posts':
          return scrapeCreatorsPaginated('/v2/instagram/user/posts', { handle, trim: true }, config.max_results || 12);
        case 'user_reels':
          return scrapeCreatorsPaginated('/v1/instagram/user/reels', { handle, trim: true }, config.max_results || 12);
        default:
          throw new Error(`Unknown Instagram scrape_type: ${scrape_type}`);
      }
    }

    /* ── TikTok ──────────────────────────────────────────── */
    case 'tiktok': {
      const handle = target.replace(/^@/, '').trim();
      const limit = config.max_results || 20;
      switch (scrape_type) {
        case 'profile':
          return scrapeCreators('/v1/tiktok/profile', { handle, trim: true });
        case 'profile_videos':
          return scrapeCreators('/v1/tiktok/profile', { handle, trim: true });
        case 'search':
          return scrapeCreatorsPaginated('/v1/tiktok/search/keyword', { query: target, trim: true }, limit);
        default:
          throw new Error(`Unknown TikTok scrape_type: ${scrape_type}`);
      }
    }

    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

function normalizeLookupItems(source, raw) {
  const items = [];

  if (source === 'google') {
    for (const r of raw?.results || []) {
      items.push({
        source,
        id: r.url,
        title: r.title || r.url,
        text: r.description || '',
        url: r.url,
      });
    }
    return items;
  }

  if (source === 'reddit') {
    const subreddit = raw?.data || raw;
    if (!raw?.posts && (subreddit?.display_name || subreddit?.name)) {
      items.push({
        source,
        id: subreddit.id || subreddit.name || subreddit.display_name,
        title: `r/${subreddit.display_name || subreddit.name}`,
        text: subreddit.public_description || subreddit.description || '',
        url: `https://reddit.com/r/${subreddit.display_name || subreddit.name}`,
      });
      return items;
    }

    for (const p of raw?.posts || []) {
      items.push({
        source,
        id: p.id || p.name,
        title: p.title || 'Reddit post',
        text: p.selftext || '',
        url: p.permalink ? `https://reddit.com${p.permalink}` : p.url,
        author: p.author,
        metrics: {
          score: p.score ?? p.ups ?? 0,
          comments: p.num_comments ?? 0,
        },
      });
    }
    return items;
  }

  if (source === 'youtube') {
    const all = [
      ...(raw?.videos || []),
      ...(raw?.shorts || []),
      ...(raw?.channels || []),
      ...(raw?.playlists || []),
    ];
    for (const v of all) {
      items.push({
        source,
        id: v.id || v.url,
        title: v.title || v.name || 'YouTube result',
        text: v.description || '',
        url: v.url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null),
        author: v.channel?.title || v.channelTitle || null,
      });
    }
    return items;
  }

  if (source === 'tiktok') {
    const profile = raw?.data || raw;
    if (!raw?.search_item_list && (profile?.uniqueId || profile?.username || profile?.nickname)) {
      const handle = profile.uniqueId || profile.username;
      items.push({
        source,
        id: profile.id || handle || profile.nickname,
        title: profile.nickname || handle || 'TikTok profile',
        text: profile.signature || profile.bio || '',
        url: handle ? `https://www.tiktok.com/@${handle}` : null,
        author: handle || null,
      });
      return items;
    }

    for (const row of raw?.search_item_list || []) {
      const v = row?.data || row;
      items.push({
        source,
        id: v.aweme_id || v.id,
        title: (v.desc || 'TikTok video').slice(0, 120),
        text: v.desc || '',
        url: v.url || (v.aweme_id ? `https://www.tiktok.com/@${v.author?.uniqueId || 'user'}/video/${v.aweme_id}` : null),
        author: v.author?.uniqueId || v.author?.nickname || null,
      });
    }
    return items;
  }

  if (source === 'instagram') {
    const d = raw?.data || raw;
    if (!raw?.reels && (d?.username || d?.full_name || d?.fullName)) {
      items.push({
        source,
        id: d.id || d.username,
        title: d.full_name || d.fullName || d.username || 'Instagram profile',
        text: d.biography || d.bio || '',
        url: d.username ? `https://www.instagram.com/${d.username}/` : null,
        author: d.username || null,
      });
      return items;
    }

    for (const r of raw?.reels || []) {
      items.push({
        source,
        id: r.id || r.shortcode || r.url,
        title: r.caption ? r.caption.slice(0, 120) : 'Instagram reel',
        text: r.caption || '',
        url: r.url || (r.shortcode ? `https://www.instagram.com/reel/${r.shortcode}/` : null),
        author: r.owner?.username || null,
      });
    }
    return items;
  }

  if (source === 'linkedin') {
    items.push({
      source,
      id: raw?.url || raw?.name || 'linkedin',
      title: raw?.name || raw?.headline || 'LinkedIn',
      text: raw?.about || raw?.description || '',
      url: raw?.url || null,
    });
    return items;
  }

  return items;
}

app.post('/api/lookup/search', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    const limit = Math.min(150, Math.max(10, Number(req.body?.limit) || 60));
    const maxCredits = Math.min(6, Math.max(1, Number(req.body?.maxCredits) || 1));

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const isUrl = /^https?:\/\//i.test(query);
    const accountMatch = query.match(/^@([A-Za-z0-9._]{2,})(?:\s+(instagram|tiktok|reddit))?$/i);
    const isAccountHandle = Boolean(accountMatch);
    const queue = [];
    let intent = isUrl ? 'url' : isAccountHandle ? 'account' : 'phrase';
    let routeUsed = null;

    if (isUrl) {
      if (/linkedin\.com\//i.test(query)) {
        const endpoint = /\/company\//i.test(query)
          ? '/v1/linkedin/company'
          : (/\/pulse\//i.test(query) || /\/posts\//i.test(query))
            ? '/v1/linkedin/post'
            : '/v1/linkedin/profile';

        queue.push({ source: 'linkedin', run: () => scrapeCreators(endpoint, { url: query }) });
        routeUsed = endpoint;
      } else if (/instagram\.com\//i.test(query)) {
        const isPostUrl = /\/p\/|\/reel\//i.test(query);
        if (isPostUrl) {
          queue.push({ source: 'instagram', run: () => scrapeCreators('/v1/instagram/post', { url: query, trim: true }) });
          routeUsed = '/v1/instagram/post';
        } else {
          const handle = query.split('/').filter(Boolean).pop()?.replace(/^@/, '') || '';
          queue.push({ source: 'instagram', run: () => scrapeCreators('/v1/instagram/profile', { handle, trim: true }) });
          routeUsed = '/v1/instagram/profile';
        }
      } else if (/tiktok\.com\//i.test(query)) {
        const handle = query.match(/@([^/]+)/)?.[1];
        if (handle) {
          queue.push({ source: 'tiktok', run: () => scrapeCreators('/v1/tiktok/profile', { handle, trim: true }) });
          routeUsed = '/v1/tiktok/profile';
        } else {
          queue.push({ source: 'google', run: () => scrapeCreators('/v1/google/search', { query }) });
          routeUsed = '/v1/google/search';
        }
      } else if (/reddit\.com\//i.test(query)) {
        const subMatch = query.match(/\/r\/([^/]+)/i);
        if (subMatch?.[1]) {
          queue.push({ source: 'reddit', run: () => scrapeCreators('/v1/reddit/subreddit/details', { subreddit: subMatch[1], trim: true }) });
          routeUsed = '/v1/reddit/subreddit/details';
        } else {
          queue.push({ source: 'google', run: () => scrapeCreators('/v1/google/search', { query }) });
          routeUsed = '/v1/google/search';
        }
      } else if (/youtube\.com\/|youtu\.be\//i.test(query)) {
        queue.push({ source: 'youtube', run: () => searchYouTube(query, Math.min(15, limit)) });
        routeUsed = 'youtube-api-search';
      } else {
        queue.push({ source: 'google', run: () => scrapeCreators('/v1/google/search', { query }) });
        routeUsed = '/v1/google/search';
      }
    } else if (isAccountHandle) {
      const handle = accountMatch[1];
      const hint = (accountMatch[2] || 'instagram').toLowerCase();

      if (hint === 'tiktok') {
        queue.push({ source: 'tiktok', run: () => scrapeCreators('/v1/tiktok/profile', { handle, trim: true }) });
        routeUsed = '/v1/tiktok/profile';
      } else if (hint === 'reddit') {
        queue.push({ source: 'reddit', run: () => scrapeCreators('/v1/reddit/subreddit/details', { subreddit: handle, trim: true }) });
        routeUsed = '/v1/reddit/subreddit/details';
      } else {
        queue.push({ source: 'instagram', run: () => scrapeCreators('/v1/instagram/profile', { handle, trim: true }) });
        routeUsed = '/v1/instagram/profile';
      }
    } else {
      // Phrase / keyword mode: single Google-style endpoint for low credit usage.
      queue.push({ source: 'google', run: () => scrapeCreators('/v1/google/search', { query }) });
      routeUsed = '/v1/google/search';
    }

    const results = [];
    const bySource = {};
    const errors = [];
    let calls = 0;
    let credits_remaining = null;

    for (const task of queue) {
      if (calls >= maxCredits) break;
      try {
        const raw = await task.run();
        calls += 1;
        if (raw?.credits_remaining != null) credits_remaining = raw.credits_remaining;

        const normalized = normalizeLookupItems(task.source, raw);
        bySource[task.source] = normalized;
        results.push(...normalized);

        if (results.length >= limit) break;
      } catch (err) {
        errors.push({ source: task.source, error: err?.message || String(err) });
      }
    }

    return res.json({
      success: true,
      query,
      intent,
      routeUsed,
      maxCredits,
      callsUsed: calls,
      total: Math.min(results.length, limit),
      results: results.slice(0, limit),
      bySource,
      errors,
      credits_remaining,
    });
  } catch (err) {
    console.error('Lookup search error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   Cron endpoint — runs ALL users' enabled watchlist items.
   Protected by CRON_SECRET env var, called by Google Cloud Scheduler.
   ═══════════════════════════════════════════════════════════════════════ */
app.post('/api/cron/watchlist', async (req, res) => {
  // Verify secret
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('[CRON] Starting watchlist run for all users...');
  const startTime = Date.now();

  try {
    // Fetch ALL enabled watchlist items across all users
    const { data: items, error: fetchErr } = await supabase
      .from('watchlist_items')
      .select('*')
      .eq('enabled', true);

    if (fetchErr) throw fetchErr;
    if (!items?.length) {
      console.log('[CRON] No enabled watchlist items found.');
      return res.json({ message: 'Nothing to run.', total: 0 });
    }

    console.log(`[CRON] Found ${items.length} enabled items across all users.`);

    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        const data = await executeWatchlistItem(item);

        await supabase.from('watchlist_items').update({
          last_run_at: new Date().toISOString(),
          last_result: { success: true, data, scrape_type: item.scrape_type },
        }).eq('id', item.id);

        successCount++;
        console.log(`[CRON] ✓ ${item.platform}/${item.scrape_type} for user ${item.user_id} (${item.label})`);
      } catch (err) {
        errorCount++;
        console.error(`[CRON] ✗ ${item.platform}/${item.scrape_type} for user ${item.user_id} (${item.label}):`, err.message);

        await supabase.from('watchlist_items').update({
          last_result: { success: false, error: err.message, scrape_type: item.scrape_type },
        }).eq('id', item.id);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CRON] Done in ${elapsed}s — ${successCount} succeeded, ${errorCount} failed.`);

    return res.json({
      message: 'Cron complete',
      total: items.length,
      success: successCount,
      errors: errorCount,
      elapsed_seconds: Number(elapsed),
    });
  } catch (err) {
    console.error('[CRON] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});