import fetch from "node-fetch";
import { scrapeCreators, scrapeCreatorsPaginated } from "./utils/scrapeCreators.js";

const DEFAULT_LIMIT = 10;
const REDDIT_HOST_RE = /(^|\.)reddit\.com$/i;
const USER_AGENT = "ChibitekCompetitivePlatform/1.0 (+https://chibitek.app)";

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function pickNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "object") {
      if (Number.isFinite(Number(value.count))) return Number(value.count);
      if (Number.isFinite(Number(value.value))) return Number(value.value);
      if (Number.isFinite(Number(value.total_count))) return Number(value.total_count);
      continue;
    }

    const raw = String(value).trim().replace(/,/g, "");
    const match = raw.match(/^([0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
    if (match) {
      const base = Number(match[1]);
      const suffix = String(match[2] || "").toLowerCase();
      const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
      return Math.round(base * multiplier);
    }

    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}


function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = typeof value === "string" ? value : String(value);
    const cleaned = /<[^>]+>/.test(text) ? stripHtml(text) : decodeHtml(text).trim();
    if (cleaned) return cleaned;
  }
  return "";
}

function cleanMediaUrl(value) {
  const text = decodeHtml(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return "";
  if (/\/static\//i.test(text) && /redditstatic\.com/i.test(text)) return "";
  return text;
}

function isImageUrl(value) {
  return /\.(?:png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(String(value || ""));
}

function isVideoUrl(value) {
  return /\.(?:mp4|m3u8|mov|webm)(?:[?#].*)?$/i.test(String(value || ""));
}

function isUsefulThumbnail(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  return !/^(?:self|default|nsfw|spoiler|image|video)$/i.test(text);
}

function addMedia(items, media) {
  const url = cleanMediaUrl(media?.url || media?.source || media?.src);
  const thumbnail = cleanMediaUrl(media?.thumbnail || media?.thumbnail_url || media?.preview || media?.poster || "");
  if (!url && !thumbnail) return;
  const type = media?.type || (isVideoUrl(url) ? "video" : "image");
  const item = {
    type,
    url: url || thumbnail,
    thumbnail: thumbnail || url,
    width: media?.width || media?.w || null,
    height: media?.height || media?.h || null,
    source: media?.sourceName || media?.source || null,
  };
  const key = `${item.type}:${item.url}`;
  if (!items.some((existing) => `${existing.type}:${existing.url}` === key)) items.push(item);
}

function extractPreviewMedia(p = {}) {
  const items = [];
  const previewImages = asArray(p.preview?.images);
  for (const image of previewImages) {
    const source = image?.source || {};
    const resolutions = asArray(image?.resolutions);
    const best = resolutions[resolutions.length - 1] || source;
    addMedia(items, {
      type: "image",
      url: source.url || best.url,
      thumbnail: best.url || source.url,
      width: source.width || best.width,
      height: source.height || best.height,
      sourceName: "preview",
    });
  }
  return items;
}

function extractGalleryMedia(p = {}) {
  const items = [];
  const metadata = p.media_metadata || p.mediaMetadata || {};
  const orderedIds = asArray(p.gallery_data?.items || p.galleryData?.items)
    .map((item) => item.media_id || item.mediaId)
    .filter(Boolean);
  const ids = orderedIds.length ? orderedIds : Object.keys(metadata);

  for (const id of ids) {
    const meta = metadata[id] || {};
    const source = meta.s || meta.source || {};
    const previews = asArray(meta.p || meta.resolutions);
    const best = previews[previews.length - 1] || source;
    const mime = String(meta.m || meta.mime || "").toLowerCase();
    addMedia(items, {
      type: mime.includes("video") ? "video" : "image",
      url: source.u || source.gif || source.mp4 || source.url || best.u || best.url,
      thumbnail: best.u || best.url || source.u || source.url,
      width: source.x || source.width || best.x || best.width,
      height: source.y || source.height || best.y || best.height,
      sourceName: "gallery",
    });
  }
  return items;
}

function extractVideoMedia(p = {}) {
  const items = [];
  const video = p.secure_media?.reddit_video || p.media?.reddit_video || p.preview?.reddit_video_preview || p.reddit_video || null;
  if (video) {
    addMedia(items, {
      type: "video",
      url: video.fallback_url || video.hls_url || video.dash_url,
      thumbnail: isUsefulThumbnail(p.thumbnail) ? p.thumbnail : extractPreviewMedia(p)[0]?.thumbnail,
      width: video.width,
      height: video.height,
      sourceName: "reddit_video",
    });
  }
  return items;
}

function extractRedditMedia(p = {}) {
  const items = [];

  for (const item of extractGalleryMedia(p)) addMedia(items, item);
  for (const item of extractVideoMedia(p)) addMedia(items, item);
  for (const item of extractPreviewMedia(p)) addMedia(items, item);

  if (isUsefulThumbnail(p.thumbnail)) {
    addMedia(items, {
      type: isVideoUrl(p.thumbnail) ? "video" : "image",
      url: p.thumbnail,
      thumbnail: p.thumbnail,
      width: p.thumbnail_width,
      height: p.thumbnail_height,
      sourceName: "thumbnail",
    });
  }

  const outbound = cleanMediaUrl(p.url_overridden_by_dest || p.url || p.link || "");
  if (outbound && (isImageUrl(outbound) || isVideoUrl(outbound))) {
    addMedia(items, {
      type: isVideoUrl(outbound) ? "video" : "image",
      url: outbound,
      thumbnail: extractPreviewMedia(p)[0]?.thumbnail || (isImageUrl(outbound) ? outbound : p.thumbnail),
      sourceName: "outbound",
    });
  }

  const crosspost = Array.isArray(p.crosspost_parent_list) ? p.crosspost_parent_list[0] : null;
  if (crosspost) {
    for (const item of extractRedditMedia(crosspost)) addMedia(items, item);
  }

  return items.slice(0, 6);
}

function dateMs(value) {
  if (!value) return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanSubreddit(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === "r");
    if (idx >= 0 && parts[idx + 1]) raw = parts[idx + 1];
  } catch {
    // Not a URL; continue with string cleanup.
  }

  return raw
    .replace(/^\/+/, "")
    .replace(/^r\//i, "")
    .split(/[/?#\s]/)[0]
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 50);
}

function cleanUsername(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ["user", "u"].includes(p.toLowerCase()));
    if (idx >= 0 && parts[idx + 1]) raw = parts[idx + 1];
  } catch {
    // Not a URL; continue with string cleanup.
  }

  return raw
    .replace(/^@/, "")
    .replace(/^\/+/, "")
    .replace(/^(u|user)\//i, "")
    .split(/[/?#\s]/)[0]
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 50);
}

function canonicalSubredditUrl(subreddit) {
  const clean = cleanSubreddit(subreddit);
  return clean ? `https://www.reddit.com/r/${clean}/` : null;
}

function canonicalUserUrl(username) {
  const clean = cleanUsername(username);
  return clean ? `https://www.reddit.com/user/${clean}/` : null;
}

function canonicalPostUrl(post = {}) {
  const permalink = post.permalink || post.permaLink || post.path;
  if (permalink) {
    const text = String(permalink);
    return text.startsWith("http") ? text : `https://www.reddit.com${text.startsWith("/") ? "" : "/"}${text}`;
  }
  const url = post.url || post.link || post.post_url;
  return url ? String(url) : null;
}

function postIdFromRedditUrl(value) {
  const text = String(value || "").trim();
  return text.match(/reddit\.com\/r\/[^/]+\/comments\/([A-Za-z0-9]+)/i)?.[1] || null;
}

function usernameFromRedditUrl(value) {
  const text = String(value || "").trim();
  return text.match(/reddit\.com\/(?:user|u)\/([^/?#]+)/i)?.[1] || null;
}

function subredditFromRedditUrl(value) {
  const text = String(value || "").trim();
  return text.match(/reddit\.com\/r\/([^/?#]+)/i)?.[1] || null;
}

function redditJsonUrl(pathAndQuery) {
  const base = "https://www.reddit.com";
  const value = String(pathAndQuery || "").trim();
  if (value.startsWith("http")) return value;
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

function postJsonUrl(inputUrl) {
  const url = new URL(String(inputUrl).startsWith("http") ? inputUrl : `https://www.reddit.com${String(inputUrl).startsWith("/") ? "" : "/"}${inputUrl}`);
  url.hostname = "www.reddit.com";
  url.protocol = "https:";
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith(".json")) url.pathname = `${url.pathname}.json`;
  url.searchParams.set("raw_json", "1");
  return url.toString();
}

async function fetchRedditJson(url, { allow404 = false } = {}) {
  const resp = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  const text = await resp.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text };
  }

  if (!resp.ok) {
    const err = new Error(body?.message || body?.error || `Reddit request failed (${resp.status})`);
    err.status = resp.status;
    err.body = body;
    if (allow404 && resp.status === 404) return null;
    throw err;
  }

  return body;
}

function unwrapThing(raw) {
  if (!raw || typeof raw !== "object") return raw || null;
  if (raw.kind && raw.data && typeof raw.data === "object") return raw.data;
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) && !raw.data.children && !raw.data.dist) {
    return raw.data;
  }
  return raw;
}

function extractPostsArray(obj) {
  if (!obj) return [];

  if (Array.isArray(obj)) {
    if (obj[0]?.data?.children) return obj[0].data.children.map(unwrapThing);
    return obj.flatMap((item) => extractPostsArray(item));
  }

  const roots = [obj, obj.data, obj.result, obj.results].filter(Boolean);
  for (const root of roots) {
    if (Array.isArray(root?.children)) return root.children.map(unwrapThing);
    if (Array.isArray(root?.posts)) return root.posts.map(unwrapThing);
    if (Array.isArray(root?.items)) return root.items.map(unwrapThing);
    if (Array.isArray(root?.listing)) return root.listing.map(unwrapThing);
  }

  if (obj.title || obj.selftext || obj.permalink || obj.name?.startsWith?.("t3_")) return [unwrapThing(obj)];
  return [];
}

function extractCommentsArray(obj) {
  if (!obj) return [];

  if (Array.isArray(obj)) {
    const commentListing = obj[1]?.data?.children || obj[0]?.comments || [];
    if (Array.isArray(commentListing)) return commentListing.map(unwrapThing).filter((c) => c?.body || c?.author || c?.replies);
    return obj.flatMap((item) => extractCommentsArray(item));
  }

  const roots = [obj, obj.data, obj.result, obj.results].filter(Boolean);
  for (const root of roots) {
    if (Array.isArray(root?.comments)) return root.comments.map(unwrapThing);
    if (Array.isArray(root?.children)) return root.children.map(unwrapThing).filter((c) => c?.body || c?.author || c?.replies);
  }

  return [];
}

function normalizeRedditPost(raw = {}, fallback = {}) {
  const p = unwrapThing(raw) || {};
  const subreddit = cleanSubreddit(p.subreddit || p.subreddit_name_prefixed || fallback.subreddit || "");
  const author = cleanUsername(p.author || p.author_name || p.username || fallback.author || "");
  const createdAt = p.created_utc ?? p.createdUtc ?? p.created ?? p.created_at ?? p.createdAt ?? null;
  const media = extractRedditMedia(p);
  const canonicalUrl = canonicalPostUrl(p) || fallback.url || null;
  const permalink = p.permalink || (canonicalUrl?.includes("reddit.com") ? new URL(canonicalUrl).pathname : null);
  const redditUrl = permalink ? `https://www.reddit.com${permalink.startsWith("/") ? "" : "/"}${permalink}` : canonicalUrl;
  const outboundUrl = cleanMediaUrl(p.url_overridden_by_dest || p.link_url || p.outbound_url || "");
  const bodyText = cleanText(
    p.selftext,
    p.body,
    p.description,
    p.caption,
    p.text,
    p.content,
    p.markdown,
    p.selftext_html,
    fallback.selftext,
    fallback.body
  );

  return {
    ...p,
    id: String(p.id || p.post_id || p.name || fallback.id || "").replace(/^t3_/, ""),
    name: p.name || (p.id ? `t3_${String(p.id).replace(/^t3_/, "")}` : undefined),
    title: cleanText(p.title, p.headline, fallback.title),
    selftext: bodyText,
    body: bodyText,
    description: bodyText || cleanText(p.description),
    subreddit,
    subreddit_name_prefixed: subreddit ? `r/${subreddit}` : p.subreddit_name_prefixed,
    author,
    created_utc: Number.isFinite(Number(createdAt)) ? Number(createdAt) : createdAt,
    permalink,
    url: redditUrl,
    reddit_url: redditUrl,
    external_url: outboundUrl || (p.url && p.url !== redditUrl ? cleanMediaUrl(p.url) : null),
    score: pickNumber(p.score, p.ups, p.upvotes, p.upvote_count, p.likes, p.like_count) ?? 0,
    ups: pickNumber(p.ups, p.score, p.upvotes, p.upvote_count) ?? 0,
    upvote_ratio: pickNumber(p.upvote_ratio, p.upvoteRatio) ?? null,
    num_comments: pickNumber(p.num_comments, p.comment_count, p.comments, p.comments_count) ?? 0,
    total_awards_received: pickNumber(p.total_awards_received, p.awards, p.award_count) ?? 0,
    author_fullname: p.author_fullname || p.author_id || null,
    thumbnail: cleanMediaUrl(p.thumbnail) || media[0]?.thumbnail || null,
    media,
    media_preview: media,
    media_url: media[0]?.url || null,
    media_type: media[0]?.type || (p.is_video ? "video" : media.length ? "image" : null),
    is_gallery: Boolean(p.is_gallery || p.gallery_data || p.media_metadata || media.length > 1),
  };
}

function normalizeRedditComment(raw = {}) {
  const c = unwrapThing(raw) || {};
  return {
    ...c,
    id: String(c.id || c.name || "").replace(/^t1_/, ""),
    body: cleanText(c.body, c.text, c.content),
    author: cleanUsername(c.author || c.username || ""),
    score: pickNumber(c.score, c.ups, c.upvotes) ?? 0,
    created_utc: c.created_utc ?? c.created ?? c.created_at ?? null,
  };
}

function normalizeRedditUserProfile(raw = {}, username = "") {
  const root = unwrapThing(raw) || raw || {};
  const clean = cleanUsername(username || root.name || root.username || root.display_name || "");
  const createdAt = root.created_utc ?? root.created ?? root.created_at ?? null;
  const totalKarma = pickNumber(root.total_karma, root.totalKarma, root.link_karma + root.comment_karma, root.karma);

  return {
    ...root,
    id: root.id || root.name || clean,
    name: root.name || clean,
    username: root.name || clean,
    display_name: root.name || clean,
    url: canonicalUserUrl(clean),
    icon_img: root.icon_img || root.avatar || root.profile_img || null,
    created_utc: Number.isFinite(Number(createdAt)) ? Number(createdAt) : createdAt,
    link_karma: pickNumber(root.link_karma, root.linkKarma) ?? null,
    comment_karma: pickNumber(root.comment_karma, root.commentKarma) ?? null,
    total_karma: totalKarma ?? null,
    awardee_karma: pickNumber(root.awardee_karma) ?? null,
    awarder_karma: pickNumber(root.awarder_karma) ?? null,
    is_gold: root.is_gold ?? root.isGold ?? null,
    is_mod: root.is_mod ?? root.isMod ?? null,
    verified: root.verified ?? root.has_verified_email ?? null,
  };
}

function normalizeSubredditDetails(raw = {}, subreddit = "") {
  const root = unwrapThing(raw) || raw || {};
  const clean = cleanSubreddit(subreddit || root.display_name || root.displayName || root.name || "");
  return {
    ...root,
    id: root.id || root.name || clean,
    display_name: root.display_name || root.displayName || clean,
    name: root.name || clean,
    url: canonicalSubredditUrl(clean),
    description: root.public_description || root.description || root.submit_text || "",
    public_description: root.public_description || root.description || "",
    subscribers: pickNumber(root.subscribers, root.subscriber_count, root.members) ?? null,
    weekly_active_users: pickNumber(root.weekly_active_users, root.active_user_count, root.accounts_active, root.active_users) ?? null,
    weekly_contributions: pickNumber(root.weekly_contributions, root.posts_per_week, root.submission_count) ?? null,
    advertiser_category: root.advertiser_category || root.category || null,
    rules: Array.isArray(root.rules) ? root.rules : asArray(root.rules),
  };
}

function sortPostsNewestFirst(posts = []) {
  return [...posts].sort((a, b) => dateMs(b.created_utc || b.created || b.created_at) - dateMs(a.created_utc || a.created || a.created_at));
}

function dedupePosts(posts = []) {
  const seen = new Set();
  const out = [];
  for (const post of posts) {
    if (!post) continue;
    const key = String(post.id || post.name || post.permalink || post.url || post.title || "").trim();
    if (!key) {
      out.push(post);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

function getCredits(...responses) {
  for (const resp of responses) {
    if (resp?.credits_remaining != null) return resp.credits_remaining;
  }
  return null;
}


function shouldEnrichPost(post = {}) {
  const hasText = Boolean(post.selftext || post.body || post.description);
  const hasMedia = Array.isArray(post.media) && post.media.length > 0;
  return Boolean((post.permalink || post.reddit_url || post.url) && (!hasText || !hasMedia));
}

function mergeNormalizedPost(base = {}, detail = {}) {
  const detailed = normalizeRedditPost({ ...base, ...detail }, base);
  return {
    ...base,
    ...detailed,
    title: detailed.title || base.title,
    selftext: detailed.selftext || base.selftext || base.body || "",
    body: detailed.body || detailed.selftext || base.body || base.selftext || "",
    media: detailed.media?.length ? detailed.media : (base.media || base.media_preview || []),
    media_preview: detailed.media?.length ? detailed.media : (base.media_preview || base.media || []),
    thumbnail: detailed.thumbnail || base.thumbnail || null,
    url: detailed.reddit_url || detailed.url || base.reddit_url || base.url,
    reddit_url: detailed.reddit_url || base.reddit_url || base.url,
  };
}

async function enrichRedditPosts(posts = [], limit = DEFAULT_LIMIT) {
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const normalized = posts.map((p) => normalizeRedditPost(p)).slice(0, cleanLimit);
  const enriched = [];

  for (const post of normalized) {
    if (!shouldEnrichPost(post)) {
      enriched.push(post);
      continue;
    }

    try {
      const targetUrl = post.reddit_url || post.permalink || post.url;
      const resp = await fetchRedditJson(postJsonUrl(targetUrl), { allow404: true });
      const detailRaw = extractPostsArray(resp)[0];
      enriched.push(detailRaw ? mergeNormalizedPost(post, detailRaw) : post);
    } catch (err) {
      // Keep the original search result when a detail fetch is rate-limited or blocked.
      enriched.push(post);
    }
  }

  return enriched.slice(0, cleanLimit);
}

export function parseRedditInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "empty", raw };

  const atUser = raw.match(/^@([A-Za-z0-9_-]{2,50})(?:\s+.*)?$/);
  if (atUser) {
    return {
      type: "user",
      raw,
      username: atUser[1],
      url: canonicalUserUrl(atUser[1]),
      source: "handle",
      includePosts: true,
    };
  }

  const userMatch = raw.match(/^(?:u|user)\/([A-Za-z0-9_-]{2,50})$/i);
  if (userMatch) {
    return {
      type: "user",
      raw,
      username: userMatch[1],
      url: canonicalUserUrl(userMatch[1]),
      source: "user_prefix",
      includePosts: true,
    };
  }

  const subMatch = raw.match(/^r\/([A-Za-z0-9_]{2,50})$/i);
  if (subMatch) {
    return {
      type: "subreddit",
      raw,
      subreddit: subMatch[1],
      url: canonicalSubredditUrl(subMatch[1]),
      source: "subreddit_prefix",
      includePosts: true,
    };
  }

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^old\./, "").replace(/^new\./, "");
    if (REDDIT_HOST_RE.test(host)) {
      const user = usernameFromRedditUrl(url.toString());
      const subreddit = subredditFromRedditUrl(url.toString());
      const postId = postIdFromRedditUrl(url.toString());

      if (postId) {
        return { type: "post", raw, url: url.toString(), postId, subreddit };
      }

      if (user) {
        return {
          type: "user",
          raw,
          username: user,
          url: canonicalUserUrl(user),
          source: "profile_url",
          includePosts: false,
        };
      }

      if (subreddit) {
        return {
          type: "subreddit",
          raw,
          subreddit,
          url: canonicalSubredditUrl(subreddit),
          source: "subreddit_url",
          includePosts: false,
        };
      }
    }
  } catch {
    // Not a URL; treat as keyword below.
  }

  return { type: "keyword", raw, query: raw };
}

async function scrapeRedditUserProfile(username) {
  const clean = cleanUsername(username);
  try {
    const resp = await fetchRedditJson(redditJsonUrl(`/user/${encodeURIComponent(clean)}/about.json?raw_json=1`));
    return { profile: normalizeRedditUserProfile(resp, clean), raw: resp, credits_remaining: null };
  } catch (err) {
    console.warn("[Reddit] user profile fetch failed; returning minimal profile:", err?.message || err);
    return {
      profile: normalizeRedditUserProfile({ name: clean }, clean),
      raw: null,
      credits_remaining: null,
      error: err?.message || String(err),
    };
  }
}

async function scrapeRedditUserPosts(username, limit = DEFAULT_LIMIT) {
  const clean = cleanUsername(username);
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);

  try {
    const resp = await fetchRedditJson(redditJsonUrl(`/user/${encodeURIComponent(clean)}/submitted.json?sort=new&limit=${cleanLimit}&raw_json=1`));
    const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p, { author: clean }));
    const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
    return { posts: enriched, raw: resp, credits_remaining: null };
  } catch (err) {
    console.warn("[Reddit] user posts fetch failed; falling back to search:", err?.message || err);
  }

  const searchResp = await searchRedditKeyword(`author:${clean}`, cleanLimit);
  const posts = (searchResp.posts || []).filter((p) => String(p.author || "").toLowerCase() === clean.toLowerCase());
  return { posts: posts.slice(0, cleanLimit), credits_remaining: searchResp.credits_remaining };
}

async function scrapeSubredditDetails(subreddit) {
  const clean = cleanSubreddit(subreddit);
  try {
    const resp = await scrapeCreators("/v1/reddit/subreddit/details", { subreddit: clean, trim: true });
    return { details: normalizeSubredditDetails(resp, clean), raw: resp, credits_remaining: resp?.credits_remaining ?? null };
  } catch (err) {
    console.warn("[Reddit] subreddit details endpoint failed; falling back to Reddit JSON:", err?.message || err);
  }

  const resp = await fetchRedditJson(redditJsonUrl(`/r/${encodeURIComponent(clean)}/about.json?raw_json=1`));
  return { details: normalizeSubredditDetails(resp, clean), raw: resp, credits_remaining: null };
}

async function scrapeSubredditPosts(subreddit, limit = DEFAULT_LIMIT) {
  const clean = cleanSubreddit(subreddit);
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  try {
    const resp = await scrapeCreatorsPaginated("/v1/reddit/subreddit", { subreddit: clean, sort: "new", trim: true }, cleanLimit);
    const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p, { subreddit: clean }));
    const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
    return { posts: enriched, raw: resp, credits_remaining: resp?.credits_remaining ?? null };
  } catch (err) {
    console.warn("[Reddit] subreddit posts endpoint failed; falling back to Reddit JSON:", err?.message || err);
  }

  const resp = await fetchRedditJson(redditJsonUrl(`/r/${encodeURIComponent(clean)}/new.json?limit=${cleanLimit}&raw_json=1`));
  const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p, { subreddit: clean }));
  const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
  return { posts: enriched, raw: resp, credits_remaining: null };
}

