import { scrapeCreators, scrapeCreatorsPaginated } from "./utils/scrapeCreators.js";

const DEFAULT_LIMIT = 10;
const INSTAGRAM_HOST_RE = /(^|\.)instagram\.com$/i;
const RESERVED_PROFILE_PATHS = new Set([
  "p",
  "reel",
  "tv",
  "explore",
  "accounts",
  "direct",
  "stories",
  "about",
  "developer",
  "reels",
]);

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

function cleanHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .split(/[/?#]/)[0]
    .replace(/\/+$/, "");
}

function canonicalProfileUrl(handleOrUrl) {
  const handle = cleanHandle(handleOrUrl);
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

function canonicalPostUrl(shortcodeOrUrl, kind = "p") {
  const value = String(shortcodeOrUrl || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  const clean = value.replace(/^\/+/, "").replace(/^instagram\.com\//i, "").split(/[/?#]/).filter(Boolean);
  const shortcode = clean[1] || clean[0];
  return shortcode ? `https://www.instagram.com/${kind}/${shortcode}/` : null;
}

export function parseInstagramInput(input) {
  const raw = String(input || "").trim();
  if (!raw) return { type: "empty", raw };

  const at = raw.match(/^@([A-Za-z0-9._]{1,30})$/);
  if (at) {
    return {
      type: "account",
      raw,
      handle: at[1],
      url: canonicalProfileUrl(at[1]),
      source: "handle",
    };
  }

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (INSTAGRAM_HOST_RE.test(host)) {
      const parts = url.pathname.split("/").filter(Boolean);
      const first = String(parts[0] || "").toLowerCase();
      const second = parts[1];

      if (["p", "reel", "tv"].includes(first) && second) {
        return {
          type: "post",
          raw,
          url: url.toString(),
          shortcode: second,
          postType: first,
        };
      }

      if (parts[0] && !RESERVED_PROFILE_PATHS.has(first)) {
        const handle = parts[0].replace(/^@/, "");
        if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
          return {
            type: "account",
            raw,
            handle,
            url: url.toString(),
            source: "profile_url",
          };
        }
      }
    }
  } catch {
    // Not a URL; treat as keyword below.
  }

  return { type: "keyword", raw, query: raw };
}

function getCredits(...responses) {
  for (const resp of responses) {
    if (resp?.credits_remaining != null) return resp.credits_remaining;
  }
  return null;
}

function dateMs(value) {
  if (!value) return 0;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPostsNewestFirst(posts = []) {
  return [...posts].sort((a, b) => dateMs(b.taken_at || b.taken_at_timestamp || b.timestamp || b.created_at) - dateMs(a.taken_at || a.taken_at_timestamp || a.timestamp || a.created_at));
}

function shortcodeFromUrl(url) {
  const text = String(url || "");
  const match = text.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

function dedupePosts(posts = []) {
  const seen = new Set();
  const out = [];
  for (const post of posts) {
    if (!post) continue;
    const key = String(post.code || post.shortcode || shortcodeFromUrl(post.url || post.permalink) || post.pk || post.id || "").trim();
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

function bestCandidate(candidates = []) {
  const list = asArray(candidates).filter((x) => x?.url);
  if (!list.length) return null;
  return [...list].sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0]?.url || null;
}

function bestVideo(videoVersions = []) {
  const list = asArray(videoVersions).filter((x) => x?.url);
  if (!list.length) return null;
  return [...list].sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0))[0]?.url || null;
}

function firstText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.text === "string") return value.text;
  if (Array.isArray(value?.edges)) {
    return value.edges.map((e) => e?.node?.text).filter(Boolean).join("\n");
  }
  return "";
}

function extractCaption(post = {}) {
  return (
    firstText(post.caption) ||
    firstText(post.edge_media_to_caption) ||
    post.accessibility_caption ||
    post.title ||
    post.description ||
    ""
  );
}

function normalizeInstagramMedia(rawMedia, fallbackKey = "media") {
  if (!rawMedia) return null;
  const isVideo = rawMedia.media_type === 2 || rawMedia.is_video === true || Boolean(rawMedia.video_url || rawMedia.video_versions);
  const videoUrl = rawMedia.video_url || bestVideo(rawMedia.video_versions);
  const imageUrl =
    rawMedia.display_url ||
    rawMedia.thumbnail_src ||
    rawMedia.thumbnail_url ||
    rawMedia.image_url ||
    bestCandidate(rawMedia.image_versions2?.candidates) ||
    bestCandidate(rawMedia.image_versions?.candidates) ||
    rawMedia.media_url ||
    rawMedia.url ||
    null;

  const url = isVideo ? videoUrl : imageUrl;
  const preview = imageUrl || rawMedia.preview_image_url || null;

  if (!url && !preview) return null;

  return {
    media_key: String(rawMedia.id || rawMedia.pk || rawMedia.code || rawMedia.shortcode || fallbackKey),
    type: isVideo ? "video" : "photo",
    url: url || preview,
    preview_image_url: preview || url,
    width: rawMedia.original_width || rawMedia.width || null,
    height: rawMedia.original_height || rawMedia.height || null,
    variants: videoUrl ? [{ content_type: "video/mp4", url: videoUrl }] : [],
  };
}

function extractMedia(post = {}) {
  const carouselCandidates = [
    ...asArray(post.carousel_media),
    ...asArray(post.carousel_media_items),
    ...asArray(post.edge_sidecar_to_children?.edges).map((e) => e?.node).filter(Boolean),
  ];

  const items = carouselCandidates.length ? carouselCandidates : [post];
  const media = items
    .map((m, index) => normalizeInstagramMedia(m?.node || m, `${post.id || post.pk || post.code || "ig"}-${index}`))
    .filter(Boolean);

  const seen = new Set();
  return media.filter((m) => {
    const key = m.url || m.preview_image_url || m.media_key;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unwrapPost(raw = {}) {
  return (
    raw?.node ||
    raw?.media ||
    raw?.data?.xdt_shortcode_media ||
    raw?.data?.shortcode_media ||
    raw?.data?.media ||
    raw?.data ||
    raw?.post ||
    raw
  );
}

export function normalizeInstagramPost(raw = {}, fallbackAuthor = {}) {
  const post = unwrapPost(raw);
  const caption = extractCaption(post);
  const code = post.code || post.shortcode || shortcodeFromUrl(post.url || post.permalink) || "";
  const id = String(post.pk || post.id || post.media_id || code || Date.now());
  const owner = post.user || post.owner || post.author || fallbackAuthor || {};
  const username = owner.username || post.username || fallbackAuthor.username || fallbackAuthor.handle || "";
  const media = extractMedia(post);
  const isVideo = post.media_type === 2 || post.is_video === true || media.some((m) => m.type === "video");
  const postType = isVideo ? "reel" : "p";
  const url = post.url || post.permalink || (code ? `https://www.instagram.com/${postType}/${code}/` : null);
  const takenAt = post.taken_at || post.taken_at_timestamp || post.timestamp || post.created_at || post.date || null;

  return {
    ...post,
    id,
    pk: post.pk || id,
    code,
    shortcode: code,
    url,
    permalink: url,
    caption: { text: caption },
    text: caption,
    taken_at: takenAt,
    created_at: takenAt,
    media_type: post.media_type ?? (isVideo ? 2 : media.length > 1 ? 8 : 1),
    is_video: isVideo,
    carousel_media_count: post.carousel_media_count || media.length,
    like_count: post.like_count ?? post.likes ?? post.edge_media_preview_like?.count ?? post.edge_liked_by?.count ?? post.likes_count ?? 0,
    comment_count: post.comment_count ?? post.comments ?? post.edge_media_to_comment?.count ?? post.comments_count ?? 0,
    play_count: post.play_count ?? post.video_view_count ?? post.view_count ?? post.video_play_count ?? null,
    video_view_count: post.video_view_count ?? post.play_count ?? null,
    media,
    image_url: media.find((m) => m.type === "photo")?.url || media[0]?.preview_image_url || null,
    video_url: media.find((m) => m.type === "video")?.url || post.video_url || null,
    user: {
      ...owner,
      username,
      full_name: owner.full_name || owner.fullName || owner.name || fallbackAuthor.full_name || fallbackAuthor.name || username,
      profile_pic_url: owner.profile_pic_url || owner.profile_pic_url_hd || owner.profileImage || fallbackAuthor.profile_pic_url || fallbackAuthor.image || null,
    },
    source: post.source || "scrape_creators",
  };
}

function normalizeProfile(resp, url = null) {
  const profile = resp?.data?.user || resp?.data || resp?.user || resp?.profile || resp;
  const username = profile.username || cleanHandle(url) || "";
  const posts = [
    ...asArray(profile.posts),
    ...asArray(profile.items),
    ...asArray(profile.media),
    ...asArray(profile.edge_owner_to_timeline_media?.edges).map((e) => e?.node).filter(Boolean),
  ];

  return {
    ...profile,
    username,
    full_name: profile.full_name || profile.fullName || profile.name || username,
    biography: profile.biography || profile.bio || profile.description || "",
    profile_pic_url: profile.profile_pic_url || profile.profile_pic_url_hd || profile.profileImage || profile.avatar || null,
    media_count: profile.media_count ?? profile.edge_owner_to_timeline_media?.count ?? profile.postsCount ?? profile.posts_count ?? null,
    follower_count: profile.follower_count ?? profile.edge_followed_by?.count ?? profile.followersCount ?? profile.followers ?? null,
    following_count: profile.following_count ?? profile.edge_follow?.count ?? profile.followingCount ?? profile.following ?? null,
    external_url: profile.external_url || profile.url || profile.bio_links?.[0]?.url || null,
    url: profile.url || url || canonicalProfileUrl(username),
    posts,
  };
}

function recentGoogleDate(daysBack = 90) {
  const d = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function instagramPostUrlFromHit(hit) {
  const url = String(hit?.url || hit?.link || "").trim();
  if (!url || !/instagram\.com\//i.test(url)) return null;
  if (/instagram\.com\/(p|reel|tv)\//i.test(url)) return url;
  return null;
}

function extractPostList(resp = {}) {
  const data = resp?.data || resp;
  const candidates = [
    data?.posts,
    data?.items,
    data?.data?.items,
    data?.reels,
    data?.medias,
    data?.media,
    data?.edges,
  ];

  for (const candidate of candidates) {
    const arr = asArray(candidate);
    if (arr.length) return arr.map((x) => x?.node || x?.media || x);
  }

  return [];
}

export async function scrapeInstagramProfile(handleOrUrl) {
  const handle = cleanHandle(handleOrUrl);
  const resp = await scrapeCreators("/v1/instagram/profile", { handle });
  return {
    profile: normalizeProfile(resp, canonicalProfileUrl(handle)),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function scrapeInstagramUserPosts(handleOrUrl, limit = DEFAULT_LIMIT) {
  const handle = cleanHandle(handleOrUrl);
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const resp = await scrapeCreatorsPaginated("/v2/instagram/user/posts", { handle, trim: "false" }, target);
  const posts = extractPostList(resp).map((p) => normalizeInstagramPost(p, { username: handle })).filter(Boolean);
  return {
    posts: sortPostsNewestFirst(dedupePosts(posts)).slice(0, target),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

export async function scrapeInstagramPost(urlOrShortcode, fallbackAuthor = {}) {
  const parsed = parseInstagramInput(urlOrShortcode);
  const url = parsed.type === "post" ? parsed.url : canonicalPostUrl(urlOrShortcode, "p");
  if (!url) throw new Error("Valid Instagram post or reel URL is required.");
  const resp = await scrapeCreators("/v1/instagram/post", { url, trim: "false" });
  return {
    post: normalizeInstagramPost(resp, fallbackAuthor),
    credits_remaining: resp?.credits_remaining ?? null,
  };
}

async function hydratePostUrls(urls = [], limit = DEFAULT_LIMIT) {
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const out = [];
  let credits_remaining = null;

  for (const url of urls.slice(0, target * 2)) {
    try {
      const detail = await scrapeInstagramPost(url);
      if (detail?.post) out.push(detail.post);
      if (detail?.credits_remaining != null) credits_remaining = detail.credits_remaining;
    } catch (err) {
      console.warn("[Instagram] Post hydrate failed; skipping lightweight result:", {
        url,
        message: err?.message,
        status: err?.status,
      });
    }
    if (out.length >= target) break;
  }

  return {
    posts: sortPostsNewestFirst(dedupePosts(out)).slice(0, target),
    credits_remaining,
  };
}

export async function searchInstagramKeywordPosts(query, limit = DEFAULT_LIMIT) {
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const since = recentGoogleDate(90);
  const searches = [
    `${query} after:${since} site:instagram.com/p`,
    `${query} after:${since} site:instagram.com/reel`,
  ];

  const urls = [];
  let credits_remaining = null;

  for (const search of searches) {
    const resp = await scrapeCreators("/v1/google/search", { query: search });
    if (resp?.credits_remaining != null) credits_remaining = resp.credits_remaining;
    const hits = resp?.results || resp?.data || [];
    for (const hit of hits) {
      const url = instagramPostUrlFromHit(hit);
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= target * 2) break;
    }
    if (urls.length >= target * 2) break;
  }

  const hydrated = await hydratePostUrls(urls, target);

  if (hydrated.posts.length < target) {
    try {
      const reelsResp = await scrapeCreatorsPaginated("/v2/instagram/reels/search", { query, trim: "false" }, target);
      const reels = extractPostList(reelsResp).map((p) => normalizeInstagramPost(p)).filter(Boolean);
      hydrated.posts = sortPostsNewestFirst(dedupePosts([...hydrated.posts, ...reels])).slice(0, target);
      if (reelsResp?.credits_remaining != null) credits_remaining = reelsResp.credits_remaining;
    } catch (err) {
      console.warn("[Instagram] Reels keyword fallback failed:", err?.message || err);
    }
  }

  return {
    posts: hydrated.posts,
    credits_remaining: hydrated.credits_remaining ?? credits_remaining,
    source: "google_to_instagram_post",
  };
}

export async function lookupInstagramInput(input, maxResults = DEFAULT_LIMIT) {
  const parsed = parseInstagramInput(input);
  const limit = clampInt(maxResults, 1, 25, DEFAULT_LIMIT);

  if (parsed.type === "empty") {
    throw new Error("Please enter an Instagram @username, profile/post/reel URL, or keyword search.");
  }

  if (parsed.type === "account") {
    const profileResult = await scrapeInstagramProfile(parsed.handle || parsed.url);
    const profile = profileResult.profile;
    let posts = [];
    let postsCredits = null;

    const embeddedPosts = asArray(profile.posts).map((p) => normalizeInstagramPost(p, { username: profile.username, full_name: profile.full_name })).filter(Boolean);
    if (embeddedPosts.length >= limit) {
      posts = sortPostsNewestFirst(dedupePosts(embeddedPosts)).slice(0, limit);
    } else {
      const postsResult = await scrapeInstagramUserPosts(profile.username || parsed.handle, limit);
      posts = postsResult.posts;
      postsCredits = postsResult.credits_remaining;
    }

    return {
      success: true,
      platform: "instagram",
      mode: "account",
      input: parsed,
      results: {
        profile: { ...profile, posts: [] },
        userPosts: { posts },
      },
      errors: [],
      credits_remaining: postsCredits ?? profileResult.credits_remaining ?? null,
    };
  }

  if (parsed.type === "post") {
    const result = await scrapeInstagramPost(parsed.url);
    return {
      success: true,
      platform: "instagram",
      mode: "post",
      input: parsed,
      results: {
        singlePost: result.post,
      },
      errors: [],
      credits_remaining: result.credits_remaining ?? null,
    };
  }

  const searchResult = await searchInstagramKeywordPosts(parsed.query, limit);
  return {
    success: true,
    platform: "instagram",
    mode: "keyword",
    input: parsed,
    results: {
      searchPosts: searchResult.posts,
    },
    errors: [],
    credits_remaining: searchResult.credits_remaining ?? null,
  };
}
