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

  const at = raw.match(/^@([A-Za-z0-9._]{1,30})(?:\s+.*)?$/);
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
            url: canonicalProfileUrl(handle),
            source: "profile_url",
            includePosts: false,
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

function instagramPostKindFromUrl(url) {
  const text = String(url || "");
  const match = text.match(/instagram\.com\/(p|reel|tv)\//i);
  return match?.[1] || null;
}

function normalizeInstagramPostUrl(post = {}, code = "", isVideo = false) {
  const rawUrl = String(post.url || post.permalink || "").trim();
  const rawCode = shortcodeFromUrl(rawUrl);
  const finalCode = String(code || rawCode || "").trim();

  if (!finalCode) return null;

  const rawKind = instagramPostKindFromUrl(rawUrl);
  if (rawKind && rawCode && rawCode === finalCode) {
    return `https://www.instagram.com/${rawKind}/${finalCode}/`;
  }

  const isReel =
    post.product_type === "clips" ||
    post.__typename === "XDTGraphVideo" ||
    post.is_video === true ||
    post.media_type === 2 ||
    isVideo;

  return `https://www.instagram.com/${isReel ? "reel" : "p"}/${finalCode}/`;
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
  if (typeof value?.caption === "string") return value.caption;
  if (typeof value?.caption_text === "string") return value.caption_text;
  if (typeof value?.node?.text === "string") return value.node.text;
  if (Array.isArray(value?.edges)) {
    return value.edges.map((e) => e?.node?.text).filter(Boolean).join("\n");
  }
  return "";
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

function pickString(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickTimestamp(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = new Date(trimmed).getTime();
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

function findNestedStringByKey(root, keyMatchers = [], { maxDepth = 5 } = {}) {
  const seen = new WeakSet();
  const queue = [{ value: root, depth: 0, path: "root" }];

  while (queue.length) {
    const { value, depth, path } = queue.shift();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (depth > maxDepth) continue;

    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      const fullPath = `${path}.${key}`.toLowerCase();
      const isCandidate = keyMatchers.some((matcher) => matcher.test(lowerKey) || matcher.test(fullPath));

      if (isCandidate && typeof child === "string" && child.trim()) return child.trim();
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1, path: fullPath });
    }
  }

  return "";
}

function findNestedNumberByKey(root, keyMatchers = [], { maxDepth = 6 } = {}) {
  const seen = new WeakSet();
  const queue = [{ value: root, depth: 0, path: "root" }];

  while (queue.length) {
    const { value, depth, path } = queue.shift();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (depth > maxDepth) continue;

    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      const fullPath = `${path}.${key}`.toLowerCase();

      // Avoid accidentally treating IDs or URLs as metrics.
      if (/(id|fbid|pk|url|uri|link|shortcode|code)$/.test(lowerKey)) {
        if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1, path: fullPath });
        continue;
      }

      const isCandidate = keyMatchers.some((matcher) => matcher.test(lowerKey) || matcher.test(fullPath));
      if (isCandidate) {
        const picked = pickNumber(child);
        if (picked != null && picked >= 0 && picked < 10_000_000_000) return picked;
      }

      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1, path: fullPath });
    }
  }

  return null;
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

function urlFromCandidates(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (typeof value === "object") {
      const candidate = value.url || value.src || value.uri;
      if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
    }
  }
  return null;
}

function isLikelyMediaUrl(value) {
  if (!value || typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return (
      host.includes("cdninstagram") ||
      host.includes("fbcdn") ||
      /\.(jpg|jpeg|png|webp|gif|mp4|mov)(\?|$)/i.test(path)
    );
  } catch {
    return false;
  }
}

function shouldSkipMediaPath(path = "") {
  const p = path.toLowerCase();
  return p.includes("profile_pic") || p.includes("profilepicture") || p.includes("avatar") || p.includes("owner.profile") || p.includes("user.profile");
}