async function searchSubreddit(subreddit, query, limit = DEFAULT_LIMIT) {
  const clean = cleanSubreddit(subreddit);
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  try {
    const resp = await scrapeCreatorsPaginated("/v1/reddit/subreddit/search", { subreddit: clean, query: String(query || "").trim(), sort: "new", trim: true }, cleanLimit);
    const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p, { subreddit: clean }));
    const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
    return { posts: enriched, raw: resp, credits_remaining: resp?.credits_remaining ?? null };
  } catch (err) {
    console.warn("[Reddit] subreddit search endpoint failed; falling back to Reddit JSON:", err?.message || err);
  }

  const params = new URLSearchParams({ q: String(query || "").trim(), restrict_sr: "1", sort: "new", limit: String(cleanLimit), raw_json: "1" });
  const resp = await fetchRedditJson(redditJsonUrl(`/r/${encodeURIComponent(clean)}/search.json?${params}`));
  const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p, { subreddit: clean }));
  const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
  return { posts: enriched, raw: resp, credits_remaining: null };
}

async function scrapeRedditPost(url) {
  const cleanUrl = String(url || "").trim();
  try {
    const resp = await fetchRedditJson(postJsonUrl(cleanUrl));
    const post = normalizeRedditPost(extractPostsArray(resp)[0] || {}, { url: cleanUrl, id: postIdFromRedditUrl(cleanUrl) });
    const comments = extractCommentsArray(resp).map(normalizeRedditComment);
    return { post, comments, raw: resp, credits_remaining: null };
  } catch (err) {
    console.warn("[Reddit] post JSON fetch failed; falling back to ScrapeCreators comments:", err?.message || err);
  }

  const resp = await scrapeCreators("/v1/reddit/post/comments", { url: cleanUrl, trim: true });
  const post = normalizeRedditPost(extractPostsArray(resp)[0] || resp?.post || { url: cleanUrl, id: postIdFromRedditUrl(cleanUrl) }, { url: cleanUrl });
  const comments = extractCommentsArray(resp).map(normalizeRedditComment);
  return { post, comments, raw: resp, credits_remaining: resp?.credits_remaining ?? null };
}

