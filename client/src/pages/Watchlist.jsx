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
} from "@tabler/icons-react";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";

/* ── Platform metadata ─────────────────────────────────────────────── */
function getPlatforms(t) {
  return {
    x:         { label: t("watchlist.platformNames.x"), color: "dark",   icon: IconBrandX },
    youtube:   { label: t("watchlist.platformNames.youtube"), color: "red",    icon: IconBrandYoutube },
    reddit:    { label: t("watchlist.platformNames.reddit"), color: "orange", icon: IconBrandReddit },
    linkedin:  { label: t("watchlist.platformNames.linkedin"), color: "blue",   icon: IconBrandLinkedin },
    instagram: { label: t("watchlist.platformNames.instagram"), color: "grape",  icon: IconBrandInstagram },
    tiktok:    { label: t("watchlist.platformNames.tiktok"), color: "cyan",   icon: IconBrandTiktok },
  };
}

/* ── Auto-scraper uses the same simple flow as the social search pages ── */
function getPlatformSearchPlaceholders(t) {
  return {
    x: t("watchlist.placeholders.xSearch", { defaultValue: "@openai or AI agents" }),
    youtube: t("watchlist.placeholders.youtubeSearch", { defaultValue: "channel, video URL, or search term" }),
    reddit: t("watchlist.placeholders.redditSearch", { defaultValue: "r/artificial or search term" }),
    linkedin: t("watchlist.placeholders.linkedinSearch", { defaultValue: "profile/company/post URL or keyword" }),
    instagram: t("watchlist.placeholders.instagramSearch", { defaultValue: "@natgeo, profile URL, post URL, or keyword" }),
    tiktok: t("watchlist.placeholders.tiktokSearch", { defaultValue: "@tiktok, profile URL, or keyword" }),
  };
}

/* ── Config fields shown per platform+scrape_type ──────────────────── */
// Each entry: { key (in config JSON), label, type, default, min, max, description }
function getConfigFields(t) {
  const maxResults = (defaultVal, max = 100) => [
    { key: "max_results", label: t("watchlist.config.maxResults"), type: "number", defaultVal, min: 1, max },
  ];
  return {
    x: { search: maxResults(10, 100) },
    youtube: { search: maxResults(10, 50) },
    reddit: { search: maxResults(25, 100) },
    linkedin: { search: maxResults(10, 25) },
    instagram: { search: maxResults(12, 50) },
    tiktok: { search: maxResults(20, 50) },
  };
}

const DEFAULT_SORT_MODE = "date_desc";
const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "metrics_desc", label: "Most engagement" },
  { value: "likes_desc", label: "Most likes" },
  { value: "comments_desc", label: "Most comments" },
  { value: "shares_desc", label: "Most shares" },
];

function SortSelect({ value, onChange, compact = true }) {
  return (
    <Select
      label={compact ? undefined : "Sort posts"}
      aria-label="Sort posts"
      size="xs"
      value={value || DEFAULT_SORT_MODE}
      onChange={(next) => onChange(next || DEFAULT_SORT_MODE)}
      data={SORT_OPTIONS}
      checkIconPosition="right"
      allowDeselect={false}
      w={compact ? 190 : 210}
    />
  );
}

/* ── Helpers ───────────────────────────────────────────────────────── */
async function getAuthSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