function normalizeInstagramMedia(rawMedia, fallbackKey = "media") {
  if (!rawMedia) return null;
  const item = rawMedia.node || rawMedia.media || rawMedia;

  const isVideo =
    item.media_type === 2 ||
    item.mediaType === 2 ||
    item.product_type === "clips" ||
    item.is_video === true ||
    Boolean(item.video_url || item.videoUrl || item.video_versions || item.video_versions2);

  const videoUrl = urlFromCandidates(
    item.video_url,
    item.videoUrl,
    bestVideo(item.video_versions),
    bestVideo(item.video_versions2),
    item.video?.url,
    item.video?.src,
  );

  const imageUrl = urlFromCandidates(
    item.display_url,
    item.displayUrl,
    item.thumbnail_src,
    item.thumbnail_url,
    item.thumbnailUrl,
    item.thumbnail,
    item.image_url,
    item.imageUrl,
    item.image,
    item.picture,
    item.photo,
    item.photo_url,
    item.photoUrl,
    item.image_versions2?.candidates?.[0]?.url,
    item.display_resources?.[0]?.src,
    item.graphql?.shortcode_media?.display_url,
    item.graphql?.shortcode_media?.displayUrl,
    item.cover_url,
    item.coverUrl,
    item.cover,
    item.src,
    item.media_url,
    item.mediaUrl,
    item.url,
    bestCandidate(item.display_resources),
    bestCandidate(item.image_versions2?.candidates),
    bestCandidate(item.image_versions?.candidates),
    bestCandidate(item.thumbnail_resources),
  );

  const url = isVideo ? (videoUrl || imageUrl) : imageUrl;
  const preview = imageUrl || item.preview_image_url || item.previewImageUrl || url || null;

  if (!url && !preview) return null;

  return {
    media_key: String(item.id || item.pk || item.code || item.shortcode || item.media_key || fallbackKey),
    type: isVideo ? "video" : "photo",
    url: url || preview,
    preview_image_url: preview || url,
    width: item.original_width || item.width || item.dimensions?.width || null,
    height: item.original_height || item.height || item.dimensions?.height || null,
    variants: videoUrl ? [{ content_type: "video/mp4", url: videoUrl, width: item.width || null }] : [],
  };
}

