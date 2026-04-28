import "dotenv/config";
import axios from "axios";
import { normalizeXPost } from "./utils/normalizeXPost.js";
import { scrapeCreators, scrapeCreatorsPaginated } from "./utils/scrapeCreators.js";

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
      params: {
        "user.fields": "created_at,description,location,name,profile_image_url,public_metrics,verified,url,pinned_tweet_id",
      },
    });

    if (!res.data?.data?.id) {
      throw new Error(`No user found for username ${username}`);
    }

    return res.data.data;
  } catch (err) {
    // If the bearer-token attempts failed (network/blocking), try a best-effort
    // fallback using ScrapeCreators: perform a lightweight Google search to
    // find a twitter.com profile URL and return minimal metadata so the UI
    // can still show something useful.
    const isAllBearerFailures = err && (
      err.attempts ||
      err.message?.includes('All bearer tokens failed') ||
      err.message?.includes('No X bearer tokens found')
    );
    if (isAllBearerFailures) {
      try {
        const scProfile = await scrapeCreatorsProfile(username);
        return {
          ...scProfile.user,
          credits_remaining: scProfile.credits_remaining,
          note: 'Returned via ScrapeCreators Twitter profile endpoint',
        };
      } catch (gErr) {
        // If ScrapeCreators profile fails, fall back to Google search
        if (err.attempts) {
          const summary = err.attempts;
          const ex = new Error(`All bearer tokens failed for X user lookup and fallback also failed: ${gErr?.message || gErr}`);
          ex.attempts = summary;
          throw ex;
        }
        const google = await scrapeCreators('/v1/google/search', { query: `${username} site:twitter.com` });
        const hits = google?.results || google?.data || [];
        const twitterUrl = (hits.find(h => /twitter\.com\//i.test(h.url || h.link || ''))?.url) || null;
        const title = hits.find(h => h.title)?.title || '';
        const nameGuess = title.split('(')[0]?.replace(/\s+\/\s*X$/i, '').trim() || username;
        return {
          id: String(username),
          username,
          name: nameGuess,
          fallback_url: twitterUrl,
          public_metrics: {
            followers_count: null,
            following_count: null,
            tweet_count: null,
            listed_count: null,
          },
          metrics_unavailable: true,
          credits_remaining: google?.credits_remaining ?? null,
          note: 'Returned via ScrapeCreators Google fallback — not authoritative',
        };
      }
    }

    if (err.response) {
      throw new Error(
        `X API user lookup failed: ${err.response.status} ${JSON.stringify(
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

const TWEET_FIELDS = "created_at,public_metrics,lang,conversation_id,in_reply_to_user_id,referenced_tweets,entities,source,impression_count";

function mapScrapeCreatorsProfile(profile) {
  const legacy = profile?.legacy || {};
  const username = legacy.screen_name || profile?.screen_name || profile?.username || "";
  const name = legacy.name || profile?.name || username;
  const urlEntity = legacy?.entities?.url?.urls?.[0]?.expanded_url || null;

  return {
    id: String(profile?.rest_id || legacy?.id_str || username || ""),
    username,
    name,
    description: legacy.description || "",
    location: legacy.location || "",
    created_at: legacy.created_at || null,
    verified: legacy.verified || profile?.is_blue_verified || false,
    url: urlEntity,
    public_metrics: {
      followers_count: legacy.followers_count ?? null,
      following_count: legacy.friends_count ?? null,
      tweet_count: legacy.statuses_count ?? null,
      listed_count: legacy.listed_count ?? null,
    },
    metrics_unavailable: false,
  };
}

function mapScrapeCreatorsTweet(tweet) {
  const legacy = tweet?.legacy || {};
  return {
    id: tweet?.rest_id || legacy?.id_str,
    text: legacy.full_text || "",
    created_at: legacy.created_at || null,
    public_metrics: {
      like_count: legacy.favorite_count ?? null,
      retweet_count: legacy.retweet_count ?? null,
      reply_count: legacy.reply_count ?? null,
      quote_count: legacy.quote_count ?? null,
    },
    metrics_unavailable: false,
  };
}

async function scrapeCreatorsProfile(handle) {
  const resp = await scrapeCreators('/v1/twitter/profile', { handle });
  return {
    user: mapScrapeCreatorsProfile(resp),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function scrapeCreatorsUserTweets(handle, maxResults) {
  const resp = await scrapeCreators('/v1/twitter/user-tweets', { handle });
  const tweets = Array.isArray(resp?.tweets) ? resp.tweets.map(mapScrapeCreatorsTweet) : [];
  return {
    tweets: tweets.slice(0, Math.min(Math.max(maxResults, 10), 100)),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function scrapeCreatorsTweetByUrl(url) {
  const resp = await scrapeCreators('/v1/twitter/tweet', { url });
  return {
    tweet: mapScrapeCreatorsTweet(resp),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function collectGoogleTweetFallback(queries, maxResults) {
  const tweets = [];
  const seen = new Set();
  let credits_remaining = null;

  for (const q of queries) {
    const google = await scrapeCreators('/v1/google/search', { query: q });
    if (credits_remaining == null && google?.credits_remaining != null) {
      credits_remaining = google.credits_remaining;
    }
    const hits = google?.results || google?.data || [];
    for (const h of hits) {
      const url = h.url || h.link || '';
      if (!/twitter\.com\/.+\/status\//i.test(url) && !/x\.com\/.+\/status\//i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      tweets.push({
        id: url.split('/').pop(),
        url,
        text: h.title || h.snippet || '',
        public_metrics: {
          like_count: null,
          reply_count: null,
          retweet_count: null,
          quote_count: null,
        },
        metrics_unavailable: true,
      });
      if (tweets.length >= maxResults) return { tweets, credits_remaining };
    }
  }

  return { tweets, credits_remaining };
}

async function enrichTweetsWithScrapeCreators(tweets) {
  let credits_remaining = null;
  const enriched = [];

  for (const t of tweets) {
    if (!t?.url) {
      enriched.push(t);
      continue;
    }
    try {
      const sc = await scrapeCreatorsTweetByUrl(t.url);
      if (sc?.credits_remaining != null) credits_remaining = sc.credits_remaining;
      enriched.push({
        ...t,
        ...sc.tweet,
        url: t.url,
        metrics_unavailable: false,
      });
    } catch {
      enriched.push(t);
    }
  }

  return { tweets: enriched, credits_remaining };
}

export async function fetchPostsByUserId(userId, maxResults = 10) {
  // If a non-numeric userId is supplied (from fallback), treat it as a
  // username and return best-effort search results via ScrapeCreators.
  if (!userId || (typeof userId === 'string' && !/^[0-9]+$/.test(userId))) {
    const username = String(userId || '').trim();
    try {
      const scTweets = await scrapeCreatorsUserTweets(username, maxResults);
      return { ...scTweets, metrics_unavailable: false };
    } catch (gErr) {
      const ex = new Error(`X tweet lookup fallback failed: ${gErr?.message || gErr}`);
      throw ex;
    }
  }

  try {
    const target = Math.min(Math.max(maxResults, 10), 100);
    const tweets = [];
    let paginationToken = null;

    for (let page = 0; page < 5 && tweets.length < target; page++) {
      const res = await requestWithTokenFallback({
        method: "get",
        url: `/users/${userId}/tweets`,
        params: {
          max_results: Math.min(Math.max(target - tweets.length, 10), 100),
          exclude: "replies,retweets",
          "tweet.fields": TWEET_FIELDS,
          ...(paginationToken ? { pagination_token: paginationToken } : {}),
        },
      });
      const pageTweets = res.data?.data || [];
      tweets.push(...pageTweets);
      paginationToken = res.data?.meta?.next_token || null;
      if (!paginationToken || pageTweets.length === 0) break;
    }

    // If we still have fewer than target tweets, try once without exclusions
    // to backfill (some users may only have replies/retweets recently).
    if (tweets.length < target) {
      const res = await requestWithTokenFallback({
        method: "get",
        url: `/users/${userId}/tweets`,
        params: {
          max_results: Math.min(Math.max(target - tweets.length, 10), 100),
          "tweet.fields": TWEET_FIELDS,
        },
      });
      const pageTweets = res.data?.data || [];
      tweets.push(...pageTweets);
    }

    return tweets.slice(0, target);
  } catch (err) {
    // If bearer tokens all failed, attempt a best-effort ScrapeCreators fallback
    const isAllBearerFailures = err && (
      err.attempts ||
      err.message?.includes('All bearer tokens failed') ||
      err.message?.includes('No X bearer tokens found')
    );
    if (isAllBearerFailures) {
      try {
        const scTweets = await scrapeCreatorsUserTweets(String(userId), Math.min(Math.max(maxResults, 10), 100));
        return { ...scTweets, metrics_unavailable: false };
      } catch (gErr) {
        const ex = new Error(`X tweet lookup failed and fallback also failed: ${gErr?.message || gErr}`);
        ex.original = err;
        throw ex;
      }
    }
    throw err;
  }
}

export async function fetchUserMentions(userId, maxResults = 10) {
  const res = await requestWithTokenFallback({
    method: "get",
    url: `/users/${userId}/mentions`,
    params: {
      max_results: Math.min(Math.max(maxResults, 5), 100),
      "tweet.fields": TWEET_FIELDS,
      "expansions": "author_id",
      "user.fields": "username,name,profile_image_url",
    },
  });
  return {
    tweets: res.data?.data || [],
    users: res.data?.includes?.users || [],
  };
}

export async function fetchFollowers(userId, maxResults = 20) {
  const res = await requestWithTokenFallback({
    method: "get",
    url: `/users/${userId}/followers`,
    params: {
      max_results: Math.min(Math.max(maxResults, 1), 1000),
      "user.fields": "created_at,description,public_metrics,profile_image_url,verified,location",
    },
  });
  return res.data?.data || [];
}

export async function fetchFollowing(userId, maxResults = 20) {
  const res = await requestWithTokenFallback({
    method: "get",
    url: `/users/${userId}/following`,
    params: {
      max_results: Math.min(Math.max(maxResults, 1), 1000),
      "user.fields": "created_at,description,public_metrics,profile_image_url,verified,location",
    },
  });
  return res.data?.data || [];
}

export async function fetchTweetById(tweetId) {
  try {
    const res = await requestWithTokenFallback({
      method: "get",
      url: `/tweets/${tweetId}`,
      params: {
        "tweet.fields": TWEET_FIELDS,
        "expansions": "author_id,referenced_tweets.id",
        "user.fields": "username,name,profile_image_url,public_metrics",
      },
    });
    return {
      tweet: res.data?.data || null,
      users: res.data?.includes?.users || [],
      tweets: res.data?.includes?.tweets || [],
    };
  } catch (err) {
    const isAllBearerFailures = err && (
      err.attempts ||
      err.message?.includes('All bearer tokens failed') ||
      err.message?.includes('No X bearer tokens found')
    );
    if (!isAllBearerFailures) throw err;

    // Try ScrapeCreators tweet endpoint using a constructed URL
    const url = `https://x.com/i/web/status/${tweetId}`;
    const sc = await scrapeCreatorsTweetByUrl(url);
    return { tweet: sc.tweet || null, users: [], tweets: [], credits_remaining: sc.credits_remaining };
  }
}

export async function searchRecentTweets(query, maxResults = 10) {
  try {
    const target = Math.min(Math.max(maxResults, 10), 100);
    const tweets = [];
    const usersById = new Map();
    let nextToken = null;

    for (let page = 0; page < 5 && tweets.length < target; page++) {
      const res = await requestWithTokenFallback({
        method: "get",
        url: `/tweets/search/recent`,
        params: {
          query,
          max_results: Math.min(Math.max(target - tweets.length, 10), 100),
          "tweet.fields": TWEET_FIELDS,
          "expansions": "author_id",
          "user.fields": "username,name,profile_image_url,public_metrics",
          ...(nextToken ? { next_token: nextToken } : {}),
        },
      });
      const pageTweets = res.data?.data || [];
      tweets.push(...pageTweets);
      for (const u of res.data?.includes?.users || []) {
        if (u?.id) usersById.set(u.id, u);
      }
      nextToken = res.data?.meta?.next_token || null;
      if (!nextToken || pageTweets.length === 0) break;
    }

    return {
      tweets: tweets.slice(0, target),
      users: Array.from(usersById.values()),
    };
  } catch (err) {
    const isAllBearerFailures = err && (
      err.attempts ||
      err.message?.includes('All bearer tokens failed') ||
      err.message?.includes('No X bearer tokens found')
    );
    if (isAllBearerFailures) {
      try {
        // Best-effort fallback: use Google search to find recent tweet URLs matching the query
        const queries = [
          `${query} site:twitter.com`,
          `${query} site:x.com`,
          `${query} "twitter.com"`,
          `${query} "x.com"`,
        ];
        const fallback = await collectGoogleTweetFallback(queries, Math.min(Math.max(maxResults, 10), 100));
        const enriched = await enrichTweetsWithScrapeCreators(fallback.tweets);
        return {
          tweets: enriched.tweets,
          users: [],
          credits_remaining: enriched.credits_remaining ?? fallback.credits_remaining,
          metrics_unavailable: false,
        };
      } catch (gErr) {
        throw new Error(`X search failed and fallback also failed: ${gErr?.message || gErr}`);
      }
    }
    throw err;
  }
}
