// client/src/pages/KeywordTracking.jsx
import "../utils/ui.css";
import { forwardRef, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle, IconArrowDown, IconArrowUp, IconInfoCircle,
  IconMinus, IconRefresh,
} from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ── sub-components ───────────────────────────────────────────────────────── */

function TrendIcon({ dir }) {
  if (dir === "rising")  return <IconArrowUp  size={12} color="var(--mantine-color-green-6)" />;
  if (dir === "falling") return <IconArrowDown size={12} color="var(--mantine-color-red-6)" />;
  return <IconMinus size={12} color="var(--mantine-color-gray-4)" />;
}

function KpiBar({ value }) {
  const color =
    value >= 75 ? "green" :
    value >= 45 ? "blue"  :
    value >= 20 ? "yellow": "gray";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 60, height: 5, borderRadius: 99,
        background: "var(--mantine-color-default-border)", overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${value}%`, borderRadius: 99,
          background: `var(--mantine-color-${color}-5)`,
        }} />
      </div>
      <Text
        size="xs" fw={700} w={22} ta="right"
        c={value >= 75 ? "green" : value >= 45 ? "blue" : "dimmed"}
      >
        {value}
      </Text>
    </div>
  );
}

// Color map for platform badges
const PLATFORM_COLORS = {
  X: "dark", YouTube: "red", LinkedIn: "blue",
  Instagram: "pink", TikTok: "violet", Reddit: "orange",
};

function PlatformBadges({ platforms }) {
  if (!platforms?.length) return null;
  return (
    <Group gap={3} wrap="wrap">
      {platforms.map(p => (
        <Badge
          key={p.label}
          size="xs"
          variant="light"
          color={PLATFORM_COLORS[p.label] || p.color || "gray"}
        >
          {p.label}
        </Badge>
      ))}
    </Group>
  );
}

/* ── column definitions ───────────────────────────────────────────────────── */

const COLS = [
  {
    key: "kpi",
    label: "KPI",
    w: 104,
    tip: "Keyword Performance Index (0–100). Combines normalised engagement, sample size, consistency, and trend. Higher = more reliably drives engagement across your saved posts.",
  },
  {
    key: "engagement",
    label: "AVG SCORE",
    w: 88,
    tip: "Average raw engagement score for posts containing this keyword. Formula: Comments×5 + Likes×2 + log₁₀(Views+1)×1. Comments weighted highest as they signal the strongest intent.",
  },
  {
    key: "posts",
    label: "POSTS",
    w: 50,
    tip: "How many of your saved posts contain this keyword. Needs ≥2 posts for a reliable signal (when you have 10+ posts total).",
  },
  {
    key: "consistency",
    label: "CONSIST.",
    w: 76,
    tip: "How consistently this keyword drives high engagement (0–100%). Derived from coefficient of variation across post scores. 100% = all posts with this word perform equally. Low = one-hit wonder.",
  },
  {
    key: "trend",
    label: "TREND",
    w: 70,
    tip: "Compares average engagement in your newest 33% of saved posts vs the older 67%. ↑ = gaining traction, ↓ = fading, — = stable.",
  },
  {
    key: "platforms",
    label: "PLATFORMS",
    w: 130,
    tip: "Which connected social media platforms this keyword appears in across your saved posts.",
  },
];

/* ── main component ───────────────────────────────────────────────────────── */

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  const [keywords, setKeywords]           = useState([]);
  const [meta, setMeta]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [currentUserId, setCurrentUserId] = useState(undefined);
  const [sortBy, setSortBy]               = useState("kpi");

  /* Auth */
  useEffect(() => {
    let mounted = true;
    if (!supabase) { setCurrentUserId(null); return; }
    supabase.auth.getUser()
      .then(({ data }) => { if (mounted) setCurrentUserId(data?.user?.id ?? null); })
      .catch(() => { if (mounted) setCurrentUserId(null); });
    return () => { mounted = false; };
  }, []);

  /* Fetch */
  const fetchKeywords = () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/keywords?user_id=${encodeURIComponent(currentUserId)}`))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (d.error) throw new Error(d.error); setKeywords(d.keywords || []); setMeta(d); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (currentUserId === undefined) return;
    if (!currentUserId) { setLoading(false); setError("Sign in to see keyword data."); return; }
    fetchKeywords();
  }, [currentUserId]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "keyword-tracking" } }));
  }, []);

  /* Sort */
  const sorted = [...keywords].sort((a, b) => {
    if (sortBy === "engagement")  return b.avgEngagement - a.avgEngagement;
    if (sortBy === "posts")       return b.sampleSize    - a.sampleSize;
    if (sortBy === "consistency") return b.consistency   - a.consistency;
    if (sortBy === "trend")       return b.trend         - a.trend;
    if (sortBy === "platforms")   return (b.platforms?.length || 0) - (a.platforms?.length || 0);
    return b.kpi - a.kpi;
  });

  /* Grid template: rank | keyword | ...columns */
  const gridCols = `28px 1fr ${COLS.map(c => c.w + "px").join(" ")}`;

  return (
    <div ref={ref}>
      <Stack gap="sm">

        {/* ── Header card ── */}
        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div style={{ flex: 1 }}>
              <Title order={3}>Keyword Intelligence</Title>
              <Text size="sm" c="dimmed" mt={6} style={{ lineHeight: 1.65, maxWidth: 680 }}>
                Posts are scored by <strong>weighted engagement</strong> (Comments×5 + Likes×2 + log Views×1 —
                comments count most because replying takes real intent). Scores are{" "}
                <strong>normalised per account</strong> so a small creator going 3× their baseline
                ranks equally to MrBeast doing the same. The <strong>KPI (0–100)</strong> adds
                consistency and a trend boost on top. Keywords are tagged with every{" "}
                <strong>platform</strong> they appear on.{" "}
                <strong>Click any column header to re-sort.</strong>
              </Text>
              {meta?.debug && (
                <Text size="xs" c="dimmed" mt={4}>{meta.debug}</Text>
              )}
            </div>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconRefresh size={14} />}
              loading={loading}
              onClick={fetchKeywords}
              disabled={!currentUserId}
              ml="md"
              style={{ flexShrink: 0 }}
            >
              Refresh
            </Button>
          </Group>

          {error && (
            <Alert
              icon={<IconAlertCircle size={14} />}
              color="red"
              radius="md"
              mt="sm"
              py="xs"
            >
              {error}
            </Alert>
          )}
        </Card>

        {/* ── Table card ── */}
        <Card withBorder radius="lg" p="md">

          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            alignItems: "center",
            padding: "0 6px 6px",
            borderBottom: "1px solid var(--mantine-color-default-border)",
            marginBottom: 4,
          }}>
            <Text size="xs" c="dimmed" fw={600}>#</Text>
            <Text size="xs" c="dimmed" fw={600}>KEYWORD</Text>
            {COLS.map(col => (
              <Tooltip key={col.key} label={col.tip} withArrow multiline w={240} position="top">
                <Group
                  gap={3}
                  justify="center"
                  style={{ cursor: "pointer" }}
                  onClick={() => setSortBy(col.key)}
                >
                  <Text
                    size="xs"
                    fw={700}
                    c={sortBy === col.key ? "blue" : "dimmed"}
                    style={{ textDecoration: sortBy === col.key ? "underline dotted" : "none" }}
                  >
                    {col.label}
                  </Text>
                  <IconInfoCircle
                    size={10}
                    color={sortBy === col.key
                      ? "var(--mantine-color-blue-5)"
                      : "var(--mantine-color-gray-4)"}
                  />
                </Group>
              </Tooltip>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <Stack gap={3} mt={4}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: 8,
                    padding: "4px 6px",
                  }}
                >
                  {[24, 120, 96, 72, 36, 56, 52, 100].map((w, j) => (
                    <Skeleton key={j} height={11} width={w} radius="sm" />
                  ))}
                </div>
              ))}
            </Stack>
          ) : sorted.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl" size="sm">
              No keywords yet — save posts from Competitor Lookup first.
            </Text>
          ) : (
            <Stack gap={1} mt={2}>
              {sorted.map((kw, i) => {
                const medals  = ["🥇", "🥈", "🥉"];
                const isTop   = i < 3;
                const tooltipLabel = [
                  `Outperformance: ${kw.normalizedAvg}× account avg`,
                  `Raw avg score: ${fmt(kw.avgEngagement)}`,
                  `❤️ ${fmt(kw.totalLikes)}  💬 ${fmt(kw.totalComments)}  👁 ${fmt(kw.totalViews)}`,
                ].join("  ·  ");

                return (
                  <Tooltip
                    key={kw.term}
                    multiline
                    w={280}
                    withArrow
                    position="right"
                    label={tooltipLabel}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: gridCols,
                        alignItems: "center",
                        padding: "5px 6px",
                        borderRadius: 6,
                        borderLeft: `3px solid ${isTop
                          ? "var(--mantine-color-yellow-4)"
                          : "transparent"}`,
                        background: isTop
                          ? "var(--mantine-color-default-hover)"
                          : "transparent",
                        cursor: "default",
                      }}
                      onMouseEnter={e => {
                        if (!isTop) e.currentTarget.style.background = "var(--mantine-color-default-hover)";
                      }}
                      onMouseLeave={e => {
                        if (!isTop) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Rank */}
                      <Text size="xs" c="dimmed" ta="right">
                        {isTop ? medals[i] : i + 1}
                      </Text>

                      {/* Keyword */}
                      <Text size="sm" fw={isTop ? 700 : 500} ml={6}>{kw.term}</Text>

                      {/* KPI bar */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <KpiBar value={kw.kpi} />
                      </div>

                      {/* Avg engagement */}
                      <Text size="xs" ta="center" c="dimmed" fw={500}>
                        {fmt(kw.avgEngagement)}
                      </Text>

                      {/* Post count */}
                      <Text size="xs" ta="center" c="dimmed">{kw.sampleSize}</Text>

                      {/* Consistency badge */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <Badge
                          size="xs"
                          variant="light"
                          color={
                            kw.consistency >= 80 ? "green" :
                            kw.consistency >= 60 ? "blue"  :
                            kw.consistency >= 40 ? "yellow": "gray"
                          }
                        >
                          {kw.consistency}%
                        </Badge>
                      </div>

                      {/* Trend */}
                      <Group gap={3} justify="center">
                        <TrendIcon dir={kw.trendDir} />
                        <Text
                          size="xs"
                          c={kw.trendDir === "rising" ? "green"
                            : kw.trendDir === "falling" ? "red"
                            : "dimmed"}
                        >
                          {kw.trendDir === "rising"  ? `↑${kw.trend}×`
                           : kw.trendDir === "falling" ? `↓${kw.trend}×`
                           : "—"}
                        </Text>
                      </Group>

                      {/* Platform badges */}
                      <PlatformBadges platforms={kw.platforms} />
                    </div>
                  </Tooltip>
                );
              })}
            </Stack>
          )}
        </Card>

      </Stack>
    </div>
  );
});

export default KeywordTracking;