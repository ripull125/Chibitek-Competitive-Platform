import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon, Alert, AspectRatio, Avatar, Badge, Button, Card, Collapse, Divider,
  Group, LoadingOverlay, Modal, Paper, Select, SimpleGrid, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import {
  IconBrandInstagram, IconBrandLinkedin, IconBrandReddit,
  IconBrandTiktok, IconBrandX, IconBrandYoutube,
  IconChevronDown, IconChevronUp,
  IconExternalLink, IconHeart,
  IconMessage, IconRepeat, IconTrash,
} from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

/* ── auth helpers ─────────────────────────────────────────────────────────── */

async function getAuthSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

async function getPublicUserId() {
  const session = await getAuthSession();
  const authUserId = session?.user?.id || null;
  if (!session?.access_token) return authUserId;

  try {
    const response = await fetch(apiUrl("/api/auth/access"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json().catch(() => ({}));
    return payload?.user_id || authUserId;
  } catch {
    return authUserId;
  }
}

async function authHeaders() {
  const session = await getAuthSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function formatDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function Metric({ icon, value }) {
  const label = value == null || value === "" ? "—" : Number(value || 0).toLocaleString();
  return (
    <Group gap={4} wrap="nowrap">
      {icon}
      <Text size="xs" c="dimmed" lh={1}>{label}</Text>
    </Group>
  );
}


const DEFAULT_SORT_MODE = "date_desc";
const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "metrics_desc", label: "Highest total metrics" },
  { value: "likes_desc", label: "Most likes" },
  { value: "comments_desc", label: "Most comments" },
  { value: "shares_desc", label: "Most shares" },
];

function parseMetricValue(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return 0;
  const match = text.match(/^(-?[0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }
  const base = Number(match[1]);
  const suffix = String(match[2] || "").toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Number.isFinite(base) ? Math.max(0, Math.round(base * multiplier)) : 0;
}

function getSortableDate(post = {}) {
  const raw = post.published_at ?? post.publishedAt ?? post.datePublished ?? post.created_at ?? post.createdAt ?? post.created_utc ?? post.created ?? post.timestamp ?? post.extra?.published_at;
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSortableLikes(post = {}) {
  return parseMetricValue(post.likes ?? post.extra?.likes ?? post.extra?.like_count ?? post.extra?.likeCount ?? 0);
}

function getSortableComments(post = {}) {
  return parseMetricValue(post.comments ?? post.extra?.comments ?? post.extra?.comment_count ?? post.extra?.commentCount ?? 0);
}

function getSortableShares(post = {}) {
  return parseMetricValue(post.shares ?? post.extra?.shares ?? post.extra?.share_count ?? post.extra?.shareCount ?? 0);
}

function getSortableTotalMetrics(post = {}) {
  return getSortableLikes(post) + getSortableComments(post) + getSortableShares(post);
}

function sortPostsForDisplay(posts = [], sortMode = DEFAULT_SORT_MODE) {
  if (!Array.isArray(posts)) return [];
  const mode = sortMode || DEFAULT_SORT_MODE;
  const decorated = posts.map((post, index) => ({ post, index }));

  decorated.sort((a, b) => {
    let diff = 0;
    if (mode === "date_asc") diff = getSortableDate(a.post) - getSortableDate(b.post);
    else if (mode === "metrics_desc") diff = getSortableTotalMetrics(b.post) - getSortableTotalMetrics(a.post);
    else if (mode === "likes_desc") diff = getSortableLikes(b.post) - getSortableLikes(a.post);
    else if (mode === "comments_desc") diff = getSortableComments(b.post) - getSortableComments(a.post);
    else if (mode === "shares_desc") diff = getSortableShares(b.post) - getSortableShares(a.post);
    else diff = getSortableDate(b.post) - getSortableDate(a.post);

    return diff || a.index - b.index;
  });

  return decorated.map(({ post }) => post);
}

function SortSelect({ value, onChange }) {
  const { t } = useTranslation();
  const translatedOptions = SORT_OPTIONS.map((option) => ({
    ...option,
    label: t(`savedPosts.sortOptions.${option.value}`, { defaultValue: option.label }),
  }));

  return (
    <Select
      aria-label={t("savedPosts.sortSavedPosts", { defaultValue: "Sort saved posts" })}
      size="xs"
      value={value}
      onChange={(next) => onChange(next || DEFAULT_SORT_MODE)}
      data={translatedOptions}
      allowDeselect={false}
      checkIconPosition="right"
      w={190}
    />
  );
}


function cleanXImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  return url.replace("_normal", "_400x400");
}

function bestVideoVariant(variants = []) {
  if (!Array.isArray(variants)) return null;

  const normalized = variants
    .filter((v) => v?.url)
    .map((v) => ({
      ...v,
      _contentType: String(v.content_type || v.contentType || v.mime_type || v.type || "").toLowerCase(),
      _url: String(v.url || ""),
    }));

  const mp4s = normalized
    .filter((v) => v._contentType.includes("mp4") || /\.mp4(?:\?|$)/i.test(v._url))
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));

  // Native <video> plays MP4 reliably. HLS may work in Safari, but Chrome usually
  // needs hls.js, so use HLS only as a last resort.
  const hls = normalized.find((v) => v._contentType.includes("mpegurl") || /\.m3u8(?:\?|$)/i.test(v._url));

  return mp4s[0]?.url || hls?.url || null;
}

function normalizeMediaUrlKey(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("format");
    parsed.searchParams.delete("name");
    parsed.searchParams.delete("tag");
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(url).split("?")[0].toLowerCase();
  }
}

