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
  "attachments",
  "note_tweet",
].join(",");

const MEDIA_FIELDS = [
  "media_key",
  "type",
  "url",
  "preview_image_url",
  "width",
  "height",
  "duration_ms",
  "public_metrics",
  "variants",
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

function getFullTweetText(tweet = {}) {
  return (
    tweet.note_tweet?.text ||
    tweet.note_tweet?.note_tweet_results?.result?.text ||
    tweet.note_tweet_results?.result?.text ||
    tweet.legacy?.note_tweet?.note_tweet_results?.result?.text ||
    tweet.full_text ||
    tweet.legacy?.full_text ||
    tweet.text ||
    ""
  );
}


function normalizeUser(user) {
  if (!user) return null;

  const legacy = user.legacy || {};
  const username = user.username || legacy.screen_name || user.screen_name || user.handle || "";
  const name = user.name || legacy.name || username;

  const followers =
    user.public_metrics?.followers_count ??
    legacy.followers_count ??
    user.followers_count ??
    user.normal_followers_count ??
    null;

  const following =
    user.public_metrics?.following_count ??
    legacy.friends_count ??
    user.following_count ??
    user.friends_count ??
    null;

  const tweetCount =
    user.public_metrics?.tweet_count ??
    legacy.statuses_count ??
    user.tweet_count ??
    user.statuses_count ??
    null;

  const listed =
    user.public_metrics?.listed_count ??
    legacy.listed_count ??
    user.listed_count ??
    null;

  const expandedUrl =
    user.url ||
    legacy?.entities?.url?.urls?.[0]?.expanded_url ||
    userUrl(username);

  return {
    ...user,
    id: String(user.id || user.rest_id || legacy.id_str || username || ""),
    username,
    name,
    description: user.description || legacy.description || "",
    location: user.location || legacy.location || "",
    profile_image_url:
      user.profile_image_url ||
      user.profile_image_url_https ||
      legacy.profile_image_url_https ||
      legacy.profile_image_url ||
      null,
    created_at: user.created_at || legacy.created_at || null,
    verified: Boolean(user.verified || user.is_blue_verified || legacy.verified),
    url: expandedUrl,
    public_metrics: {
      followers_count: followers,
      following_count: following,
      tweet_count: tweetCount,
      listed_count: listed,
    },
    source: user.source || "x_api",
  };
}

function normalizeMedia(media) {
  if (!media) return null;

  return {
    media_key: media.media_key || media.id || "",
    type: media.type || "photo",
    url: media.url || media.media_url_https || media.media_url || null,
    preview_image_url:
      media.preview_image_url ||
      media.media_url_https ||
      media.media_url ||
      null,
    width: media.width ?? media.sizes?.large?.w ?? null,
    height: media.height ?? media.sizes?.large?.h ?? null,
    duration_ms: media.duration_ms ?? media.video_info?.duration_millis ?? null,
    public_metrics: media.public_metrics || {},
    variants: Array.isArray(media.variants)
      ? media.variants
      : Array.isArray(media.video_info?.variants)
        ? media.video_info.variants.map((v) => ({
          bitrate: v.bitrate ?? null,
          content_type: v.content_type || v.contentType || "",
          url: v.url || "",
        }))
        : [],
  };
}


function stripImageUrlNoise(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("format");
    parsed.searchParams.delete("name");
    parsed.searchParams.delete("tag");
    parsed.searchParams.delete("large");
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(url).split("?")[0].toLowerCase();
  }
}

function mediaQualityScore(item = {}) {
  const width = Number(item.width || item.sizes?.large?.w || 0);
  const height = Number(item.height || item.sizes?.large?.h || 0);
  const url = String(item.url || item.preview_image_url || "");
  let score = width * height;
  if (/name=(orig|4096x4096|large)/i.test(url)) score += 1_000_000;
  if (item.type === "video" || item.type === "animated_gif") score += 500_000;
  return score;
}

function dedupeMediaItems(mediaItems = []) {
  const byKey = new Map();

  for (const raw of mediaItems || []) {
    const item = normalizeMedia(raw);
    if (!item) continue;

    const urlKey = stripImageUrlNoise(item.url || item.preview_image_url);
    const key = item.media_key || urlKey;
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing || mediaQualityScore(item) > mediaQualityScore(existing)) {
      byKey.set(key, item);
    }
  }

  const values = Array.from(byKey.values());
  const looksLikeCardPreviewSet =
    values.length > 1 &&
    values.every((item) => {
      const url = String(item.url || item.preview_image_url || "");
      const key = String(item.media_key || "");
      return /card_img|card-image|thumbnail_image|player_image|summary/i.test(url + " " + key);
    });

  if (looksLikeCardPreviewSet) {
    return values.sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a)).slice(0, 1);
  }

  return values;
}

