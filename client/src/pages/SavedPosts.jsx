import { useEffect, useState } from "react";
import {
  Card,
  Stack,
  Text,
  Title,
  Badge,
  Group,
  LoadingOverlay,
  Button,
  ActionIcon,
  Tooltip,
  Modal,
  Spoiler,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { apiUrl } from "../utils/api";

function PlatformBadge({ platformId }) {
  const isX = platformId === 1;
  const isYouTube = platformId === 8;

  if (isYouTube) return <Badge variant="light">YouTube</Badge>;
  if (isX) return <Badge variant="light">X</Badge>;
  return <Badge variant="light">Other</Badge>;
}

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "saved-posts" } })
    );
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/posts"))
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .finally(() => setLoading(false));
  }, []);

  function openDeleteConfirm(postId) {
    setDeleteModal({ open: true, postId });
  }

  function closeDeleteConfirm() {
    setDeleteModal({ open: false, postId: null });
  }

  async function handleDelete() {
    const postId = deleteModal.postId;
    closeDeleteConfirm();

    try {
      const resp = await fetch(`http://localhost:8080/api/posts/${postId}`, {
        method: "DELETE",
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.error || "Failed to delete post");
      }

      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete post: " + err.message);
    }
  }

  return (
    <Card p="lg" withBorder radius="md" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} />

      <Stack>
        <Title order={2}>Saved Posts</Title>

        {posts.map((p) => {
          const isX = p.platform_id === 1;
          const isYouTube = p.platform_id === 8;

          return (
            <Card key={p.id} withBorder radius="md">
              <Stack gap="xs">
                {/* Header row: platform tag + date (left), delete (right) */}
                <Group justify="space-between" align="center">
                  <Group gap="xs" align="center">
                    <PlatformBadge platformId={p.platform_id} />
                    <Text size="xs" c="dimmed">
                      {new Date(p.published_at).toLocaleString()}
                    </Text>
                  </Group>

                  <Tooltip label="Delete post" withArrow>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => openDeleteConfirm(p.id)}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {/* Content */}
                {isYouTube ? (
                  <Stack gap="xs">
                    <Text fw={600} size="lg">
                      {p.extra?.title || "Untitled Video"}{" "}
                      <Text span fw={400} c="dimmed">
                        — {p.extra?.channelTitle || "Unknown Creator"}
                      </Text>
                    </Text>

                    <Text size="sm" c="dimmed">
                      {p.extra?.description
                        ? p.extra.description.length > 200
                          ? `${p.extra.description.slice(0, 200)}…`
                          : p.extra.description
                        : "No description available"}
                    </Text>

                    {/* Transcript (collapsible) */}
                    {p.content ? (
                      <Stack gap={4} mt="sm">
                        <Text size="sm" fw={500}>
                          Transcript
                        </Text>

                        <Spoiler
                          maxHeight={90}
                          showLabel="See more"
                          hideLabel="See less"
                        >
                          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                            {p.content}
                          </Text>
                        </Spoiler>
                      </Stack>
                    ) : (
                      <Text size="sm" mt="sm" c="dimmed">
                        No transcript available
                      </Text>
                    )}
                  </Stack>
                ) : (
                  <Text fw={500}>{p.content}</Text>
                )}

                {/* Metrics */}
                <Group>
                  <Badge>❤️ {p.likes}</Badge>
                  {isX && <Badge>🔁 {p.shares}</Badge>}
                  <Badge>💬 {p.comments}</Badge>
                  {isYouTube && <Badge>👀 {p.extra?.views || 0}</Badge>}
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      <Modal
        opened={deleteModal.open}
        onClose={closeDeleteConfirm}
        title="Confirm Delete"
        centered
      >
        <Stack gap="lg">
          <Text>
            Are you sure you want to delete this post? This action cannot be
            undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDeleteConfirm}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