function instagramEmbedUrl(url) {
  const text = String(url || "").trim();
  const match = text.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
}

function mediaQualityScore(item = {}) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const url = String(item.url || item.preview_image_url || "");
  let score = width * height;
  if (/name=(orig|4096x4096|large)/i.test(url)) score += 1_000_000;
  if (item.type === "video" || item.type === "animated_gif") score += 500_000;
  return score;
}

function dedupeMediaForDisplay(media = [], maxItems = 4) {
  const byKey = new Map();

  for (const item of Array.isArray(media) ? media : []) {
    if (!item) continue;
    const urlKey = normalizeMediaUrlKey(item.url || item.preview_image_url);
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

  return values.slice(0, maxItems);
}

function cleanDisplayTextForMedia(text = "", mediaItems = []) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (!mediaItems?.length) return raw;

  return raw
    .replace(/(?:\s|^)https?:\/\/t\.co\/[A-Za-z0-9_]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function XMediaPreview({ media, postUrl = null, maxItems = 4, videoLabel = null, embedFallbackUrl = null }) {
  const { t } = useTranslation();
  const resolvedVideoLabel = videoLabel || t("savedPosts.openVideoOnX");
  const items = dedupeMediaForDisplay(media, maxItems);
  if (!items.length) {
    const embedUrl = embedFallbackUrl ? instagramEmbedUrl(embedFallbackUrl) : null;
    if (!embedUrl) return null;

    return (
      <div style={{ maxWidth: 420, width: "100%" }}>
        <iframe
          src={embedUrl}
          title={t("savedPosts.instagramPostMedia")}
          loading="lazy"
          style={{
            width: "100%",
            height: 320,
            border: "1px solid #edf2f7",
            borderRadius: 10,
            background: "#fff",
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: items.length === 1 ? 420 : 560, width: "100%" }}>
      <SimpleGrid cols={items.length === 1 ? 1 : 2} spacing="xs">
        {items.map((item, index) => {
          const key = item.media_key || item.url || item.preview_image_url || index;
          const isVideo = item.type === "video" || item.type === "animated_gif";
          const videoUrl = bestVideoVariant(item.variants);
          const imageUrl = item.url || item.preview_image_url;

          const mediaStyle = {
            width: "100%",
            maxHeight: 180,
            objectFit: "contain",
            borderRadius: 10,
            background: isVideo ? "#000" : "#f8f9fa",
            display: "block",
            border: "1px solid #edf2f7",
          };

          if (isVideo && videoUrl) {
            return (
              <video
                key={key}
                controls
                playsInline
                preload="metadata"
                poster={item.preview_image_url || undefined}
                style={mediaStyle}
              >
                <source src={videoUrl} type={/\.m3u8(?:\?|$)/i.test(videoUrl) ? "application/vnd.apple.mpegurl" : "video/mp4"} />
              </video>
            );
          }

          if (imageUrl) {
            const image = (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                style={mediaStyle}
              />
            );

            if (isVideo && postUrl) {
              return (
                <a key={key} href={postUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative" }}>
                  {image}
                  <span
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: 8,
                      background: "rgba(0,0,0,0.72)",
                      color: "white",
                      borderRadius: 999,
                      padding: "3px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {resolvedVideoLabel}
                  </span>
                </a>
              );
            }

            return <div key={key}>{image}</div>;
          }

          return null;
        })}
      </SimpleGrid>

    </div>
  );
}

function isUsableInstagramImageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) && !/\.(mp4|mov|m3u8)(\?|$)/i.test(url);
}

function InstagramMediaPreview({ media, postUrl = null }) {
  const { t } = useTranslation();
  const items = dedupeMediaForDisplay(media, 10);
  const imageItems = items
    .map((item, index) => {
      const isVideo = item?.type === "video" || item?.type === "animated_gif";
      const imageUrl = item?.preview_image_url || (!isVideo ? item?.url : null);
      return imageUrl && isUsableInstagramImageUrl(imageUrl)
        ? { ...item, _displayUrl: imageUrl, _displayKey: item.media_key || imageUrl || index }
        : null;
    })
    .filter(Boolean);

  const hasHiddenMedia = items.length > imageItems.length;

  if (!imageItems.length) {
    if (!postUrl) return null;
    return (
      <Card withBorder radius="md" p="sm" bg="gray.0" style={{ maxWidth: 460, width: "100%" }}>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("savedPosts.instagramPreviewUnavailable")}
          </Text>
          <Text size="xs" c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
            {t("savedPosts.viewInstagramMedia")}
          </Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap={6} style={{ maxWidth: imageItems.length === 1 ? 360 : 520, width: "100%" }}>
      <SimpleGrid cols={imageItems.length === 1 ? 1 : 2} spacing="xs">
        {imageItems.map((item, index) => (
          <img
            key={item._displayKey || index}
            src={item._displayUrl}
            alt=""
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            style={{
              width: "100%",
              maxHeight: 170,
              objectFit: "contain",
              borderRadius: 10,
              display: "block",
              background: "#f8f9fa",
              border: "1px solid #edf2f7",
            }}
          />
        ))}
      </SimpleGrid>
      {(hasHiddenMedia || postUrl) && (
        <Text size="xs" c="dimmed">
          {t("savedPosts.someInstagramMediaMayNotPreview")} {postUrl && (
            <Text span c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
              {t("savedPosts.viewPostArrow")}
            </Text>
          )}
        </Text>
      )}
    </Stack>
  );
}

function getTrimmedPreview(value, threshold) {
  if (!value || value.length <= threshold) return value;

  const hardCut = value.slice(0, threshold);
  const lastSpace = Math.max(
    hardCut.lastIndexOf(" "),
    hardCut.lastIndexOf("\n"),
    hardCut.lastIndexOf("\t")
  );

  const cutAt = lastSpace > threshold * 0.65 ? lastSpace : threshold;
  return value.slice(0, cutAt).trimEnd() + "…";
}

function ExpandablePostText({ text, threshold = 260, dimmed = false }) {
  const [expanded, setExpanded] = useState(false);
  const value = String(text || "").trim();
  const isLong = value.length > threshold;

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  if (!value) return null;

  const visibleText = isLong && !expanded
    ? getTrimmedPreview(value, threshold)
    : value;

  return (
    <Stack gap={4}>
      <Text
        component="div"
        size="sm"
        c={dimmed ? "dimmed" : undefined}
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.55,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {visibleText}
      </Text>

      {isLong && (
        <Button
          type="button"
          variant="subtle"
          size="compact-sm"
          px={0}
          leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          style={{ alignSelf: "flex-start" }}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </Stack>
  );
}


function instagramIdToShortcode(id) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // Handle cases like "12345_67890"
  const cleanId = id.toString().split("_")[0];

  let num = BigInt(cleanId);
  let shortcode = "";

  while (num > 0n) {
    const remainder = Number(num % 64n);
    shortcode = alphabet[remainder] + shortcode;
    num = num / 64n;
  }

  return shortcode;
}

function isInstagramPostUrl(value) {
  return /instagram\.com\/(p|reel|tv)\//i.test(String(value || ""));
}

// Build URL to the original post on its platform 
function getPostUrl(post) {
  // Prefer real stored platform URLs. Do not blindly trust guessed Instagram URLs.
  if (post.platform_id === 3) {
    if (isInstagramPostUrl(post.url)) return post.url;
    if (isInstagramPostUrl(post.extra?.url)) return post.extra.url;
    if (isInstagramPostUrl(post.extra?.permalink)) return post.extra.permalink;
  } else if (post.url) {
    return post.url;
  }

  const pid = post.platform_post_id;
  if (!pid) return null;

  const platformId = post.platform_id;

  // X
  if (platformId === 1 || platformId === 4) {
    return `https://x.com/i/web/status/${pid}`;
  }

  // Instagram
  if (platformId === 3) {
    const shortcode = post.extra?.shortcode || post.extra?.code;

    if (shortcode) {
      const isReel =
        post.extra?.is_video === true ||
        post.extra?.type === "reel" ||
        post.extra?.product_type === "clips";

      return `https://www.instagram.com/${isReel ? "reel" : "p"}/${shortcode}/`;
    }

    // Do not guess Instagram URLs from numeric IDs. That can open the wrong post.
    return null;
  }

  // TikTok
  if (platformId === 5) {
    const user = post.username || post.extra?.username || post.extra?.author_handle;
    return user
      ? `https://www.tiktok.com/@${user}/video/${pid}`
      : `https://www.tiktok.com/video/${pid}`;
  }

  // YouTube
  if (platformId === 8) {
    const vid = post.extra?.videoId || pid;
    return `https://www.youtube.com/watch?v=${vid}`;
  }

  // Reddit. Some deployments use id 6, others use id 10 depending on seed/migration order.
  if (platformId === 6 || platformId === 10 || String(post.platform_name || post.platform || '').toLowerCase() === 'reddit') {
    const directUrl = post.url || post.extra?.url || post.extra?.permalink;
    if (directUrl && /^https?:\/\//i.test(String(directUrl))) return directUrl;
    if (post.extra?.permalink) return `https://www.reddit.com${post.extra.permalink}`;
    const subreddit = post.extra?.subreddit || post.subreddit;
    const cleanPid = String(pid || '').replace(/^t3_/, '');
    if (subreddit && cleanPid) return `https://www.reddit.com/r/${subreddit}/comments/${cleanPid}`;
    if (cleanPid) return `https://www.reddit.com/comments/${cleanPid}`;
  }

  return null;
}
/* ── X / Twitter card ────────────────────────────────────────────────────── */

function XPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const tone = post.tone;
  const postUrl = getPostUrl(post);
  const extra = post.extra || {};
  const handle = String(extra.author_handle || extra.username || post.username || "").replace(/^@/, "");
  const name = extra.author_name || handle || t("savedPosts.unknown");
  const avatarUrl = cleanXImageUrl(extra.author_profile_image_url || extra.profile_image_url);
  const mediaItems = dedupeMediaForDisplay(extra.media);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #1d9bf0" }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Avatar src={avatarUrl} radius="xl" size={38} color="blue">
              {(name || handle || "?")[0].toUpperCase()}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>{name}</Text>
              {handle && <Text size="xs" c="dimmed" lh={1.2}>@{handle}</Text>}
              {post.published_at && <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandX size={18} style={{ opacity: 0.55 }} />
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <ExpandablePostText text={cleanDisplayTextForMedia(post.content, mediaItems)} threshold={220} />

        <XMediaPreview media={mediaItems} postUrl={postUrl} />

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />

        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#e0245e" />} value={post.likes} />
          <Metric icon={<IconRepeat size={14} color="#17bf63" />} value={post.shares} />
          <Metric icon={<IconMessage size={14} color="#1d9bf0" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── YouTube card ────────────────────────────────────────────────────────── */

function getYoutubeThumbnailUrl(thumbnails = null) {
  if (!thumbnails) return null;
  if (typeof thumbnails === "string") return thumbnails;
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

function getYoutubeVideoIdFromSavedPost(post = {}, postUrl = null) {
  const extra = post?.extra || {};
  const direct =
    extra.videoId ||
    extra.youtubeVideoId ||
    extra.id?.videoId ||
    post.youtubeVideoId ||
    post.videoId ||
    post.platform_post_id;

  if (typeof direct === "string" && /^[a-zA-Z0-9_-]{11}$/.test(direct)) {
    return direct;
  }

  const candidates = [
    postUrl,
    post.url,
    extra.url,
    extra.link,
    extra.videoUrl,
    extra.embedUrl,
    extra.permalink,
  ].filter(Boolean);

  for (const raw of candidates) {
    const url = String(raw);
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match?.[1]) return match[1];

    try {
      const parsed = new URL(url);
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    } catch {
      // Ignore non-URL values.
    }
  }

  return null;
}

function getYoutubeEmbedUrl(videoId) {
  if (!videoId) return null;
  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (origin) params.set("origin", origin);
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function YoutubeThumbnailPreview({ post, postUrl = null }) {
  const { t } = useTranslation();
  const extra = post?.extra || {};
  const videoId = getYoutubeVideoIdFromSavedPost(post, postUrl);
  const thumbUrl = extra.thumbnailUrl || getYoutubeThumbnailUrl(extra.thumbnails);
  const [showPlayer, setShowPlayer] = useState(false);
  const embedUrl = videoId ? getYoutubeEmbedUrl(videoId) : null;

  if (embedUrl && showPlayer) {
    return (
      <Stack gap={6} mt="xs" style={{ maxWidth: 520 }}>
        <AspectRatio
          ratio={16 / 9}
          style={{
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid var(--border-color)",
            background: "var(--surface-2)",
          }}
        >
          <iframe
            src={embedUrl}
            title={extra.title || post.title || t("savedPosts.youtubeVideo")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ border: 0, width: "100%", height: "100%" }}
          />
        </AspectRatio>
        <Group gap="xs" justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed">{t("savedPosts.youtubeBlockedHint")}</Text>
          {postUrl ? (
            <Button size="compact-xs" variant="subtle" component="a" href={postUrl} target="_blank" rel="noopener noreferrer" rightSection={<IconExternalLink size={12} />}>
              {t("savedPosts.openYoutube")}
            </Button>
          ) : null}
        </Group>
      </Stack>
    );
  }

  if (!thumbUrl && !embedUrl) return null;

  return (
    <Stack gap={6} mt="xs" style={{ maxWidth: 520 }}>
      <button
        type="button"
        onClick={() => embedUrl ? setShowPlayer(true) : null}
        style={{
          display: "block",
          position: "relative",
          width: "100%",
          padding: 0,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--surface-2)",
          cursor: embedUrl ? "pointer" : "default",
          boxShadow: "none",
        }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={extra.title || t("savedPosts.youtubeVideo")}
            loading="lazy"
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <AspectRatio ratio={16 / 9}>
            <div style={{ display: "grid", placeItems: "center", color: "var(--text-secondary)" }}>{t("savedPosts.youtubeVideo")}</div>
          </AspectRatio>
        )}
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255, 0, 0, 0.90)",
            color: "white",
            borderRadius: 999,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 900,
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          }}
        >
          {t("savedPosts.play")}
        </span>
      </button>
      <Group gap="xs" wrap="wrap">
        {embedUrl ? (
          <Button size="compact-xs" variant="light" onClick={() => setShowPlayer(true)}>
            {t("savedPosts.playInApp")}
          </Button>
        ) : null}
        {postUrl ? (
          <Button size="compact-xs" variant="subtle" component="a" href={postUrl} target="_blank" rel="noopener noreferrer" rightSection={<IconExternalLink size={12} />}>
            {t("savedPosts.openOriginal")}
          </Button>
        ) : null}
      </Group>
    </Stack>
  );
}

function getYouTubeSavedDescription(post, title = "") {
  const extraDescription = post.extra?.description || post.extra?.snippet?.description || "";
  if (extraDescription) return extraDescription;

  const content = String(post.content || "").trim();
  if (!content) return "";

  const cleanTitle = String(title || "").trim();
  if (cleanTitle && content.startsWith(cleanTitle)) {
    return content.slice(cleanTitle.length).trim();
  }

  return content;
}

function YouTubePostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [showDesc, setShowDesc] = useState(false);
  const title = post.extra?.title || t("savedPosts.untitledVideo");
  const channel = post.extra?.channelTitle || post.extra?.username || post.username || t("savedPosts.unknownChannel");
  const description = getYouTubeSavedDescription(post, title);
  const descLong = description.length > 200;
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #ff0000" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "#fde8e8",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <IconBrandYoutube size={22} color="#ff0000" />
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>{channel}</Text>
              {post.published_at && (
                <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>
              )}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text fw={600} size="md" lh={1.3}>{title}</Text>

        <YoutubeThumbnailPreview post={post} postUrl={postUrl} />

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        {description && (
          <div>
            <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {descLong && !showDesc ? description.slice(0, 200) + "…" : description}
            </Text>
            {descLong && (
              <Button variant="subtle" size="xs" p={0} h="auto" mt={4}
                leftSection={showDesc ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                onClick={() => setShowDesc(!showDesc)}
              >
                {showDesc ? t("savedPosts.showLess") : t("savedPosts.showMore")}
              </Button>
            )}
          </div>
        )}

        <Divider my={0} />

        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#e0245e" />} value={post.likes} />
          <Metric icon={<IconMessage size={14} color="#606060" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── LinkedIn card ───────────────────────────────────────────────────────── */

function LinkedInPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.extra?.author_name || post.username || t("savedPosts.unknown");
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #0A66C2" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "#e8f0fe",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15, color: "#0A66C2", flexShrink: 0,
            }}>
              {(name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>{name}</Text>
              {post.published_at && <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandLinkedin size={18} color="#0A66C2" style={{ opacity: 0.7 }} />
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{preview}</Text>
        {isLong && (
          <Button variant="subtle" size="xs" p={0} h="auto"
            leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("savedPosts.showLess") : t("savedPosts.showMore")}
          </Button>
        )}

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />
        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#0A66C2" />} value={post.likes} />
          <Metric icon={<IconMessage size={14} color="#0A66C2" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── Instagram card ──────────────────────────────────────────────────────── */

function InstagramPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const content = String(post.content || "");
  const isLong = content.length > 280;
  const preview = isLong && !expanded ? getTrimmedPreview(content, 280) : content;
  const name = post.username || post.extra?.author_handle || post.extra?.username || t("savedPosts.unknown");
  const mediaItems = Array.isArray(post.extra?.media) ? post.extra.media : [];
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #E1306C" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg, #fdf497 0%, #fd5949 30%, #d6249f 60%, #285AEB 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15, color: "#fff", flexShrink: 0,
            }}>
              {(name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>@{name}</Text>
              {post.published_at && <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandInstagram size={18} color="#E1306C" style={{ opacity: 0.7 }} />
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{preview}</Text>
        {isLong && (
          <Button variant="subtle" size="xs" p={0} h="auto"
            leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("savedPosts.showLess") : t("savedPosts.showMore")}
          </Button>
        )}

        <InstagramMediaPreview media={mediaItems} postUrl={postUrl} />

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />
        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#E1306C" />} value={post.likes} />
          <Metric icon={<IconMessage size={14} color="#E1306C" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── TikTok card ─────────────────────────────────────────────────────────── */

function TikTokPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const tone = post.tone;
  const name = post.username || post.extra?.username || t("savedPosts.unknown");
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #000" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "#f0f0f0",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15, color: "#000", flexShrink: 0,
            }}>
              {(name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>@{name}</Text>
              {post.published_at && <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandTiktok size={18} style={{ opacity: 0.7 }} />
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{preview}</Text>
        {isLong && (
          <Button variant="subtle" size="xs" p={0} h="auto"
            leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("savedPosts.showLess") : t("savedPosts.showMore")}
          </Button>
        )}

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />
        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#fe2c55" />} value={post.likes} />
          <Metric icon={<IconRepeat size={14} color="#25f4ee" />} value={post.shares} />
          <Metric icon={<IconMessage size={14} color="#161823" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── Reddit card ─────────────────────────────────────────────────────────── */

function RedditPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const content = String(post.content || "");
  const isLong = content.length > 280;
  const preview = isLong && !expanded ? getTrimmedPreview(content, 280) : content;
  const name = post.username || post.extra?.author_handle || post.extra?.username || t("savedPosts.unknown");
  const mediaItems = Array.isArray(post.extra?.media) ? post.extra.media : [];
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #FF4500" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "#fff3ed",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15, color: "#FF4500", flexShrink: 0,
            }}>
              {(name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>u/{name}</Text>
              {post.published_at && <Text size="xs" c="dimmed" lh={1.2}>{formatDate(post.published_at)}</Text>}
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandReddit size={18} color="#FF4500" style={{ opacity: 0.7 }} />
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{preview}</Text>
        {isLong && (
          <Button variant="subtle" size="xs" p={0} h="auto"
            leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("savedPosts.showLess") : t("savedPosts.showMore")}
          </Button>
        )}

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />
        <Group gap="lg">
          <Metric icon={<IconHeart size={14} color="#FF4500" />} value={post.likes} />
          <Metric icon={<IconMessage size={14} color="#FF4500" />} value={post.comments} />
        </Group>
      </Stack>
    </Card>
  );
}

/* ── Generic fallback card ───────────────────────────────────────────────── */

function GenericPostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const tone = post.tone;
  const postUrl = getPostUrl(post);
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" style={{ flex: 1, whiteSpace: "pre-wrap" }}>{post.content}</Text>
          <Group gap={6} wrap="nowrap">
            {postUrl && (
              <Tooltip label={t("savedPosts.viewPost", "View Post")}>
                <ActionIcon variant="subtle" color="blue" size="sm" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  <IconExternalLink size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("savedPosts.removeSavedPost")}>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
                <IconTrash size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {post.published_at && <Text size="xs" c="dimmed">{formatDate(post.published_at)}</Text>}
        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}
        <Divider my={0} />
        <Group gap="lg">
          {post.likes > 0 && <Metric icon={<IconHeart size={14} color="#868e96" />} value={post.likes} />}
          {post.comments > 0 && <Metric icon={<IconMessage size={14} color="#868e96" />} value={post.comments} />}
        </Group>
      </Stack>
    </Card>
  );
}

/* ── platform config (default IDs; overridden dynamically from server) ──── */

const PLATFORM_CARD_CONFIG = {
  x: { label: "X / Twitter", icon: IconBrandX, color: "#1d9bf0", Card: XPostCard },
  instagram: { label: "Instagram", icon: IconBrandInstagram, color: "#E1306C", Card: InstagramPostCard },
  tiktok: { label: "TikTok", icon: IconBrandTiktok, color: "#000", Card: TikTokPostCard },
  youtube: { label: "YouTube", icon: IconBrandYoutube, color: "#ff0000", Card: YouTubePostCard },
  linkedin: { label: "LinkedIn", icon: IconBrandLinkedin, color: "#0A66C2", Card: LinkedInPostCard },
  reddit: { label: "Reddit", icon: IconBrandReddit, color: "#FF4500", Card: RedditPostCard },
};

const DEFAULT_PLATFORM_MAP = {
  1: { ...PLATFORM_CARD_CONFIG.x },
  3: { ...PLATFORM_CARD_CONFIG.instagram },
  4: { ...PLATFORM_CARD_CONFIG.x },
  5: { ...PLATFORM_CARD_CONFIG.tiktok },
  8: { ...PLATFORM_CARD_CONFIG.youtube },
  9: { ...PLATFORM_CARD_CONFIG.linkedin },
  10: { ...PLATFORM_CARD_CONFIG.reddit },
};

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function SavedPosts() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [notice, setNotice] = useState("");
  const [platformMap, setPlatformMap] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({});
  const [deleteAllModal, setDeleteAllModal] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [sortMode, setSortMode] = useState(() => localStorage.getItem("savedPostsSortMode") || DEFAULT_SORT_MODE);

  useEffect(() => {
    localStorage.setItem("savedPostsSortMode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    const newMap = {};
    fetch(apiUrl("/api/platforms"))
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") {
          for (const [key, id] of Object.entries(data)) {
            const cfg = PLATFORM_CARD_CONFIG[key];
            if (cfg && id) newMap[id] = { ...cfg };
          }
        }
      })
      .catch(() => { })
      .finally(() => {
        for (const [id, cfg] of Object.entries(DEFAULT_PLATFORM_MAP)) {
          if (!newMap[id]) {
            newMap[id] = { ...cfg };
          }
        }
        setPlatformMap(newMap);
      });
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const publicUserId = await getPublicUserId();
      if (mounted) setCurrentUserId(publicUserId || null);
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setPosts([]);
      setNotice(t("savedPosts.signInToView"));
      setLoading(false);
      return;
    }
    setNotice("");
    setLoading(true);
    authHeaders()
      .then((headers) => fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`), { headers }))
      .then(r => r.json())
      .then(data => setPosts(data.posts || []))
      .catch(() => setNotice(t("savedPosts.failedLoadPosts")))
      .finally(() => setLoading(false));

    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "saved-posts" } })
    );
  }, [currentUserId]);

  async function handleDelete() {
    const itemId = deleteModal.postId;
    setDeleteModal({ open: false, postId: null });
    if (!currentUserId) {
      setNotice(t("savedPosts.signInToDelete"));
      return;
    }
    try {
      const resp = await fetch(
        apiUrl(`/api/posts/${itemId}?user_id=${encodeURIComponent(currentUserId)}`),
        { method: "DELETE", headers: await authHeaders() }
      );
      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.error || t("savedPosts.failedDeletePost"));
      }
      setPosts((prev) => prev.filter((p) => p.id !== itemId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert(t("savedPosts.deleteError", { message: err.message }));
    }
  }

  /* Group posts by platform */
  const grouped = {};
  for (const p of posts) {
    const pid = p.platform_id ?? 0;
    if (!grouped[pid]) grouped[pid] = [];
    grouped[pid].push(p);
  }
  // Sort platform groups: known platforms first in a nice order, then unknowns
  const platformOrder = Object.keys(platformMap).map(Number).sort((a, b) => a - b);
  const sortedKeys = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => {
      const ia = platformOrder.indexOf(a);
      const ib = platformOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  return (
    <Stack gap="lg" style={{ position: "relative" }} data-tour="saved-posts-list">
      <LoadingOverlay visible={loading} />

      {/* page header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t("savedPosts.title")}</Title>
        <Group gap="sm" align="center" wrap="wrap">
          {posts.length > 0 && <SortSelect value={sortMode} onChange={setSortMode} />}
          {posts.length > 0 && (
            <Button
              color="red"
              variant="light"
              size="xs"
              leftSection={<IconTrash size={14} />}
              onClick={() => setDeleteAllModal(true)}
            >
              {t("savedPosts.deleteAll")}
            </Button>
          )}
          <Badge variant="filled" size="lg" radius="sm" color="blue">
            {posts.length} {posts.length === 1 ? t("common.post") : t("common.posts")}
          </Badge>
        </Group>
      </Group>

      {notice && <Text size="sm" c="dimmed">{notice}</Text>}

      {!loading && posts.length === 0 && !notice && (
        <Alert color="gray" variant="light" radius="md">
          {t("savedPosts.noSavedPosts")}
        </Alert>
      )}

      {sortedKeys.map((platformId) => {
        const platformPosts = sortPostsForDisplay(grouped[platformId], sortMode);
        const cfg = platformMap[platformId];
        const PlatformIcon = cfg?.icon;
        const PlatformCard = cfg?.Card || GenericPostCard;
        const isOpen = !collapsedSections[platformId];

        return (
          <Paper key={platformId} withBorder radius="lg" p="md">
            <Stack gap="md">
              <Group
                justify="space-between"
                align="center"
                onClick={() => setCollapsedSections(prev => ({ ...prev, [platformId]: !prev[platformId] }))}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                <Group gap={8} align="center">
                  {PlatformIcon && <PlatformIcon size={18} color={cfg.color} />}
                  <Text fw={700} size="sm">
                    {cfg?.label || t("savedPosts.platformFallback", { platformId })}
                  </Text>
                  <Badge size="sm" variant="light" color="gray">{platformPosts.length}</Badge>
                </Group>
                {isOpen
                  ? <IconChevronUp size={16} style={{ opacity: 0.5 }} />
                  : <IconChevronDown size={16} style={{ opacity: 0.5 }} />
                }
              </Group>
              {(cfg?.label === "X / Twitter" || cfg?.label === "X") && (
                <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconBrandX size={16} />}>
                  {t("savedPosts.xVideoThumbnailOnly")}
                </Alert>
              )}
              <Collapse in={isOpen}>
                <div
                  style={{
                    columns: platformPosts.length > 1 ? "420px 2" : "auto",
                    columnGap: 16,
                  }}
                >
                  {platformPosts.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        breakInside: "avoid",
                        pageBreakInside: "avoid",
                        marginBottom: 16,
                      }}
                    >
                      <PlatformCard
                        post={p}
                        onDelete={() => setDeleteModal({ open: true, postId: p.id })}
                      />
                    </div>
                  ))}
                </div>
              </Collapse>
            </Stack>
          </Paper>
        );
      })}

      {/* delete modal */}
      <Modal
        opened={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, postId: null })}
        title={t("savedPosts.confirmDeleteTitle")}
        centered
      >
        <Stack gap="lg">
          <Text>{t("savedPosts.confirmDeleteMessage")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteModal({ open: false, postId: null })}>{t("savedPosts.cancel")}</Button>
            <Button color="red" onClick={handleDelete}>{t("savedPosts.delete")}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* delete all modal */}
      <Modal
        opened={deleteAllModal}
        onClose={() => setDeleteAllModal(false)}
        title={t("savedPosts.deleteAllSavedPosts")}
        centered
      >
        <Stack gap="lg">
          <Text>{t("savedPosts.confirmDeleteAll", { count: posts.length })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteAllModal(false)}>{t("savedPosts.cancel")}</Button>
            <Button
              color="red"
              loading={deletingAll}
              onClick={async () => {
                if (!currentUserId) return;
                setDeletingAll(true);
                try {
                  const resp = await fetch(
                    apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`),
                    { method: "DELETE", headers: await authHeaders() }
                  );
                  const ct = resp.headers.get("content-type") || "";
                  if (!resp.ok) {
                    const errMsg = ct.includes("application/json")
                      ? (await resp.json()).error
                      : `Server error (${resp.status})`;
                    throw new Error(errMsg || "Failed to delete all posts");
                  }
                  setPosts([]);
                  setDeleteAllModal(false);
                } catch (err) {
                  console.error("Delete all failed:", err);
                  alert(err.message);
                } finally {
                  setDeletingAll(false);
                }
              }}
            >
              {t("savedPosts.deleteAll")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}