async function getUserId() {
  const session = await getAuthSession();
  const authUserId = session?.user?.id || null;
  if (!session?.access_token) return authUserId;

  try {
    const res = await fetch(apiUrl("/api/auth/access"), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await res.json().catch(() => ({}));
    return payload?.user_id || authUserId;
  } catch {
    return authUserId;
  }
}

async function apiFetch(path, opts = {}) {
  const session = await getAuthSession();
  const userId = await getUserId();
  const url = apiUrl(path);
  const headers = { "Content-Type": "application/json", "x-user-id": userId, ...opts.headers };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function relativeTime(dateStr, t) {
  if (!dateStr) return t("watchlist.never");
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("watchlist.justNow");
  if (mins < 60) return t("watchlist.minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("watchlist.hoursAgo", { count: hrs });
  const days = Math.floor(hrs / 24);
  return t("watchlist.daysAgo", { count: days });
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */
export default function Watchlist() {
  const { t } = useTranslation();
  const PLATFORMS = useMemo(() => getPlatforms(t), [t]);
  const SEARCH_PLACEHOLDERS = useMemo(() => getPlatformSearchPlaceholders(t), [t]);
  const CONFIG_FIELDS = useMemo(() => getConfigFields(t), [t]);

  /* ── state ───────────────────────── */
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [runningIds, setRunningIds] = useState(new Set());

  // per-card results: { [itemId]: { success, data, error, scrape_type } }
  const [cardResults, setCardResults] = useState({});
  // which cards have their results expanded
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [sortModesByItem, setSortModesByItem] = useState({});
  const [modalSortMode, setModalSortMode] = useState(DEFAULT_SORT_MODE);

  // set of platform_post_ids the user already saved
  const [savedPostIds, setSavedPostIds] = useState(new Set());

  // results viewer modal (full-screen view)
  const [viewData, setViewData] = useState(null);   // { label, platform, scrapeType, data }
  const [viewOpen, setViewOpen] = useState(false);

  // add-item form
  const [addOpen, setAddOpen] = useState(false);
  const [formPlatform, setFormPlatform] = useState("x");
  const [formType, setFormType] = useState("search");
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
      // Hydrate cardResults from persisted last_result and auto-expand
      const restored = {};
      const toExpand = new Set();
      for (const item of (data || [])) {
        if (item.last_result) {
          restored[item.id] = item.last_result;
          if (item.last_result.success && item.last_result.data) {
            toExpand.add(item.id);
          }
        }
      }
      setCardResults((prev) => ({ ...restored, ...prev }));
      setExpandedCards((prev) => {
        const merged = new Set(prev);
        for (const id of toExpand) merged.add(id);
        return merged;
      });
    } catch (err) {
      console.error("failed to load watchlist:", err);
    } finally {
      setLoading(false);
    }
  };

  /* ── load saved post ids ─────────── */
  const loadSavedIds = async () => {
    try {
      const { ids } = await apiFetch("/api/saved-items/saved-ids");
      setSavedPostIds(new Set(ids || []));
    } catch (err) {
      console.error("failed to load saved ids:", err);
    }
  };

  useEffect(() => { loadItems(); loadSavedIds(); }, []);

  /* ── add item ────────────────────── */
  const handleAdd = async () => {
    setFormError("");
    if (!formTarget.trim()) {
      setFormError(t("watchlist.scrapeTypeTargetRequired"));
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
          scrape_type: "search",
          target: formTarget.trim(),
          label: formLabel.trim() || formTarget.trim(),
          config: configToSend,
        }),
      });
      setAddOpen(false);
      setFormTarget("");
      setFormLabel("");
      setFormType("search");
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
  // reset config when platform changes
  useEffect(() => { setFormType("search"); setFormConfig({}); }, [formPlatform]);

  /* ═══ render ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: "24px 32px", width: "100%", maxWidth: "min(100%, 1500px)", margin: "0 auto" }}>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>
            <IconRobot size={28} style={{ verticalAlign: "middle", marginRight: 8 }} />
            {t("watchlist.title")}
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            {t("watchlist.subtitle")}
          </Text>
        </div>

        <Group>
          <Tooltip label={t("watchlist.refreshList")}>
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
            {t("watchlist.runAllCount", { count: enabledCount })}
          </Button>

          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
            {t("watchlist.addItem")}
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
            {t("watchlist.emptyDescription")}
          </Text>
          <Button mt="md" leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}>
            {t("watchlist.addFirstItem")}
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
                      {item.scrape_type === "search" ? t("watchlist.autoSearch", { defaultValue: "search" }) : item.scrape_type.replace(/_/g, " ")}
                    </Badge>
                  </Group>
                  <Group gap={8}>
                    <Switch
                      size="xs"
                      checked={item.enabled}
                      onChange={() => toggleEnabled(item)}
                      label={item.enabled ? t("watchlist.on") : t("watchlist.off")}
                    />
                  </Group>
                </Group>

                <Group gap="lg" mb={8}>
                  <Text size="xs" c="dimmed" lineClamp={1} title={item.target}>
                    {t("watchlist.targetLabel")} {item.target}
                  </Text>
                  {item.config && Object.keys(item.config).length > 0 && (
                    <Text size="xs" c="dimmed">
                      {Object.entries(item.config).map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`).join(", ")}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    {t("watchlist.lastRun")} {relativeTime(item.last_run_at, t)}
                  </Text>
                </Group>

                <Group gap={6}>
                  <Tooltip label={t("watchlist.runNow")}>
                    <Button
                      variant="light"
                      color="teal"
                      size="compact-xs"
                      loading={isRunning}
                      leftSection={<IconPlayerPlay size={12} />}
                      onClick={() => runItem(item.id)}
                    >
                      {t("watchlist.run")}
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
                        {isExpanded ? t("watchlist.hideResults") : t("watchlist.showResults")}
                      </Button>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<IconEye size={12} />}
                        onClick={() => {
                          setViewData({ label: item.label, platform: item.platform, scrapeType: result.scrape_type || item.scrape_type, data: result.data });
                          setModalSortMode(sortModesByItem[item.id] || DEFAULT_SORT_MODE);
                          setViewOpen(true);
                        }}
                      >
                        {t("watchlist.expand")}
                      </Button>
                    </>
                  )}
                  {result && !result.success && (
                    <Badge size="sm" color="red" variant="light">
                      {t("watchlist.errorLabel")} {result.error}
                    </Badge>
                  )}

                  <div style={{ flex: 1 }} />
                  <Tooltip label={t("watchlist.delete")}>
                    <ActionIcon variant="light" color="red" size="sm" onClick={() => setDeleteId(item.id)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                {/* ── Inline results ───────────────────────────────── */}
                <Collapse in={isExpanded && result?.success && !!result?.data}>
                  <Divider my={8} />
                  <ScrollArea h={620} type="auto" offsetScrollbars>
                    <ResultsRenderer
                      platform={item.platform}
                      scrapeType={result?.scrape_type || item.scrape_type}
                      data={result?.data}
                      savedPostIds={savedPostIds}
                      onSaved={(pid) => setSavedPostIds((prev) => new Set(prev).add(pid))}
                      sortMode={sortModesByItem[item.id] || DEFAULT_SORT_MODE}
                      onSortChange={(next) => setSortModesByItem((prev) => ({ ...prev, [item.id]: next }))}
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
        title={t("watchlist.addWatchlistItem")}
        size="md"
      >
        <Stack>
          <Select
            label={t("watchlist.platform")}
            data={Object.entries(PLATFORMS).map(([k, v]) => ({ value: k, label: v.label }))}
            value={formPlatform}
            onChange={(v) => setFormPlatform(v)}
          />


          <TextInput
            label={t("watchlist.target", { defaultValue: "Search" })}
            placeholder={SEARCH_PLACEHOLDERS[formPlatform] || t("watchlist.usernameUrlOrSearchQuery")}
            value={formTarget}
            onChange={(e) => setFormTarget(e.currentTarget.value)}
          />

          <TextInput
            label={t("watchlist.labelOptional")}
            placeholder={t("watchlist.friendlyNamePlaceholder")}
            value={formLabel}
            onChange={(e) => setFormLabel(e.currentTarget.value)}
          />

          {/* ── Per-platform config fields ───────────────────────── */}
          {(() => {
            const fields = (CONFIG_FIELDS[formPlatform] || {})[formType] || [];
            if (!fields.length) return null;
            return (
              <>
                <Divider label={t("watchlist.options")} labelPosition="center" />
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
            <Button variant="default" onClick={() => setAddOpen(false)}>{t("watchlist.cancel")}</Button>
            <Button loading={formSaving} onClick={handleAdd}>{t("watchlist.addToWatchlist")}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Delete confirmation ────────────────────────────────────── */}
      <Modal
        opened={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={t("watchlist.removeItem")}
        size="sm"
      >
        <Text size="sm">{t("watchlist.confirmRemoveItem")}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteId(null)}>{t("watchlist.cancel")}</Button>
          <Button color="red" onClick={confirmDelete}>{t("watchlist.delete")}</Button>
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
          ) : t("watchlist.scrapedData")
        }
        fullScreen
      >
        {viewData?.data && (
          <ScrollArea h="calc(100vh - 110px)" type="auto" offsetScrollbars>
            <ResultsRenderer
              platform={viewData.platform}
              scrapeType={viewData.scrapeType}
              data={viewData.data}
              savedPostIds={savedPostIds}
              onSaved={(pid) => setSavedPostIds((prev) => new Set(prev).add(pid))}
              sortMode={modalSortMode}
              onSortChange={setModalSortMode}
            />
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


/* ── Platform names for save-post API ──────────────────────────────── */
const PLATFORM_NAMES = { x: 'x', instagram: 'instagram', linkedin: 'linkedin', reddit: 'reddit', youtube: 'youtube', tiktok: 'tiktok' };

/* ── Reject non-http(s) URLs to prevent javascript: URI injection ──── */
function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}


function cleanUrl(value) {
  if (!value) return null;
  const url = String(value).trim()
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
  return isSafeUrl(url) ? url : null;
}

function urlLooksLikeVideo(url) {
  if (!url) return false;
  const lowered = String(url).toLowerCase();
  return (
    /\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(lowered) ||
    lowered.includes("/video/") ||
    lowered.includes("video_") ||
    lowered.includes("mime=video") ||
    lowered.includes("type=video") ||
    lowered.includes("format=mp4")
  );
}

function mediaObjectLooksLikeVideo(value) {
  if (!value || typeof value !== "object") return false;
  const type = String(value.type || value.media_type || value.mime_type || value.mimeType || value.kind || "").toLowerCase();
  return type.includes("video") || Boolean(value.duration || value.duration_ms || value.videoDuration);
}


/* ── Image helpers: use larger thumbnails and render them big enough to see ── */
function normalizeImageUrl(value) {
  if (!value) return null;
  if (typeof value === "object") {
    return normalizeImageUrl(
      value.url || value.src || value.source?.url || value.display_url || value.thumbnail_url || value.image_url
    );
  }
  let url = cleanUrl(value);
  if (!url || ["self", "default", "nsfw", "spoiler", "image"].includes(url.toLowerCase())) return null;

  // Do not accidentally use a playable video URL as an image poster.
  if (urlLooksLikeVideo(url)) return null;

  // X/Twitter profile images often come back as tiny *_normal files.
  url = url.replace(/_normal(\.(jpg|jpeg|png|webp))/i, "_400x400$1");

  return url;
}

function pickFirstImage(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const url = normalizeImageUrl(candidate);
      if (url) return url;
      continue;
    }
    if (Array.isArray(candidate)) {
      const sorted = [...candidate].sort((a, b) => {
        const aw = Number(a?.width || a?.w || 0) * Number(a?.height || a?.h || 0);
        const bw = Number(b?.width || b?.w || 0) * Number(b?.height || b?.h || 0);
        return bw - aw;
      });
      const found = pickFirstImage(...sorted);
      if (found) return found;
      continue;
    }
    if (typeof candidate === "object") {
      const found = pickFirstImage(
        candidate.source,
        candidate.display_url,
        candidate.image_url,
        candidate.thumbnail_url,
        candidate.thumbnailUrl,
        candidate.url,
        candidate.src,
        candidate.uri,
        candidate.media_url_https,
        candidate.mediaUrl,
        candidate.full,
        candidate.large,
        candidate.high,
        candidate.medium,
        candidate.default,
        candidate.resolutions,
        candidate.images
      );
      if (found) return found;
    }
  }
  return null;
}

