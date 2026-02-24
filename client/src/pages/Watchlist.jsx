/* client/src/pages/Watchlist.jsx — Auto-Scrape Watchlist Manager */
import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Title,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  ActionIcon,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Modal,
  Loader,
  Tooltip,
  Divider,
  Paper,
  SimpleGrid,
  ThemeIcon,
  Collapse,
  Alert,
  ScrollArea,
  Code,
  Tabs,
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconPlayerPlay,
  IconPlayerPlayFilled,
  IconRefresh,
  IconBrandX,
  IconBrandYoutube,
  IconBrandReddit,
  IconBrandLinkedin,
  IconBrandInstagram,
  IconBrandTiktok,
  IconRobot,
  IconAlertCircle,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconBookmark,
} from "@tabler/icons-react";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";

/* ── Platform metadata ─────────────────────────────────────────────── */
const PLATFORMS = {
  x:         { label: "X (Twitter)", color: "dark",   icon: IconBrandX },
  youtube:   { label: "YouTube",     color: "red",    icon: IconBrandYoutube },
  reddit:    { label: "Reddit",      color: "orange", icon: IconBrandReddit },
  linkedin:  { label: "LinkedIn",    color: "blue",   icon: IconBrandLinkedin },
  instagram: { label: "Instagram",   color: "grape",  icon: IconBrandInstagram },
  tiktok:    { label: "TikTok",      color: "cyan",   icon: IconBrandTiktok },
};

/* ── Scrape-type options per platform ──────────────────────────────── */
const SCRAPE_TYPES = {
  x: [
    { value: "user_posts",    label: "User Posts",    placeholder: "e.g. @elonmusk" },
    { value: "user_mentions", label: "User Mentions",  placeholder: "e.g. @openai" },
    { value: "followers",     label: "Followers List", placeholder: "e.g. @github" },
    { value: "following",     label: "Following List", placeholder: "e.g. @github" },
    { value: "search",        label: "Search Query",   placeholder: "e.g. AI agents" },
  ],
  youtube: [
    { value: "channel_videos",  label: "Channel Videos",  placeholder: "Channel URL or @handle" },
    { value: "channel_details", label: "Channel Details",  placeholder: "Channel URL or @handle" },
    { value: "video_details",   label: "Video Details",    placeholder: "Video URL or ID" },
    { value: "video_comments",  label: "Video Comments",   placeholder: "Video URL or ID" },
    { value: "search",          label: "Search",           placeholder: "Search query" },
  ],
  reddit: [
    { value: "subreddit_posts",   label: "Subreddit Posts",   placeholder: "e.g. r/MCP or MCP" },
    { value: "subreddit_details", label: "Subreddit Details",  placeholder: "e.g. r/artificial" },
    { value: "search",            label: "Search",             placeholder: "Search query" },
  ],
  linkedin: [
    { value: "profile", label: "Profile",      placeholder: "LinkedIn profile URL" },
    { value: "company", label: "Company Page",  placeholder: "LinkedIn company URL" },
    { value: "post",    label: "Single Post",   placeholder: "LinkedIn post URL" },
  ],
  instagram: [
    { value: "profile",     label: "Profile",     placeholder: "e.g. @natgeo" },
    { value: "user_posts",  label: "User Posts",   placeholder: "e.g. @natgeo" },
    { value: "user_reels",  label: "User Reels",   placeholder: "e.g. @natgeo" },
  ],
  tiktok: [
    { value: "profile",         label: "Profile",        placeholder: "e.g. @tiktok" },
    { value: "profile_videos",  label: "Profile Videos",  placeholder: "e.g. @tiktok" },
    { value: "search",          label: "Keyword Search",  placeholder: "Search keyword" },
  ],
};

/* ── Config fields shown per platform+scrape_type ──────────────────── */
// Each entry: { key (in config JSON), label, type, default, min, max, description }
const CONFIG_FIELDS = {
  x: {
    user_posts:    [{ key: "max_results", label: "Max posts",      type: "number", defaultVal: 10, min: 1, max: 100 }],
    user_mentions: [{ key: "max_results", label: "Max mentions",   type: "number", defaultVal: 10, min: 1, max: 100 }],
    followers:     [{ key: "max_results", label: "Max followers",  type: "number", defaultVal: 20, min: 1, max: 100 }],
    following:     [{ key: "max_results", label: "Max following",  type: "number", defaultVal: 20, min: 1, max: 100 }],
    search:        [{ key: "max_results", label: "Max results",    type: "number", defaultVal: 10, min: 1, max: 100 }],
  },
  youtube: {
    channel_videos: [{ key: "max_results", label: "Max videos",    type: "number", defaultVal: 10, min: 1, max: 50 }],
    video_comments: [{ key: "max_results", label: "Max comments",  type: "number", defaultVal: 20, min: 1, max: 100 }],
    search:         [{ key: "max_results", label: "Max results",   type: "number", defaultVal: 10, min: 1, max: 50 }],
  },
  reddit: {
    subreddit_posts: [{ key: "max_results", label: "Max posts",   type: "number", defaultVal: 25, min: 1, max: 100 }],
    search:          [{ key: "max_results", label: "Max results",  type: "number", defaultVal: 25, min: 1, max: 100 }],
  },
  linkedin: {},
  instagram: {
    user_posts:  [{ key: "max_results", label: "Max posts",  type: "number", defaultVal: 12, min: 1, max: 50 }],
    user_reels:  [{ key: "max_results", label: "Max reels",  type: "number", defaultVal: 12, min: 1, max: 50 }],
  },
  tiktok: {
    profile_videos: [{ key: "max_results", label: "Max videos",   type: "number", defaultVal: 20, min: 1, max: 50 }],
    search:         [{ key: "max_results", label: "Max results",  type: "number", defaultVal: 20, min: 1, max: 50 }],
  },
};

/* ── Helpers ───────────────────────────────────────────────────────── */
async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id;
}

