import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon, Alert, Avatar, Badge, Button, Card, Collapse, Divider,
  Group, LoadingOverlay, Modal, Paper, SimpleGrid, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import {
  IconBrandInstagram, IconBrandLinkedin, IconBrandReddit,
  IconBrandTiktok, IconBrandX, IconBrandYoutube,
  IconChevronDown, IconChevronUp,
  IconExternalLink, IconEye, IconHeart, IconInfoCircle,
  IconMessage, IconRepeat, IconTrash,
} from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function formatDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function Metric({ icon, value }) {
  return (
    <Group gap={4} wrap="nowrap">
      {icon}
      <Text size="xs" c="dimmed" lh={1}>{(value || 0).toLocaleString()}</Text>
    </Group>
  );
}


function cleanXImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  return url.replace("_normal", "_400x400");
}

function bestVideoVariant(variants = []) {
  if (!Array.isArray(variants)) return null;

  const mp4s = variants
    .filter((v) => v?.url && String(v.content_type || v.contentType || "").includes("mp4"))
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));

  return mp4s[0]?.url || null;
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

function mediaQualityScore(item = {}) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const url = String(item.url || item.preview_image_url || "");
  let score = width * height;
  if (/name=(orig|4096x4096|large)/i.test(url)) score += 1_000_000;
  if (item.type === "video" || item.type === "animated_gif") score += 500_000;
  return score;
}

