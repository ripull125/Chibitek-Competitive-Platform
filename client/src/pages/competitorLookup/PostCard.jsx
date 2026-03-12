import React, { useState } from "react";
import {
  Button,
  Card,
  Divider,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconBrandX,
  IconChevronDown,
  IconChevronUp,
  IconHeart,
  IconMessage,
  IconRepeat,
} from "@tabler/icons-react";
import { apiUrl } from "../../utils/api";

function avatarInitial(name) {
  if (!name) return "?";
  return name[0].toUpperCase();
}

export function PostCard({ post, currentUserId, platformIds, result }) {
  if (!post?.text) return null;

  const metrics = post.public_metrics || {};
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const isLong = post.text.length > 280;
  const preview = isLong && !expanded ? post.text.slice(0, 280) + "…" : post.text;
  const date = post.created_at
    ? new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  async function handleSave() {
    try {
      if (!currentUserId) {
        throw new Error("Please sign in to save posts.");
      }
      setSaving(true);
      setSaveStatus(null);
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.x,
          platform_user_id: result.userId,
          username: result.username,
          platform_post_id: post.id,
          content: post.text,
          published_at: post.created_at,
          likes: metrics.like_count ?? 0,
          shares: metrics.retweet_count ?? 0,
          comments: metrics.reply_count ?? 0,
          views: metrics.impression_count ?? 0,
          user_id: currentUserId,
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Failed to save post: ${resp.status} ${errorText}`);
      }

      await resp.json();
      setSaveStatus('saved');
    } catch (e) {
      console.error("Error saving post:", e);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

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
              {avatarInitial(result?.name || result?.username)}
            </div>
            <div style={{ minWidth: 0 }}>
              <Text fw={700} size="sm" lh={1.3} truncate>{result?.name || result?.username}</Text>
              <Text size="xs" c="dimmed" lh={1.2}>@{result?.username}</Text>
            </div>
          </Group>
          <IconBrandX size={18} style={{ opacity: 0.5, flexShrink: 0 }} />
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

        {date && <Text size="xs" c="dimmed" mt={-4}>{date}</Text>}

        <Divider my={0} />

        <Group justify="space-between" align="center">
          <Group gap="lg">
            <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{(metrics.like_count ?? 0).toLocaleString()}</Text></Group>
            <Group gap={4} wrap="nowrap"><IconRepeat size={14} color="#17bf63" /><Text size="xs" c="dimmed">{(metrics.retweet_count ?? 0).toLocaleString()}</Text></Group>
            <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#1d9bf0" /><Text size="xs" c="dimmed">{(metrics.reply_count ?? 0).toLocaleString()}</Text></Group>
          </Group>
          <Button size="xs" variant="light" loading={saving}
            color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
            onClick={handleSave}
            disabled={saveStatus === 'saved'}
          >
            {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error – Retry' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
