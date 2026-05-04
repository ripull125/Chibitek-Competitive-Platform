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
import { useTranslation } from "react-i18next";

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

function fmt(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ── sub-components ───────────────────────────────────────────────────────── */

function TrendIcon({ dir }) {
  if (dir === "rising") return <IconArrowUp size={12} color="var(--mantine-color-green-6)" />;
  if (dir === "falling") return <IconArrowDown size={12} color="var(--mantine-color-red-6)" />;
  return <IconMinus size={12} color="var(--mantine-color-gray-4)" />;
}

function KpiBar({ value }) {
  const color =
    value >= 75 ? "green" :
      value >= 45 ? "blue" :
        value >= 20 ? "yellow" : "gray";
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
    w: 104,
  },
  {
    key: "engagement",
    w: 88,
  },
  {
    key: "posts",
    w: 50,
  },
  {
    key: "consistency",
    w: 76,
  },
  {
    key: "trend",
    w: 70,
  },
  {
    key: "platforms",
    w: 130,
  },
];

/* ── main component ───────────────────────────────────────────────────────── */

const KeywordTracking = forwardRef(function KeywordTracking({ onKeywordsLoaded, maxEntries }, ref) {
  const { t } = useTranslation();
  const [keywords, setKeywords] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(undefined);
  const [sortBy, setSortBy] = useState("kpi");

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
      .then(d => { if (d.error) throw new Error(d.error); setKeywords(d.keywords || []); setMeta(d); onKeywordsLoaded?.(d.keywords || []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (currentUserId === undefined) return;
    if (!currentUserId) { setLoading(false); setError(t("keywordTracking.signInToSeeData")); return; }
    fetchKeywords();
  }, [currentUserId, t]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "keyword-tracking" } }));
  }, []);

  /* Sort */
  let sorted = [...keywords].sort((a, b) => {
    if (sortBy === "engagement") return b.avgEngagement - a.avgEngagement;
    if (sortBy === "posts") return b.sampleSize - a.sampleSize;
    if (sortBy === "consistency") return b.consistency - a.consistency;
    if (sortBy === "trend") return b.trend - a.trend;
    if (sortBy === "platforms") return (b.platforms?.length || 0) - (a.platforms?.length || 0);
    return b.kpi - a.kpi;
  });
  if (typeof maxEntries === "number" && maxEntries > 0) {
    sorted = sorted.slice(0, Math.max(5, Math.min(10, maxEntries)));
  }

  /* Grid template: rank | keyword | ...columns */
  const gridCols = `28px 1fr ${COLS.map(c => c.w + "px").join(" ")}`;

  return (
    <div ref={ref}>
      <Stack gap="sm">

        {/* ── Header card ── */}
        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div style={{ flex: 1 }}>
              <Title order={3}>{t("keywordTracking.intelligenceTitle")}</Title>
              <Text size="sm" c="dimmed" mt={6} style={{ lineHeight: 1.65, maxWidth: 680 }}>
                {t("keywordTracking.intelligenceIntro1")} <strong>{t("keywordTracking.intelligenceWeightedEngagement")}</strong>{" "}
                {t("keywordTracking.intelligenceIntro2")} <strong>{t("keywordTracking.intelligenceNormalizedPerAccount")}</strong>{" "}
                {t("keywordTracking.intelligenceIntro3")} <strong>{t("keywordTracking.intelligenceKpiRange")}</strong>{" "}
                {t("keywordTracking.intelligenceIntro4")} <strong>{t("keywordTracking.intelligencePlatform")}</strong>{" "}
                <strong>{t("keywordTracking.intelligenceClickToSort")}</strong>
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
              {t("common.refresh")}
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
            <Text size="xs" c="dimmed" fw={600}>{t("keywordTracking.keywordHeader")}</Text>
            {COLS.map(col => (
              <Tooltip key={col.key} label={t(`keywordTracking.colTips.${col.key}`)} withArrow multiline w={240} position="top">
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
                    {t(`keywordTracking.colLabels.${col.key}`)}
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
              {t("keywordTracking.noKeywords")}
            </Text>
          ) : (
            <Stack gap={1} mt={2}>
              {sorted.map((kw, i) => {
                const medals = ["🥇", "🥈", "🥉"];
                const isTop = i < 3;
                const tooltipLabel = [
                  `${t("keywordTracking.outperformance")}: ${kw.normalizedAvg}× ${t("keywordTracking.accountAvg")}`,
                  `${t("keywordTracking.rawAvgScore")}: ${fmt(kw.avgEngagement)}`,
                  `❤️ ${fmt(kw.totalLikes)}  💬 ${fmt(kw.totalComments)}  👁 ${fmt(kw.totalViews)}`,
                ].join("  ·  ");

                return (
                  <Tooltip
                    key={kw.term}
                    multiline
                    maw={280}
                    withArrow
                    position="top-start"
                    withinPortal
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
                              kw.consistency >= 60 ? "blue" :
                                kw.consistency >= 40 ? "yellow" : "gray"
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
                          {kw.trendDir === "rising" ? `↑${kw.trend}×`
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