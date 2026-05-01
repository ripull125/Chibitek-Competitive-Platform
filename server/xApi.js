import "dotenv/config";
import axios from "axios";
import { scrapeCreators } from "./utils/scrapeCreators.js";

const X_API_BASE_URLS = [
  process.env.X_API_BASE_URL || "https://api.x.com/2",
  "https://api.twitter.com/2",
].filter((value, index, arr) => value && arr.indexOf(value) === index);

const USER_FIELDS = [
  "id",
  "name",
  "username",
  "created_at",
  "description",
  "location",
  "profile_image_url",
  "public_metrics",
  "verified",
  "url",
  "pinned_tweet_id",
].join(",");

// Do not include impression_count as a top-level tweet field. It comes back
// inside public_metrics when your X access tier supports it.
const TWEET_FIELDS = [
  "id",
  "text",
  "author_id",
  "created_at",
  "public_metrics",
  "lang",
  "conversation_id",
  "referenced_tweets",
  "entities",
].join(",");

const RESERVED_PROFILE_PATHS = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "i",
  "search",
  "settings",
  "compose",
  "intent",
]);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function loadBearerTokens() {
  const tokens = [];

  if (process.env.X_BEARER_TOKENS) {
    tokens.push(...process.env.X_BEARER_TOKENS.split(",").map((s) => s.trim()).filter(Boolean));
  }

  if (process.env.X_BEARER_TOKEN) tokens.push(process.env.X_BEARER_TOKEN.trim());

  // Support both common styles:
  // X_BEARER_TOKEN1 ... X_BEARER_TOKEN10
  // X_BEARER_TOKEN_1 ... X_BEARER_TOKEN_10
  for (let i = 1; i <= 10; i++) {
    const compact = process.env[`X_BEARER_TOKEN${i}`];
    const underscored = process.env[`X_BEARER_TOKEN_${i}`];
    if (compact) tokens.push(compact.trim());
    if (underscored) tokens.push(underscored.trim());
  }

  return Array.from(new Set(tokens.filter(Boolean)));
}

function maskToken(token) {
  if (!token) return "<missing>";
  if (token.length <= 10) return "***";
  return `${token.slice(0, 5)}...${token.slice(-5)}`;
}

function normalizeAxiosError(err, context = {}) {
  const status = err?.response?.status ?? null;
  const body = err?.response?.data ?? null;
  const message = body?.detail || body?.title || body?.error || body?.message || err?.message || "X API request failed";
  const out = new Error(`${message}${status ? ` (${status})` : ""}`);
  out.status = status;
  out.body = body;
  out.code = err?.code;
  out.context = context;
  return out;
}

function shouldTryNextToken(status) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

function shouldFallbackToScrapeCreators(err) {
  return (
    err?.code === "NO_X_TOKENS" ||
    err?.attempts?.length > 0 ||
    err?.status === 401 ||
    err?.status === 403 ||
    err?.status === 429 ||
    err?.status >= 500 ||
    ["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(err?.code)
  );
}

async function xRequest(config) {
  const tokens = loadBearerTokens();
  if (!tokens.length) {
    const err = new Error("No X bearer token configured. Set X_BEARER_TOKEN or X_BEARER_TOKENS.");
    err.code = "NO_X_TOKENS";
    throw err;
  }

  const attempts = [];
  let lastError = null;

  for (const baseURL of X_API_BASE_URLS) {
    const client = axios.create({
      baseURL,
      timeout: 20_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Chibitek-Competitive-Platform",
      },
    });

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        const response = await client.request({
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        });
        return response.data;
      } catch (rawErr) {
        const err = normalizeAxiosError(rawErr, { baseURL, url: config.url });
        lastError = err;
        attempts.push({
          baseURL,
          url: config.url,
          token: maskToken(token),
          status: err.status,
          code: err.code,
          body: err.body,
          message: err.message,
        });

        if (!shouldTryNextToken(err.status)) {
          err.attempts = attempts;
          throw err;
        }
      }
    }
  }

  const err = new Error(`All X bearer token attempts failed for ${config.method || "GET"} ${config.url}.`);
  err.attempts = attempts;
  err.lastError = lastError;
  err.status = lastError?.status ?? null;
  err.code = lastError?.code ?? null;
  throw err;
}