async function apiFetch(path, opts = {}) {
  const userId = await getUserId();
  const url = apiUrl(path);
  const headers = { "Content-Type": "application/json", "x-user-id": userId, ...opts.headers };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function relativeTime(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */
export default function Watchlist() {
  const { t } = useTranslation();

  /* ── state ───────────────────────── */
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningIds, setRunningIds] = useState(new Set());

  // per-card results: { [itemId]: { success, data, error, scrape_type } }
  const [cardResults, setCardResults] = useState({});
  // which cards have their results expanded
  const [expandedCards, setExpandedCards] = useState(new Set());

  // results viewer modal (full-screen view)
  const [viewData, setViewData] = useState(null);   // { label, platform, scrapeType, data }
  const [viewOpen, setViewOpen] = useState(false);

  // add-item form
  const [addOpen, setAddOpen] = useState(false);
  const [formPlatform, setFormPlatform] = useState("x");
  const [formType, setFormType] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formConfig, setFormConfig] = useState({});
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // delete confirmation
  const [deleteId, setDeleteId] = useState(null);

  /* ── load items ──────────────────── */
  const loadItems = async () => {
    setLoading(true);
    try {
      const { items: data } = await apiFetch("/api/watchlist");
      setItems(data || []);
    } catch (err) {
      console.error("failed to load watchlist:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  /* ── add item ────────────────────── */
  const handleAdd = async () => {
    setFormError("");
    if (!formType || !formTarget.trim()) {
      setFormError("Scrape type and target are required.");
      return;
    }
    setFormSaving(true);
    try {
      // Build config — only include non-default values
      const configToSend = {};
      const fields = (CONFIG_FIELDS[formPlatform] || {})[formType] || [];
      for (const f of fields) {
        const val = formConfig[f.key];
        if (val !== undefined && val !== null && val !== f.defaultVal) {
          configToSend[f.key] = val;
        } else {
          configToSend[f.key] = f.defaultVal;
        }
      }

      await apiFetch("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({
          platform: formPlatform,
          scrape_type: formType,
          target: formTarget.trim(),
          label: formLabel.trim() || formTarget.trim(),
          config: configToSend,
        }),
      });
      setAddOpen(false);
      setFormTarget("");
      setFormLabel("");
      setFormType("");
      setFormConfig({});
      await loadItems();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  /* ── toggle enabled ──────────────── */
  const toggleEnabled = async (item) => {
    try {
      await apiFetch(`/api/watchlist/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: !i.enabled } : i)));
    } catch (err) {
      console.error("toggle error:", err);
    }
  };

  /* ── delete item ─────────────────── */
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await apiFetch(`/api/watchlist/${deleteId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
    } catch (err) {
      console.error("delete error:", err);
    } finally {
      setDeleteId(null);
    }
  };

  /* ── run individual item ─────────── */
  const runItem = async (itemId) => {
    setRunningIds((prev) => new Set(prev).add(itemId));
    try {
      const res = await apiFetch(`/api/watchlist/run?item_id=${itemId}`, { method: "POST" });
      // Store result for this card and auto-expand it
      for (const r of (res.results || [])) {
        setCardResults((prev) => ({ ...prev, [r.id]: { success: r.success, data: r.data, error: r.error, scrape_type: r.scrape_type } }));
        setExpandedCards((prev) => new Set(prev).add(r.id));
      }
      await loadItems();
    } catch (err) {
      console.error("run error:", err);
    } finally {
      setRunningIds((prev) => {
        const n = new Set(prev);
        n.delete(itemId);
        return n;
      });
    }
  };

  /* ── run ALL enabled items ───────── */
  const runAll = async () => {
    setRunningAll(true);
    try {
      const res = await apiFetch("/api/watchlist/run", { method: "POST" });
      // Store results per card and expand all that succeeded
      const newResults = {};
      const newExpanded = new Set(expandedCards);
      for (const r of (res.results || [])) {
        newResults[r.id] = { success: r.success, data: r.data, error: r.error, scrape_type: r.scrape_type };
        if (r.success && r.data) newExpanded.add(r.id);
      }
      setCardResults((prev) => ({ ...prev, ...newResults }));
      setExpandedCards(newExpanded);
      await loadItems();
    } catch (err) {
      console.error("run-all error:", err);
    } finally {
      setRunningAll(false);
    }
  };

  /* ── derived helpers ─────────────── */
  const enabledCount = useMemo(() => items.filter((i) => i.enabled).length, [items]);
  const currentScrapeTypes = SCRAPE_TYPES[formPlatform] || [];

  // reset form type + config when platform changes
  useEffect(() => { setFormType(""); setFormConfig({}); }, [formPlatform]);
  // reset config when scrape type changes
  useEffect(() => { setFormConfig({}); }, [formType]);

  const selectedTypeMeta = currentScrapeTypes.find((s) => s.value === formType);

  /* ═══ render ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "24px 32px", maxWidth: 960 }}>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>
            <IconRobot size={28} style={{ verticalAlign: "middle", marginRight: 8 }} />
            Auto-Scrape Watchlist
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            Define what to scrape automatically. Run all enabled items at once or individually.
          </Text>
        </div>

        <Group>
          <Tooltip label="Refresh list">
            <ActionIcon variant="subtle" onClick={loadItems} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>

          <Button
            leftSection={<IconPlayerPlayFilled size={16} />}
            color="teal"
            loading={runningAll}
            disabled={enabledCount === 0}
            onClick={runAll}
          >
            Run All ({enabledCount})
          </Button>

          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
            Add Item
          </Button>
        </Group>
      </Group>

      {/* ── Loading state ──────────────────────────────────────────── */}
      {loading && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {!loading && items.length === 0 && (
        <Paper withBorder p="xl" ta="center" radius="md">
          <IconRobot size={48} style={{ opacity: 0.25 }} />
          <Text mt="md" c="dimmed">
            Your watchlist is empty. Add items to start auto-scraping competitors, channels, and subreddits.
          </Text>
          <Button mt="md" leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
            Add Your First Item
          </Button>
        </Paper>
      )}

      {/* ── Item cards ─────────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <Stack gap="md">
          {items.map((item) => {
            const pMeta = PLATFORMS[item.platform] || {};
            const PIcon = pMeta.icon || IconRobot;
            const isRunning = runningIds.has(item.id);
            const result = cardResults[item.id];
            const isExpanded = expandedCards.has(item.id);

            return (
              <Card key={item.id} withBorder shadow="xs" radius="md" padding="md">
                <Group justify="space-between" mb={8}>
                  <Group gap={8}>
                    <ThemeIcon variant="light" color={pMeta.color || "gray"} size="sm">
                      <PIcon size={14} />
                    </ThemeIcon>
                    <Text fw={600} size="sm">{item.label || item.target}</Text>
                    <Badge size="sm" color={pMeta.color || "gray"} variant="light">
                      {pMeta.label}
                    </Badge>
                    <Badge size="sm" variant="outline">
                      {item.scrape_type.replace(/_/g, " ")}
                    </Badge>
                  </Group>
                  <Group gap={8}>
                    <Switch
                      size="xs"
                      checked={item.enabled}
                      onChange={() => toggleEnabled(item)}
                      label={item.enabled ? "On" : "Off"}
                    />
                  </Group>
                </Group>

                <Group gap="lg" mb={8}>
                  <Text size="xs" c="dimmed" lineClamp={1} title={item.target}>
                    Target: {item.target}
                  </Text>
                  {item.config && Object.keys(item.config).length > 0 && (
                    <Text size="xs" c="dimmed">
                      {Object.entries(item.config).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    Last run: {relativeTime(item.last_run_at)}
                  </Text>
                </Group>

                <Group gap={6}>
                  <Tooltip label="Run now">
                    <Button
                      variant="light"
                      color="teal"
                      size="compact-xs"
                      loading={isRunning}
                      leftSection={<IconPlayerPlay size={12} />}
                      onClick={() => runItem(item.id)}
                    >
                      Run
                    </Button>
                  </Tooltip>

                  {/* Show/hide results toggle — only if we have data */}
                  {result?.success && result?.data && (
                    <>
                      <Button
                        variant="light"
                        size="compact-xs"
                        leftSection={isExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                        onClick={() => {
                          setExpandedCards((prev) => {
                            const n = new Set(prev);
                            n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                            return n;
                          });
                        }}
                      >
                        {isExpanded ? "Hide Results" : "Show Results"}
                      </Button>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<IconEye size={12} />}
                        onClick={() => {
                          setViewData({ label: item.label, platform: item.platform, scrapeType: result.scrape_type || item.scrape_type, data: result.data });
                          setViewOpen(true);
                        }}
                      >
                        Expand
                      </Button>
                    </>
                  )}
                  {result && !result.success && (
                    <Badge size="sm" color="red" variant="light">
                      Error: {result.error}
                    </Badge>
                  )}

                  <div style={{ flex: 1 }} />
                  <Tooltip label="Delete">
                    <ActionIcon variant="light" color="red" size="sm" onClick={() => setDeleteId(item.id)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {/* ── Inline results ───────────────────────────────── */}
                <Collapse in={isExpanded && result?.success && !!result?.data}>
                  <Divider my={8} />
                  <ScrollArea h={320} type="auto" offsetScrollbars>
                    <ResultsRenderer
                      platform={item.platform}
                      scrapeType={result?.scrape_type || item.scrape_type}
                      data={result?.data}
                    />
                  </ScrollArea>
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* ── Add-item Modal ─────────────────────────────────────────── */}
      <Modal
        opened={addOpen}
        onClose={() => { setAddOpen(false); setFormError(""); }}
        title="Add Watchlist Item"
        size="md"
      >
        <Stack>
          <Select
            label="Platform"
            data={Object.entries(PLATFORMS).map(([k, v]) => ({ value: k, label: v.label }))}
            value={formPlatform}
            onChange={(v) => setFormPlatform(v)}
          />

          <Select
            label="Scrape Type"
            placeholder="Select what to scrape"
            data={currentScrapeTypes.map((s) => ({ value: s.value, label: s.label }))}
            value={formType}
            onChange={(v) => setFormType(v)}
          />

          <TextInput
            label="Target"
            placeholder={selectedTypeMeta?.placeholder || "Username, URL, or search query"}
            value={formTarget}
            onChange={(e) => setFormTarget(e.currentTarget.value)}
          />

          <TextInput
            label="Label (optional)"
            placeholder="Friendly name for this item"
            value={formLabel}
            onChange={(e) => setFormLabel(e.currentTarget.value)}
          />

          {/* ── Per-platform config fields ───────────────────────── */}
          {(() => {
            const fields = (CONFIG_FIELDS[formPlatform] || {})[formType] || [];
            if (!fields.length) return null;
            return (
              <>
                <Divider label="Options" labelPosition="center" />
                {fields.map((f) => (
                  <NumberInput
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    min={f.min}
                    max={f.max}
                    value={formConfig[f.key] ?? f.defaultVal}
                    onChange={(val) => setFormConfig((prev) => ({ ...prev, [f.key]: val }))}
                  />
                ))}
              </>
            );
          })()}

          {formError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {formError}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button loading={formSaving} onClick={handleAdd}>Add to Watchlist</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Delete confirmation ────────────────────────────────────── */}
      <Modal
        opened={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Remove Item"
        size="sm"
      >
        <Text size="sm">Are you sure you want to remove this item from your watchlist?</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="red" onClick={confirmDelete}>Delete</Button>
        </Group>
      </Modal>

      {/* ── Scraped Data Viewer ────────────────────────────────────── */}
      <Modal
        opened={viewOpen}
        onClose={() => setViewOpen(false)}
        title={
          viewData ? (
            <Group gap={8}>
              {(() => { const P = PLATFORMS[viewData.platform]?.icon; return P ? <P size={18} /> : null; })()}
              <Text fw={600}>{viewData.label}</Text>
              <Badge size="sm" variant="light" color={PLATFORMS[viewData.platform]?.color || "gray"}>
                {viewData.scrapeType?.replace(/_/g, " ") || viewData.platform}
              </Badge>
            </Group>
          ) : "Scraped Data"
        }
        size="xl"
      >
        {viewData?.data && (
          <ScrollArea h={480} type="auto" offsetScrollbars>
            <ResultsRenderer platform={viewData.platform} scrapeType={viewData.scrapeType} data={viewData.data} />
          </ScrollArea>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Utility helpers
   ═══════════════════════════════════════════════════════════════════════ */
function fmtNum(n) {
  if (n == null) return "0";
  const num = Number(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return num.toLocaleString();
}

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(typeof d === "number" ? (d > 1e12 ? d : d * 1000) : d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseDuration(iso) {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const h = m[1] ? `${m[1]}:` : "";
  const min = (m[2] || "0").padStart(h ? 2 : 1, "0");
  const sec = (m[3] || "0").padStart(2, "0");
  return `${h}${min}:${sec}`;
}

/* ── Platform IDs for save-post API ─────────────────────────────────── */
const PLATFORM_IDS = { x: 1, instagram: 2, linkedin: 5, reddit: 6, youtube: 8, tiktok: 5 };

/* ── Make a card clickable to open source ───────────────────────────── */
function cardLinkProps(url) {
  if (!url) return {};
  return {
    onClick: (e) => {
      if (e.target.closest('button, a, [role="button"]')) return;
      window.open(url, '_blank', 'noopener');
    },
    style: { cursor: 'pointer' },
  };
}

/* ── Save-to-Saved-Posts button ─────────────────────────────────────── */
function SaveBtn({ platform, postId, authorId, content, publishedAt, likes, shares, comments, extra }) {
  const [status, setStatus] = useState("idle");
  if (!postId) return null;
  const handleSave = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("saving");
    try {
      const uid = await getUserId();
      await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          platform_id: PLATFORM_IDS[platform] || 1,
          platform_user_id: String(authorId || "unknown"),
          platform_post_id: String(postId),
          content: (content || "").slice(0, 2000),
          published_at: publishedAt
            ? new Date(typeof publishedAt === "number" ? (publishedAt > 1e12 ? publishedAt : publishedAt * 1000) : publishedAt).toISOString()
            : new Date().toISOString(),
          likes: Number(likes) || 0,
          shares: Number(shares) || 0,
          comments: Number(comments) || 0,
          user_id: uid,
          ...(extra || {}),
        }),
      });
      setStatus("saved");
    } catch (err) {
      console.error("Save post failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };
  return (
    <Tooltip label={status === "saved" ? "Saved!" : status === "error" ? "Failed to save" : "Save to Saved Posts"}>
      <ActionIcon
        variant={status === "saved" ? "filled" : "subtle"}
        size="xs"
        color={status === "saved" ? "teal" : status === "error" ? "red" : "gray"}
        onClick={handleSave}
        loading={status === "saving"}
      >
        <IconBookmark size={14} />
      </ActionIcon>
    </Tooltip>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ResultsRenderer — smart platform-aware display
   ═══════════════════════════════════════════════════════════════════════ */
function ResultsRenderer({ platform, scrapeType, data }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!data) return <Text size="sm" c="dimmed" ta="center" py="sm">No data returned.</Text>;

  return (
    <Stack gap="sm">
      {/* Platform-specific rendering — each renderer handles its own data extraction */}
      <PlatformRenderer platform={platform} scrapeType={scrapeType} data={data} />

      {/* Toggle raw JSON */}
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        onClick={() => setShowRaw((v) => !v)}
        mt={4}
      >
        {showRaw ? "Hide" : "Show"} raw JSON
      </Button>
      <Collapse in={showRaw}>
        <Code block style={{ maxHeight: 260, overflow: "auto", fontSize: 11 }}>
          {JSON.stringify(data, null, 2)}
        </Code>
      </Collapse>
    </Stack>
  );
}

/* ── Platform dispatcher ────────────────────────────────────────────── */
function PlatformRenderer({ platform, scrapeType, data }) {
  switch (platform) {
    case "x":        return <XRenderer scrapeType={scrapeType} data={data} />;
    case "youtube":  return <YouTubeRenderer scrapeType={scrapeType} data={data} />;
    case "reddit":   return <RedditRenderer scrapeType={scrapeType} data={data} />;
    case "linkedin": return <LinkedInRenderer scrapeType={scrapeType} data={data} />;
    case "instagram":return <InstagramRenderer scrapeType={scrapeType} data={data} />;
    case "tiktok":   return <TikTokRenderer scrapeType={scrapeType} data={data} />;
    default:         return <GenericRenderer data={data} />;
  }
}

/* ── Shared: extract array from various API wrappers ────────────────── */
function extractArray(data, ...keys) {
  if (Array.isArray(data)) return data;
  for (const k of keys) {
    const val = data?.[k];
    if (Array.isArray(val)) return val;
  }
  // Nested under .data
  if (data?.data) {
    if (Array.isArray(data.data)) return data.data;
    for (const k of keys) {
      const val = data.data[k];
      if (Array.isArray(val)) return val;
    }
    // Reddit's { data: { children: [...] } }
    if (Array.isArray(data.data.children)) return data.data.children.map(c => c.data || c);
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   X / Twitter
   ═══════════════════════════════════════════════════════════════════════ */
function XRenderer({ scrapeType, data }) {
  if (scrapeType === "followers" || scrapeType === "following") {
    const users = extractArray(data, "data", "users") || [];
    if (!users.length) return <Text size="sm" c="dimmed">No users returned.</Text>;
    return (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {users.map((u, i) => (
          <Card key={u.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(u.username ? `https://x.com/${u.username}` : null)}>
            <Group gap={8} wrap="nowrap" align="start">
              {u.profile_image_url && (
                <img src={u.profile_image_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" fw={600} lineClamp={1}>{u.name}</Text>
                  {u.verified && <Badge size="xs" color="blue" variant="filled" p={2}>✓</Badge>}
                </Group>
                <Text size="xs" c="dimmed">@{u.username}</Text>
                {u.description && <Text size="xs" c="dimmed" lineClamp={1} mt={2}>{u.description}</Text>}
                {u.public_metrics && (
                  <Group gap={6} mt={4}>
                    <Badge size="xs" variant="light">{fmtNum(u.public_metrics.followers_count)} followers</Badge>
                    <Badge size="xs" variant="light">{fmtNum(u.public_metrics.tweet_count)} tweets</Badge>
                  </Group>
                )}
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  // Tweets: user_posts, user_mentions, search
  // user_posts returns [...tweets], mentions/search returns { tweets: [...], users: [...] }
  const tweets = extractArray(data, "tweets", "data") || [];
  const tweetUsers = data?.users || [];
  const findAuthor = (authorId) => tweetUsers.find((u) => u.id === authorId);

  if (!tweets.length) return <Text size="sm" c="dimmed">No tweets returned.</Text>;

  return (
    <Stack gap="xs">
      {tweets.map((t, i) => {
        const m = t.public_metrics || {};
        const author = findAuthor(t.author_id);
        const tweetUrl = t.id ? `https://x.com/i/web/status/${t.id}` : null;
        return (
          <Card key={t.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(tweetUrl)}>
            <Stack gap={4}>
              {author && (
                <Group gap={6}>
                  {author.profile_image_url && (
                    <img src={author.profile_image_url} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                  )}
                  <Text size="xs" fw={600}>@{author.username}</Text>
                </Group>
              )}
              <Text size="sm" lineClamp={3} style={{ whiteSpace: "pre-wrap" }}>{t.text}</Text>
              <Group gap={6} wrap="wrap">
                <Badge variant="light" size="xs">❤️ {fmtNum(m.like_count)}</Badge>
                <Badge variant="light" size="xs">🔁 {fmtNum(m.retweet_count)}</Badge>
                <Badge variant="light" size="xs">💬 {fmtNum(m.reply_count)}</Badge>
                {m.quote_count > 0 && <Badge variant="light" size="xs">💭 {fmtNum(m.quote_count)}</Badge>}
              </Group>
              <Group gap="xs">
                {t.created_at && <Text size="xs" c="dimmed">{fmtDate(t.created_at)}</Text>}
                {t.lang && t.lang !== "und" && <Badge size="xs" variant="light" color="gray">{t.lang}</Badge>}
                <Text size="xs" c="blue" component="a" href={`https://x.com/i/web/status/${t.id}`} target="_blank" rel="noopener">
                  View →
                </Text>
                <SaveBtn platform="x" postId={t.id} authorId={t.author_id} content={t.text} publishedAt={t.created_at} likes={m.like_count} shares={m.retweet_count} comments={m.reply_count} extra={{ author_name: author?.name, author_handle: author?.username, username: author?.username }} />
              </Group>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   YouTube
   ═══════════════════════════════════════════════════════════════════════ */
function YouTubeRenderer({ scrapeType, data }) {
  // Channel details — single object
  if (scrapeType === "channel_details") {
    const ch = data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {ch.thumbnails?.medium?.url && (
              <img src={ch.thumbnails.medium.url} alt="" style={{ width: 56, height: 56, borderRadius: "50%" }} />
            )}
            <div>
              <Text fw={700} size="lg">{ch.title}</Text>
              {ch.customUrl && <Text size="xs" c="dimmed">{ch.customUrl}</Text>}
            </div>
          </Group>
          {ch.bannerUrl && (
            <img src={ch.bannerUrl} alt="banner" style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 6 }} />
          )}
          <Group gap="xl" justify="center">
            {[
              { label: "Subscribers", value: fmtNum(ch.subscribers) },
              { label: "Views", value: fmtNum(ch.totalViews) },
              { label: "Videos", value: fmtNum(ch.videoCount) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {ch.description && <Text size="xs" c="dimmed" lineClamp={3}>{ch.description}</Text>}
          {ch.country && <Text size="xs" c="dimmed">Country: {ch.country}</Text>}
        </Stack>
      </Card>
    );
  }

  // Video details — single object
  if (scrapeType === "video_details") {
    const v = data;
    const thumb = v.thumbnails?.medium?.url || v.thumbnails?.default?.url;
    return (
      <Card withBorder radius="md" p="md">
        <Group gap="sm" wrap="nowrap" align="start">
          {thumb && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <img src={thumb} alt="" style={{ width: 180, borderRadius: 6, display: "block" }} />
              {v.duration && (
                <Badge size="xs" style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,.8)", color: "#fff" }}>
                  {parseDuration(v.duration)}
                </Badge>
              )}
            </div>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600} lineClamp={2}>{v.title}</Text>
            <Text size="xs" c="dimmed">{v.channelTitle} · {fmtDate(v.publishedAt)}</Text>
            <Group gap={6}>
              <Badge variant="light" size="xs">👁 {fmtNum(v.views)}</Badge>
              <Badge variant="light" size="xs">❤️ {fmtNum(v.likes)}</Badge>
              <Badge variant="light" size="xs">💬 {fmtNum(v.comments)}</Badge>
            </Group>
            {v.description && <Text size="xs" c="dimmed" lineClamp={3}>{v.description}</Text>}
          </Stack>
        </Group>
      </Card>
    );
  }

  // Video comments — returns [{ author, text, likes, ... }]
  if (scrapeType === "video_comments") {
    const comments = extractArray(data, "comments") || [];
    if (!comments.length) return <Text size="sm" c="dimmed">No comments returned.</Text>;
    return (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {comments.map((c, i) => (
          <Card key={i} withBorder radius="sm" p="xs">
            <Group gap={6} mb={4} wrap="nowrap">
              {c.authorImage && <img src={c.authorImage} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />}
              <Text size="xs" fw={600} lineClamp={1} style={{ flex: 1 }}>{c.author}</Text>
              {c.likes > 0 && <Badge size="xs" variant="light">❤️ {c.likes}</Badge>}
            </Group>
            <Text size="xs" lineClamp={3}>{c.text}</Text>
            {c.replyCount > 0 && <Text size="xs" c="dimmed" mt={2}>{c.replyCount} {c.replyCount === 1 ? "reply" : "replies"}</Text>}
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  // Videos list: channel_videos, search — returns [{ id, title, thumbnails, ... }]
  const videos = extractArray(data, "items", "videos") || [];
  if (!videos.length) return <Text size="sm" c="dimmed">No videos returned.</Text>;
  return (
    <Stack gap="xs">
      {videos.map((v, i) => {
        const thumb = v.thumbnails?.medium?.url || v.thumbnails?.default?.url;
        const vidId = typeof v.id === 'object' ? (v.id.videoId || v.id) : v.id;
        const videoUrl = vidId ? `https://youtube.com/watch?v=${vidId}` : null;
        return (
          <Card key={v.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(videoUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              {thumb && (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img src={thumb} alt="" style={{ width: 120, borderRadius: 4, display: "block" }} />
                  {v.duration && (
                    <Badge size="xs" style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,.8)", color: "#fff", fontSize: 10 }}>
                      {parseDuration(v.duration)}
                    </Badge>
                  )}
                </div>
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>{v.title}</Text>
                <Text size="xs" c="dimmed">{v.channelTitle} · {fmtDate(v.publishedAt)}</Text>
                <Group gap={6}>
                  <Badge variant="light" size="xs">👁 {fmtNum(v.views)}</Badge>
                  <Badge variant="light" size="xs">❤️ {fmtNum(v.likes)}</Badge>
                  <Badge variant="light" size="xs">💬 {fmtNum(v.comments)}</Badge>
                  <SaveBtn platform="youtube" postId={vidId} authorId={v.channelId || v.channelTitle} content={v.title} publishedAt={v.publishedAt} likes={v.likes} comments={v.comments} extra={{ title: v.title, description: v.description, channelTitle: v.channelTitle, videoId: vidId, views: v.views }} />
                </Group>
              </Stack>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Reddit
   ═══════════════════════════════════════════════════════════════════════ */
function RedditRenderer({ scrapeType, data }) {
  // Subreddit details — single object
  if (scrapeType === "subreddit_details") {
    const sub = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {(sub.icon_img || sub.community_icon) && (
              <img src={(sub.icon_img || sub.community_icon).split("?")[0]} alt="" style={{ width: 48, height: 48, borderRadius: "50%" }} />
            )}
            <div>
              <Text fw={700} size="lg">r/{sub.display_name || sub.name}</Text>
              {sub.title && <Text size="xs" c="dimmed">{sub.title}</Text>}
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: "Members", value: fmtNum(sub.subscribers) },
              { label: "Weekly Active", value: fmtNum(sub.weekly_active_users || sub.active_user_count || sub.accounts_active) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(sub.public_description || sub.description) && (
            <Text size="xs" c="dimmed" lineClamp={4}>{sub.public_description || sub.description}</Text>
          )}
        </Stack>
      </Card>
    );
  }

  // Posts: subreddit_posts, search
  // ScrapeCreators returns { posts: [...] } for Reddit
  const posts = extractArray(data, "posts", "children", "data") || [];
  // Each post might be wrapped: { data: { ... } } (Reddit listing style)
  const normalizedPosts = posts.map(p => p.data || p);

  if (!normalizedPosts.length) return <Text size="sm" c="dimmed">No posts returned.</Text>;

  return (
    <Stack gap="xs">
      {normalizedPosts.map((post, i) => {
        const thumb = post.thumbnail && !["self", "default", "nsfw", "spoiler", "image", ""].includes(post.thumbnail) ? post.thumbnail : null;
        const postUrl = post.permalink ? `https://reddit.com${post.permalink}` : (post.subreddit && post.id ? `https://reddit.com/r/${post.subreddit}/comments/${post.id}` : null);
        return (
          <Card key={post.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(postUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              {thumb && (
                <img src={thumb} alt="" style={{ width: 64, height: 64, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>{post.title || <i>No title</i>}</Text>
                {post.selftext && <Text size="xs" c="dimmed" lineClamp={2}>{post.selftext.slice(0, 200)}</Text>}
                <Group gap={6}>
                  {post.author && <Text size="xs" c="dimmed">u/{post.author}</Text>}
                  {post.subreddit && <Text size="xs" c="dimmed">r/{post.subreddit}</Text>}
                  {(post.created_utc || post.created) && <Text size="xs" c="dimmed">{fmtDate(post.created_utc || post.created)}</Text>}
                </Group>
                <Group gap={6}>
                  {(post.score != null || post.ups != null) && <Badge variant="light" size="xs">⬆ {fmtNum(post.score ?? post.ups)}</Badge>}
                  {post.num_comments != null && <Badge variant="light" size="xs">💬 {fmtNum(post.num_comments)}</Badge>}
                  {post.total_awards_received > 0 && <Badge variant="light" size="xs" color="yellow">🏆 {post.total_awards_received}</Badge>}
                  {post.link_flair_text && <Badge variant="outline" size="xs">{post.link_flair_text}</Badge>}
                  <SaveBtn platform="reddit" postId={post.id || post.name} authorId={post.author} content={post.title || post.selftext} publishedAt={post.created_utc || post.created} likes={post.score ?? post.ups} comments={post.num_comments} />
                </Group>
                {post.url && !post.url.includes("reddit.com") && (
                  <Text size="xs" c="blue" component="a" href={post.url} target="_blank" rel="noopener" lineClamp={1}>
                    {post.url}
                  </Text>
                )}
              </Stack>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   LinkedIn
   ═══════════════════════════════════════════════════════════════════════ */
function LinkedInRenderer({ scrapeType, data }) {
  const d = data?.data || data;

  if (scrapeType === "profile") {
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {d.image && <img src={d.image} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />}
            <div style={{ flex: 1 }}>
              <Text fw={700} size="lg">{d.name}</Text>
              {d.headline && <Text size="sm" c="dimmed">{d.headline}</Text>}
              {d.location && <Text size="xs" c="dimmed">{d.location}</Text>}
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {d.followers != null && (
              <Stack align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(d.followers)}</Text>
                <Text size="xs" c="dimmed">Followers</Text>
              </Stack>
            )}
            {d.connections != null && (
              <Stack align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(d.connections)}</Text>
                <Text size="xs" c="dimmed">Connections</Text>
              </Stack>
            )}
          </Group>
          {d.about && <Text size="xs" c="dimmed" lineClamp={4}>{d.about}</Text>}

          {/* Experience */}
          {d.experience?.length > 0 && (
            <>
              <Divider label="Experience" labelPosition="center" />
              {d.experience.slice(0, 3).map((exp, i) => (
                <Group key={i} gap="sm" wrap="nowrap">
                  {exp.logo && <img src={exp.logo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} />}
                  <div>
                    <Text size="sm" fw={600}>{exp.title}</Text>
                    <Text size="xs" c="dimmed">{exp.company} · {exp.duration || exp.dates}</Text>
                  </div>
                </Group>
              ))}
            </>
          )}

          {/* Recent activity */}
          {(d.activity?.length > 0 || d.recentPosts?.length > 0) && (
            <>
              <Divider label="Recent Activity" labelPosition="center" />
              {(d.activity || d.recentPosts || []).slice(0, 3).map((post, i) => (
                <Card key={i} withBorder radius="sm" p="xs">
                  <Text size="xs" lineClamp={2}>{post.text || post.title || post.content}</Text>
                  {(post.likes != null || post.comments != null) && (
                    <Group gap={6} mt={4}>
                      {post.likes != null && <Badge variant="light" size="xs">❤️ {fmtNum(post.likes)}</Badge>}
                      {post.comments != null && <Badge variant="light" size="xs">💬 {fmtNum(post.comments)}</Badge>}
                    </Group>
                  )}
                </Card>
              ))}
            </>
          )}
        </Stack>
      </Card>
    );
  }

  if (scrapeType === "company") {
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {d.logo && <img src={d.logo} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "contain" }} />}
            <div>
              <Text fw={700} size="lg">{d.name}</Text>
              {d.industry && <Text size="xs" c="dimmed">{d.industry}</Text>}
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {d.followers != null && (
              <Stack align="center" gap={0}><Text fw={700} size="md">{fmtNum(d.followers)}</Text><Text size="xs" c="dimmed">Followers</Text></Stack>
            )}
            {(d.employees != null || d.employeeCount != null) && (
              <Stack align="center" gap={0}><Text fw={700} size="md">{fmtNum(d.employees || d.employeeCount)}</Text><Text size="xs" c="dimmed">Employees</Text></Stack>
            )}
          </Group>
          {d.description && <Text size="xs" c="dimmed" lineClamp={4}>{d.description}</Text>}
          {d.website && <Text size="xs" c="blue" component="a" href={d.website} target="_blank" rel="noopener">{d.website}</Text>}
        </Stack>
      </Card>
    );
  }

  // Post
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        {d.author && (
          <Group gap="sm">
            {d.authorImage && <img src={d.authorImage} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />}
            <div>
              <Text size="sm" fw={600}>{d.author}</Text>
              {d.authorHeadline && <Text size="xs" c="dimmed">{d.authorHeadline}</Text>}
            </div>
          </Group>
        )}
        <Text size="sm" lineClamp={6} style={{ whiteSpace: "pre-wrap" }}>{d.text || d.content || d.title}</Text>
        <Group gap={6}>
          {d.likes != null && <Badge variant="light" size="xs">❤️ {fmtNum(d.likes)}</Badge>}
          {d.comments != null && <Badge variant="light" size="xs">💬 {fmtNum(d.comments)}</Badge>}
          {d.shares != null && <Badge variant="light" size="xs">🔗 {fmtNum(d.shares)}</Badge>}
        </Group>
        {d.postedAt && <Text size="xs" c="dimmed">{fmtDate(d.postedAt)}</Text>}
      </Stack>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram
   ═══════════════════════════════════════════════════════════════════════ */
function InstagramRenderer({ scrapeType, data }) {
  // Profile
  if (scrapeType === "profile") {
    const p = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {(p.profile_pic_url || p.profilePicUrl) && (
              <img src={p.profile_pic_url || p.profilePicUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <Text fw={700} size="lg">{p.full_name || p.fullName || p.username}</Text>
              <Text size="xs" c="dimmed">@{p.username}</Text>
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: "Followers", value: p.follower_count ?? p.followers },
              { label: "Following", value: p.following_count ?? p.following },
              { label: "Posts", value: p.media_count ?? p.posts },
            ].filter(({ value }) => value != null).map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(value)}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(p.biography || p.bio) && <Text size="xs" c="dimmed" lineClamp={3}>{p.biography || p.bio}</Text>}
          {p.external_url && <Text size="xs" c="blue" component="a" href={p.external_url} target="_blank" rel="noopener">{p.external_url}</Text>}
        </Stack>
      </Card>
    );
  }

  // Posts or reels
  // ScrapeCreators: user_posts = { posts: [{ node: {...} }] }, user_reels = { items: [{ media: {...} }] }
  const isReels = scrapeType === "user_reels";
  const rawItems = extractArray(data, "posts", "items", "reels", "data") || [];
  const postItems = rawItems.map(p => p.node || p.media || p);

  if (!postItems.length) return <Text size="sm" c="dimmed">No {isReels ? "reels" : "posts"} returned.</Text>;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
      {postItems.map((post, i) => {
        const thumb = post.display_url || post.thumbnail_url || post.image_url || post.thumbnailUrl || post.cover;
        const isVideo = post.is_video || post.media_type === "VIDEO";
        const igPostUrl = (post.shortcode || post.code) ? `https://instagram.com/p/${post.shortcode || post.code}` : null;
        return (
          <Card key={post.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(igPostUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              {thumb && (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={thumb}
                    alt=""
                    style={{
                      width: isReels ? 70 : 80,
                      height: isReels ? 94 : 80,
                      borderRadius: 4,
                      objectFit: "cover",
                    }}
                  />
                  {isVideo && (
                    <Badge size="xs" style={{ position: "absolute", top: 2, left: 2, background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 9 }}>
                      ▶
                    </Badge>
                  )}
                </div>
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                {(post.caption || post.text) && <Text size="xs" lineClamp={3}>{(post.caption || post.text)?.slice(0, 200)}</Text>}
                {post.username && <Text size="xs" c="dimmed">@{post.username}</Text>}
                <Group gap={6} wrap="wrap">
                  {(post.like_count ?? post.likes) != null && <Badge variant="light" size="xs">❤️ {fmtNum(post.like_count ?? post.likes)}</Badge>}
                  {(post.comment_count ?? post.comments) != null && <Badge variant="light" size="xs">💬 {fmtNum(post.comment_count ?? post.comments)}</Badge>}
                  {(post.video_view_count ?? post.views ?? post.play_count) != null && (
                    <Badge variant="light" size="xs">▶ {fmtNum(post.video_view_count ?? post.views ?? post.play_count)}</Badge>
                  )}
                  <SaveBtn platform="instagram" postId={post.id || post.shortcode || post.code} authorId={post.username || post.owner?.username} content={post.caption || post.text} likes={post.like_count ?? post.likes} comments={post.comment_count ?? post.comments} />
                </Group>
                {(post.timestamp || post.taken_at) && <Text size="xs" c="dimmed">{fmtDate(post.timestamp || post.taken_at)}</Text>}
              </Stack>
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TikTok
   ═══════════════════════════════════════════════════════════════════════ */
function TikTokRenderer({ scrapeType, data }) {
  // Profile
  if (scrapeType === "profile") {
    const p = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {(p.avatarLarger || p.avatarMedium || p.avatar) && (
              <img src={p.avatarLarger || p.avatarMedium || p.avatar} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <Text fw={700} size="lg">{p.nickname || p.uniqueId || p.username}</Text>
              <Text size="xs" c="dimmed">@{p.uniqueId || p.username}</Text>
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: "Followers", value: p.followerCount ?? p.followers },
              { label: "Following", value: p.followingCount ?? p.following },
              { label: "Likes", value: p.heartCount ?? p.hearts ?? p.likes },
              { label: "Videos", value: p.videoCount ?? p.videos },
            ].filter(({ value }) => value != null).map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(value)}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(p.signature || p.bio) && <Text size="xs" c="dimmed" lineClamp={3}>{p.signature || p.bio}</Text>}
        </Stack>
      </Card>
    );
  }

  // Videos: profile_videos, search
  // ScrapeCreators: { itemList: [...] } or { search_item_list: [...] }
  const videos = extractArray(data, "itemList", "search_item_list", "items", "data", "videos") || [];

  if (!videos.length) return <Text size="sm" c="dimmed">No videos returned.</Text>;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
      {videos.map((v, i) => {
        const vid = v.data || v;
        const cover = vid.cover || vid.originCover || vid.dynamicCover;
        const ttAuthor = typeof vid.author === 'string' ? vid.author : vid.author?.uniqueId || vid.author?.nickname;
        const videoUrl = vid.id ? `https://tiktok.com/@${ttAuthor || 'user'}/video/${vid.id}` : (vid.share_url || vid.url || null);
        return (
          <Card key={vid.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(videoUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              {cover && (
                <img src={cover} alt="" style={{ width: 64, height: 86, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" lineClamp={3}>{vid.desc || vid.description || vid.title}</Text>
                {vid.author && <Text size="xs" c="dimmed">@{typeof vid.author === "string" ? vid.author : vid.author.uniqueId || vid.author.nickname}</Text>}
                <Group gap={6} wrap="wrap">
                  {(vid.playCount ?? vid.plays) != null && <Badge variant="light" size="xs">▶ {fmtNum(vid.playCount ?? vid.plays)}</Badge>}
                  {(vid.diggCount ?? vid.likes) != null && <Badge variant="light" size="xs">❤️ {fmtNum(vid.diggCount ?? vid.likes)}</Badge>}
                  {(vid.commentCount ?? vid.comments) != null && <Badge variant="light" size="xs">💬 {fmtNum(vid.commentCount ?? vid.comments)}</Badge>}
                  {(vid.shareCount ?? vid.shares) != null && <Badge variant="light" size="xs">🔗 {fmtNum(vid.shareCount ?? vid.shares)}</Badge>}
                  <SaveBtn platform="tiktok" postId={vid.id} authorId={ttAuthor} content={vid.desc || vid.description || vid.title} likes={vid.diggCount ?? vid.likes} comments={vid.commentCount ?? vid.comments} shares={vid.shareCount ?? vid.shares} />
                </Group>
                {vid.createTime && <Text size="xs" c="dimmed">{fmtDate(vid.createTime)}</Text>}
              </Stack>
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Generic fallback — auto-detects arrays in the data
   ═══════════════════════════════════════════════════════════════════════ */
function GenericRenderer({ data }) {
  // Try to find an array of items anywhere in the data
  let list;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    // Look for the first array property
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        list = data[key];
        break;
      }
    }
  }
  if (!list) list = [data]; // fallback: treat as single item

  return (
    <Stack gap="xs">
      {list.map((item, idx) => {
        if (!item || typeof item !== "object") {
          return <Text key={idx} size="xs">{String(item)}</Text>;
        }
        const title =
          item.title || item.name || item.display_name || item.username ||
          item.text?.slice(0, 100) || item.content?.slice(0, 100) || item.full_text?.slice(0, 100) ||
          item.desc?.slice(0, 100) || item.caption?.slice(0, 100) ||
          `Item ${idx + 1}`;
        const description = item.description || item.selftext || item.body || item.text || item.content || item.about || "";
        const stats = [];
        if (item.likes != null || item.like_count != null) stats.push(`❤️ ${fmtNum(item.likes ?? item.like_count)}`);
        if (item.views != null || item.view_count != null) stats.push(`👁 ${fmtNum(item.views ?? item.view_count)}`);
        if (item.comments != null || item.comment_count != null || item.num_comments != null) stats.push(`💬 ${fmtNum(item.comments ?? item.comment_count ?? item.num_comments)}`);
        if (item.followers_count != null || item.subscribers != null) stats.push(`${fmtNum(item.followers_count ?? item.subscribers)} followers`);
        if (item.score != null) stats.push(`⬆ ${fmtNum(item.score)}`);

        return (
          <Card key={idx} withBorder radius="sm" p="xs">
            <Text size="sm" fw={600} lineClamp={2}>{title}</Text>
            {description && title !== description.slice(0, title.length) && (
              <Text size="xs" c="dimmed" lineClamp={2} mt={2}>{description.slice(0, 200)}</Text>
            )}
            {stats.length > 0 && (
              <Group gap={6} mt={4}>
                {stats.map((s, i) => <Badge key={i} variant="light" size="xs">{s}</Badge>)}
              </Group>
            )}
          </Card>
        );
      })}
    </Stack>
  );
}
