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
  IconBrandLinkedin,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandReddit,
  IconCheck,
  IconCopy,
  IconInfoCircle,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { Checkbox, Transition } from "@mantine/core";

function LabelWithInfo({ label, info }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm">{label}</Text>
      <Tooltip label={info} multiline w={260} withArrow>
        <ActionIcon variant="subtle" size="xs" color="gray" radius="xl">
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

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
  const [linkedinOptions, setLinkedinOptions] = useState({
    profile: false,
    company: false,
    post: false,
  });
  const [linkedinInputs, setLinkedinInputs] = useState({
    profile: "",
    company: "",
    post: "",
  });
  const [instagramOptions, setInstagramOptions] = useState({});
  const [instagramInputs, setInstagramInputs] = useState({});
  const [tiktokOptions, setTiktokOptions] = useState({});
  const [tiktokInputs, setTiktokInputs] = useState({});



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

      // Convert the data using DataConverter
      try {
        const converted = convertXInput(data);
        setConvertedData(converted);
        console.log('Converted data:', converted);

        // Save last 10 posts to localStorage
        const postsToSave = (data.posts || []).slice(0, 10).map((post, index) => {
          const metrics = post.public_metrics || {};
          const engagement =
            (metrics.like_count || 0) +
            (metrics.retweet_count || 0) +
            (metrics.reply_count || 0);
          return {
            id: post.id,
            username: data.username,
            content: post.text,
            engagement: engagement,
            likes: metrics.like_count || 0,
            shares: metrics.retweet_count || 0,
            comments: metrics.reply_count || 0,
            timestamp: post.created_at,
          };
        });

        // Get existing posts from localStorage and prepend new ones
        const storageKey = currentUserId
          ? `recentCompetitorPosts_${currentUserId}`
          : 'recentCompetitorPosts';
        const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const allPosts = [...postsToSave, ...existingPosts];
        // Keep only the last 10 overall
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

    const metrics = post.public_metrics || [];
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'

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
      <Card withBorder radius="md" shadow="sm">
        <Group justify="space-between" mt="sm">
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
      </Card>
    );
  }

  function YouTubeCard({ data }) {
    if (!data) return null;

    const [saving, setSaving] = useState(false);

    async function handleSave() {
      try {
        setSaving(true);
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
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Failed to save video: ${resp.status} ${errorText}`);
        }

        await resp.json();
        // Optionally show success message
      } catch (e) {
        console.error("Error saving video:", e);
        // Optionally show error
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
              onClick={handleSave}
            >
              Save Video
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
            Search competitors across social platforms
          </Text>
        </Group>

        <Tabs defaultValue="x" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>
              X / Twitter
            </Tabs.Tab>
            <Tabs.Tab value="linkedin" leftSection={<IconBrandLinkedin size={16} color="#0A66C2" />}>
              LinkedIn
            </Tabs.Tab>
            <Tabs.Tab value="instagram" leftSection={<IconBrandInstagram size={16} color="#E1306C" />}>
              Instagram
            </Tabs.Tab>
            <Tabs.Tab value="tiktok" leftSection={<IconBrandTiktok size={16} />}>
              TikTok
            </Tabs.Tab>
            <Tabs.Tab value="reddit" leftSection={<IconBrandReddit size={16} color="#FF4500" />}>
              Reddit
            </Tabs.Tab>
            <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} color="#FF0000" />}>
              YouTube
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="x" pt="md">
            <form onSubmit={handleSubmit}>
              <Group align="end" wrap="wrap" gap="sm">
                <TextInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  onChange={(e) => setYoutubeUrl(e.target.value)}
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

          <Tabs.Panel value="linkedin" pt="md">
            <Stack gap="md">

              <Title order={4}>LinkedIn Lookup</Title>

              {/* Checkbox Options */}
              <Checkbox.Group
                value={Object.keys(linkedinOptions).filter(k => linkedinOptions[k])}
                onChange={(values) => {
                  setLinkedinOptions({
                    profile: values.includes("profile"),
                    company: values.includes("company"),
                    post: values.includes("post"),
                  });
                }}
                label="Select what you want to search"
              >
                <Stack mt="xs">
                  <Checkbox value="profile" label="Profile" />
                  <Checkbox value="company" label="Company" />
                  <Checkbox value="post" label="Post" />
                </Stack>
              </Checkbox.Group>

              <Stack gap="sm">
                {linkedinOptions.profile && (
                  <TextInput
                    label="Profile URL or username (1 credit)"
                    placeholder="https://linkedin.com/in/..."
                    value={linkedinInputs.profile}
                    onChange={(e) =>
                      setLinkedinInputs((prev) => ({
                        ...prev,
                        profile: e.target.value,
                      }))
                    }
                  />
                )}
                {linkedinOptions.company && (
                  <TextInput
                    label="Company URL or name (1 credit)"
                    placeholder="https://linkedin.com/company/..."
                    value={linkedinInputs.company}
                    onChange={(e) =>
                      setLinkedinInputs((prev) => ({
                        ...prev,
                        company: e.target.value,
                      }))
                    }
                  />
                )}
                {linkedinOptions.post && (
                  <TextInput
                    label="Post URL (1 credit)"
                    placeholder="https://linkedin.com/posts/..."
                    value={linkedinInputs.post}
                    onChange={(e) =>
                      setLinkedinInputs((prev) => ({
                        ...prev,
                        post: e.target.value,
                      }))
                    }
                  />
                )}
              </Stack>

              <Button
                leftSection={<IconSearch size={16} />}
                disabled={
                  !linkedinOptions.profile &&
                  !linkedinOptions.company &&
                  !linkedinOptions.post
                }
              >
                Search LinkedIn
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="instagram" pt="md">
            <Stack gap="lg">

              <Title order={4}>Instagram Lookup</Title>

              <Text size="sm" c="dimmed">
                Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
              </Text>

              {/* PROFILE SECTION */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>👤 Profile & Account</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Profile" info="Scrapes detailed profile info including bio, followers, following, and account stats." />}
                    checked={instagramOptions.profile || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, profile: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Basic Profile" info="Scrapes basic profile info including username, display name, and profile picture." />}
                    checked={instagramOptions.basicProfile || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, basicProfile: e.target.checked }))}
                  />

                  {(instagramOptions.profile || instagramOptions.basicProfile) && (
                    <TextInput label="Username" placeholder="@username" value={instagramInputs.username || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, username: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              {/* POSTS SECTION */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>📝 Posts & Content</Text>

                  <Checkbox
                    label={<LabelWithInfo label="User Posts" info="Scrapes the user's recent posts including images, videos, captions, and engagement metrics." />}
                    checked={instagramOptions.userPosts || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, userPosts: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Post / Reel Info" info="Scrapes detailed info about a specific post or reel including media, caption, likes, and metadata." />}
                    checked={instagramOptions.singlePost || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, singlePost: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Post Comments" info="Scrapes all comments on a specific post including user details, timestamps, and nested replies." />}
                    checked={instagramOptions.postComments || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, postComments: e.target.checked }))}
                  />

                  {instagramOptions.userPosts && (
                    <TextInput label="Username" placeholder="@username" value={instagramInputs.userPostsUsername || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, userPostsUsername: e.target.value }))} />
                  )}

                  {(instagramOptions.singlePost || instagramOptions.postComments) && (
                    <TextInput label="Post URL" placeholder="https://instagram.com/p/..." value={instagramInputs.postUrl || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              {/* REELS SECTION */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>🎥 Reels</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Search Reels" info="Searches for reels by keyword or hashtag and returns matching video content with metadata." />}
                    checked={instagramOptions.reelsSearch || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, reelsSearch: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="User Reels" info="Scrapes all reels from a specific user's profile including video URLs, captions, and engagement data." />}
                    checked={instagramOptions.userReels || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, userReels: e.target.checked }))}
                  />

                  {instagramOptions.reelsSearch && (
                    <TextInput label="Search Term" placeholder="fitness, #workout" value={instagramInputs.reelsSearchTerm || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, reelsSearchTerm: e.target.value }))} />
                  )}

                  {instagramOptions.userReels && (
                    <TextInput label="Username" placeholder="@username" value={instagramInputs.userReelsUsername || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, userReelsUsername: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              {/* HIGHLIGHTS SECTION */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>⭐ Highlights</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Highlight Detail" info="Scrapes detailed info about a specific story highlight including all stories, media URLs, and metadata." />}
                    checked={instagramOptions.highlightDetail || false}
                    onChange={(e) => setInstagramOptions(prev => ({ ...prev, highlightDetail: e.target.checked }))}
                  />

                  {instagramOptions.highlightDetail && (
                    <TextInput label="Highlight URL" placeholder="https://instagram.com/stories/highlights/..." value={instagramInputs.highlightUrl || ""}
                      onChange={(e) => setInstagramInputs(prev => ({ ...prev, highlightUrl: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              <Button
                leftSection={<IconSearch size={16} />}
                disabled={!Object.values(instagramOptions).some(Boolean)}
              >
                Search Instagram
              </Button>
            </Stack>
          </Tabs.Panel>


          <Tabs.Panel value="tiktok" pt="md">
            <Stack gap="lg">

              <Title order={4}>TikTok Lookup</Title>

              <Text size="sm" c="dimmed">
                Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
              </Text>

              {/* PROFILE & ACCOUNT */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>👤 Profile & Account</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Profile" info="Scrapes TikTok profile details including bio, follower/following counts, likes, and verified status." />}
                    checked={tiktokOptions.profile || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, profile: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Following" info="Scrapes the list of accounts a user is following." />}
                    checked={tiktokOptions.following || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, following: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Followers" info="Scrapes the list of followers for a specific user." />}
                    checked={tiktokOptions.followers || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, followers: e.target.checked }))}
                  />

                  {(tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && (
                    <TextInput label="Username" placeholder="@username" value={tiktokInputs.username || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, username: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              {/* VIDEOS & CONTENT */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>🎬 Videos & Content</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Profile Videos" info="Scrapes all videos from a user's profile including captions, view counts, and engagement." />}
                    checked={tiktokOptions.profileVideos || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, profileVideos: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Video Info" info="Scrapes detailed info about a specific video including stats, audio, effects, and metadata." />}
                    checked={tiktokOptions.videoInfo || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, videoInfo: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Transcript" info="Extracts the spoken transcript from a TikTok video." />}
                    checked={tiktokOptions.transcript || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, transcript: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Comments" info="Scrapes all comments on a specific video including user details and timestamps." />}
                    checked={tiktokOptions.comments || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, comments: e.target.checked }))}
                  />

                  {tiktokOptions.profileVideos && (
                    <TextInput label="Username" placeholder="@username" value={tiktokInputs.videosUsername || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, videosUsername: e.target.value }))} />
                  )}

                  {(tiktokOptions.videoInfo || tiktokOptions.transcript || tiktokOptions.comments) && (
                    <TextInput label="Video URL" placeholder="https://tiktok.com/@user/video/..." value={tiktokInputs.videoUrl || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              {/* SEARCH & DISCOVERY */}
              <Card withBorder radius="md" p="md">
                <Stack gap="xs">
                  <Text fw={600}>🔍 Search & Discovery</Text>

                  <Checkbox
                    label={<LabelWithInfo label="Search Users" info="Search for TikTok users by name or keyword and return matching profiles." />}
                    checked={tiktokOptions.searchUsers || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchUsers: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Search by Hashtag" info="Search for videos associated with a specific hashtag." />}
                    checked={tiktokOptions.searchHashtag || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchHashtag: e.target.checked }))}
                  />

                  <Checkbox
                    label={<LabelWithInfo label="Search by Keyword" info="Search for videos matching a keyword query across TikTok." />}
                    checked={tiktokOptions.searchKeyword || false}
                    onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchKeyword: e.target.checked }))}
                  />

                  {tiktokOptions.searchUsers && (
                    <TextInput label="User Search Query" placeholder="fitness creator" value={tiktokInputs.userSearchQuery || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, userSearchQuery: e.target.value }))} />
                  )}

                  {tiktokOptions.searchHashtag && (
                    <TextInput label="Hashtag" placeholder="#fitness" value={tiktokInputs.hashtag || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, hashtag: e.target.value }))} />
                  )}

                  {tiktokOptions.searchKeyword && (
                    <TextInput label="Keyword" placeholder="workout routine" value={tiktokInputs.keyword || ""}
                      onChange={(e) => setTiktokInputs(prev => ({ ...prev, keyword: e.target.value }))} />
                  )}
                </Stack>
              </Card>

              <Button
                leftSection={<IconSearch size={16} />}
                disabled={!Object.values(tiktokOptions).some(Boolean)}
              >
                Search TikTok
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="reddit" pt="md">
            <Alert variant="light" color="orange" title="Reddit Lookup Coming Soon">
              Reddit competitor search UI placeholder.
            </Alert>
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