async function searchRedditKeyword(query, limit = DEFAULT_LIMIT) {
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const cleanQuery = String(query || "").trim();
  try {
    const resp = await scrapeCreatorsPaginated("/v1/reddit/search", { query: cleanQuery, sort: "new", trim: true }, cleanLimit);
    const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p));
    const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
    return { posts: enriched, raw: resp, credits_remaining: resp?.credits_remaining ?? null };
  } catch (err) {
    console.warn("[Reddit] keyword search endpoint failed; falling back to Reddit JSON:", err?.message || err);
  }

  const params = new URLSearchParams({ q: cleanQuery, sort: "new", type: "link", limit: String(cleanLimit), raw_json: "1" });
  const resp = await fetchRedditJson(redditJsonUrl(`/search.json?${params}`));
  const posts = extractPostsArray(resp).map((p) => normalizeRedditPost(p));
  const enriched = await enrichRedditPosts(sortPostsNewestFirst(dedupePosts(posts)), cleanLimit);
  return { posts: enriched, raw: resp, credits_remaining: null };
}

async function searchRedditAds(query) {
  const resp = await scrapeCreators("/v1/reddit/ads/search", { query: String(query || "").trim() });
  return { ...resp, credits_remaining: resp?.credits_remaining ?? null };
}

async function getRedditAd(input) {
  const value = String(input || "").trim();
  const adId = value.match(/comments\/(\w+)/)?.[1] || value.match(/[?&]id=([^&]+)/)?.[1] || value;
  const resp = await scrapeCreators("/v1/reddit/ad", { id: adId });
  return { ...resp, credits_remaining: resp?.credits_remaining ?? null };
}