export function parseXInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "empty", raw };

  const atHandle = raw.match(/^@([A-Za-z0-9_]{1,15})$/);
  if (atHandle) return { type: "account", raw, handle: atHandle[1], source: "handle" };

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^mobile\./, "");
    if (host === "x.com" || host === "twitter.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const statusIndex = parts.findIndex((p) => p.toLowerCase() === "status");

      if (statusIndex >= 0 && /^\d+$/.test(parts[statusIndex + 1] || "")) {
        return {
          type: "post",
          raw,
          tweetId: parts[statusIndex + 1],
          handle: parts[statusIndex - 1] && !RESERVED_PROFILE_PATHS.has(parts[statusIndex - 1].toLowerCase())
            ? parts[statusIndex - 1]
            : null,
          url: raw,
        };
      }

      const possibleHandle = parts[0]?.replace(/^@/, "");
      if (possibleHandle && /^[A-Za-z0-9_]{1,15}$/.test(possibleHandle) && !RESERVED_PROFILE_PATHS.has(possibleHandle.toLowerCase())) {
        return { type: "account", raw, handle: possibleHandle, source: "profile_url", url: raw };
      }
    }
  } catch {
    // Not a URL; treat it as a keyword query below.
  }

  // Important: a bare single word is still a keyword search. Per the product
  // behavior, only @handle or profile URLs trigger account lookup.
  return { type: "keyword", raw, query: raw };
}

function extractTweetId(input) {
  const parsed = parseXInput(input);
  if (parsed.type === "post") return parsed.tweetId;
  const direct = String(input || "").trim().match(/^\d{5,}$/);
  return direct ? direct[0] : null;
}

function userUrl(username) {
  return username ? `https://x.com/${username}` : null;
}

function tweetUrl(tweet, fallbackHandle = null) {
  if (!tweet?.id) return null;
  const handle = tweet._authorUsername || tweet.author?.username || fallbackHandle;
  return handle ? `https://x.com/${handle}/status/${tweet.id}` : `https://x.com/i/web/status/${tweet.id}`;
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: String(user.id || ""),
    name: user.name || user.username || "",
    username: user.username || "",
    description: user.description || "",
    location: user.location || "",
    profile_image_url: user.profile_image_url || null,
    created_at: user.created_at || null,
    verified: Boolean(user.verified),
    url: user.url || userUrl(user.username),
    public_metrics: {
      followers_count: user.public_metrics?.followers_count ?? null,
      following_count: user.public_metrics?.following_count ?? null,
      tweet_count: user.public_metrics?.tweet_count ?? null,
      listed_count: user.public_metrics?.listed_count ?? null,
    },
    metrics_unavailable: user.metrics_unavailable === true,
    source: user.source || "x_api",
  };
}

function normalizeTweet(tweet, users = [], fallbackHandle = null) {
  if (!tweet) return null;
  const author = users.find((u) => String(u.id) === String(tweet.author_id)) || tweet.author || null;
  const authorUsername = author?.username || tweet._authorUsername || fallbackHandle || "";
  const normalized = {
    ...tweet,
    id: String(tweet.id || tweet.rest_id || tweet.legacy?.id_str || ""),
    text: tweet.text || tweet.full_text || tweet.legacy?.full_text || "",
    created_at: tweet.created_at || tweet.legacy?.created_at || null,
    author_id: tweet.author_id || tweet.legacy?.user_id_str || author?.id || null,
    public_metrics: {
      retweet_count: tweet.public_metrics?.retweet_count ?? tweet.legacy?.retweet_count ?? 0,
      reply_count: tweet.public_metrics?.reply_count ?? tweet.legacy?.reply_count ?? 0,
      like_count: tweet.public_metrics?.like_count ?? tweet.legacy?.favorite_count ?? 0,
      quote_count: tweet.public_metrics?.quote_count ?? tweet.legacy?.quote_count ?? 0,
      bookmark_count: tweet.public_metrics?.bookmark_count ?? tweet.legacy?.bookmark_count ?? 0,
      impression_count: tweet.public_metrics?.impression_count ?? tweet.legacy?.impression_count ?? 0,
    },
    author: author ? normalizeUser(author) : null,
    _authorUsername: authorUsername,
    metrics_unavailable: tweet.metrics_unavailable === true,
    source: tweet.source || "x_api",
  };
  normalized.url = tweet.url || tweetUrl(normalized, authorUsername);
  return normalized;
}