function cleanTweetDisplayText(text = "", mediaItems = []) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (!mediaItems?.length) return raw;

  return raw
    .replace(/(?:\s|^)https?:\/\/t\.co\/[A-Za-z0-9_]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTweet(tweet, users = [], fallbackHandle = null, media = []) {
  if (!tweet) return null;

  const author =
    users.find((u) => String(u.id) === String(tweet.author_id)) ||
    tweet.author ||
    null;

  const authorUsername =
    author?.username || tweet._authorUsername || fallbackHandle || "";

  const mediaByKey = new Map(
    (media || [])
      .filter(Boolean)
      .map((m) => [String(m.media_key || m.id || ""), m])
  );

  const mediaKeys = tweet.attachments?.media_keys || [];

  const mediaItemsFromAttachments = mediaKeys
    .map((key) => mediaByKey.get(String(key)))
    .filter(Boolean)
    .map(normalizeMedia)
    .filter(Boolean);

  const mediaItemsFromTweet = Array.isArray(tweet.media)
    ? tweet.media.map(normalizeMedia).filter(Boolean)
    : [];

  const mediaItems = dedupeMediaItems(
    mediaItemsFromAttachments.length ? mediaItemsFromAttachments : mediaItemsFromTweet
  );

  const fullText = getFullTweetText(tweet);

  const normalized = {
    ...tweet,
    id: String(tweet.id || tweet.rest_id || tweet.legacy?.id_str || ""),
    text: cleanTweetDisplayText(fullText, mediaItems),
    full_text_original: fullText,
    created_at: tweet.created_at || tweet.legacy?.created_at || null,
    author_id: tweet.author_id || tweet.legacy?.user_id_str || author?.id || null,
    media: mediaItems,
    public_metrics: {
      retweet_count:
        tweet.public_metrics?.retweet_count ??
        tweet.legacy?.retweet_count ??
        0,
      reply_count:
        tweet.public_metrics?.reply_count ??
        tweet.legacy?.reply_count ??
        0,
      like_count:
        tweet.public_metrics?.like_count ??
        tweet.legacy?.favorite_count ??
        0,
      quote_count:
        tweet.public_metrics?.quote_count ??
        tweet.legacy?.quote_count ??
        0,
      bookmark_count:
        tweet.public_metrics?.bookmark_count ??
        tweet.legacy?.bookmark_count ??
        0,
      impression_count:
        tweet.public_metrics?.impression_count ??
        tweet.legacy?.impression_count ??
        0,
    },
    author: author ? normalizeUser(author) : null,
    _authorUsername: authorUsername,
    _authorProfileImageUrl: author?.profile_image_url || null,
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
  try {
    const rawId = String(tweet?.id || "").replace(/\D/g, "");
    if (rawId) {
      const id = BigInt(rawId);
      const twitterEpoch = 1288834974657n;
      const timestamp = Number((id >> 22n) + twitterEpoch);

      if (Number.isFinite(timestamp) && timestamp > 0) {
        return timestamp;
      }
    }
  } catch {
  }

  return 0;
}

function sortTweetsNewestFirst(tweets = []) {
  return [...tweets].sort((a, b) => tweetTime(b) - tweetTime(a));
}

function isFreshTweet(tweet, daysBack = 45) {
  const time = tweetTime(tweet);

  if (!time) return true;

  const now = Date.now();
  const cutoff = now - daysBack * 24 * 60 * 60 * 1000;

  const futureBuffer = now + 24 * 60 * 60 * 1000;

  return time >= cutoff && time <= futureBuffer;
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

function extractScrapeCreatorsCardMedia(tweet, tweetId = "") {
  const bindingValues =
    tweet?.card?.legacy?.binding_values ||
    tweet?.card?.binding_values ||
    [];

  if (!Array.isArray(bindingValues)) return [];

  const candidates = bindingValues
    .map((item) => {
      const key = String(item?.key || "").toLowerCase();
      const value = item?.value || {};

      // Card payloads often include the same image under several keys
      // (thumbnail_image, player_image, summary_large_image, etc.). Keep only
      // one best card image so the UI does not show the same preview 4 times.
      if (!key.includes("image")) return null;

      const imageUrl =
        value?.image_value?.url ||
        value?.string_value ||
        value?.scribe_key;

      if (!imageUrl || !/^https?:\/\//i.test(String(imageUrl))) return null;

      return normalizeMedia({
        media_key: `${tweetId || "card"}-card-image`,
        type: "photo",
        url: imageUrl,
        preview_image_url: imageUrl,
      });
    })
    .filter(Boolean);

  return dedupeMediaItems(candidates).slice(0, 1);
}

function extractScrapeCreatorsMedia(tweet, legacy = {}, tweetId = "") {
  const rawMedia =
    legacy?.extended_entities?.media ||
    tweet?.extended_entities?.media ||
    legacy?.entities?.media ||
    tweet?.entities?.media ||
    [];

  const attachedMedia = rawMedia
    .map((m, index) =>
      normalizeMedia({
        media_key: m.media_key || m.id_str || m.id || `${tweetId || "media"}-${index}`,
        type: m.type || "photo",
        url: m.media_url_https || m.media_url || m.url || null,
        preview_image_url:
          m.preview_image_url ||
          m.media_url_https ||
          m.media_url ||
          null,
        width: m.width ?? m.sizes?.large?.w ?? null,
        height: m.height ?? m.sizes?.large?.h ?? null,
        duration_ms: m.video_info?.duration_millis ?? null,
        variants: m.video_info?.variants || m.variants || [],
      })
    )
    .filter(Boolean);

  const cardMedia = extractScrapeCreatorsCardMedia(tweet, tweetId);

  return [...attachedMedia, ...cardMedia];
}

function mapScrapeCreatorsTweet(rawTweet, fallbackHandle = null) {
  const tweet = rawTweet?.tweet || rawTweet?.data || rawTweet;
  const legacy = tweet?.legacy || {};
  const id = tweet?.rest_id || legacy.id_str || tweet?.id;

  const userResult = tweet?.core?.user_results?.result || tweet?.user_results?.result || {};
  const userLegacy = userResult?.legacy || tweet?.user?.legacy || tweet?.user || {};

  const handle =
    fallbackHandle ||
    userLegacy?.screen_name ||
    tweet?.user?.screen_name ||
    tweet?.user?.username ||
    "";

  const media = extractScrapeCreatorsMedia(tweet, legacy, id);

  const author = handle
    ? {
      id: userResult?.rest_id || legacy.user_id_str || handle,
      username: handle,
      name: userLegacy?.name || handle,
      profile_image_url:
        userLegacy?.profile_image_url_https ||
        userLegacy?.profile_image_url ||
        tweet?.user?.profile_image_url ||
        null,
    }
    : null;

  return normalizeTweet(
    {
      id,
      text: getFullTweetText({ ...tweet, legacy }),
      created_at: legacy.created_at || tweet?.created_at || null,
      author_id: legacy.user_id_str || tweet?.author_id || author?.id || null,
      author,
      media,
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
    },
    author ? [author] : [],
    handle,
    media
  );
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
  const resp = await scrapeCreators("/v1/twitter/tweet", {
    url,
    trim: "false",
  });

  return {
    tweet: mapScrapeCreatorsTweet(resp, fallbackHandle),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function googleTweetFallback(query, limit = 10) {
  const target = clampInt(limit, 1, 20, 10);
  const daysBack = 45;
  const since = recentGoogleDate(daysBack);

  const searches = [
    `${query} after:${since} site:x.com/*/status`,
    `${query} after:${since} site:twitter.com/*/status`,
  ];

  const seen = new Set();
  const tweets = [];
  let credits_remaining = null;

  for (const search of searches) {
    const resp = await scrapeCreators("/v1/google/search", { query: search });

    if (credits_remaining == null && resp?.credits_remaining != null) {
      credits_remaining = resp.credits_remaining;
    }

    const hits = resp?.results || resp?.data || [];

    for (const hit of hits) {
      const url = hit.url || hit.link || "";
      const parsed = parseXInput(url);

      if (parsed.type !== "post" || seen.has(parsed.tweetId)) continue;
      seen.add(parsed.tweetId);

      try {
        const detailed = await scrapeCreatorsTweetByUrl(url, parsed.handle);

        if (detailed?.tweet && isFreshTweet(detailed.tweet, daysBack)) {
          tweets.push(detailed.tweet);
        }

        if (detailed?.credits_remaining != null) {
          credits_remaining = detailed.credits_remaining;
        }
      } catch (detailErr) {
        console.warn("[X google fallback] Skipping placeholder result because tweet detail failed:", {
          url,
          message: detailErr?.message,
          status: detailErr?.response?.status,
          body: detailErr?.response?.data,
        });

        continue;
      }

      if (tweets.length >= target * 2) break;
    }

    if (tweets.length >= target * 2) break;
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
        expansions: "author_id,attachments.media_keys",
        "user.fields": USER_FIELDS,
        "media.fields": MEDIA_FIELDS,
      },
    });

    const users = data?.includes?.users || [];
    const media = data?.includes?.media || [];
    return sortTweetsNewestFirst(
      (data?.data || [])
        .map((tweet) => normalizeTweet(tweet, users, handleHint, media))
        .filter(Boolean)
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
        expansions: "author_id,attachments.media_keys",
        "user.fields": USER_FIELDS,
        "media.fields": MEDIA_FIELDS,
      },
    });

    const users = data?.includes?.users || [];
    const media = data?.includes?.media || [];
    return {
      tweet: normalizeTweet(data?.data, users, null, media),
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

export async function searchRecentTweets(query, maxResults = 10, paginationToken = null) {
  const q = String(query || "").trim();
  const searchQuery = `${q} -is:retweet`;
  if (!q) throw new Error("Search query is required.");
  const target = clampInt(maxResults, 10, 100, 10);

  try {
    const params = {
      query: searchQuery,
      max_results: target,
      sort_order: "recency",
      "tweet.fields": TWEET_FIELDS,
      expansions: "author_id,attachments.media_keys",
      "user.fields": USER_FIELDS,
      "media.fields": MEDIA_FIELDS,
    };

    if (paginationToken) {
      params.pagination_token = paginationToken;
    }

    const data = await xRequest({
      method: "GET",
      url: "/tweets/search/recent",
      params,
    });

    const users = data?.includes?.users || [];
    const media = data?.includes?.media || [];
    return {
      tweets: sortTweetsNewestFirst(
        (data?.data || [])
          .map((tweet) => normalizeTweet(tweet, users, null, media))
          .filter(Boolean)
      ).slice(0, target),
      users: users.map(normalizeUser).filter(Boolean),
      meta: data?.meta || {},
      source: "x_api",
    };
  } catch (err) {
    console.warn("[X searchRecentTweets] X API recent search failed:", {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      body: err?.body,
      attempts: err?.attempts,
    });

    if (!shouldFallbackToScrapeCreators(err)) throw err;

    const fallback = await googleTweetFallback(q, target);

    if (!fallback.tweets?.length) {
      const out = new Error(
        "X keyword search failed. Your X API recent-search call failed, and the fallback could not retrieve full tweet details. Check X_BEARER_TOKEN access or ScrapeCreators /v1/twitter/tweet."
      );
      // Prefer a gateway error here so the UI treats it as a backend data-source problem,
      // not as a user's form/input mistake.
      out.status = 502;
      out.originalStatus = err?.status || null;
      out.originalCode = err?.code || null;
      out.originalBody = err?.body || null;
      out.attempts = err?.attempts || null;
      throw out;
    }

    return {
      ...fallback,
      source: "scrape_creators_fallback",
    };
  }
}

export async function lookupXInput(input, maxResults = 10, options = {}) {
  const parsed = parseXInput(input);
  const limit = clampInt(maxResults, 10, 100, 10);

  if (parsed.type === "empty") {
    throw new Error("Please enter an X @handle, profile URL, post URL, or keyword search.");
  }

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

  const result = await searchRecentTweets(parsed.query, limit, options.paginationToken || null);
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
      expansions: "author_id,attachments.media_keys",
      "user.fields": USER_FIELDS,
      "media.fields": MEDIA_FIELDS,
    },
  });
  const users = data?.includes?.users || [];
  const media = data?.includes?.media || [];
  return {
    tweets: (data?.data || [])
      .map((tweet) => normalizeTweet(tweet, users, null, media))
      .filter(Boolean),
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