function getBestYouTubeThumbnail(thumbnails) {
  if (!thumbnails) return null;
  return pickFirstImage(
    thumbnails.maxres,
    thumbnails.standard,
    thumbnails.high,
    thumbnails.medium,
    thumbnails.default,
    thumbnails
  );
}

function getYouTubeVideoThumbnail(video = {}, videoId = null) {
  return (
    getBestYouTubeThumbnail(video.thumbnails || video.snippet?.thumbnails) ||
    pickFirstImage(
      video.thumbnail,
      video.thumbnailUrl,
      video.thumbnail_url,
      video.image,
      video.imageUrl,
      video.image_url
    ) ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null)
  );
}

function getRedditPostImage(post = {}) {
  const previewImage = post.preview?.images?.[0];
  const mediaMetadataImage = post.media_metadata
    ? Object.values(post.media_metadata).find((item) => item?.s || item?.p)
    : null;
  const directImage = /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(post.url || "")) ? post.url : null;
  return pickFirstImage(
    previewImage?.source,
    previewImage?.resolutions,
    mediaMetadataImage?.s,
    mediaMetadataImage?.p,
    post.url_overridden_by_dest,
    directImage,
    post.thumbnail
  );
}

function getLinkedInPostImage(post = {}) {
  return pickFirstImage(
    post.image,
    post.imageUrl,
    post.image_url,
    post.thumbnailUrl,
    post.thumbnail_url,
    post.thumbnail,
    post.coverImage,
    post.cover_image,
    post.media,
    post.images,
    post.attachments,
    post.sharedContent?.image,
    post.article?.image
  );
}

function getInstagramPostImage(post = {}) {
  return pickFirstImage(
    post.display_url,
    post.displayUrl,
    post.image_url,
    post.imageUrl,
    post.thumbnail_url,
    post.thumbnailUrl,
    post.cover,
    post.cover_url,
    post.video_url_thumbnail,
    post.edge_sidecar_to_children?.edges?.[0]?.node?.display_url,
    post.images
  );
}

function getTikTokCover(video = {}) {
  return pickFirstImage(
    video.originCover,
    video.cover,
    video.dynamicCover,
    video.video?.originCover,
    video.video?.cover,
    video.video?.dynamicCover,
    video.imagePost?.images
  );
}

function normalizeVideoUrl(value, { allowAnySafeUrl = false } = {}) {
  if (!value) return null;
  if (Array.isArray(value)) return pickFirstVideo(...value);
  if (typeof value === "object") {
    const allowObjectUrl = allowAnySafeUrl || mediaObjectLooksLikeVideo(value);
    return pickFirstVideoCandidate(allowObjectUrl,
      value.url,
      value.src,
      value.playUrl,
      value.playURL,
      value.playAddr,
      value.play_addr,
      value.downloadAddr,
      value.download_url,
      value.videoUrl,
      value.video_url,
      value.fallback_url,
      value.secure_url,
      value.source?.url,
      value.variants,
      value.url_list,
      value.urls
    );
  }
  const url = cleanUrl(value);
  if (!url) return null;
  return (allowAnySafeUrl || urlLooksLikeVideo(url)) ? url : null;
}

function pickFirstVideoCandidate(allowAnySafeUrl, ...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      const url = normalizeVideoUrl(candidate, { allowAnySafeUrl });
      if (url) return url;
      continue;
    }
    if (Array.isArray(candidate)) {
      const found = pickFirstVideoCandidate(allowAnySafeUrl, ...candidate);
      if (found) return found;
      continue;
    }
    if (typeof candidate === "object") {
      const found = normalizeVideoUrl(candidate, { allowAnySafeUrl: allowAnySafeUrl || mediaObjectLooksLikeVideo(candidate) });
      if (found) return found;
    }
  }
  return null;
}

function pickFirstVideo(...candidates) {
  return pickFirstVideoCandidate(false, ...candidates);
}

function pickFirstExplicitVideo(...candidates) {
  return pickFirstVideoCandidate(true, ...candidates);
}

function pickVideoFromTypedCollection(collection) {
  const items = Array.isArray(collection) ? collection : collection ? [collection] : [];
  for (const item of items) {
    if (!mediaObjectLooksLikeVideo(item)) continue;
    const found = pickFirstExplicitVideo(item.videoUrl, item.video_url, item.url, item.src, item.mediaUrl, item.media_url, item);
    if (found) return found;
  }
  return null;
}

function getRedditVideoUrl(post = {}) {
  return pickFirstVideo(
    post.secure_media?.reddit_video?.fallback_url,
    post.media?.reddit_video?.fallback_url,
    post.preview?.reddit_video_preview?.fallback_url,
    post.video_url,
    post.videoUrl,
    post.media_url,
    post.url
  );
}

function getLinkedInVideoUrl(post = {}) {
  // LinkedIn often uses generic media/mediaUrl fields for photos. Only treat
  // explicit video fields or typed video attachments as playable videos.
  return (
    pickFirstExplicitVideo(
      post.videoUrl,
      post.video_url,
      post.video?.url,
      post.video?.src,
      post.video,
      post.sharedContent?.video?.url,
      post.sharedContent?.video?.src,
      post.sharedContent?.video
    ) ||
    pickVideoFromTypedCollection(post.media) ||
    pickVideoFromTypedCollection(post.attachments)
  );
}

function getInstagramVideoUrl(post = {}) {
  return pickFirstExplicitVideo(
    post.video_url,
    post.videoUrl,
    post.video_versions,
    post.videoVersions,
    post.video?.url,
    post.video
  );
}

function getTikTokVideoUrl(video = {}) {
  return pickFirstExplicitVideo(
    video.playAddr,
    video.playUrl,
    video.downloadAddr,
    video.video?.playAddr,
    video.video?.play_url,
    video.video?.downloadAddr,
    video.video?.play_addr?.url_list,
    video.video?.download_addr?.url_list,
    video.video?.bitrateInfo?.[0]?.PlayAddr?.UrlList,
    video.video?.bitrateInfo?.[0]?.playAddr?.urlList
  );
}

const MEDIA_PREVIEW_WIDTH = 360;
const MEDIA_PREVIEW_HEIGHT = 203;