function dedupeMediaForDisplay(media = []) {
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

  return values.slice(0, 4);
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

function XMediaPreview({ media }) {
  const items = dedupeMediaForDisplay(media);
  if (!items.length) return null;

  return (
    <div style={{ maxWidth: items.length === 1 ? 520 : 680 }}>
      <SimpleGrid cols={items.length === 1 ? 1 : 2} spacing="xs">
        {items.map((item, index) => {
          const key = item.media_key || item.url || item.preview_image_url || index;
          const isVideo = item.type === "video" || item.type === "animated_gif";
          const videoUrl = bestVideoVariant(item.variants);
          const imageUrl = item.url || item.preview_image_url;

          const mediaStyle = {
            width: "100%",
            maxHeight: 260,
            objectFit: "contain",
            borderRadius: 10,
            background: "#f8f9fa",
            display: "block",
            border: "1px solid #edf2f7",
          };

          if (isVideo && videoUrl) {
            return (
              <video
                key={key}
                controls
                playsInline
                poster={item.preview_image_url || undefined}
                style={{ ...mediaStyle, background: "#000" }}
              >
                <source src={videoUrl} type="video/mp4" />
              </video>
            );
          }

          if (imageUrl) {
            return (
              <img
                key={key}
                src={imageUrl}
                alt=""
                loading="lazy"
                style={mediaStyle}
              />
            );
          }

          return null;
        })}
      </SimpleGrid>
    </div>
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

// Build URL to the original post on its platform 
function getPostUrl(post) {
  // Prefer stored url
  if (post.url) return post.url;

  const pid = post.platform_post_id;
  if (!pid) return null;

  const platformId = post.platform_id;

  // X
  if (platformId === 1 || platformId === 4) {
    return `https://x.com/i/web/status/${pid}`;
  }

  // Instagram
  if (platformId === 3) {
    const shortcode = instagramIdToShortcode(pid);
    return `https://www.instagram.com/p/${shortcode}/`;
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
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #1d9bf0" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <Avatar src={avatarUrl} radius="xl" size={44} color="blue">
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

        <ExpandablePostText text={cleanDisplayTextForMedia(post.content, mediaItems)} threshold={260} />

        <XMediaPreview media={mediaItems} />

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

function YouTubePostCard({ post, onDelete }) {
  const { t } = useTranslation();
  const [showDesc, setShowDesc] = useState(false);
  const title = post.extra?.title || t("savedPosts.untitledVideo");
  const channel = post.extra?.channelTitle || post.extra?.username || post.username || t("savedPosts.unknownChannel");
  const description = post.extra?.description || "";
  const descLong = description.length > 200;
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #ff0000" }}>
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
          <Metric icon={<IconEye size={14} color="#606060" />} value={post.views} />
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
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #0A66C2" }}>
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
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.username || post.extra?.username || t("savedPosts.unknown");
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #E1306C" }}>
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

        {tone && (
          <Badge size="sm" variant="light">{tone}</Badge>
        )}

        <Divider my={0} />
        <Group gap="lg">
          <Metric icon={<IconEye size={14} color="#E1306C" />} value={post.views} />
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
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #000" }}>
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
          <Metric icon={<IconEye size={14} color="#161823" />} value={post.views} />
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
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.username || post.extra?.username || t("savedPosts.unknown");
  const tone = post.tone;
  const postUrl = getPostUrl(post);

  return (
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #FF4500" }}>
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
    <Card withBorder radius="md" p="lg">
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
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
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
    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
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
        { method: "DELETE" }
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
    <Stack gap="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} />

      {/* page header */}
      <Group justify="space-between" align="center">
        <Title order={2}>{t("savedPosts.title")}</Title>
        <Group gap="sm">
          {posts.length > 0 && (
            <Button
              color="red"
              variant="light"
              size="xs"
              leftSection={<IconTrash size={14} />}
              onClick={() => setDeleteAllModal(true)}
            >
              Delete All
            </Button>
          )}
          <Badge variant="filled" size="lg" radius="sm" color="blue">
            {posts.length} {posts.length === 1 ? t("common.post") : t("common.posts")}
          </Badge>
        </Group>
      </Group>

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" radius="md">
        {t("savedPosts.metricsMayBeUnavailable", {
          defaultValue: "Some metrics (e.g. views) may appear as 0 because they are private or unavailable from the platform's API.",
        })}
      </Alert>

      {notice && <Text size="sm" c="dimmed">{notice}</Text>}

      {!loading && posts.length === 0 && !notice && (
        <Alert color="gray" variant="light" radius="md">
          {t("savedPosts.noSavedPosts")}
        </Alert>
      )}

      {sortedKeys.map((platformId) => {
        const platformPosts = grouped[platformId];
        const cfg = platformMap[platformId];
        const PlatformIcon = cfg?.icon;
        const PlatformCard = cfg?.Card || GenericPostCard;
        const isOpen = !collapsedSections[platformId];

        return (
          <Stack key={platformId} gap="sm">
            <Group
              gap={8}
              align="center"
              onClick={() => setCollapsedSections(prev => ({ ...prev, [platformId]: !prev[platformId] }))}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              {PlatformIcon && <PlatformIcon size={18} color={cfg.color} />}
              <Text fw={700} size="sm">
                {cfg?.label || t("savedPosts.platformFallback", { platformId })} ({platformPosts.length})
              </Text>
              {isOpen
                ? <IconChevronUp size={16} style={{ opacity: 0.5 }} />
                : <IconChevronDown size={16} style={{ opacity: 0.5 }} />
              }
            </Group>
            <Collapse in={isOpen}>
              <Stack gap="sm">
                {platformPosts.map((p) => (
                  <PlatformCard
                    key={p.id}
                    post={p}
                    onDelete={() => setDeleteModal({ open: true, postId: p.id })}
                  />
                ))}
              </Stack>
            </Collapse>
          </Stack>
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
        title="Delete All Saved Posts"
        centered
      >
        <Stack gap="lg">
          <Text>Are you sure you want to delete all {posts.length} saved posts? This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteAllModal(false)}>Cancel</Button>
            <Button
              color="red"
              loading={deletingAll}
              onClick={async () => {
                if (!currentUserId) return;
                setDeletingAll(true);
                try {
                  const resp = await fetch(
                    apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`),
                    { method: "DELETE" }
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
              Delete All
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}