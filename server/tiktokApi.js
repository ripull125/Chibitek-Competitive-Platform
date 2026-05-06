import { scrapeCreators, scrapeCreatorsPaginated } from "./utils/scrapeCreators.js";

const DEFAULT_LIMIT = 10;
const TIKTOK_HOST_RE = /(^|\.)tiktok\.com$/i;

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

function dateMs(value) {
  if (!value) return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPostsNewestFirst(posts = []) {
  return [...posts].sort((a, b) => dateMs(b.createTime || b.create_time || b.created_at || b.publishTime) - dateMs(a.createTime || a.create_time || a.created_at || a.publishTime));
}

function cleanHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.|m\.|vm\.)?tiktok\.com\/@?/i, "")
    .split(/[/?#]/)[0]
    .replace(/\/+$/, "");
}

function canonicalProfileUrl(handleOrUrl) {
  const handle = cleanHandle(handleOrUrl);
  return handle ? `https://www.tiktok.com/@${handle}` : null;
}

function videoIdFromUrl(value) {
  const text = String(value || "").trim();
  return text.match(/\/video\/(\d+)/i)?.[1] || text.match(/[?&]item_id=(\d+)/i)?.[1] || null;
}

function handleFromTikTokUrl(value) {
  const text = String(value || "").trim();
  return text.match(/tiktok\.com\/@([^/?#]+)/i)?.[1] || null;
}

function canonicalVideoUrl(urlOrId, handle = "user") {
  const value = String(urlOrId || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  const id = videoIdFromUrl(value) || value;
  return id ? `https://www.tiktok.com/@${handle || "user"}/video/${id}` : null;
}

export function parseTikTokInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "empty", raw };

  const at = raw.match(/^@([A-Za-z0-9._]{2,30})(?:\s+.*)?$/);
  if (at) {
    return {
      type: "account",
      raw,
      handle: at[1],
      url: canonicalProfileUrl(at[1]),
      source: "handle",
      includePosts: true,
    };
  }

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (TIKTOK_HOST_RE.test(host)) {
      const handle = handleFromTikTokUrl(url.toString());
      const videoId = videoIdFromUrl(url.toString());

      if (videoId) {
        return {
          type: "post",
          raw,
          url: url.toString(),
          videoId,
          handle,
        };
      }

      if (handle) {
        return {
          type: "account",
          raw,
          handle,
          url: canonicalProfileUrl(handle),
          source: "profile_url",
          includePosts: false,
        };
      }

      return { type: "post", raw, url: url.toString(), videoId: null, handle: null };
    }
  } catch {
    // Not a URL; treat as keyword below.
  }

  const hashtag = raw.match(/^#([A-Za-z0-9_]+)$/);
  if (hashtag) return { type: "keyword", raw, query: hashtag[1], hashtag: hashtag[1] };

  return { type: "keyword", raw, query: raw };
}

function getCredits(...responses) {
  for (const resp of responses) {
    if (resp?.credits_remaining != null) return resp.credits_remaining;
  }
  return null;
}

function looksLikeTikTokPost(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  // A real TikTok post/aweme object often contains a nested `video` media
  // object. Do NOT unwrap that `video` field, or we lose author/statistics and
  // the UI falls back to "unknown" + 0 metrics.
  return Boolean(
    value.aweme_id ||
    value.awemeId ||
    value.id_str ||
    value.item_id ||
    value.desc ||
    value.description ||
    value.statistics ||
    value.stats ||
    value.statsV2 ||
    value.author ||
    value.author_info ||
    value.share_url ||
    value.create_time ||
    value.createTime ||
    value.create_time_utc
  );
}

function unwrapVideo(raw = {}) {
  // ScrapeCreators returns TikTok search results as wrappers like:
  // { aweme_info: { ...real post... }, search_aweme_info: {...} }
  // Some older/local helpers return { data: { ...real post... } }.
  // Recursively unwrap wrappers, but stop as soon as the object already looks
  // like an actual TikTok post so we don't accidentally unwrap post.video.
  if (!raw || typeof raw !== "object") return raw || null;
  if (looksLikeTikTokPost(raw)) return raw;

  const wrapped =
    raw.aweme_detail ||
    raw.awemeDetail ||
    raw.aweme_info ||
    raw.awemeInfo ||
    raw.aweme ||
    raw.item ||
    raw.post ||
    raw.result ||
    raw.data;

  if (wrapped && wrapped !== raw) return unwrapVideo(wrapped);
  return raw;
}

function extractVideoArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.map(unwrapVideo);

  const candidates = [obj, obj.data, obj.result, obj.results].filter(Boolean);
  const directKeys = [
    "itemList",
    "item_list",
    "aweme_list",
    "posts",
    "videos",
    "video_list",
    "challenge_aweme_list",
    "search_item_list",
    "items",
    "data",
  ];

  for (const root of candidates) {
    if (Array.isArray(root)) return root.map(unwrapVideo);
    for (const key of directKeys) {
      if (Array.isArray(root?.[key])) return root[key].map(unwrapVideo);
    }
  }

  return [];
}

function firstUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find(Boolean) || null;
  if (Array.isArray(value.url_list)) return value.url_list.find(Boolean) || null;
  return value.url || value.uri || null;
}

function normalizeAuthor(raw = {}) {
  const authorCandidate = raw.author_info || raw.author || raw.user || raw.userInfo?.user || raw.user_info || raw.authorStats || {};
  const author = typeof authorCandidate === "string" ? { uniqueId: authorCandidate, unique_id: authorCandidate, nickname: authorCandidate } : (authorCandidate || {});
  const unique = author.uniqueId || author.unique_id || author.username || author.handle || raw.author_unique_id || raw.authorHandle || raw.author_username || raw.owner_handle || null;
  return {
    ...author,
    id: author.id || author.uid || author.secUid || author.sec_uid || raw.author_user_id || raw.author_id || raw.authorId || null,
    uniqueId: unique,
    unique_id: unique,
    nickname: author.nickname || author.nick_name || author.name || author.displayName || raw.author_name || unique || null,
    avatarThumb: author.avatarThumb || firstUrl(author.avatar_thumb) || author.avatarMedium || firstUrl(author.avatar_medium) || firstUrl(author.avatar_168x168) || firstUrl(author.avatar) || null,
  };
}

function normalizeTikTokVideo(raw = {}, fallback = {}) {
  const v = unwrapVideo(raw) || {};
  const stats = v.stats || v.statsV2 || v.statistics || v.stats_v2 || {};
  const author = normalizeAuthor(v);
  const videoId = String(v.aweme_id || v.awemeId || v.id_str || v.id || v.video_id || v.item_id || fallback.videoId || "");
  const authorHandle = author.uniqueId || author.unique_id || fallback.handle || handleFromTikTokUrl(v.share_url || v.url || "") || "user";
  const postUrl = v.share_url || v.shareUrl || v.url || v.webVideoUrl || v.share_info?.share_url || (videoId ? canonicalVideoUrl(videoId, authorHandle) : null);
  const createdAt = v.createTime ?? v.create_time ?? v.created_at ?? v.publishTime ?? v.createTimeISO ?? v.create_time_utc ?? null;

  return {
    ...v,
    id: videoId || v.id,
    aweme_id: videoId || v.aweme_id,
    desc: v.desc || v.description || v.video_description || v.title || "",
    title: v.title || v.desc || v.video_description || "",
    createTime: createdAt,
    create_time: createdAt,
    url: postUrl,
    share_url: postUrl,
    author,
    stats: {
      ...stats,
      // Intentionally do not normalize/display play/view counts. The UI and
      // saves should focus on the more reliable public engagement metrics.
      diggCount: pickNumber(stats.diggCount, stats.digg_count, stats.likeCount, stats.like_count, v.like_count, v.digg_count, v.diggCount) ?? 0,
      commentCount: pickNumber(stats.commentCount, stats.comment_count, v.comment_count, v.commentCount) ?? 0,
      shareCount: pickNumber(stats.shareCount, stats.share_count, v.share_count, v.shareCount, v.forward_count, stats.forward_count) ?? 0,
    },
  };
}

function dedupeVideos(videos = []) {
  const seen = new Set();
  const out = [];
  for (const video of videos) {
    if (!video) continue;
    const key = String(video.aweme_id || video.id || video.video_id || video.url || video.share_url || "").trim();
    if (!key) {
      out.push(video);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(video);
  }
  return out;
}

function normalizeProfile(resp, handle = null) {
  const root = resp?.data || resp?.profile || resp;
  const user = root?.user || root?.userInfo?.user || root;
  const stats = root?.stats || root?.userInfo?.stats || root?.statsV2 || user?.stats || {};
  const clean = cleanHandle(handle || user?.uniqueId || user?.unique_id || root?.uniqueId || root?.unique_id || "");
  const videos = dedupeVideos(extractVideoArray(resp).map((v) => normalizeTikTokVideo(v, { handle: clean })));

  return {
    ...root,
    user: {
      ...user,
      uniqueId: user?.uniqueId || user?.unique_id || clean,
      unique_id: user?.unique_id || user?.uniqueId || clean,
      nickname: user?.nickname || user?.name || clean,
    },
    stats: {
      ...stats,
      followerCount: pickNumber(stats.followerCount, stats.follower_count, user?.followerCount, user?.follower_count) ?? null,
      followingCount: pickNumber(stats.followingCount, stats.following_count, user?.followingCount, user?.following_count) ?? null,
      heartCount: pickNumber(stats.heartCount, stats.heart, stats.diggCount, user?.heartCount, user?.heart) ?? null,
      videoCount: pickNumber(stats.videoCount, stats.video_count, user?.videoCount, user?.video_count) ?? null,
    },
    url: canonicalProfileUrl(clean),
    itemList: videos,
  };
}

async function scrapeTikTokProfile(handle) {
  const clean = cleanHandle(handle);
  const resp = await scrapeCreators("/v1/tiktok/profile", { handle: clean, trim: true });
  return {
    profile: normalizeProfile(resp, clean),
    raw: resp,
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function scrapeTikTokProfileVideos(handle, limit = DEFAULT_LIMIT) {
  const clean = cleanHandle(handle);

  // Current ScrapeCreators docs expose profile videos separately under v3.
  // Keep the older profile fallback because the existing app/mock also returns
  // itemList from /v1/tiktok/profile.
  try {
    const resp = await scrapeCreatorsPaginated("/v3/tiktok/profile/videos", { handle: clean, sort_by: "latest", trim: true }, clampInt(limit, 1, 25, DEFAULT_LIMIT));
    const videos = dedupeVideos(extractVideoArray(resp).map((v) => normalizeTikTokVideo(v, { handle: clean })));
    if (videos.length) {
      return { itemList: sortPostsNewestFirst(videos).slice(0, clampInt(limit, 1, 25, DEFAULT_LIMIT)), credits_remaining: resp?.credits_remaining ?? null };
    }
  } catch (err) {
    console.warn("[TikTok] profile videos endpoint failed; falling back to profile/search:", err?.message || err);
  }

  const profileResp = await scrapeTikTokProfile(clean);
  let videos = profileResp.profile.itemList || [];

  if (!videos.length) {
    try {
      const searchResp = await scrapeCreatorsPaginated("/v1/tiktok/search/keyword", { query: clean, trim: true }, clampInt(limit, 1, 25, DEFAULT_LIMIT));
      videos = extractVideoArray(searchResp)
        .map((v) => normalizeTikTokVideo(v, { handle: clean }))
        .filter((v) => (v.author?.uniqueId || v.author?.unique_id || "").toLowerCase() === clean.toLowerCase());
      return { itemList: sortPostsNewestFirst(dedupeVideos(videos)).slice(0, clampInt(limit, 1, 25, DEFAULT_LIMIT)), credits_remaining: getCredits(profileResp, searchResp) };
    } catch (err) {
      console.warn("[TikTok] profile video search fallback failed:", err?.message || err);
    }
  }

  return { itemList: sortPostsNewestFirst(dedupeVideos(videos)).slice(0, clampInt(limit, 1, 25, DEFAULT_LIMIT)), credits_remaining: profileResp.credits_remaining };
}

async function scrapeTikTokVideo(url, fallback = {}) {
  const cleanUrl = canonicalVideoUrl(url, fallback.handle || handleFromTikTokUrl(url) || "user");
  try {
    const resp = await scrapeCreators("/v2/tiktok/video", { url: cleanUrl, trim: true });
    const video = normalizeTikTokVideo(resp, fallback);
    return { video, credits_remaining: resp?.credits_remaining ?? null };
  } catch (err) {
    console.warn("[TikTok] video endpoint failed; falling back to profile match:", err?.message || err);
  }

  const handle = fallback.handle || handleFromTikTokUrl(cleanUrl);
  const targetId = fallback.videoId || videoIdFromUrl(cleanUrl);
  if (handle) {
    const profileVideos = await scrapeTikTokProfileVideos(handle, 20);
    const match = profileVideos.itemList.find((v) => String(v.aweme_id || v.id) === String(targetId));
    if (match) return { video: match, credits_remaining: profileVideos.credits_remaining };
  }

  return {
    video: normalizeTikTokVideo({ url: cleanUrl, aweme_id: targetId, author: { uniqueId: handle || "user" } }, fallback),
    credits_remaining: null,
  };
}

async function searchTikTokKeyword(query, limit = DEFAULT_LIMIT, hashtag = null) {
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const endpoint = hashtag ? "/v1/tiktok/search/hashtag" : "/v1/tiktok/search/keyword";
  const params = hashtag ? { hashtag: String(hashtag).replace(/^#/, ""), trim: true } : { query: String(query || "").trim(), trim: true };
  const resp = await scrapeCreatorsPaginated(endpoint, params, cleanLimit);
  const videos = sortPostsNewestFirst(dedupeVideos(extractVideoArray(resp).map((v) => normalizeTikTokVideo(v)))).slice(0, cleanLimit);

  return {
    search_item_list: videos,
    challenge_aweme_list: videos,
    itemList: videos,
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function lookupTikTokInput(input, limit = DEFAULT_LIMIT) {
  const parsed = parseTikTokInput(input);
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const results = {};
  const errors = [];
  const credits = [];

  if (parsed.type === "empty") {
    const err = new Error("Enter a TikTok @username, profile/video URL, hashtag, or keyword.");
    err.status = 400;
    throw err;
  }

  if (parsed.type === "account") {
    try {
      const profileResp = await scrapeTikTokProfile(parsed.handle);
      results.profile = profileResp.profile;
      credits.push(profileResp);
    } catch (err) {
      errors.push({ endpoint: "profile", error: err?.message || String(err) });
    }

    if (parsed.includePosts) {
      try {
        const videosResp = await scrapeTikTokProfileVideos(parsed.handle, cleanLimit);
        results.profileVideos = { itemList: videosResp.itemList || [] };
        credits.push(videosResp);
      } catch (err) {
        errors.push({ endpoint: "profileVideos", error: err?.message || String(err) });
      }
    }
  } else if (parsed.type === "post") {
    try {
      const videoResp = await scrapeTikTokVideo(parsed.url, { handle: parsed.handle, videoId: parsed.videoId });
      results.video = videoResp.video;
      results.post = videoResp.video;
      credits.push(videoResp);
    } catch (err) {
      errors.push({ endpoint: "video", error: err?.message || String(err) });
    }
  } else if (parsed.type === "keyword") {
    try {
      const searchResp = await searchTikTokKeyword(parsed.query, cleanLimit, parsed.hashtag);
      if (parsed.hashtag) results.searchHashtag = searchResp;
      else results.searchKeyword = searchResp;
      credits.push(searchResp);
    } catch (err) {
      errors.push({ endpoint: parsed.hashtag ? "searchHashtag" : "searchKeyword", error: err?.message || String(err) });
    }
  }

  return {
    success: true,
    platform: "tiktok",
    query: parsed.raw,
    inputType: parsed.type,
    parsed,
    results,
    errors,
    credits_remaining: getCredits(...credits),
  };
}

export async function lookupTikTokAdvanced(options = {}, inputs = {}, limit = DEFAULT_LIMIT) {
  const cleanLimit = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const results = {};
  const errors = [];
  const credits = [];

  const handle = cleanHandle(inputs.username);
  const videosHandle = cleanHandle(inputs.videosUsername || inputs.username);

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

  if (options.profile && handle) {
    const resp = await run("profile", () => scrapeTikTokProfile(handle));
    if (resp) results.profile = resp.profile;
  }

  if (options.profileVideos && videosHandle) {
    const resp = await run("profileVideos", () => scrapeTikTokProfileVideos(videosHandle, cleanLimit));
    if (resp) results.profileVideos = { itemList: resp.itemList || [] };
  }

  if (options.following && handle) {
    const resp = await run("following", () => scrapeCreators("/v1/tiktok/user/following", { handle }));
    if (resp) results.following = resp;
  }

  if (options.followers && handle) {
    const resp = await run("followers", () => scrapeCreators("/v1/tiktok/user/followers", { handle }));
    if (resp) results.followers = resp;
  }

  if (options.transcript && inputs.videoUrl?.trim()) {
    const resp = await run("video", () => scrapeTikTokVideo(inputs.videoUrl.trim(), { handle: handleFromTikTokUrl(inputs.videoUrl), videoId: videoIdFromUrl(inputs.videoUrl) }));
    if (resp) {
      results.video = resp.video;
      results.post = resp.video;
    }
    const transcript = await run("transcript", () => scrapeCreators("/v1/tiktok/video/transcript", { url: inputs.videoUrl.trim() }));
    if (transcript) results.transcript = transcript;
  }

  if (options.searchUsers && inputs.userSearchQuery?.trim()) {
    const resp = await run("searchUsers", () => scrapeCreators("/v1/tiktok/search/users", { query: inputs.userSearchQuery.trim() }));
    if (resp) results.searchUsers = resp;
  }

  if (options.searchHashtag && inputs.hashtag?.trim()) {
    const resp = await run("searchHashtag", () => searchTikTokKeyword(inputs.hashtag.trim(), cleanLimit, inputs.hashtag.trim()));
    if (resp) results.searchHashtag = resp;
  }

  if (options.searchKeyword && inputs.keyword?.trim()) {
    const resp = await run("searchKeyword", () => searchTikTokKeyword(inputs.keyword.trim(), cleanLimit));
    if (resp) results.searchKeyword = resp;
  }

  if (!Object.keys(results).length && !errors.length) {
    const err = new Error("No TikTok options selected or inputs provided.");
    err.status = 400;
    throw err;
  }

  return {
    success: true,
    platform: "tiktok",
    results,
    errors,
    credits_remaining: getCredits(...credits),
  };
}
