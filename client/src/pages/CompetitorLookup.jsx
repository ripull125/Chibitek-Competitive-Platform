import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, Collapse, Divider, Group,
  LoadingOverlay, NumberInput, Stack, Text, TextInput, Title, Tabs, Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle, IconBrandX, IconBrandYoutube, IconChevronDown, IconChevronUp,
  IconSearch, IconUser, IconDeviceFloppy,
} from "@tabler/icons-react";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

function avatarInitial(str) {
  return (str || "?")[0].toUpperCase();
}

export default function CompetitorLookup() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "competitor-lookup" } }));
  }, []);

  // auth — undefined = still loading, null = not logged in, string = logged in
  const [currentUserId, setCurrentUserId] = useState(undefined);
  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) { if (mounted) setCurrentUserId(null); return; }
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setCurrentUserId(data?.user?.id ?? null);
      } catch {
        if (mounted) setCurrentUserId(null);
      }
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  // lookup state
  const [activeTab, setActiveTab] = useState("x");
  const [username, setUsername] = useState("");
  const [postCount, setPostCount] = useState(10);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [youtubeResult, setYoutubeResult] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // clear results when switching tabs so they don't bleed through
  function handleTabChange(tab) {
    setActiveTab(tab);
    setResult(null);
    setYoutubeResult(null);
    setError(null);
    setBulkResult(null);
  }

  const backends = useMemo(() => {
    const bases = new Set();
    if (apiBase) bases.add(apiBase);
    if (import.meta.env.DEV) bases.add("http://localhost:8080");
    return Array.from(bases);
  }, []);

  async function tryFetch(usernameToFetch, count) {
    const trimmed = String(usernameToFetch || "").trim().replace(/^@/, "");
    if (!trimmed) throw new Error("Please enter a username.");
    const attempts = [];
    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/x/fetch/${encodeURIComponent(trimmed)}?count=${encodeURIComponent(count)}`;
      try {
        const resp = await fetch(url);
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error(`Expected JSON, got: ${(await resp.text()).slice(0, 200)}`);
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error || `Request failed ${resp.status}`);
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }
    const notFound = attempts.find(a => {
      const l = a.error.toLowerCase();
      return a.error.includes("404") || l.includes("not found") || l.includes("user does not exist");
    });
    if (notFound) { const err = new Error(`Username "@${trimmed}" not found.`); err.type = "not_found"; throw err; }
    throw new Error("Couldn't connect to the server. Make sure it's running.");
  }

  async function tryFetchYouTube(videoUrl) {
    const trimmed = String(videoUrl || "").trim();
    if (!trimmed) throw new Error("Please enter a YouTube URL.");
    const attempts = [];
    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/youtube/transcript?video=${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url);
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error(`Expected JSON, got: ${(await resp.text()).slice(0, 200)}`);
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error || `Request failed ${resp.status}`);
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }
    throw new Error("Couldn't connect to the server. Make sure it's running.");
  }

  async function savePost(postPayload) {
    const resp = await fetch(apiUrl("/api/posts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      if (text.includes("duplicate key") || text.includes("unique constraint") || text.includes("already exists")) return "duplicate";
      throw new Error(`${resp.status} ${text}`);
    }
    return "saved";
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null); setResult(null); setBulkResult(null);
    const u = username.trim();
    if (!u) { setError("Please enter a username."); return; }
    const safeCount = Math.max(5, Math.min(100, Number(postCount) || 10));
    setLoading(true);
    try {
      const data = await tryFetch(u, safeCount);
      setResult(data);
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitYouTube(e) {
    e?.preventDefault?.();
    setError(null); setYoutubeResult(null);
    const u = youtubeUrl.trim();
    if (!u) { setError("Please enter a YouTube URL."); return; }
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

  async function handleSaveAll() {
    if (!currentUserId || !result?.posts?.length) return;
    setBulkSaving(true);
    setBulkResult(null);
    let saved = 0, skipped = 0, failed = 0;
    for (const post of result.posts) {
      try {
        const metrics = post.public_metrics || {};
        const status = await savePost({
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
          author_name: result.name || result.username,
          author_handle: result.username,
        });
        status === "duplicate" ? skipped++ : saved++;
      } catch { failed++; }
    }
    setBulkSaving(false);
    setBulkResult({ saved, skipped, failed });
  }

  // ── X Post Card ────────────────────────────────────────────────────────────
  function XPostCard({ post }) {
    if (!post?.text) return null;
    const metrics = post.public_metrics || {};
    const [expanded, setExpanded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const isLong = post.text.length > 280;
    const preview = isLong && !expanded ? post.text.slice(0, 280) + "…" : post.text;
    const date = post.created_at
      ? new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    async function handleSave() {
      if (!currentUserId) { setSaveStatus("error"); return; }
      setSaving(true); setSaveStatus(null);
      try {
        await savePost({
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
          author_name: result.name || result.username,
          author_handle: result.username,
        });
        setSaveStatus("saved");
      } catch { setSaveStatus("error"); }
      finally { setSaving(false); }
    }

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
              {avatarInitial(result.name || result.username)}
            </div>
            <div>
              <Text fw={700} size="sm" lh={1.2}>{result.name || result.username}</Text>
              <Text size="xs" c="dimmed">@{result.username}</Text>
            </div>
            <IconBrandX size={16} style={{ marginLeft: "auto", color: "#000" }} />
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

          {date && <Text size="xs" c="dimmed">{date}</Text>}
          <Divider />

          <Group justify="space-between" align="center">
            <Group gap="md">
              <Text size="xs" c="dimmed">❤️ {(metrics.like_count ?? 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">🔁 {(metrics.retweet_count ?? 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">💬 {(metrics.reply_count ?? 0).toLocaleString()}</Text>
            </Group>
            <Button size="xs" variant="light" loading={saving}
              color={saveStatus === "saved" ? "green" : saveStatus === "error" ? "red" : undefined}
              disabled={saveStatus === "saved" || currentUserId === undefined}
              onClick={handleSave}
            >
              {saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error – Retry" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  // ── YouTube Card ───────────────────────────────────────────────────────────
  function YouTubeCard({ data }) {
    if (!data) return null;
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [showTranscript, setShowTranscript] = useState(false);
    const [showDesc, setShowDesc] = useState(false);
    const descLong = (data.video?.description || "").length > 200;
    const date = data.video?.publishedAt
      ? new Date(data.video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    async function handleSave() {
      if (!currentUserId) { setSaveStatus("error"); return; }
      setSaving(true); setSaveStatus(null);
      try {
        await savePost({
          platform_id: 8,
          platform_user_id: data.video.channelId,
          username: data.video.channelTitle,
          platform_post_id: data.videoId,
          content: data.transcript || data.video.description,
          published_at: data.video.publishedAt,
          likes: data.video.stats.likes || 0,
          shares: 0,
          comments: data.video.stats.comments || 0,
          user_id: currentUserId,
          title: data.video.title,
          description: data.video.description,
          channelTitle: data.video.channelTitle,
          videoId: data.videoId,
          views: data.video.stats.views,
        });
        setSaveStatus("saved");
      } catch { setSaveStatus("error"); }
      finally { setSaving(false); }
    }

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
            <div>
              <Text fw={700} size="sm" lh={1.2}>{data.video?.channelTitle || "Unknown Channel"}</Text>
              {date && <Text size="xs" c="dimmed">{date}</Text>}
            </div>
          </Group>

          <Text fw={600} size="md">{data.video?.title || "Untitled Video"}</Text>

          {data.video?.description && (
            <div>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {descLong && !showDesc ? data.video.description.slice(0, 200) + "…" : data.video.description}
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

          {data.transcriptAvailable && data.transcript && (
            <div>
              <Button variant="subtle" size="xs" p={0} h="auto"
                leftSection={showTranscript ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "Hide transcript" : "Show transcript"}
              </Button>
              <Collapse in={showTranscript}>
                <Text size="xs" c="dimmed" mt="xs" style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
                  {data.transcript}
                </Text>
              </Collapse>
            </div>
          )}

          <Divider />

          <Group justify="space-between" align="center">
            <Group gap="md">
              <Text size="xs" c="dimmed">👁 {(data.video?.stats?.views || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">❤️ {(data.video?.stats?.likes || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">💬 {(data.video?.stats?.comments || 0).toLocaleString()}</Text>
            </Group>
            <Button size="xs" variant="light" loading={saving}
              color={saveStatus === "saved" ? "green" : saveStatus === "error" ? "red" : undefined}
              disabled={saveStatus === "saved" || currentUserId === undefined}
              onClick={handleSave}
            >
              {saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error – Retry" : "Save"}
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
          <Text size="sm" c="dimmed">Search competitors on X/Twitter or YouTube</Text>
        </Group>

        <Tabs value={activeTab} onChange={handleTabChange} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>X / Twitter</Tabs.Tab>
            <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} />}>YouTube</Tabs.Tab>
          </Tabs.List>

          {/* ── X tab ── */}
          <Tabs.Panel value="x" pt="md">
            <Stack gap="md">
              <form onSubmit={handleSubmit}>
                <Group align="end" gap="sm" wrap="wrap">
                  <TextInput
                    value={username}
                    onChange={(e) => setUsername(e.currentTarget.value)}
                    placeholder="@jack"
                    label="Username"
                    maw={300}
                    leftSection={<IconUser size={16} />}
                    autoComplete="off"
                  />
                  <NumberInput
                    value={postCount}
                    onChange={(val) => setPostCount(Number(val) || 10)}
                    label="Posts to fetch"
                    min={5}
                    max={100}
                    w={130}
                    description="Min 5 · Max 100"
                  />
                  <Button type="submit" leftSection={<IconSearch size={16} />}
                    disabled={!username.trim() || loading} mt={2}>
                    Lookup
                  </Button>
                </Group>
              </form>

              {error && activeTab === "x" && (
                <Alert variant="light"
                  color={error.includes("not found") ? "yellow" : "orange"}
                  title={error.includes("not found") ? "Not found" : "Error"}
                  icon={<IconAlertCircle />}
                >
                  {error}
                </Alert>
              )}

              {result && (
                <Stack gap="md">
                  <Card withBorder radius="md" p="md">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <IconBrandX size={18} />
                        <Text fw={700}>@{result.username}</Text>
                        {result.name && result.name !== result.username && (
                          <Text c="dimmed" size="sm">· {result.name}</Text>
                        )}
                        <Badge variant="light" color="gray">{posts.length} posts fetched</Badge>
                      </Group>
                      {posts.length > 0 && currentUserId && (
                        <Tooltip label="Save all posts for keyword analysis">
                          <Button size="sm" variant="filled"
                            leftSection={<IconDeviceFloppy size={16} />}
                            loading={bulkSaving}
                            onClick={handleSaveAll}
                          >
                            Save All ({posts.length})
                          </Button>
                        </Tooltip>
                      )}
                    </Group>
                    {bulkResult && (
                      <Text size="xs" c="dimmed" mt="xs">
                        Saved {bulkResult.saved} posts
                        {bulkResult.skipped > 0 ? `, ${bulkResult.skipped} already existed` : ""}
                        {bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ""}
                      </Text>
                    )}
                  </Card>

                  {posts.length === 0 ? (
                    <Alert color="gray">No posts returned for this account.</Alert>
                  ) : (
                    <Stack gap="sm">
                      {posts.map((p) => <XPostCard key={p?.id ?? Math.random()} post={p} />)}
                    </Stack>
                  )}
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>

          {/* ── YouTube tab ── */}
          <Tabs.Panel value="youtube" pt="md">
            <Stack gap="md">
              <form onSubmit={handleSubmitYouTube}>
                <Group align="end" gap="sm">
                  <TextInput
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    label="YouTube URL"
                    maw={420}
                    leftSection={<IconBrandYoutube size={16} />}
                    autoComplete="off"
                  />
                  <Button type="submit" leftSection={<IconSearch size={16} />}
                    disabled={!youtubeUrl.trim() || loading}>
                    Lookup
                  </Button>
                </Group>
              </form>

              {error && activeTab === "youtube" && (
                <Alert variant="light" color="orange" title="Error" icon={<IconAlertCircle />}>
                  {error}
                </Alert>
              )}

              {youtubeResult && <YouTubeCard data={youtubeResult} />}
            </Stack>
          </Tabs.Panel>


        </Tabs>
      </Stack>
    </Card>
  );
}