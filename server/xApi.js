import "dotenv/config";
import axios from "axios";

function loadBearerTokens() {
  const tokens = [];

  if (process.env.X_BEARER_TOKENS) {
    tokens.push(
      ...process.env.X_BEARER_TOKENS.split(",").map((s) => s.trim()).filter(Boolean)
    );
  }

  if (process.env.X_BEARER_TOKEN) tokens.push(process.env.X_BEARER_TOKEN);

  // Support individually numbered vars: X_BEARER_TOKEN_1 ... X_BEARER_TOKEN_10
  for (let i = 1; i <= 10; i++) {
    const k = `X_BEARER_TOKEN${i}`;
    if (process.env[k]) tokens.push(process.env[k]);
  }

  // dedupe and filter
  return Array.from(new Set(tokens.filter(Boolean)));
}

// Note: Despite rebranding, the official v2 API host remains api.twitter.com
const xClient = axios.create({
  baseURL: "https://api.twitter.com/2",
  headers: {
    "User-Agent": "Chibitek-App",
    Accept: "application/json",
  },
  timeout: 15000,
});

async function requestWithTokenFallback(requestConfig) {
  const tokens = loadBearerTokens();
  if (!tokens.length) {
    throw new Error("No X bearer tokens found in environment (X_BEARER_TOKENS, X_BEARER_TOKEN or X_BEARER_TOKEN_1..).");
  }
  const attempts = [];

  function mask(tok) {
    if (!tok) return '(<missing>)';
    if (tok.length <= 8) return tok.replace(/./g, '*');
    return `${tok.slice(0, 4)}...${tok.slice(-4)}`;
  }

  let lastError = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const attempt = { index: i, token: mask(token), url: requestConfig.url };
    try {
      const res = await xClient.request({
        ...requestConfig,
        headers: {
          ...(requestConfig.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      attempt.success = true;
      attempt.status = res.status;
      attempts.push(attempt);
      return res;
    } catch (err) {
      lastError = err;
      attempt.success = false;
      attempt.errorCode = err.code || null;
      if (err.response) {
        attempt.status = err.response.status;
        try {
          attempt.body = JSON.stringify(err.response.data);
        } catch (e) {
          attempt.body = String(err.response.data);
        }
      } else {
        attempt.message = err.message;
      }
      attempts.push(attempt);
      // continue to next token
    }
  }

  // All tokens failed — throw an aggregated error with per-token diagnostics (tokens masked)
  const summary = attempts.map(a => ({ index: a.index, token: a.token, success: a.success, status: a.status || null, errorCode: a.errorCode || null, body: a.body || a.message || null }));
  const agg = new Error(`All bearer tokens failed for request ${requestConfig.method || 'GET'} ${requestConfig.url}. Attempts: ${JSON.stringify(summary, null, 2)}`);
  // attach attempts array for programmatic access if caller wants it
  agg.attempts = summary;
  agg.lastError = lastError;
  throw agg;
}

export async function getUserIdByUsername(username) {
  try {
    const res = await requestWithTokenFallback({
      method: "get",
      url: `/users/by/username/${encodeURIComponent(username)}`,
    });

    if (!res.data?.data?.id) {
      throw new Error(`No user found for username ${username}`);
    }

    return res.data.data.id;
  } catch (err) {
    if (err.response) {
      throw new Error(
        `X API user lookup failed: ${err.response.status} ${JSON.stringify(
          err.response.data
        )}`
      );
    }
    // Improve network error visibility
    if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      throw new Error(`Network error contacting X API (${err.code}). Check internet connectivity, DNS, or firewall settings.`);
    }
    throw err;
  }
}

export async function fetchPostsByUserId(userId, maxResults = 5) {
  const clamped = Math.min(100, Math.max(5, maxResults));

  try {
    const res = await requestWithTokenFallback({
      method: "get",
      url: `/users/${userId}/tweets`,
      params: { max_results: clamped },
    });

    return res.data?.data || [];
  } catch (err) {
    if (err.response) {
      throw new Error(
        `X API tweet fetch failed: ${err.response.status} ${JSON.stringify(
          err.response.data
        )}`
      );
    }
    if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      throw new Error(`Network error contacting X API (${err.code}). Check internet connectivity, DNS, or firewall settings.`);
    }
    throw err;
  }
}