function collectNestedInstagramMedia(root, limit = 30) {
  const out = [];
  const seenObjects = new WeakSet();

  function visit(value, path = "root") {
    if (!value || out.length >= limit) return;
    if (typeof value === "string") {
      if (!shouldSkipMediaPath(path) && isLikelyMediaUrl(value)) {
        const isVideo = /\.(mp4|mov)(\?|$)/i.test(value);
        out.push(normalizeInstagramMedia({
          id: `${path}-${out.length}`,
          media_type: isVideo ? 2 : 1,
          url: value,
          video_url: isVideo ? value : null,
          image_url: isVideo ? null : value,
        }, `${path}-${out.length}`));
      }
      return;
    }

    if (typeof value !== "object") return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    if (!shouldSkipMediaPath(path)) {
      const normalized = normalizeInstagramMedia(value, `${path}-${out.length}`);
      if (normalized) out.push(normalized);
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}.${index}`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (out.length >= limit) break;
      visit(child, `${path}.${key}`);
    }
  }

  visit(root);
  return out.filter(Boolean);
}

function extractMedia(post = {}) {
  const carouselCandidates = [
    ...asArray(post.carousel_media),
    ...asArray(post.carousel_media_items),
    ...asArray(post.carouselMedia),
    ...asArray(post.carousel?.items),
    ...asArray(post.carousel),
    ...asArray(post.children),
    ...asArray(post.child_media),
    ...asArray(post.resources),
    ...asArray(post.sidecar_children),
    ...asArray(post.edge_sidecar_to_children?.edges).map((e) => e?.node).filter(Boolean),
    ...asArray(post.edge_sidecar_to_children?.edges).map((e) => e?.node?.media).filter(Boolean),
  ];

  const directItems = carouselCandidates.length ? carouselCandidates : [post];
  const directMedia = directItems
    .map((m, index) => normalizeInstagramMedia(m?.node || m, `${post.id || post.pk || post.code || "ig"}-${index}`))
    .filter(Boolean);

  const deepMedia = collectNestedInstagramMedia(post, 40);
  const media = [...directMedia, ...deepMedia];

  const seen = new Set();
  return media.filter((m) => {
    const rawKey = m.url || m.preview_image_url || m.media_key;
    let key = String(rawKey || "");
    try {
      const parsed = new URL(key);
      parsed.searchParams.delete("se");
      parsed.searchParams.delete("stp");
      parsed.searchParams.delete("_nc_cat");
      parsed.searchParams.delete("_nc_ht");
      parsed.searchParams.delete("_nc_sid");
      key = `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
      key = key.split("?")[0].toLowerCase();
    }
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeInstagramPost(value = {}) {
  if (!value || typeof value !== "object") return false;
  return Boolean(
    value.code ||
    value.shortcode ||
    value.short_code ||
    value.shortCode ||
    value.pk ||
    value.media_id ||
    value.mediaId ||
    value.caption ||
    value.owner ||
    value.user ||
    value.author ||
    value.media_type != null ||
    value.mediaType != null ||
    value.product_type ||
    value.like_count != null ||
    value.likeCount != null ||
    value.likes != null ||
    value.comment_count != null ||
    value.commentCount != null ||
    value.comments != null ||
    value.taken_at ||
    value.taken_at_timestamp ||
    value.image_versions2 ||
    value.video_versions ||
    value.carousel_media
  );
}

function unwrapPost(raw = {}) {
  if (looksLikeInstagramPost(raw)) return raw;

  return (
    raw?.node ||
    raw?.media ||
    raw?.item ||
    raw?.result ||
    raw?.response ||
    raw?.data?.xdt_shortcode_media ||
    raw?.data?.shortcode_media ||
    raw?.data?.graphql?.shortcode_media ||
    raw?.graphql?.shortcode_media ||
    raw?.data?.media ||
    raw?.data?.post ||
    raw?.data?.result ||
    raw?.data?.response ||
    raw?.data?.items?.[0] ||
    raw?.items?.[0] ||
    raw?.post ||
    raw?.data ||
    raw
  );
}

function instagramEmbedUrl(url) {
  const text = String(url || "").trim();
  if (!text) return null;
  const match = text.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
}

export function normalizeInstagramPost(raw = {}, fallbackAuthor = {}) {
  const post = unwrapPost(raw) || {};
  const caption = extractCaption(post);
  const code = pickString(
    post.code,
    post.shortcode,
    post.short_code,
    post.shortCode,
    post.media?.code,
    post.media?.shortcode,
    shortcodeFromUrl(post.url || post.permalink || post.shortcode_url || post.link)
  );
  const id = String(post.pk || post.id || post.media_id || post.mediaId || post.fbid || code || Date.now());

  // ScrapeCreators can put the creator in several places depending on endpoint:
  // user posts usually have user/owner, reels search commonly has owner, and
  // some detail/list responses only include caption.user. Keep all fallbacks so
  // the UI never has to guess and show @unknown when the account is present.
  const owner =
    post.user ||
    post.owner ||
    post.author ||
    post.account ||
    post.profile ||
    post.caption?.user ||
    post.caption?.owner ||
    post.media?.user ||
    post.media?.owner ||
    fallbackAuthor ||
    {};

  const username = cleanHandle(
    owner.username ||
      owner.handle ||
      owner.user_name ||
      owner.userName ||
      post.username ||
      post.handle ||
      post.ownerUsername ||
      post.owner_username ||
      post.authorUsername ||
      post.author_username ||
      post.user_username ||
      post.user_name ||
      post.profile_username ||
      post.account_username ||
      post.caption?.user?.username ||
      post.caption?.owner?.username ||
      fallbackAuthor.username ||
      fallbackAuthor.handle ||
      fallbackAuthor.user_name ||
      findNestedStringByKey(post, [/^username$/, /owner\.username$/, /user\.username$/, /author\.username$/]) ||
      ""
  );

  const media = extractMedia(post);
  const isVideo = post.media_type === 2 || post.mediaType === 2 || post.is_video === true || post.__typename === "XDTGraphVideo" || media.some((m) => m.type === "video");
  const url = normalizeInstagramPostUrl(post, code, isVideo);
  const takenAt = pickTimestamp(
    post.taken_at,
    post.taken_at_timestamp,
    post.timestamp,
    post.created_at,
    post.createdAt,
    post.date,
    post.caption?.created_at,
    post.caption?.created_at_utc
  );

  const likeCount = pickNumber(
    post.like_count,
    post.likeCount,
    post.likesCount,
    post.likes_count,
    post.likes,
    post.like_and_view_counts?.like_count,
    post.edge_media_preview_like?.count,
    post.edge_liked_by?.count,
    post.metrics?.like_count,
    post.metrics?.likeCount,
    post.metrics?.likes,
    post.insights?.like_count,
    findNestedNumberByKey(post, [/^like_count$/, /^likecount$/, /^likes_count$/, /^likes$/])
  );

  const commentCount = pickNumber(
    post.comment_count,
    post.commentCount,
    post.commentsCount,
    post.comments_count,
    post.num_comments,
    post.comments,
    post.edge_media_to_comment?.count,
    post.edge_media_to_parent_comment?.count,
    post.metrics?.comment_count,
    post.metrics?.commentCount,
    post.metrics?.comments,
    post.insights?.comment_count,
    findNestedNumberByKey(post, [/^comment_count$/, /^commentcount$/, /^comments_count$/, /^comments$/, /^num_comments$/])
  );

  const {
    play_count: _playCount,
    playCount: _playCountCamel,
    plays: _plays,
    ig_play_count: _igPlayCount,
    fb_play_count: _fbPlayCount,
    video_play_count: _videoPlayCount,
    videoPlayCount: _videoPlayCountCamel,
    view_count: _viewCount,
    viewCount: _viewCountCamel,
    views: _views,
    video_view_count: _videoViewCount,
    videoViewCount: _videoViewCountCamel,
    ...postWithoutViewMetrics
  } = post;

  const normalizedUser = {
    ...owner,
    username,
    full_name: owner.full_name || owner.fullName || owner.name || fallbackAuthor.full_name || fallbackAuthor.name || username,
    profile_pic_url:
      owner.profile_pic_url ||
      owner.profile_pic_url_hd ||
      owner.profileImage ||
      owner.hd_profile_pic_url_info?.url ||
      fallbackAuthor.profile_pic_url ||
      fallbackAuthor.image ||
      null,
  };

  return {
    ...postWithoutViewMetrics,
    id,
    pk: post.pk || id,
    code,
    shortcode: code,
    url,
    permalink: url,
    embed_url: instagramEmbedUrl(url),
    caption: { ...(typeof post.caption === "object" && post.caption ? post.caption : {}), text: caption },
    text: caption,
    taken_at: takenAt,
    taken_at_timestamp: takenAt,
    created_at: takenAt,
    media_type: post.media_type ?? post.mediaType ?? (isVideo ? 2 : media.length > 1 ? 8 : 1),
    is_video: isVideo,
    carousel_media_count: post.carousel_media_count || post.carouselMediaCount || media.length,
    like_count: likeCount,
    likes: likeCount,
    comment_count: commentCount,
    comments: commentCount,
    media,
    image_url: media.find((m) => m.type === "photo")?.url || media[0]?.preview_image_url || null,
    video_url: media.find((m) => m.type === "video")?.url || post.video_url || post.videoUrl || null,
    user: normalizedUser,
    owner: post.owner || normalizedUser,
    username,
    handle: username,
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
  const rawPosts = extractPostList(resp);
  const hydrated = await hydrateInstagramPostsIfNeeded(rawPosts, { username: handle }, target);
  return {
    posts: sortPostsNewestFirst(dedupePosts(hydrated.posts)).slice(0, target),
    credits_remaining: hydrated.credits_remaining ?? resp?.credits_remaining ?? null,
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

function shouldHydrateInstagramPost(post = {}) {
  const expectedCarouselCount = Number(post.carousel_media_count || 0);
  const mediaCount = Array.isArray(post.media) ? post.media.length : 0;
  return (
    !mediaCount ||
    (expectedCarouselCount > 1 && mediaCount < expectedCarouselCount) ||
    post.comment_count == null
  );
}

function mergeHydratedInstagramPost(base = {}, detailed = {}) {
  if (!detailed) return base;
  return {
    ...base,
    ...detailed,
    media: Array.isArray(detailed.media) && detailed.media.length ? detailed.media : base.media,
    text: detailed.text || base.text,
    caption: detailed.caption?.text ? detailed.caption : base.caption,
    like_count: detailed.like_count ?? base.like_count,
    comment_count: detailed.comment_count ?? base.comment_count,
    user: detailed.user?.username ? detailed.user : base.user,
    url: detailed.url || base.url,
    permalink: detailed.permalink || base.permalink,
  };
}

async function hydrateInstagramPostsIfNeeded(posts = [], fallbackAuthor = {}, limit = DEFAULT_LIMIT) {
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const out = [];
  let credits_remaining = null;

  for (const post of posts.slice(0, target)) {
    let normalized = normalizeInstagramPost(post, fallbackAuthor);

    if (shouldHydrateInstagramPost(normalized) && normalized.url) {
      try {
        const detail = await scrapeInstagramPost(normalized.url, fallbackAuthor);
        normalized = mergeHydratedInstagramPost(normalized, detail.post);
        if (detail?.credits_remaining != null) credits_remaining = detail.credits_remaining;
      } catch (err) {
        console.warn("[Instagram] Detail hydration failed; keeping list result:", {
          url: normalized.url,
          message: err?.message,
          status: err?.status,
        });
      }
    }

    out.push(normalized);
  }

  return { posts: out, credits_remaining };
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

export async function scrapeInstagramUserReels(handleOrUrl, limit = DEFAULT_LIMIT) {
  const handle = cleanHandle(handleOrUrl);
  const target = clampInt(limit, 1, 25, DEFAULT_LIMIT);
  const resp = await scrapeCreatorsPaginated("/v1/instagram/user/reels", { handle, trim: "false" }, target);
  const rawReels = extractPostList(resp);
  const hydrated = await hydrateInstagramPostsIfNeeded(rawReels, { username: handle }, target);
  return {
    reels: sortPostsNewestFirst(dedupePosts(hydrated.posts)).slice(0, target),
    credits_remaining: hydrated.credits_remaining ?? resp?.credits_remaining ?? null,
  };
}

export async function lookupInstagramAdvanced(options = {}, inputs = {}, maxResults = DEFAULT_LIMIT) {
  const limit = clampInt(maxResults, 1, 25, DEFAULT_LIMIT);
  const results = {};
  const errors = [];
  let credits_remaining = null;

  async function capture(label, fn, onSuccess) {
    try {
      const value = await fn();
      if (value?.credits_remaining != null) credits_remaining = value.credits_remaining;
      onSuccess(value);
    } catch (err) {
      errors.push({ endpoint: label, error: err?.message || String(err) });
    }
  }

  const profileHandle = cleanHandle(inputs.username);
  const postsHandle = cleanHandle(inputs.userPostsUsername || inputs.username);
  const reelsHandle = cleanHandle(inputs.userReelsUsername || inputs.userPostsUsername || inputs.username);
  const keyword = String(inputs.reelsSearchTerm || inputs.keyword || inputs.query || "").trim();
  const postUrl = String(inputs.postUrl || "").trim();
  const highlightHandle = cleanHandle(inputs.highlightUrl || inputs.username);

  if (options.profile && profileHandle) {
    await capture("profile", () => scrapeInstagramProfile(profileHandle), (value) => {
      results.profile = { ...(value.profile || {}), posts: [] };
    });
  }

  if (options.userPosts && postsHandle) {
    await capture("userPosts", () => scrapeInstagramUserPosts(postsHandle, limit), (value) => {
      results.userPosts = { posts: value.posts || [] };
    });
  }

  if (options.singlePost && postUrl) {
    await capture("singlePost", () => scrapeInstagramPost(postUrl), (value) => {
      results.singlePost = value.post;
    });
  }

  if (options.reelsSearch && keyword) {
    await capture("reelsSearch", () => searchInstagramKeywordPosts(keyword, limit), (value) => {
      // Advanced UI historically renders this checkbox under `reelsSearch`.
      // The posts are normalized the same way as keyword `searchPosts` so the
      // card can read creator/date/likes/comments consistently.
      results.reelsSearch = { reels: value.posts || [] };
    });
  }

  if (options.userReels && reelsHandle) {
    await capture("userReels", () => scrapeInstagramUserReels(reelsHandle, limit), (value) => {
      results.userReels = { reels: value.reels || [] };
    });
  }

  if (options.highlightDetail && highlightHandle) {
    await capture("highlightDetail", () => scrapeCreators("/v1/instagram/user/highlights", { handle: highlightHandle }), (value) => {
      results.highlightDetail = value;
    });
  }

  if (!Object.keys(results).length && !errors.length) {
    throw new Error("No Instagram options selected or inputs provided.");
  }

  return {
    success: true,
    platform: "instagram",
    mode: "advanced",
    results,
    errors,
    credits_remaining,
  };
}

export async function lookupInstagramInput(input, maxResults = DEFAULT_LIMIT) {
  const parsed = parseInstagramInput(input);
  const limit = clampInt(maxResults, 1, 25, DEFAULT_LIMIT);

  if (parsed.type === "empty") {
    throw new Error("Please enter an Instagram @username, profile/post/reel URL, or keyword search.");
  }

  if (parsed.type === "account") {
    const errors = [];
    let profileResult = null;
    let profile = null;
    let posts = [];
    let postsCredits = null;
    const includePosts = parsed.includePosts === true || parsed.source === "handle";

    try {
      profileResult = await scrapeInstagramProfile(parsed.handle || parsed.url);
      profile = profileResult.profile;
    } catch (err) {
      errors.push({ endpoint: "profile", error: err?.message || String(err) });
      profile = {
        username: parsed.handle || cleanHandle(parsed.url),
        full_name: parsed.handle || cleanHandle(parsed.url),
        url: parsed.url || canonicalProfileUrl(parsed.handle),
        posts: [],
      };
    }

    const usernameForPosts = profile?.username || parsed.handle || cleanHandle(parsed.url);

    if (includePosts) {
      try {
        const embeddedRawPosts = asArray(profile?.posts);
        const embeddedHydrated = embeddedRawPosts.length
          ? await hydrateInstagramPostsIfNeeded(embeddedRawPosts, { username: usernameForPosts, full_name: profile?.full_name }, limit)
          : { posts: [] };
        const embeddedPosts = embeddedHydrated.posts || [];
        if (embeddedPosts.length >= limit) {
          posts = sortPostsNewestFirst(dedupePosts(embeddedPosts)).slice(0, limit);
          postsCredits = embeddedHydrated.credits_remaining;
        } else if (usernameForPosts) {
          const postsResult = await scrapeInstagramUserPosts(usernameForPosts, limit);
          posts = postsResult.posts || [];
          postsCredits = postsResult.credits_remaining;
        }
      } catch (err) {
        errors.push({ endpoint: "userPosts", error: err?.message || String(err) });
        posts = [];
      }
    }

    return {
      success: true,
      platform: "instagram",
      mode: includePosts ? "account_with_posts" : "account",
      input: parsed,
      results: {
        profile: { ...profile, posts: [] },
        ...(includePosts ? { userPosts: { posts } } : {}),
      },
      errors,
      credits_remaining: postsCredits ?? profileResult?.credits_remaining ?? null,
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
