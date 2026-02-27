import { useEffect, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Card, Collapse, Divider,
  Group, LoadingOverlay, Modal, Paper, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import {
  IconBrandInstagram, IconBrandLinkedin, IconBrandReddit,
  IconBrandTiktok, IconBrandX, IconBrandYoutube,
  IconChevronDown, IconChevronUp,
  IconEye, IconHeart, IconMessage, IconRepeat, IconTrash,
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

/* ── X / Twitter card ────────────────────────────────────────────────────── */

function XPostCard({ post, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const handle = post.extra?.author_handle || post.extra?.username || post.username || "unknown";
  const name = post.extra?.author_name || handle;

  return (
    <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #1d9bf0" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "#e8f5fd",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15, color: "#1d9bf0", flexShrink: 0,
            }}>
              {(name || "?")[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>{name}</Text>
              <Text size="xs" c="dimmed" lh={1.2}>@{handle}</Text>
            </div>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconBrandX size={18} style={{ opacity: 0.55 }} />
            <Tooltip label="Remove saved post">
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
            {expanded ? "Show less" : "Show more"}
          </Button>
        )}

        {post.published_at && (
          <Text size="xs" c="dimmed" mt={-4}>{formatDate(post.published_at)}</Text>
        )}

        <Divider my={0} />

        <Group gap="lg">
          <Metric icon={<IconEye size={14} color="#1d9bf0" />} value={post.views} />
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
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const title = post.extra?.title || "Untitled Video";
  const channel = post.extra?.channelTitle || post.extra?.username || post.username || "Unknown Channel";
  const description = post.extra?.description || "";
  const transcript = post.content || "";
  const descLong = description.length > 200;

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
          <Tooltip label="Remove saved post">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <IconTrash size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Text fw={600} size="md" lh={1.3}>{title}</Text>

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
                {showDesc ? "Show less" : "Show more"}
              </Button>
            )}
          </div>
        )}

        {transcript && transcript !== description && (
          <div>
            <Button variant="subtle" size="xs" p={0} h="auto"
              leftSection={showTranscript ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? "Hide transcript" : "Show transcript"}
            </Button>
            <Collapse in={showTranscript}>
              <Paper p="sm" mt="xs" radius="sm"
                style={{ background: "var(--mantine-color-gray-0)", maxHeight: 300, overflow: "auto" }}>
                <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>{transcript}</Text>
              </Paper>
            </Collapse>
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
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.extra?.author_name || post.username || "Unknown";

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
            <Tooltip label="Remove saved post">
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
            {expanded ? "Show less" : "Show more"}
          </Button>
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
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.username || post.extra?.username || "Unknown";

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
            <Tooltip label="Remove saved post">
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
            {expanded ? "Show less" : "Show more"}
          </Button>
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
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.username || post.extra?.username || "Unknown";

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
            <Tooltip label="Remove saved post">
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
            {expanded ? "Show less" : "Show more"}
          </Button>
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
  const [expanded, setExpanded] = useState(false);
  const isLong = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const name = post.username || post.extra?.username || "Unknown";

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
            <Tooltip label="Remove saved post">
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
            {expanded ? "Show less" : "Show more"}
          </Button>
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
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" style={{ flex: 1, whiteSpace: "pre-wrap" }}>{post.content}</Text>
          <Tooltip label="Remove saved post">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <IconTrash size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
        {post.published_at && <Text size="xs" c="dimmed">{formatDate(post.published_at)}</Text>}
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
  5: { ...PLATFORM_CARD_CONFIG.tiktok },
  8: { ...PLATFORM_CARD_CONFIG.youtube },
  9: { ...PLATFORM_CARD_CONFIG.linkedin },
  10: { ...PLATFORM_CARD_CONFIG.reddit },
};

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [notice, setNotice] = useState("");
  const [platformMap, setPlatformMap] = useState(DEFAULT_PLATFORM_MAP);
  const [collapsedSections, setCollapsedSections] = useState({});

  /* Fetch platform IDs from server to keep in sync with DB */
  useEffect(() => {
    fetch(apiUrl("/api/platforms"))
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") {
          const newMap = { ...DEFAULT_PLATFORM_MAP };
          for (const [key, id] of Object.entries(data)) {
            const cfg = PLATFORM_CARD_CONFIG[key];
            if (cfg && id) newMap[id] = { ...cfg };
          }
          setPlatformMap(newMap);
        }
      })
      .catch(() => { }); // fall back to defaults
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
      setNotice("Sign in to view your saved posts.");
      setLoading(false);
      return;
    }
    setNotice("");
    setLoading(true);
    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then(r => r.json())
      .then(data => setPosts(data.posts || []))
      .catch(() => setNotice("Failed to load posts."))
      .finally(() => setLoading(false));

    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "saved-posts" } })
    );
  }, [currentUserId]);

  async function handleDelete() {
    const itemId = deleteModal.postId;
    setDeleteModal({ open: false, postId: null });
    if (!currentUserId) {
      setNotice("Sign in to delete saved items.");
      return;
    }
    try {
      const resp = await fetch(
        apiUrl(`/api/posts/${itemId}?user_id=${encodeURIComponent(currentUserId)}`),
        { method: "DELETE" }
      );
      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.error || "Failed to delete post");
      }
      setPosts((prev) => prev.filter((p) => p.id !== itemId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete post: " + err.message);
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
        <Title order={2}>Saved Posts</Title>
        <Badge variant="filled" size="lg" radius="sm" color="blue">
          {posts.length} {posts.length === 1 ? "POST" : "POSTS"}
        </Badge>
      </Group>

      {notice && <Text size="sm" c="dimmed">{notice}</Text>}

      {!loading && posts.length === 0 && !notice && (
        <Alert color="gray" variant="light" radius="md">
          No saved posts yet. Head to Competitor Lookup to search and save posts.
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
                {cfg?.label || `Platform ${platformId}`} ({platformPosts.length})
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
        title="Confirm Delete"
        centered
      >
        <Stack gap="lg">
          <Text>Are you sure you want to delete this post? This action cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteModal({ open: false, postId: null })}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}