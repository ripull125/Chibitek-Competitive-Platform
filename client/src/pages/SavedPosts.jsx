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
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { apiUrl } from "../utils/api";

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });

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

      // Remove from local state
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

        {posts.map((p) => (
          <Card key={p.id} withBorder radius="md">
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start">
                <Text fw={500} style={{ flex: 1 }}>
                  {p.content}
                </Text>
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

              <Group>
                <Badge>❤️ {p.likes}</Badge>
                <Badge>🔁 {p.shares}</Badge>
                <Badge>💬 {p.comments}</Badge>
              </Group>

              <Text size="xs" c="dimmed">
                {new Date(p.published_at).toLocaleString()}
              </Text>
            </Stack>
          </Card>
        ))}
      </Stack>

      <Modal
        opened={deleteModal.open}
        onClose={closeDeleteConfirm}
        title="Confirm Delete"
        centered
      >
        <Stack gap="lg">
          <Text>Are you sure you want to delete this post? This action cannot be undone.</Text>
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