function tweetTime(tweet) {
  if (tweet?.created_at) {
    const time = new Date(tweet.created_at).getTime();
    if (Number.isFinite(time)) return time;
  }
  const id = BigInt(String(tweet?.id || "0").replace(/\D/g, "") || "0");
  return Number(id > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : id);
}

function sortTweetsNewestFirst(tweets = []) {
  return [...tweets].sort((a, b) => tweetTime(b) - tweetTime(a));
}

function recentGoogleDate(daysBack = 14) {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function mapScrapeCreatorsProfile(resp) {
  const profile = resp?.data || resp?.user || resp;
  const legacy = profile?.legacy || {};
  const username = legacy.screen_name || profile?.screen_name || profile?.username || profile?.handle || "";
  const name = legacy.name || profile?.name || username;
  const expandedUrl = legacy?.entities?.url?.urls?.[0]?.expanded_url || null;

  return normalizeUser({
    id: profile?.rest_id || legacy.id_str || username,
    username,
    name,
    description: legacy.description || profile?.description || "",
    location: legacy.location || profile?.location || "",
    profile_image_url: legacy.profile_image_url_https || profile?.profile_image_url || null,
    created_at: legacy.created_at || profile?.created_at || null,
    verified: legacy.verified || profile?.is_blue_verified || profile?.verified || false,
    url: expandedUrl || userUrl(username),
    public_metrics: {
      followers_count: legacy.followers_count ?? profile?.followers_count ?? null,
      following_count: legacy.friends_count ?? profile?.following_count ?? null,
      tweet_count: legacy.statuses_count ?? profile?.tweet_count ?? null,
      listed_count: legacy.listed_count ?? profile?.listed_count ?? null,
    },
    source: "scrape_creators",
  });
}

function mapScrapeCreatorsTweet(rawTweet, fallbackHandle = null) {
  const tweet = rawTweet?.tweet || rawTweet?.data || rawTweet;
  const legacy = tweet?.legacy || {};
  const id = tweet?.rest_id || legacy.id_str || tweet?.id;
  const handle = fallbackHandle || tweet?.core?.user_results?.result?.legacy?.screen_name || tweet?.user?.screen_name || tweet?.user?.username || "";

  return normalizeTweet({
    id,
    text: legacy.full_text || tweet?.text || tweet?.full_text || "",
    created_at: legacy.created_at || tweet?.created_at || null,
    author_id: legacy.user_id_str || tweet?.author_id || null,
    public_metrics: {
      retweet_count: legacy.retweet_count ?? tweet?.retweet_count ?? 0,
      reply_count: legacy.reply_count ?? tweet?.reply_count ?? 0,
      like_count: legacy.favorite_count ?? tweet?.favorite_count ?? tweet?.like_count ?? 0,
      quote_count: legacy.quote_count ?? tweet?.quote_count ?? 0,
      bookmark_count: legacy.bookmark_count ?? tweet?.bookmark_count ?? 0,
      impression_count: legacy.view_count ?? legacy.impression_count ?? tweet?.impression_count ?? 0,
    },
    url: tweet?.url || (id ? `https://x.com/${handle || "i/web"}/status/${id}` : null),
    _authorUsername: handle,
    source: "scrape_creators",
  }, [], handle);
}

async function scrapeCreatorsProfile(handle) {
  const resp = await scrapeCreators("/v1/twitter/profile", { handle });
  return {
    user: mapScrapeCreatorsProfile(resp),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function scrapeCreatorsUserTweets(handle, limit = 10) {
  const resp = await scrapeCreators("/v1/twitter/user-tweets", { handle, trim: "false" });
  const rawTweets = resp?.tweets || resp?.data?.tweets || resp?.items || [];
  return {
    tweets: sortTweetsNewestFirst(
      rawTweets.map((t) => mapScrapeCreatorsTweet(t, handle)).filter(Boolean)
    ).slice(0, clampInt(limit, 1, 100, 10)),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function scrapeCreatorsTweetByUrl(url, fallbackHandle = null) {
  const resp = await scrapeCreators("/v1/twitter/tweet", { url });
  return {
    tweet: mapScrapeCreatorsTweet(resp, fallbackHandle),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function googleTweetFallback(query, limit = 10) {
  const target = clampInt(limit, 1, 20, 10);
  const since = recentGoogleDate(14);
  const searches = [
    `${query} after:${since} site:x.com/*/status`,
    `${query} after:${since} site:twitter.com/*/status`,
  ];
  const seen = new Set();
  const tweets = [];
  let credits_remaining = null;

  for (const search of searches) {
    const resp = await scrapeCreators("/v1/google/search", { query: search });
    if (credits_remaining == null && resp?.credits_remaining != null) credits_remaining = resp.credits_remaining;
    const hits = resp?.results || resp?.data || [];

    for (const hit of hits) {
      const url = hit.url || hit.link || "";
      const parsed = parseXInput(url);
      if (parsed.type !== "post" || seen.has(parsed.tweetId)) continue;
      seen.add(parsed.tweetId);

      try {
        const detailed = await scrapeCreatorsTweetByUrl(url, parsed.handle);
        if (detailed?.tweet) tweets.push(detailed.tweet);
        if (detailed?.credits_remaining != null) credits_remaining = detailed.credits_remaining;
      } catch {
        tweets.push(normalizeTweet({
          id: parsed.tweetId,
          text: hit.title || hit.snippet || "",
          url,
          _authorUsername: parsed.handle,
          public_metrics: {},
          metrics_unavailable: true,
          source: "google_fallback",
        }, [], parsed.handle));
      }

      if (tweets.length >= target) return { tweets, users: [], credits_remaining, metrics_unavailable: false };
    }
  }
  return {
    tweets: sortTweetsNewestFirst(tweets).slice(0, target),
    users: [],
    credits_remaining,
    metrics_unavailable: false,
  };
}

export async function getUserIdByUsername(username) {
  const handle = String(username || "").trim().replace(/^@/, "");
  if (!handle) throw new Error("Username is required.");

  try {
    const data = await xRequest({
      method: "GET",
      url: `/users/by/username/${encodeURIComponent(handle)}`,
      params: { "user.fields": USER_FIELDS },
    });
    const user = normalizeUser(data?.data);
    if (!user?.id) throw new Error(`No X account found for @${handle}.`);
    return user;
  } catch (err) {
    if (!shouldFallbackToScrapeCreators(err)) throw err;
    const fallback = await scrapeCreatorsProfile(handle);
    return { ...fallback.user, credits_remaining: fallback.credits_remaining };
  }
}

export async function fetchPostsByUserId(userIdOrHandle, maxResults = 10, handleHint = null) {
  const target = clampInt(maxResults, 5, 100, 10);
  const value = String(userIdOrHandle || "").trim();

  if (!/^\d+$/.test(value)) {
    const sc = await scrapeCreatorsUserTweets(value || handleHint, target);
    return { tweets: sc.tweets, credits_remaining: sc.credits_remaining };
  }

  try {
    const data = await xRequest({
      method: "GET",
      url: `/users/${encodeURIComponent(value)}/tweets`,
      params: {
        max_results: target,
        "tweet.fields": TWEET_FIELDS,
        expansions: "author_id",
        "user.fields": USER_FIELDS,
      },
    });

    const users = data?.includes?.users || [];
    return sortTweetsNewestFirst(
      (data?.data || []).map((tweet) => normalizeTweet(tweet, users, handleHint)).filter(Boolean)
    ).slice(0, target);
  } catch (err) {
    if (!shouldFallbackToScrapeCreators(err)) throw err;
    const handle = handleHint || value;
    const sc = await scrapeCreatorsUserTweets(handle, target);
    return { tweets: sc.tweets, credits_remaining: sc.credits_remaining };
  }
}

export async function fetchTweetById(tweetIdOrUrl) {
  const tweetId = extractTweetId(tweetIdOrUrl) || String(tweetIdOrUrl || "").trim();
  if (!/^\d+$/.test(tweetId)) throw new Error("Valid X post URL or numeric post id is required.");

  try {
    const data = await xRequest({
      method: "GET",
      url: `/tweets/${encodeURIComponent(tweetId)}`,
      params: {
        "tweet.fields": TWEET_FIELDS,
        expansions: "author_id",
        "user.fields": USER_FIELDS,
      },
    });

    const users = data?.includes?.users || [];
    return {
      tweet: normalizeTweet(data?.data, users),
      users: users.map(normalizeUser).filter(Boolean),
      tweets: [],
    };
  } catch (err) {
    if (!shouldFallbackToScrapeCreators(err)) throw err;
    const parsed = parseXInput(tweetIdOrUrl);
    const url = parsed.type === "post" ? parsed.raw : `https://x.com/i/web/status/${tweetId}`;
    const sc = await scrapeCreatorsTweetByUrl(url, parsed.handle);
    return { tweet: sc.tweet, users: [], tweets: [], credits_remaining: sc.credits_remaining };
  }
}

export async function searchRecentTweets(query, maxResults = 10) {
  const q = String(query || "").trim();
  const searchQuery = `${q} -is:retweet`;
  if (!q) throw new Error("Search query is required.");
  const target = clampInt(maxResults, 10, 100, 10);

  try {
    const data = await xRequest({
      method: "GET",
      url: "/tweets/search/recent",
      params: {
        query: searchQuery,
        max_results: target,
        sort_order: "recency",
        "tweet.fields": TWEET_FIELDS,
        expansions: "author_id",
        "user.fields": USER_FIELDS,
      },
    });

    const users = data?.includes?.users || [];
    return {
      tweets: sortTweetsNewestFirst(
        (data?.data || []).map((tweet) => normalizeTweet(tweet, users)).filter(Boolean)
      ).slice(0, target),
      users: users.map(normalizeUser).filter(Boolean),
      meta: data?.meta || {},
    };
  } catch (err) {
    if (!shouldFallbackToScrapeCreators(err)) throw err;
    return googleTweetFallback(q, target);
  }
}

export async function lookupXInput(input, maxResults = 10) {
  const parsed = parseXInput(input);
  const limit = clampInt(maxResults, 10, 100, 10);

  if (parsed.type === "empty") throw new Error("Please enter an X @handle, profile URL, post URL, or keyword search.");

  if (parsed.type === "account") {
    const user = await getUserIdByUsername(parsed.handle);
    const postsResult = await fetchPostsByUserId(user.id, limit, user.username || parsed.handle);
    const tweets = Array.isArray(postsResult) ? postsResult : postsResult?.tweets || [];
    return {
      success: true,
      platform: "x",
      mode: "account",
      input: parsed,
      results: {
        userLookup: user,
        userTweets: tweets.slice(0, limit),
      },
      errors: [],
      credits_remaining: user?.credits_remaining ?? postsResult?.credits_remaining ?? null,
    };
  }

  if (parsed.type === "post") {
    const result = await fetchTweetById(parsed.raw);
    return {
      success: true,
      platform: "x",
      mode: "post",
      input: parsed,
      results: {
        tweetLookup: result,
      },
      errors: [],
      credits_remaining: result?.credits_remaining ?? null,
    };
  }

  const result = await searchRecentTweets(parsed.query, limit);
  return {
    success: true,
    platform: "x",
    mode: "keyword",
    input: parsed,
    results: {
      searchTweets: result,
    },
    errors: [],
    credits_remaining: result?.credits_remaining ?? null,
  };
}

export async function fetchUserMentions(userId, maxResults = 10) {
  const target = clampInt(maxResults, 5, 100, 10);
  const data = await xRequest({
    method: "GET",
    url: `/users/${encodeURIComponent(userId)}/mentions`,
    params: {
      max_results: target,
      "tweet.fields": TWEET_FIELDS,
      expansions: "author_id",
      "user.fields": USER_FIELDS,
    },
  });
  const users = data?.includes?.users || [];
  return {
    tweets: (data?.data || []).map((tweet) => normalizeTweet(tweet, users)).filter(Boolean),
    users: users.map(normalizeUser).filter(Boolean),
  };
}

export async function fetchFollowers(userId, maxResults = 20) {
  const target = clampInt(maxResults, 1, 1000, 20);
  const data = await xRequest({
    method: "GET",
    url: `/users/${encodeURIComponent(userId)}/followers`,
    params: { max_results: target, "user.fields": USER_FIELDS },
  });
  return (data?.data || []).map(normalizeUser).filter(Boolean);
}

export async function fetchFollowing(userId, maxResults = 20) {
  const target = clampInt(maxResults, 1, 1000, 20);
  const data = await xRequest({
    method: "GET",
    url: `/users/${encodeURIComponent(userId)}/following`,
    params: { max_results: target, "user.fields": USER_FIELDS },
  });
  return (data?.data || []).map(normalizeUser).filter(Boolean);
}
