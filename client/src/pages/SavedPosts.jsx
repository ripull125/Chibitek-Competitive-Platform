import { useEffect, useState } from "react";
import {
  Card,
  Stack,
  Text,
  Title,
  Badge,
  Group,
  LoadingOverlay,
} from "@mantine/core";

export default function SavedPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8080/api/posts")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card p="lg" withBorder radius="md" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} />
      <Stack>
        <Title order={2}>Saved Posts</Title>

        {posts.map((p) => (
          <Card key={p.id} withBorder radius="md">
            <Stack gap="xs">
              <Text fw={500}>{p.content}</Text>

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
    </Card>
  );
}