export async function lookupRedditInput(input, limit = DEFAULT_LIMIT) {
  const parsed = parseRedditInput(input);
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const results = {};
  const errors = [];
  const credits = [];

  if (parsed.type === "empty") {
    const err = new Error("Enter a Reddit @username, u/username, r/subreddit, Reddit URL, or keyword.");
    err.status = 400;
    throw err;
  }

  if (parsed.type === "user") {
    try {
      const profileResp = await scrapeRedditUserProfile(parsed.username);
      results.profile = profileResp.profile;
      results.userProfile = profileResp.profile;
      credits.push(profileResp);
    } catch (err) {
      errors.push({ endpoint: "profile", error: err?.message || String(err) });
    }

    if (parsed.includePosts) {
      try {
        const postsResp = await scrapeRedditUserPosts(parsed.username, cleanLimit);
        results.userPosts = { posts: postsResp.posts || [] };
        credits.push(postsResp);
      } catch (err) {
        errors.push({ endpoint: "userPosts", error: err?.message || String(err) });
      }
    }
  } else if (parsed.type === "subreddit") {
    try {
      const detailsResp = await scrapeSubredditDetails(parsed.subreddit);
      results.subredditDetails = detailsResp.details;
      credits.push(detailsResp);
    } catch (err) {
      errors.push({ endpoint: "subredditDetails", error: err?.message || String(err) });
    }

    if (parsed.includePosts) {
      try {
        const postsResp = await scrapeSubredditPosts(parsed.subreddit, cleanLimit);
        results.subredditPosts = { posts: postsResp.posts || [] };
        credits.push(postsResp);
      } catch (err) {
        errors.push({ endpoint: "subredditPosts", error: err?.message || String(err) });
      }
    }
  } else if (parsed.type === "post") {
    try {
      const postResp = await scrapeRedditPost(parsed.url);
      results.post = postResp.post;
      // Keep comments available for the advanced/comments display, but the main
      // single-link result emphasizes one post and its metrics.
      results.postComments = { comments: postResp.comments || [], post: postResp.post };
      credits.push(postResp);
    } catch (err) {
      errors.push({ endpoint: "post", error: err?.message || String(err) });
    }
  } else if (parsed.type === "keyword") {
    try {
      const searchResp = await searchRedditKeyword(parsed.query, cleanLimit);
      results.search = { posts: searchResp.posts || [] };
      credits.push(searchResp);
    } catch (err) {
      errors.push({ endpoint: "search", error: err?.message || String(err) });
    }
  }

  return {
    success: true,
    platform: "reddit",
    query: parsed.raw,
    inputType: parsed.type,
    parsed,
    results,
    errors,
    credits_remaining: getCredits(...credits),
  };
}

