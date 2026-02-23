import "dotenv/config";
import axios from "axios";

function loadBearerTokens() {
  const tokens = [];
  if (process.env.X_BEARER_TOKENS) {
    tokens.push(...process.env.X_BEARER_TOKENS.split(",").map((s) => s.trim()).filter(Boolean));
  }
  if (process.env.X_BEARER_TOKEN) tokens.push(process.env.X_BEARER_TOKEN);
  for (let i = 1; i <= 10; i++) {
    const k = `X_BEARER_TOKEN${i}`;
    if (process.env[k]) tokens.push(process.env[k]);
  }
  return Array.from(new Set(tokens.filter(Boolean)));
}

const xClient = axios.create({
  baseURL: "https://api.twitter.com/2",
  headers: { "User-Agent": "Chibitek-App", Accept: "application/json" },
  timeout: 15000,
});

async function requestWithTokenFallback(requestConfig) {
  const tokens = loadBearerTokens();
  if (!tokens.length) {
    throw new Error("No X bearer tokens found in environment.");
  }
  const attempts = [];
  let lastError = null;

  function mask(tok) {
    if (!tok) return "(<missing>)";
    if (tok.length <= 8) return tok.replace(/./g, "*");
    return `${tok.slice(0, 4)}...${tok.slice(-4)}`;
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const attempt = { index: i, token: mask(token), url: requestConfig.url };
    try {
      const res = await xClient.request({
        ...requestConfig,
        headers: { ...(requestConfig.headers || {}), Authorization: `Bearer ${token}` },
      });
      attempt.success = true;
      attempts.push(attempt);
      return res;
    } catch (err) {
      lastError = err;
      attempt.success = false;
      attempt.errorCode = err.code || null;
      if (err.response) {
        attempt.status = err.response.status;
        attempt.body = JSON.stringify(err.response.data);
      } else {
        attempt.message = err.message;
      }
      attempts.push(attempt);
    }
  }

  const summary = attempts.map((a) => ({
    index: a.index, token: a.token, success: a.success,
    status: a.status || null, errorCode: a.errorCode || null, body: a.body || a.message || null,
  }));
  const agg = new Error(`All bearer tokens failed. Attempts: ${JSON.stringify(summary, null, 2)}`);
  agg.attempts = summary;
  agg.lastError = lastError;
  throw agg;
}

// Returns { id, username, followerCount }
export async function getUserByUsername(username) {
  try {
    const res = await requestWithTokenFallback({
      method: "get",
      url: `/users/by/username/${encodeURIComponent(username)}`,
      params: {
        "user.fields": "public_metrics",
      },
    });
    const user = res.data?.data;
    if (!user?.id) throw new Error(`No user found for username ${username}`);
    return {
      id: user.id,
      username: user.username || username,
      name: user.name || username,
      followerCount: user.public_metrics?.followers_count || 0,
    };
  } catch (err) {
    if (err.response) {
      throw new Error(`X API user lookup failed: ${err.response.status} ${JSON.stringify(err.response.data)}`);
    }
    if (["ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(err.code)) {
      throw new Error(`Network error contacting X API (${err.code}).`);
    }
    throw err;
  }
}

// Keep old function for backwards compat
export async function getUserIdByUsername(username) {
  const user = await getUserByUsername(username);
  return user.id;
}

// Fetch up to maxResults posts for a user, returns array of tweet objects
export async function fetchPostsByUserId(userId, maxResults = 10) {
  const clampedMax = Math.min(Math.max(maxResults, 5), 100); // X API requires min 5
  const res = await requestWithTokenFallback({
    method: "get",
    url: `/users/${userId}/tweets`,
    params: {
      max_results: clampedMax,
      exclude: "replies,retweets",
      "tweet.fields": "created_at,public_metrics,lang",
    },
  });
  return res.data?.data || [];
}