function MediaPreview({ src, alt = "", radius = 12, videoSrc = null, youtubeId = null, title = "Video preview" }) {
  const imageUrl = normalizeImageUrl(src);
  const safeVideoUrl = normalizeVideoUrl(videoSrc, { allowAnySafeUrl: true });
  const hasPlayable = Boolean(youtubeId || safeVideoUrl);
  if (!imageUrl && !hasPlayable) return null;

  const frameStyle = {
    width: "min(100%, 360px)",
    aspectRatio: "16 / 9",
    maxHeight: MEDIA_PREVIEW_HEIGHT,
    borderRadius: radius,
    overflow: "hidden",
    flexShrink: 0,
    background: "var(--mantine-color-gray-1)",
    border: "1px solid var(--mantine-color-gray-3)",
  };

  const mediaStyle = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    background: "var(--mantine-color-gray-0)",
  };

  return (
    <div style={frameStyle}>
      {youtubeId ? (
        <iframe
          title={title || alt || "YouTube video"}
          src={`https://www.youtube.com/embed/${youtubeId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#000" }}
        />
      ) : safeVideoUrl ? (
        <video
          controls
          playsInline
          preload="metadata"
          poster={imageUrl || undefined}
          src={safeVideoUrl}
          style={{ ...mediaStyle, background: "#000" }}
        />
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={mediaStyle}
        />
      )}
    </div>
  );
}

/* ── Make a card clickable to open source ───────────────────────────── */
function cardLinkProps(url) {
  if (!url || !isSafeUrl(url)) return {};
  return {
    onClick: (e) => {
      if (e.target.closest('button, a, [role="button"], video, iframe')) return;
      window.open(url, '_blank', 'noopener');
    },
    style: { cursor: 'pointer' },
  };
}

/* ── Save-to-Saved-Posts button (matches CompetitorLookup style) ──── */
function SaveBtn({ platform, postId, authorId, content, publishedAt, likes, shares, comments, extra, savedPostIds, onSaved }) {
  const { t } = useTranslation();
  const alreadySaved = savedPostIds?.has(String(postId));
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  // Derive effective status: if already saved in DB, always show saved
  const effective = alreadySaved ? "already_saved" : status;
  if (!postId) return null;
  const handleSave = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (effective === "saving" || effective === "saved" || effective === "already_saved") return;
    setStatus("saving");
    try {
      const uid = await getUserId();
      const result = await apiFetch("/api/saved-items", {
        method: "POST",
        body: JSON.stringify({
          platform_name: PLATFORM_NAMES[platform] || platform,
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
      setStatus(result?.already_saved ? "already_saved" : "saved");
      if (onSaved) onSaved(String(postId));
    } catch (err) {
      console.error("Save post failed:", err);
      setStatus("error");
    }
  };
  return (
    <Button
      size="compact-xs"
      variant={effective === "already_saved" ? "default" : "light"}
      loading={effective === "saving"}
      color={effective === "saved" ? "green" : effective === "error" ? "red" : "blue"}
      disabled={effective === "saved" || effective === "already_saved"}
      onClick={handleSave}
    >
      {effective === "saved" ? t("watchlist.saved") : effective === "already_saved" ? "Saved already" : effective === "error" ? t("watchlist.retry") : t("watchlist.save")}
    </Button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ResultsRenderer — smart platform-aware display
   ═══════════════════════════════════════════════════════════════════════ */
function ResultsRenderer({ platform, scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE, onSortChange }) {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);

  if (!data) return <Text size="sm" c="dimmed" ta="center" py="sm">{t("watchlist.noDataReturned")}</Text>;

  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <SortSelect value={sortMode} onChange={onSortChange || (() => {})} />
      </Group>
      {/* Platform-specific rendering — each renderer handles its own data extraction */}
      <PlatformRenderer platform={platform} scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />

      {/* Toggle raw JSON */}
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        onClick={() => setShowRaw((v) => !v)}
        mt={4}
      >
        {showRaw ? t("watchlist.hide") : t("watchlist.show")} {t("watchlist.rawJson")}
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
function PlatformRenderer({ platform, scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  switch (platform) {
    case "x":        return <XRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    case "youtube":  return <YouTubeRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    case "reddit":   return <RedditRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    case "linkedin": return <LinkedInRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    case "instagram":return <InstagramRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    case "tiktok":   return <TikTokRenderer scrapeType={scrapeType} data={data} savedPostIds={savedPostIds} onSaved={onSaved} sortMode={sortMode} />;
    default:         return <GenericRenderer data={data} sortMode={sortMode} />;
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

function parseMetricValue(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).trim().toLowerCase().replace(/,/g, "");
  if (!normalized || normalized === "hidden") return 0;
  const match = normalized.match(/^([0-9]*\.?[0-9]+)\s*([kmb])?$/i);
  if (!match) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const base = Number(match[1]);
  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Number.isFinite(base) ? base * multiplier : 0;
}

function firstMetric(...values) {
  for (const value of values) {
    const parsed = parseMetricValue(value);
    if (parsed !== 0 || value === 0 || value === "0") return parsed;
  }
  return 0;
}

function getSortableLikes(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || post.public_metrics || {};
  return firstMetric(post.likes, post.likeCount, post.like_count, post.likesCount, post.diggCount, post.digg_count, post.score, post.ups, stats.likes, stats.likeCount, stats.like_count, stats.diggCount, stats.digg_count);
}

function getSortableComments(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || post.public_metrics || {};
  return firstMetric(post.comments, post.commentCount, post.comment_count, post.commentsCount, post.num_comments, post.replyCount, post.reply_count, stats.comments, stats.commentCount, stats.comment_count, stats.reply_count);
}

function getSortableShares(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || post.public_metrics || {};
  return firstMetric(post.shares, post.shareCount, post.share_count, post.retweetCount, post.retweet_count, post.reposts, stats.shares, stats.shareCount, stats.share_count, stats.retweet_count);
}

function getSortableDate(post = {}) {
  const raw = post.published_at ?? post.publishedAt ?? post.datePublished ?? post.created_at ?? post.createdAt ?? post.created_utc ?? post.created ?? post.createdTime ?? post.createTime ?? post.create_time ?? post.publishTime ?? post.timestamp ?? post.taken_at ?? post.taken_at_timestamp;
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPostsForDisplay(posts = [], sortMode = DEFAULT_SORT_MODE) {
  if (!Array.isArray(posts)) return [];
  const decorated = posts.map((post, index) => ({ post, index }));
  decorated.sort((a, b) => {
    let diff = 0;
    if (sortMode === "date_asc") diff = getSortableDate(a.post) - getSortableDate(b.post);
    else if (sortMode === "metrics_desc") diff = (getSortableLikes(b.post) + getSortableComments(b.post) + getSortableShares(b.post)) - (getSortableLikes(a.post) + getSortableComments(a.post) + getSortableShares(a.post));
    else if (sortMode === "likes_desc") diff = getSortableLikes(b.post) - getSortableLikes(a.post);
    else if (sortMode === "comments_desc") diff = getSortableComments(b.post) - getSortableComments(a.post);
    else if (sortMode === "shares_desc") diff = getSortableShares(b.post) - getSortableShares(a.post);
    else diff = getSortableDate(b.post) - getSortableDate(a.post);
    return diff || a.index - b.index;
  });
  return decorated.map(({ post }) => post);
}

function getYouTubeVideoId(value) {
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(String(value))) return String(value);
  try {
    const url = new URL(value);
    return url.searchParams.get("v") || url.pathname.match(/\/(shorts|embed)\/([^/?#]+)/)?.[2] || null;
  } catch {
    return null;
  }
}

function YouTubeEmbed({ videoId, title }) {
  if (!videoId) return null;
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", background: "#000" }}>
      <iframe
        title={title || "YouTube video"}
        src={`https://www.youtube.com/embed/${videoId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
      />
    </div>
  );
}

function ExpandableText({
  text,
  initialLines = 3,
  size = "sm",
  dimmed = false,
  maxLengthForButton = 140,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const value = String(text);

  return (
    <Stack gap={4}>
      <Text
        size={size}
        c={dimmed ? "dimmed" : undefined}
        lineClamp={expanded ? undefined : initialLines}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {value}
      </Text>

      {value.length > maxLengthForButton && (
        <Button
          variant="subtle"
          size="compact-xs"
          w="fit-content"
          p={0}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "Less" : "More"}
        </Button>
      )}
    </Stack>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   X / Twitter
   ═══════════════════════════════════════════════════════════════════════ */
function XRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  if (scrapeType === "followers" || scrapeType === "following") {
    const users = extractArray(data, "data", "users") || [];
    if (!users.length) return <Text size="sm" c="dimmed">{t("watchlist.noUsersReturned")}</Text>;
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
                    <Badge size="xs" variant="light">{t("watchlist.followersCount", { count: fmtNum(u.public_metrics.followers_count) })}</Badge>
                    <Badge size="xs" variant="light">{t("watchlist.tweetsCount", { count: fmtNum(u.public_metrics.tweet_count) })}</Badge>
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
  const tweets = sortPostsForDisplay(extractArray(data, "tweets", "data") || [], sortMode);
  const tweetUsers = data?.users || [];
  const findAuthor = (authorId) => tweetUsers.find((u) => u.id === authorId);

  if (!tweets.length) return <Text size="sm" c="dimmed">{t("watchlist.noTweetsReturned")}</Text>;

  return (
    <Stack gap="xs">
      {tweets.map((tweet, i) => {
        const m = tweet.public_metrics || {};
        const author = findAuthor(tweet.author_id);
        const tweetUrl = tweet.id ? `https://x.com/i/web/status/${tweet.id}` : null;
        return (
          <Card key={tweet.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(tweetUrl)}>
            <Stack gap={4}>
              {author && (
                <Group gap={6}>
                  {author.profile_image_url && (
                    <img src={author.profile_image_url} alt="" style={{ width: 18, height: 18, borderRadius: "50%" }} />
                  )}
                  <Text size="xs" fw={600}>@{author.username}</Text>
                </Group>
              )}
              <ExpandableText text={tweet.text} size="sm" initialLines={3} />
              <Group gap={6} wrap="wrap">
                <Badge variant="light" size="xs">❤️ {fmtNum(m.like_count)}</Badge>
                <Badge variant="light" size="xs">🔁 {fmtNum(m.retweet_count)}</Badge>
                <Badge variant="light" size="xs">💬 {fmtNum(m.reply_count)}</Badge>
                {m.quote_count > 0 && <Badge variant="light" size="xs">💭 {fmtNum(m.quote_count)}</Badge>}
              </Group>
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  {tweet.created_at && <Text size="xs" c="dimmed">{fmtDate(tweet.created_at)}</Text>}
                  {tweet.lang && tweet.lang !== "und" && <Badge size="xs" variant="light" color="gray">{tweet.lang}</Badge>}
                  <Text size="xs" c="blue" component="a" href={`https://x.com/i/web/status/${tweet.id}`} target="_blank" rel="noopener">
                    {t("watchlist.viewArrow")}
                  </Text>
                </Group>
                <SaveBtn platform="x" postId={tweet.id} authorId={tweet.author_id} content={tweet.text} publishedAt={tweet.created_at} likes={m.like_count} shares={m.retweet_count} comments={m.reply_count} extra={{ author_name: author?.name, author_handle: author?.username, username: author?.username }} savedPostIds={savedPostIds} onSaved={onSaved} />
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
function YouTubeRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();

  if (scrapeType === "channel_details") {
    const ch = data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {getBestYouTubeThumbnail(ch.thumbnails) && (
              <img src={getBestYouTubeThumbnail(ch.thumbnails)} alt="" style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            )}
            <div>
              <Text fw={700} size="xl">{ch.title}</Text>
              {ch.customUrl && <Text size="sm" c="dimmed">{ch.customUrl}</Text>}
            </div>
          </Group>
          {ch.bannerUrl && (
            <img src={ch.bannerUrl} alt="banner" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10 }} />
          )}
          <Group gap="xl">
            {ch.subscribers != null && (
              <Badge size="lg" variant="light">{t("watchlist.subscribers")}: {fmtNum(ch.subscribers)}</Badge>
            )}
            {ch.videoCount != null && (
              <Badge size="lg" variant="light">{t("watchlist.videos")}: {fmtNum(ch.videoCount)}</Badge>
            )}
          </Group>
          {ch.description && <ExpandableText text={ch.description} size="sm" dimmed initialLines={5} />}
          {ch.country && <Text size="xs" c="dimmed">{t("watchlist.countryLabel")} {ch.country}</Text>}
        </Stack>
      </Card>
    );
  }

  if (scrapeType === "video_details") {
    const v = data;
    const vidId = getYouTubeVideoId(v.id) || getYouTubeVideoId(v.url);
    const videoUrl = vidId ? `https://www.youtube.com/watch?v=${vidId}` : v.url;
    const thumb = getYouTubeVideoThumbnail(v, vidId);
    return (
      <Card withBorder radius="sm" p="xs" {...cardLinkProps(videoUrl)}>
        <Group gap="sm" wrap="nowrap" align="start">
          <MediaPreview src={thumb} youtubeId={vidId} title={v.title || "YouTube video"} alt={v.title || "YouTube video preview"} />
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="sm" lineClamp={2}>{v.title}</Text>
            <Text size="xs" c="dimmed">{v.channelTitle} · {fmtDate(v.publishedAt)}</Text>
            <Group gap={6} wrap="wrap">
              {v.likes != null && <Badge variant="light" size="xs">❤️ {fmtNum(v.likes)}</Badge>}
              {v.comments != null && <Badge variant="light" size="xs">💬 {fmtNum(v.comments)}</Badge>}
              {v.duration && <Badge size="xs" color="dark">{parseDuration(v.duration)}</Badge>}
              {videoUrl && isSafeUrl(videoUrl) && (
                <Text size="xs" c="blue" component="a" href={videoUrl} target="_blank" rel="noopener">
                  {t("watchlist.viewArrow")}
                </Text>
              )}
            </Group>
            {v.description && <ExpandableText text={v.description} size="xs" dimmed initialLines={2} />}
            <Group justify="flex-end">
              <SaveBtn platform="youtube" postId={vidId} authorId={v.channelId || v.channelTitle} content={v.title} publishedAt={v.publishedAt} likes={v.likes} comments={v.comments} extra={{ title: v.title, description: v.description, channelTitle: v.channelTitle, videoId: vidId, thumbnail: thumb, url: videoUrl }} savedPostIds={savedPostIds} onSaved={onSaved} />
            </Group>
          </Stack>
        </Group>
      </Card>
    );
  }

  if (scrapeType === "video_comments") {
    const comments = sortPostsForDisplay(extractArray(data, "comments") || [], sortMode);
    if (!comments.length) return <Text size="sm" c="dimmed">{t("watchlist.noCommentsReturned")}</Text>;
    return (
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {comments.map((c, i) => (
          <Card key={i} withBorder radius="md" p="md">
            <Group gap={8} mb={6} wrap="nowrap">
              {c.authorImage && <img src={c.authorImage} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />}
              <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>{c.author}</Text>
              {c.likes > 0 && <Badge size="xs" variant="light">❤️ {c.likes}</Badge>}
            </Group>
            <ExpandableText text={c.text} size="sm" initialLines={4} />
            {c.replyCount > 0 && <Text size="xs" c="dimmed" mt={4}>{t("watchlist.replyCount", { count: c.replyCount })}</Text>}
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  const rawVideos = (data?.id && data?.title) ? [data] : (extractArray(data, "items", "videos") || []);
  const videos = sortPostsForDisplay(rawVideos, sortMode);
  if (!videos.length) return <Text size="sm" c="dimmed">{t("watchlist.noVideosReturned")}</Text>;

  return (
    <Stack gap="xs">
      {videos.map((v, i) => {
        const vidId = getYouTubeVideoId(v.id) || getYouTubeVideoId(v.url);
        const videoUrl = vidId ? `https://www.youtube.com/watch?v=${vidId}` : v.url;
        const thumb = getYouTubeVideoThumbnail(v, vidId);
        return (
          <Card key={vidId || v.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(videoUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              <MediaPreview src={thumb} youtubeId={vidId} title={v.title || "YouTube video"} alt={v.title || "YouTube video preview"} />
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={700} lineClamp={2}>{v.title}</Text>
                <Text size="xs" c="dimmed">{v.channelTitle} · {fmtDate(v.publishedAt)}</Text>
                <Group gap={6} wrap="wrap">
                  {v.likes != null && <Badge variant="light" size="xs">❤️ {fmtNum(v.likes)}</Badge>}
                  {v.comments != null && <Badge variant="light" size="xs">💬 {fmtNum(v.comments)}</Badge>}
                  {v.duration && <Badge size="xs" color="dark">{parseDuration(v.duration)}</Badge>}
                  {videoUrl && isSafeUrl(videoUrl) && (
                    <Text size="xs" c="blue" component="a" href={videoUrl} target="_blank" rel="noopener">
                      {t("watchlist.viewArrow")}
                    </Text>
                  )}
                </Group>
                {v.description && <ExpandableText text={v.description} size="xs" dimmed initialLines={2} />}
                <Group justify="flex-end">
                  <SaveBtn platform="youtube" postId={vidId} authorId={v.channelId || v.channelTitle} content={v.title} publishedAt={v.publishedAt} likes={v.likes} comments={v.comments} extra={{ title: v.title, description: v.description, channelTitle: v.channelTitle, videoId: vidId, thumbnail: thumb, url: videoUrl }} savedPostIds={savedPostIds} onSaved={onSaved} />
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
function RedditRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  // Subreddit details — single object
  if (scrapeType === "subreddit_details") {
    const sub = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {normalizeImageUrl(sub.icon_img || sub.community_icon) && (
              <img src={normalizeImageUrl(sub.icon_img || sub.community_icon)} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            )}
            <div>
              <Text fw={700} size="lg">r/{sub.display_name || sub.name}</Text>
              {sub.title && <Text size="xs" c="dimmed">{sub.title}</Text>}
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: t("watchlist.members"), value: fmtNum(sub.subscribers) },
              { label: t("watchlist.weeklyActive"), value: fmtNum(sub.weekly_active_users || sub.active_user_count || sub.accounts_active) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(sub.public_description || sub.description) && (
            <ExpandableText text={sub.public_description || sub.description} size="xs" dimmed initialLines={4} />
          )}
        </Stack>
      </Card>
    );
  }

  // Posts: subreddit_posts, search
  // ScrapeCreators returns { posts: [...] } for Reddit
  const posts = extractArray(data, "posts", "children", "data") || [];
  // Each post might be wrapped: { data: { ... } } (Reddit listing style)
  const normalizedPosts = sortPostsForDisplay(posts.map(p => p.data || p), sortMode);

  if (!normalizedPosts.length) return <Text size="sm" c="dimmed">{t("watchlist.noPostsReturned")}</Text>;

  return (
    <Stack gap="xs">
      {normalizedPosts.map((post, i) => {
        const thumb = getRedditPostImage(post);
        const redditVideoUrl = getRedditVideoUrl(post);
        const postUrl = post.permalink ? `https://reddit.com${post.permalink}` : (post.subreddit && post.id ? `https://reddit.com/r/${post.subreddit}/comments/${post.id}` : null);
        return (
          <Card key={post.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(postUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              <MediaPreview src={thumb} videoSrc={redditVideoUrl} alt={post.title || "Reddit post preview"} title={post.title || "Reddit video"} />
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>{post.title || <i>{t("watchlist.noTitle")}</i>}</Text>
                {post.selftext && <ExpandableText text={post.selftext} size="xs" dimmed initialLines={2} />}
                <Group gap={6}>
                  {post.author && <Text size="xs" c="dimmed">u/{post.author}</Text>}
                  {post.subreddit && <Text size="xs" c="dimmed">r/{post.subreddit}</Text>}
                  {(post.created_utc || post.created) && <Text size="xs" c="dimmed">{fmtDate(post.created_utc || post.created)}</Text>}
                </Group>
                <Group justify="space-between" align="center">
                  <Group gap={6}>
                    {(post.score != null || post.ups != null) && <Badge variant="light" size="xs">⬆ {fmtNum(post.score ?? post.ups)}</Badge>}
                    {post.num_comments != null && <Badge variant="light" size="xs">💬 {fmtNum(post.num_comments)}</Badge>}
                    {post.total_awards_received > 0 && <Badge variant="light" size="xs" color="yellow">🏆 {post.total_awards_received}</Badge>}
                    {post.link_flair_text && <Badge variant="outline" size="xs">{post.link_flair_text}</Badge>}
                  </Group>
                  <SaveBtn platform="reddit" postId={post.id || post.name} authorId={post.author} content={post.title || post.selftext} publishedAt={post.created_utc || post.created} likes={post.score ?? post.ups} comments={post.num_comments} savedPostIds={savedPostIds} onSaved={onSaved} />
                </Group>
                {post.url && !post.url.includes("reddit.com") && isSafeUrl(post.url) && (
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
function LinkedInRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  const d = data?.data || data;
  const profile = d?.profile || (scrapeType === "profile" ? d : null);
  const company = d?.company || (scrapeType === "company" ? d : null);
  const rawPosts = [
    ...(Array.isArray(d?.posts) ? d.posts : []),
    ...(Array.isArray(d?.profilePosts) ? d.profilePosts : []),
    ...(Array.isArray(d?.companyPosts) ? d.companyPosts : []),
    ...(Array.isArray(d?.searchPosts) ? d.searchPosts : []),
    ...(d?.post ? [d.post] : []),
  ];
  const posts = sortPostsForDisplay(rawPosts, sortMode);

  const renderProfile = (p) => p ? (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="sm" align="start">
          {normalizeImageUrl(p.image || p.profileImage || p.picture) && (
            <img src={normalizeImageUrl(p.image || p.profileImage || p.picture)} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={2}>{p.name || p.fullName || "LinkedIn profile"}</Text>
            {p.headline && <Text size="sm" c="dimmed" lineClamp={2}>{p.headline}</Text>}
            {p.location && <Text size="xs" c="dimmed">{p.location}</Text>}
            {(p.url || p.linkedInUrl || p.linkedinUrl) && isSafeUrl(p.url || p.linkedInUrl || p.linkedinUrl) && (
              <Text size="xs" c="blue" component="a" href={p.url || p.linkedInUrl || p.linkedinUrl} target="_blank" rel="noopener" lineClamp={1}>
                View on LinkedIn
              </Text>
            )}
          </div>
        </Group>
        <Group gap="xl" justify="center">
          {p.followers != null && (
            <Stack align="center" gap={0}>
              <Text fw={700} size="md">{fmtNum(p.followers)}</Text>
              <Text size="xs" c="dimmed">{t("watchlist.followers")}</Text>
            </Stack>
          )}
          {p.connections != null && (
            <Stack align="center" gap={0}>
              <Text fw={700} size="md">{fmtNum(p.connections)}</Text>
              <Text size="xs" c="dimmed">{t("watchlist.connections")}</Text>
            </Stack>
          )}
        </Group>
        {(p.about || p.description) && <ExpandableText text={p.about || p.description} size="xs" dimmed initialLines={4} />}
      </Stack>
    </Card>
  ) : null;

  const renderCompany = (c) => c ? (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group gap="sm" align="start">
          {normalizeImageUrl(c.logo || c.image) && <MediaPreview src={c.logo || c.image} alt={c.name || "LinkedIn company"} radius={8} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} size="lg" lineClamp={2}>{c.name || "LinkedIn company"}</Text>
            {c.industry && <Text size="xs" c="dimmed">{c.industry}</Text>}
            {(c.url || c.linkedInUrl || c.linkedinUrl) && isSafeUrl(c.url || c.linkedInUrl || c.linkedinUrl) && (
              <Text size="xs" c="blue" component="a" href={c.url || c.linkedInUrl || c.linkedinUrl} target="_blank" rel="noopener" lineClamp={1}>
                View on LinkedIn
              </Text>
            )}
          </div>
        </Group>
        <Group gap="xl" justify="center">
          {c.followers != null && (
            <Stack align="center" gap={0}><Text fw={700} size="md">{fmtNum(c.followers)}</Text><Text size="xs" c="dimmed">{t("watchlist.followers")}</Text></Stack>
          )}
          {(c.employees != null || c.employeeCount != null) && (
            <Stack align="center" gap={0}><Text fw={700} size="md">{fmtNum(c.employees || c.employeeCount)}</Text><Text size="xs" c="dimmed">{t("watchlist.employees")}</Text></Stack>
          )}
        </Group>
        {c.description && <ExpandableText text={c.description} size="xs" dimmed initialLines={4} />}
        {c.website && isSafeUrl(c.website) && <Text size="xs" c="blue" component="a" href={c.website} target="_blank" rel="noopener">{c.website}</Text>}
      </Stack>
    </Card>
  ) : null;

  const renderPost = (post, i) => {
    const author = post.author || {};
    const authorName = typeof author === "string" ? author : author.name || post.authorName || post.author || profile?.name || company?.name || "LinkedIn";
    const authorUrl = typeof author === "object" ? author.url : post.authorUrl;
    const url = post.url || post.link || post.linkedinUrl || post.shareUrl || null;
    const image = getLinkedInPostImage(post);
    const videoUrl = getLinkedInVideoUrl(post);
    const id = post.id || post.urn || post.activityId || url || `${authorName}-${i}`;
    const content = post.text || post.description || post.body || post.content || post.title || post.headline || "LinkedIn post";
    const likes = post.likeCount ?? post.reactionCount ?? post.numLikes ?? post.likes;
    const comments = post.commentCount ?? post.numComments ?? post.commentsCount ?? (Array.isArray(post.comments) ? post.comments.length : post.comments);
    const shares = post.shareCount ?? post.numShares ?? post.reposts ?? post.shares;
    const publishedAt = post.datePublished || post.publishedAt || post.created_at || post.date || post.postedAt;

    return (
      <Card key={id || i} withBorder radius="sm" p="xs" {...cardLinkProps(url)}>
        <Group gap="sm" wrap="nowrap" align="start">
          <MediaPreview src={image} videoSrc={videoUrl} alt={content || "LinkedIn post preview"} title="LinkedIn video" />
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="xs" fw={600} lineClamp={1}>{authorName}</Text>
              {authorUrl && isSafeUrl(authorUrl) && (
                <Text size="xs" c="blue" component="a" href={authorUrl} target="_blank" rel="noopener">Profile</Text>
              )}
            </Group>
            <ExpandableText text={content} size="sm" initialLines={4} />
            <Group gap={6} wrap="wrap">
              {likes != null && <Badge variant="light" size="xs">❤️ {fmtNum(likes)}</Badge>}
              {comments != null && <Badge variant="light" size="xs">💬 {fmtNum(comments)}</Badge>}
              {shares != null && <Badge variant="light" size="xs">🔗 {fmtNum(shares)}</Badge>}
            </Group>
            <Group justify="space-between" align="center">
              <Group gap="xs">
                {publishedAt && <Text size="xs" c="dimmed">{fmtDate(publishedAt)}</Text>}
                {url && isSafeUrl(url) && (
                  <Text size="xs" c="blue" component="a" href={url} target="_blank" rel="noopener">
                    {t("watchlist.viewArrow")}
                  </Text>
                )}
              </Group>
              <SaveBtn
                platform="linkedin"
                postId={id}
                authorId={authorUrl || authorName}
                content={content}
                publishedAt={publishedAt}
                likes={likes}
                comments={comments}
                shares={shares}
                extra={{ title: post.title || post.headline, url, author_name: authorName, author_url: authorUrl }}
                savedPostIds={savedPostIds}
                onSaved={onSaved}
              />
            </Group>
          </Stack>
        </Group>
      </Card>
    );
  };

  if (profile || company || posts.length) {
    return (
      <Stack gap="xs">
        {renderProfile(profile)}
        {renderCompany(company)}
        {posts.length > 0 ? posts.map(renderPost) : (
          !profile && !company && <Text size="sm" c="dimmed">No LinkedIn posts returned.</Text>
        )}
      </Stack>
    );
  }

  // Last-resort single post fallback for older persisted results.
  return renderPost(d || {}, 0);
}

/* ═══════════════════════════════════════════════════════════════════════
   Instagram
   ═══════════════════════════════════════════════════════════════════════ */
function InstagramRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  // Profile
  if (scrapeType === "profile") {
    const p = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {normalizeImageUrl(p.profile_pic_url || p.profilePicUrl) && (
              <img src={normalizeImageUrl(p.profile_pic_url || p.profilePicUrl)} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            )}
            <div>
              <Text fw={700} size="lg">{p.full_name || p.fullName || p.username}</Text>
              <Text size="xs" c="dimmed">@{p.username}</Text>
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: t("watchlist.followers"), value: p.follower_count ?? p.followers },
              { label: t("watchlist.following"), value: p.following_count ?? p.following },
              { label: t("watchlist.posts"), value: p.media_count ?? p.posts },
            ].filter(({ value }) => value != null).map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(value)}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(p.biography || p.bio) && <ExpandableText text={p.biography || p.bio} size="xs" dimmed initialLines={3} />}
          {p.external_url && isSafeUrl(p.external_url) && <Text size="xs" c="blue" component="a" href={p.external_url} target="_blank" rel="noopener">{p.external_url}</Text>}
        </Stack>
      </Card>
    );
  }

  // Posts or reels
  // ScrapeCreators: user_posts = { posts: [{ node: {...} }] }, user_reels = { items: [{ media: {...} }] }
  const isReels = scrapeType === "user_reels";
  const rawItems = extractArray(data, "posts", "items", "reels", "data") || [];
  const postItems = sortPostsForDisplay(rawItems.map(p => p.node || p.media || p), sortMode);

  if (!postItems.length) return <Text size="sm" c="dimmed">{isReels ? t("watchlist.noReelsReturned") : t("watchlist.noPostsReturned")}</Text>;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
      {postItems.map((post, i) => {
        const thumb = getInstagramPostImage(post);
        const isVideo = post.is_video || post.media_type === "VIDEO";
        const videoUrl = getInstagramVideoUrl(post);
        const igPostUrl = (post.shortcode || post.code) ? `https://instagram.com/p/${post.shortcode || post.code}` : null;
        return (
          <Card key={post.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(igPostUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              {(thumb || videoUrl) && (
                <MediaPreview src={thumb} videoSrc={videoUrl} alt={post.caption || "Instagram post preview"} title="Instagram video" />
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                {(post.caption || post.text) && <ExpandableText text={post.caption || post.text} size="xs" initialLines={3} />}
                {post.username && <Text size="xs" c="dimmed">@{post.username}</Text>}
                <Group justify="space-between" align="center">
                  <Group gap={6} wrap="wrap">
                    {(post.like_count ?? post.likes) != null && <Badge variant="light" size="xs">❤️ {fmtNum(post.like_count ?? post.likes)}</Badge>}
                    {(post.comment_count ?? post.comments) != null && <Badge variant="light" size="xs">💬 {fmtNum(post.comment_count ?? post.comments)}</Badge>}
                  </Group>
                  <SaveBtn platform="instagram" postId={post.id || post.shortcode || post.code} authorId={post.username || post.owner?.username} content={post.caption || post.text} likes={post.like_count ?? post.likes} comments={post.comment_count ?? post.comments} savedPostIds={savedPostIds} onSaved={onSaved} />
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
function TikTokRenderer({ scrapeType, data, savedPostIds, onSaved, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  // Profile
  if (scrapeType === "profile") {
    const p = data?.data || data;
    return (
      <Card withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="sm">
            {normalizeImageUrl(p.avatarLarger || p.avatarMedium || p.avatar) && (
              <img src={normalizeImageUrl(p.avatarLarger || p.avatarMedium || p.avatar)} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            )}
            <div>
              <Text fw={700} size="lg">{p.nickname || p.uniqueId || p.username}</Text>
              <Text size="xs" c="dimmed">@{p.uniqueId || p.username}</Text>
            </div>
          </Group>
          <Group gap="xl" justify="center">
            {[
              { label: t("watchlist.followers"), value: p.followerCount ?? p.followers },
              { label: t("watchlist.following"), value: p.followingCount ?? p.following },
              { label: t("watchlist.likes"), value: p.heartCount ?? p.hearts ?? p.likes },
              { label: t("watchlist.videos"), value: p.videoCount ?? p.videos },
            ].filter(({ value }) => value != null).map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="md">{fmtNum(value)}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>
          {(p.signature || p.bio) && <ExpandableText text={p.signature || p.bio} size="xs" dimmed initialLines={3} />}
        </Stack>
      </Card>
    );
  }

  // Videos: profile_videos, search
  // ScrapeCreators: { itemList: [...] } or { search_item_list: [...] }
  const videos = sortPostsForDisplay(extractArray(data, "itemList", "search_item_list", "items", "data", "videos") || [], sortMode);

  if (!videos.length) return <Text size="sm" c="dimmed">{t("watchlist.noVideosReturned")}</Text>;

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
      {videos.map((v, i) => {
        const vid = v.data || v;
        const cover = getTikTokCover(vid);
        const playableVideoUrl = getTikTokVideoUrl(vid);
        const ttAuthor = typeof vid.author === 'string' ? vid.author : vid.author?.uniqueId || vid.author?.nickname;
        const videoUrl = vid.id ? `https://tiktok.com/@${ttAuthor || 'user'}/video/${vid.id}` : (vid.share_url || vid.url || null);
        return (
          <Card key={vid.id || i} withBorder radius="sm" p="xs" {...cardLinkProps(videoUrl)}>
            <Group gap="sm" wrap="nowrap" align="start">
              <MediaPreview src={cover} videoSrc={playableVideoUrl} alt={vid.desc || vid.description || "TikTok video preview"} title="TikTok video" />
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <ExpandableText text={vid.desc || vid.description || vid.title} size="xs" initialLines={3} />
                {vid.author && <Text size="xs" c="dimmed">@{typeof vid.author === "string" ? vid.author : vid.author.uniqueId || vid.author.nickname}</Text>}
                <Group justify="space-between" align="center">
                  <Group gap={6} wrap="wrap">
                    {(vid.diggCount ?? vid.likes) != null && <Badge variant="light" size="xs">❤️ {fmtNum(vid.diggCount ?? vid.likes)}</Badge>}
                    {(vid.commentCount ?? vid.comments) != null && <Badge variant="light" size="xs">💬 {fmtNum(vid.commentCount ?? vid.comments)}</Badge>}
                    {(vid.shareCount ?? vid.shares) != null && <Badge variant="light" size="xs">🔗 {fmtNum(vid.shareCount ?? vid.shares)}</Badge>}
                  </Group>
                  <SaveBtn platform="tiktok" postId={vid.id} authorId={ttAuthor} content={vid.desc || vid.description || vid.title} likes={vid.diggCount ?? vid.likes} comments={vid.commentCount ?? vid.comments} shares={vid.shareCount ?? vid.shares} savedPostIds={savedPostIds} onSaved={onSaved} />
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
function GenericRenderer({ data, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
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
  list = sortPostsForDisplay(list, sortMode);

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
          t("watchlist.itemNumber", { count: idx + 1 });
        const description = item.description || item.selftext || item.body || item.text || item.content || item.about || "";
        const image = pickFirstImage(
          item.image,
          item.imageUrl,
          item.image_url,
          item.thumbnail,
          item.thumbnailUrl,
          item.thumbnail_url,
          item.display_url,
          item.cover,
          item.images,
          item.preview?.images?.[0]?.source,
          item.preview?.images?.[0]?.resolutions
        );
        const videoUrl = pickFirstVideo(
          item.video,
          item.videoUrl,
          item.video_url,
          item.mediaUrl,
          item.media_url,
          item.playAddr,
          item.downloadAddr,
          item.preview?.reddit_video_preview?.fallback_url
        );
        const stats = [];
        if (item.likes != null || item.like_count != null) stats.push(`❤️ ${fmtNum(item.likes ?? item.like_count)}`);
        if (item.comments != null || item.comment_count != null || item.num_comments != null) stats.push(`💬 ${fmtNum(item.comments ?? item.comment_count ?? item.num_comments)}`);
        if (item.followers_count != null || item.subscribers != null) stats.push(t("watchlist.followersCount", { count: fmtNum(item.followers_count ?? item.subscribers) }));
        if (item.score != null) stats.push(`⬆ ${fmtNum(item.score)}`);

        return (
          <Card key={idx} withBorder radius="sm" p="xs">
            <Group gap="sm" wrap="nowrap" align="start">
              <MediaPreview src={image} videoSrc={videoUrl} alt={title} title={title} />
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} lineClamp={2}>{title}</Text>
                {description && title !== description.slice(0, title.length) && (
                  <ExpandableText text={description} size="xs" dimmed initialLines={2} />
                )}
                {stats.length > 0 && (
                  <Group gap={6} mt={4}>
                    {stats.map((s, i) => <Badge key={i} variant="light" size="xs">{s}</Badge>)}
                  </Group>
                )}
              </Stack>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
