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
import { supabase } from "../supabaseClient";

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState({ open: false, postId: null });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setPosts([]);
      setNotice("Sign in to view your saved posts.");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "saved-posts" } })
    );
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/posts"))
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  function openDeleteConfirm(postId) {
    setDeleteModal({ open: true, postId });
  }

  function closeDeleteConfirm() {
    setDeleteModal({ open: false, postId: null });
  }

  async function handleDelete() {
    const postId = deleteModal.postId;
    closeDeleteConfirm();

    if (!currentUserId) {
      setNotice("Sign in to delete saved posts.");
      return;
    }

    try {
      const resp = await fetch(
        apiUrl(`/api/posts/${postId}?user_id=${encodeURIComponent(currentUserId)}`),
        {
        method: "DELETE",
        }
      );

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

        {notice ? (
          <Text size="sm" c="dimmed">
            {notice}
          </Text>
        ) : null}

        {posts.map((p) => (
          <Card key={p.id} withBorder radius="md">
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start">
                <Text fw={500} style={{ flex: 1 }}>
                  {p.content}
                </Text>
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
