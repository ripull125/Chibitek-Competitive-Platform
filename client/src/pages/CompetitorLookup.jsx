import React, { useEffect, useMemo, useState } from "react";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  LoadingOverlay,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  Tabs,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconBrandX,
  IconBrandYoutube,
  IconCheck,
  IconCopy,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

export default function CompetitorLookup() {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "competitor-lookup" } })
    );
  }, []);

  const [username, setUsername] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [youtubeResult, setYoutubeResult] = useState(null);
  const [convertedData, setConvertedData] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const backends = useMemo(() => {
    const bases = new Set();
    if (apiBase) bases.add(apiBase);
    if (import.meta.env.DEV) bases.add('http://localhost:8080');
    return Array.from(bases);
  }, []);

  async function tryFetch(usernameToFetch) {
    const trimmed = String(usernameToFetch || "").trim().replace(/^@/, "");
    if (!trimmed) throw new Error("Please enter a username.");
    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/x/fetch/${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg = json?.error || `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const notFoundAttempt = attempts.find(a => {
      const errorLower = a.error.toLowerCase();
      return (
        a.error.includes("404") ||
        errorLower.includes("not found") ||
        errorLower.includes("user does not exist") ||
        errorLower.includes("no user found")
      );
    });

    if (notFoundAttempt) {
      const err = new Error(
        `Username "@${trimmed}" not found. Please check the spelling and try again.`
      );
      err.type = "not_found";
      throw err;
    }

    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function tryFetchYouTube(youtubeUrlToFetch) {
    const trimmed = String(youtubeUrlToFetch || "").trim();
    if (!trimmed) throw new Error("Please enter a YouTube URL.");

    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/youtube/transcript?video=${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg =
            json?.error ||
            `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = username.trim();
    if (!u) {
      setError("Please enter a username.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetch(u);
      setResult(data);

      try {
        const converted = convertXInput(data);
        setConvertedData(converted);
        console.log('Converted data:', converted);

        const postsToSave = (data.posts || []).slice(0, 10).map((post) => {
          const metrics = post.public_metrics || {};
          const engagement =
            (metrics.like_count || 0) +
            (metrics.retweet_count || 0) +
            (metrics.reply_count || 0);
          return {
            id: post.id,
            username: data.username,
            content: post.text,
            engagement,
            likes: metrics.like_count || 0,
            shares: metrics.retweet_count || 0,
            comments: metrics.reply_count || 0,
            timestamp: post.created_at,
          };
        });

        const storageKey = currentUserId
          ? `recentCompetitorPosts_${currentUserId}`
          : 'recentCompetitorPosts';
        const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const allPosts = [...postsToSave, ...existingPosts];
        const recentTen = allPosts.slice(0, 10);
        localStorage.setItem(storageKey, JSON.stringify(recentTen));

      } catch (conversionError) {
        console.error('Error converting data:', conversionError);
        setError(`Data fetched successfully but conversion failed: ${conversionError.message}`);
      }
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitYouTube(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = youtubeUrl.trim();
    if (!u) {
      setError("Please enter a YouTube URL.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetchYouTube(u);
      setYoutubeResult(data);
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function BackendBadge({ base }) {
    const label = base?.replace(/^https?:\/\//, "");
    return (
      <Badge variant="light" radius="sm" title={base}>
        {label || "unknown"}
      </Badge>
    );
  }

  function Copyable({ value, label }) {
    const [copied, handlers] = useDisclosure(false);
    return (
      <Group gap="xs" wrap="nowrap">
        <Text fw={500}>{label}:</Text>
        <Code>{value || "—"}</Code>
        <Tooltip label={copied ? "Copied" : "Copy"} withArrow withinPortal>
          <ActionIcon
            aria-label={`Copy ${label}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(value ?? ""));
                handlers.open();
                setTimeout(handlers.close, 900);
              } catch {
              }
            }}
            variant="subtle"
          >
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  function PostCard({ post }) {
    if (!post?.text) return null;

    const metrics = post.public_metrics || {};
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'

    async function handleSave() {
      if (!currentUserId) {
        setSaveStatus('error');
        return;
      }
      try {
        setSaving(true);
        setSaveStatus(null);
        const resp = await fetch(apiUrl("/api/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_id: 1,
            platform_user_id: result.userId,
            username: result.username,
            platform_post_id: post.id,
            content: post.text,
            published_at: post.created_at,
            likes: metrics.like_count ?? 0,
            shares: metrics.retweet_count ?? 0,
            comments: metrics.reply_count ?? 0,
            user_id: currentUserId,
            author_name: result.username,
            author_handle: result.username,
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          // If it's a duplicate, treat as already saved rather than an error
          if (errorText.includes("duplicate key") || errorText.includes("unique constraint")) {
            setSaveStatus('saved');
            return;
          }
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
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {post.text}
          </Text>
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Badge variant="light">❤️ {metrics.like_count ?? 0}</Badge>
              <Badge variant="light">🔁 {metrics.retweet_count ?? 0}</Badge>
              <Badge variant="light">💬 {metrics.reply_count ?? 0}</Badge>
            </Group>

            <Button
              size="xs"
              variant="light"
              loading={saving}
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

  function YouTubeCard({ data }) {
    if (!data) return null;

    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'

    async function handleSave() {
      if (!currentUserId) {
        setSaveStatus('error');
        return;
      }
      try {
        setSaving(true);
        setSaveStatus(null);
        const resp = await fetch(apiUrl("/api/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_id: 8,
            platform_user_id: data.video.channelId,
            username: data.video.channelTitle,
            platform_post_id: data.videoId,
            content: data.transcript || data.video.description,
            published_at: data.video.publishedAt,
            likes: data.video.stats.likes || 0,
            shares: 0,
            comments: data.video.stats.comments || 0,
            title: data.video.title,
            description: data.video.description,
            channelTitle: data.video.channelTitle,
            videoId: data.videoId,
            views: data.video.stats.views,
            user_id: currentUserId,  // FIX: was missing
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          // If it's a duplicate, treat as already saved
          if (errorText.includes("duplicate key") || errorText.includes("unique constraint")) {
            setSaveStatus('saved');
            return;
          }
          throw new Error(`Failed to save video: ${resp.status} ${errorText}`);
        }

        await resp.json();
        setSaveStatus('saved');
      } catch (e) {
        console.error("Error saving video:", e);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    }

    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Group justify="space-between" align="start">
            <Title order={4} lineClamp={2}>{data.video?.title || "Untitled Video"}</Title>
            <Badge variant="light" color="red">
              <IconBrandYoutube size={14} style={{ marginRight: 4 }} />
              YouTube
            </Badge>
          </Group>

          <Group gap="md" wrap="wrap">
            <Group gap="xs">
              <Text fw={500}>Channel:</Text>
              <Text>{data.video?.channelTitle || "Unknown"}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Views:</Text>
              <Text>{(data.video?.stats?.views || 0).toLocaleString()}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Likes:</Text>
              <Text>{(data.video?.stats?.likes || 0).toLocaleString()}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Published:</Text>
              <Text>{data.video?.publishedAt ? new Date(data.video.publishedAt).toLocaleDateString() : "Unknown"}</Text>
            </Group>
          </Group>

          {data.video?.description && (
            <div>
              <Text fw={500} mb="xs">Description:</Text>
              <Text size="sm" lineClamp={3}>{data.video.description}</Text>
            </div>
          )}

          <Divider />

          <div>
            <Text fw={500} mb="xs">Transcript:</Text>
            {data.transcriptAvailable ? (
              <ScrollArea h={200}>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {data.transcript}
                </Text>
              </ScrollArea>
            ) : (
              <Alert color="yellow" title="Transcript unavailable">
                YouTube does not allow downloading captions for this video.
                Showing description instead.
              </Alert>
            )}
          </div>

          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              loading={saving}
              color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
              onClick={handleSave}
              disabled={saveStatus === 'saved'}
            >
              {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error – Retry' : 'Save Video'}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  const posts = Array.isArray(result?.posts) ? result.posts : [];

  return (
    <Card withBorder radius="lg" shadow="sm" p="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} zIndex={1000} />
      <Stack gap="lg">
        <Group justify="space-between" align="baseline">
          <Title order={2}>Competitor Lookup</Title>
          <Text size="sm" c="dimmed">
            Search competitors on X/Twitter or YouTube
          </Text>
        </Group>

        <Tabs defaultValue="x" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>
              X / Twitter
            </Tabs.Tab>
            <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} />}>
              YouTube
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="x" pt="md">
            <form onSubmit={handleSubmit}>
              <Group align="end" wrap="wrap" gap="sm">
                <TextInput
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                  placeholder="@jack"
                  label="Username"
                  maw={420}
                  leftSection={<IconUser size={16} />}
                  aria-label="Username to lookup"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  leftSection={<IconSearch size={16} />}
                  disabled={!username.trim() || loading}
                >
                  Lookup
                </Button>
              </Group>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="youtube" pt="md">
            <form onSubmit={handleSubmitYouTube}>
              <Group align="end" wrap="wrap" gap="sm">
                <TextInput
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  label="YouTube URL"
                  maw={420}
                  leftSection={<IconBrandYoutube size={16} />}
                  aria-label="YouTube video URL to lookup"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  leftSection={<IconSearch size={16} />}
                  disabled={!youtubeUrl.trim() || loading}
                >
                  Lookup
                </Button>
              </Group>
            </form>
          </Tabs.Panel>
        </Tabs>

        {error && (
          <Alert
            variant="light"
            color={error.includes("not found") || error.includes("Invalid") ? "yellow" : "orange"}
            title={
              error.includes("not found") ? "Not found" :
                error.includes("Invalid") ? "Invalid input" :
                  "Connection error"
            }
            icon={<IconAlertCircle />}
            styles={{
              label: { fontWeight: 500 },
              message: { fontSize: "14px" }
            }}
          >
            <Text>{error}</Text>
          </Alert>
        )}

        {result && (
          <Stack gap="lg">
            <Card withBorder radius="md">
              <Stack gap="xs">
                <Title order={4}>Summary</Title>
                <Group gap="md" wrap="wrap">
                  <Group gap="xs">
                    <Text fw={500}>Username:</Text>
                    <Code>{result.username || "—"}</Code>
                  </Group>
                  <Copyable value={result.userId} label="User ID" />
                  <Group gap="xs">
                    <Text fw={500}>Backend:</Text>
                    <BackendBadge base={result._usedBackend} />
                  </Group>
                  <Group gap="xs">
                    <Text fw={500}>Posts:</Text>
                    <Badge variant="light" radius="sm">
                      {posts.length}
                    </Badge>
                  </Group>
                </Group>
              </Stack>
            </Card>

            {convertedData && convertedData.length > 0 && (
              <>
                <Divider label="Converted Data" />
                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>Universal Data Format</Title>
                    {convertedData.map((item, idx) => (
                      <Card key={idx} withBorder radius="sm" p="sm">
                        <Group gap="md" wrap="wrap">
                          <Group gap="xs">
                            <Text fw={500}>Name/Source:</Text>
                            <Badge variant="light">{item["Name/Source"]}</Badge>
                          </Group>
                          <Group gap="xs">
                            <Text fw={500}>Engagement:</Text>
                            <Badge variant="light" color="green">{item.Engagement}</Badge>
                          </Group>
                        </Group>
                        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
                          <Text fw={500} span>Message:</Text> {item.Message.substring(0, 150)}
                          {item.Message.length > 150 ? "..." : ""}
                        </Text>
                      </Card>
                    ))}
                  </Stack>
                </Card>
              </>
            )}

            <Divider label="Posts" />

            {posts.length === 0 ? (
              <Alert variant="light" color="gray" title="No posts returned">
                The API did not return any tweets for this user.
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md">
                {posts.map((p) => (
                  <PostCard key={p?.id ?? Math.random()} post={p} />
                ))}
              </SimpleGrid>
            )}
          </Stack>
        )}

        {youtubeResult && (
          <Stack gap="lg">
            <YouTubeCard data={youtubeResult} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}