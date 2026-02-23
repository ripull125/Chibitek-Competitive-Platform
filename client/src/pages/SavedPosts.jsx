import { useEffect, useState } from "react";
import {
  ActionIcon, Alert, Badge, Button, Card, Collapse, Divider,
  Group, LoadingOverlay, Modal, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import {
  IconBrandX, IconBrandYoutube, IconChevronDown, IconChevronUp, IconTrash,
} from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

function formatDate(str) {
  if (!str) return null;
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function XPostCard({ post, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isLong  = (post.content || "").length > 280;
  const preview = isLong && !expanded ? post.content.slice(0, 280) + "…" : post.content;
  const handle  = post.extra?.author_handle || post.extra?.username || "unknown";
  const name    = post.extra?.author_name || handle;

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group gap="xs" align="center">
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--mantine-color-blue-1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, color: "var(--mantine-color-blue-6)", flexShrink: 0,
          }}>
            {(name || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <Text fw={700} size="sm" lh={1.2}>{name}</Text>
            <Text size="xs" c="dimmed">@{handle}</Text>
          </div>
          <IconBrandX size={16} color="#000" />
          <Tooltip label="Delete post">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{preview}</Text>
        {isLong && (
          <Button variant="subtle" size="xs" p={0} h="auto"
            leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "See more"}
          </Button>
        )}

        {post.published_at && <Text size="xs" c="dimmed">{formatDate(post.published_at)}</Text>}

        <Divider />
        <Group gap="md">
          <Text size="xs" c="dimmed">❤️ {(post.likes || 0).toLocaleString()}</Text>
          <Text size="xs" c="dimmed">🔁 {(post.shares || 0).toLocaleString()}</Text>
          <Text size="xs" c="dimmed">💬 {(post.comments || 0).toLocaleString()}</Text>

        </Group>
      </Stack>
    </Card>
  );
}

function YouTubePostCard({ post, onDelete }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showDesc, setShowDesc]             = useState(false);
  const title       = post.extra?.title || "Untitled Video";
  const channel     = post.extra?.channelTitle || post.extra?.username || "Unknown Channel";
  const description = post.extra?.description || "";
  const transcript  = post.content || "";
  const descLong    = description.length > 200;

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="xs" align="center">
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--mantine-color-red-1)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <IconBrandYoutube size={20} color="var(--mantine-color-red-6)" />
          </div>
          <div style={{ flex: 1 }}>
            <Text fw={700} size="sm" lh={1.2}>{channel}</Text>
            {post.published_at && <Text size="xs" c="dimmed">{formatDate(post.published_at)}</Text>}
          </div>
          <Tooltip label="Delete post">
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onDelete}>
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Text fw={600} size="md">{title}</Text>

        {description && (
          <div>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {descLong && !showDesc ? description.slice(0, 200) + "…" : description}
            </Text>
            {descLong && (
              <Button variant="subtle" size="xs" p={0} h="auto" mt={4}
                leftSection={showDesc ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                onClick={() => setShowDesc(!showDesc)}
              >
                {showDesc ? "Show less" : "See more"}
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
              <Text size="xs" c="dimmed" mt="xs" style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
                {transcript}
              </Text>
            </Collapse>
          </div>
        )}

        <Divider />
        <Group gap="md">
          <Text size="xs" c="dimmed">👁 {(post.extra?.views || 0).toLocaleString()}</Text>
          <Text size="xs" c="dimmed">❤️ {(post.likes || 0).toLocaleString()}</Text>
          <Text size="xs" c="dimmed">💬 {(post.comments || 0).toLocaleString()}</Text>
        </Group>
      </Stack>
    </Card>
  );
}

export default function SavedPosts() {
  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [notice, setNotice]         = useState("");

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
      setPosts([]); setNotice("Sign in to view your saved posts."); setLoading(false);
      return;
    }
    setLoading(true);
    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => setNotice("Failed to load posts."))
      .finally(() => setLoading(false));

    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "saved-posts" } }));
  }, [currentUserId]);

  async function handleDelete() {
    const postId = deleteModal.postId;
    setDeleteModal({ open: false, postId: null });
    if (!currentUserId) return;
    try {
      const resp = await fetch(
        apiUrl(`/api/posts/${postId}?user_id=${encodeURIComponent(currentUserId)}`),
        { method: "DELETE" }
      );
      if (!resp.ok) throw new Error("Failed to delete");
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      alert("Failed to delete post: " + err.message);
    }
  }

  const xPosts  = posts.filter(p => p.platform_id === 1);
  const ytPosts = posts.filter(p => p.platform_id === 8);
  const other   = posts.filter(p => p.platform_id !== 1 && p.platform_id !== 8);

  return (
    <Card p="lg" withBorder radius="md" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} />
      <Stack>
        <Group justify="space-between" align="center">
          <Title order={2}>Saved Posts</Title>
          <Badge variant="light" size="lg">{posts.length} total</Badge>
        </Group>

        {notice && <Text size="sm" c="dimmed">{notice}</Text>}

        {!loading && posts.length === 0 && !notice && (
          <Alert color="gray">No saved posts yet. Go to Competitor Lookup to save posts.</Alert>
        )}

        {xPosts.length > 0 && (
          <Stack gap="xs">
            <Group gap="xs">
              <IconBrandX size={16} />
              <Text fw={600} size="sm">X / Twitter ({xPosts.length})</Text>
            </Group>
            {xPosts.map((p) => (
              <XPostCard key={p.id} post={p}
                onDelete={() => setDeleteModal({ open: true, postId: p.id })}
              />
            ))}
          </Stack>
        )}

        {ytPosts.length > 0 && (
          <Stack gap="xs" mt={xPosts.length > 0 ? "md" : 0}>
            <Group gap="xs">
              <IconBrandYoutube size={16} color="red" />
              <Text fw={600} size="sm">YouTube ({ytPosts.length})</Text>
            </Group>
            {ytPosts.map((p) => (
              <YouTubePostCard key={p.id} post={p}
                onDelete={() => setDeleteModal({ open: true, postId: p.id })}
              />
            ))}
          </Stack>
        )}

        {other.map((p) => (
          <Card key={p.id} withBorder radius="md" p="md">
            <Group justify="space-between">
              <Text size="sm" style={{ flex: 1 }}>{p.content}</Text>
              <ActionIcon variant="subtle" color="red"
                onClick={() => setDeleteModal({ open: true, postId: p.id })}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </Stack>

      <Modal opened={deleteModal.open} onClose={() => setDeleteModal({ open: false, postId: null })}
        title="Confirm Delete" centered>
        <Stack gap="lg">
          <Text>Are you sure you want to delete this post? This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteModal({ open: false, postId: null })}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}