export async function lookupRedditAdvanced(options = {}, inputs = {}, limit = DEFAULT_LIMIT) {
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const results = {};
  const errors = [];
  const credits = [];

  const run = async (label, fn) => {
    try {
      const value = await fn();
      credits.push(value);
      return value;
    } catch (err) {
      errors.push({ endpoint: label, error: err?.message || String(err) });
      return null;
    }
  };

  const subreddit = cleanSubreddit(inputs.subreddit);
  const username = cleanUsername(inputs.username || inputs.user || inputs.redditUser);

  if (options.userProfile && username) {
    const resp = await run("profile", () => scrapeRedditUserProfile(username));
    if (resp) {
      results.profile = resp.profile;
      results.userProfile = resp.profile;
    }
  }

  if (options.userPosts && username) {
    const resp = await run("userPosts", () => scrapeRedditUserPosts(username, cleanLimit));
    if (resp) results.userPosts = { posts: resp.posts || [] };
  }

  if (options.subredditDetails && subreddit) {
    const resp = await run("subredditDetails", () => scrapeSubredditDetails(subreddit));
    if (resp) results.subredditDetails = resp.details;
  }

  if (options.subredditPosts && subreddit) {
    const resp = await run("subredditPosts", () => scrapeSubredditPosts(subreddit, cleanLimit));
    if (resp) results.subredditPosts = { posts: resp.posts || [] };
  }

  if (options.subredditSearch && subreddit && inputs.subredditQuery?.trim()) {
    const resp = await run("subredditSearch", () => searchSubreddit(subreddit, inputs.subredditQuery.trim(), cleanLimit));
    if (resp) results.subredditSearch = { posts: resp.posts || [] };
  }

  if (options.postComments && inputs.postUrl?.trim()) {
    const resp = await run("postComments", () => scrapeRedditPost(inputs.postUrl.trim()));
    if (resp) {
      results.post = resp.post;
      results.postComments = { comments: resp.comments || [], post: resp.post };
    }
  }

  if (options.search && inputs.searchQuery?.trim()) {
    const resp = await run("search", () => searchRedditKeyword(inputs.searchQuery.trim(), cleanLimit));
    if (resp) results.search = { posts: resp.posts || [] };
  }

  if (options.searchAds && inputs.adSearchQuery?.trim()) {
    const resp = await run("searchAds", () => searchRedditAds(inputs.adSearchQuery.trim()));
    if (resp) results.searchAds = resp;
  }

  if (options.getAd && inputs.adUrl?.trim()) {
    const resp = await run("getAd", () => getRedditAd(inputs.adUrl.trim()));
    if (resp) results.getAd = resp;
  }

  if (!Object.keys(results).length && !errors.length) {
    const err = new Error("No Reddit options selected or inputs provided.");
    err.status = 400;
    throw err;
  }

  return {
    success: true,
    platform: "reddit",
    results,
    errors,
    credits_remaining: getCredits(...credits),
  };
}
