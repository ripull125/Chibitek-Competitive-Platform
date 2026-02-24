import "../utils/ui.css";
import React, { forwardRef, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconAlertCircle, IconArrowUp, IconArrowDown, IconMinus, IconRefresh, IconInfoCircle } from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

function TrendIcon({ dir }) {
  if (dir === "rising")  return <IconArrowUp  size={12} color="var(--mantine-color-green-6)" />;
  if (dir === "falling") return <IconArrowDown size={12} color="var(--mantine-color-red-6)" />;
  return <IconMinus size={12} color="var(--mantine-color-gray-4)" />;
}

function KpiBar({ value }) {
  const color = value >= 75 ? "green" : value >= 45 ? "blue" : value >= 20 ? "yellow" : "gray";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 64, height: 5, borderRadius: 99, background: "var(--mantine-color-default-border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, borderRadius: 99, background: `var(--mantine-color-${color}-5)` }} />
      </div>
      <Text size="xs" fw={600} w={22} ta="right" c={value >= 75 ? "green" : value >= 45 ? "blue" : "dimmed"}>{value}</Text>
    </div>
  );
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`;
  return String(n);
}

// Column definitions — label + explanation shown in tooltip
const COLS = [
  { key: "kpi",         label: "KPI",         w: 110, tip: "Keyword Performance Index (0–100). The definitive rank. Combines average engagement, sample size, consistency across posts, and trend direction. Higher = more reliably drives engagement." },
  { key: "engagement",  label: "AVG SCORE",   w: 90,  tip: "Average weighted engagement of posts containing this keyword. Formula: (Shares × 5) + (Comments × 3) + (Likes × 1). Shares and comments weighted higher as they signal stronger intent than likes." },
  { key: "posts",       label: "POSTS",       w: 50,  tip: "How many saved posts this keyword appears in. The Bayesian formula requires at least 2 posts to surface a keyword — more posts = more reliable signal." },
  { key: "consistency", label: "CONSIST.",    w: 72,  tip: "How consistently this keyword drives high engagement (0–100%). Calculated from the coefficient of variation across post scores. 100% = every post with this word performs equally. Low = one-hit wonder." },
  { key: "trend",       label: "TREND",       w: 70,  tip: "Whether this keyword is gaining or losing traction. Compares average engagement in your newest 33% of posts vs older 67%. ↑ = rising, ↓ = falling, — = stable." },
];

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  const [keywords, setKeywords]           = useState([]);
  const [meta, setMeta]                   = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [currentUserId, setCurrentUserId] = useState(undefined);
  const [sortBy, setSortBy]               = useState("kpi");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!supabase) { if (mounted) setCurrentUserId(null); return; }
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setCurrentUserId(data?.user?.id ?? null);
      } catch { if (mounted) setCurrentUserId(null); }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const fetchKeywords = () => {
    if (!currentUserId) return;
    setLoading(true); setError(null);
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

  const sorted = [...keywords].sort((a, b) => {
    if (sortBy === "engagement")  return b.avgEngagement - a.avgEngagement;
    if (sortBy === "posts")       return b.sampleSize    - a.sampleSize;
    if (sortBy === "consistency") return b.consistency   - a.consistency;
    if (sortBy === "trend")       return b.trend         - a.trend;
    return b.kpi - a.kpi;
  });

  // Grid: rank | keyword | KPI | avg score | posts | consistency | trend
  const gridCols = `28px 1fr ${COLS.map(c => c.w + "px").join(" ")}`;

  return (
    <div ref={ref}>
      <Stack gap="sm">

        {/* Header */}
        <Card withBorder radius="lg" p="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={3}>Keyword Intelligence</Title>
              <Text size="sm" c="dimmed" mt={6} mb={2} style={{ lineHeight: 1.6 }}>
                Every post is scored by <strong>weighted engagement</strong> (Shares×5 + Comments×3 + Likes×1 — shares and comments count more because they signal stronger intent than a like).
                That score is then <strong>normalized per account</strong> — so a post that gets 3× Obama's typical engagement and a post that gets 3× MrBeast's typical engagement are treated equally, regardless of their raw numbers.
                The <strong>KPI (0–100)</strong> is the final rank: it combines how much a keyword outperforms its account's baseline, how <em>consistently</em> it does so across multiple posts, and a small trend boost if it's gaining momentum in recent posts.
                A keyword scores 100 only if it reliably appears in posts that massively outperform that account's average. <strong>Click any column header to re-sort.</strong>
              </Text>
              {meta?.debug && <Text size="xs" c="dimmed" mt={2}>{meta.debug}</Text>}
            </div>
            <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />}
              loading={loading} onClick={fetchKeywords} disabled={!currentUserId}>
              Refresh
            </Button>
          </Group>
          {error && <Alert icon={<IconAlertCircle size={14} />} color="red" radius="md" mt="sm" py="xs">{error}</Alert>}
        </Card>

        {/* Table */}
        <Card withBorder radius="lg" p="md">

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: gridCols, alignItems: "center",
            padding: "0 6px 6px", borderBottom: "1px solid var(--mantine-color-default-border)", marginBottom: 4 }}>
            <Text size="xs" c="dimmed" fw={600}>#</Text>
            <Text size="xs" c="dimmed" fw={600}>KEYWORD</Text>
            {COLS.map(col => (
              <Tooltip key={col.key} label={col.tip} withArrow multiline w={240} position="top">
                <Group gap={3} justify="center" style={{ cursor: "pointer" }} onClick={() => setSortBy(col.key)}>
                  <Text size="xs" fw={700}
                    c={sortBy === col.key ? "blue" : "dimmed"}
                    style={{ textDecoration: sortBy === col.key ? "underline dotted" : "none" }}>
                    {col.label}
                  </Text>
                  <IconInfoCircle size={10} color={sortBy === col.key ? "var(--mantine-color-blue-5)" : "var(--mantine-color-gray-4)"} />
                </Group>
              </Tooltip>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <Stack gap={3} mt={4}>
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "4px 6px" }}>
                  {[28, 120, 100, 80, 40, 60, 55].map((w, j) => (
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
                const medals = ["🥇","🥈","🥉"];
                const isTop = i < 3;
                return (
                  <Tooltip key={kw.term} multiline w={260} withArrow position="right" label={
                    `Outperformance: ${kw.normalizedAvg}x account avg  ·  Raw avg: ${fmt(kw.avgEngagement)}\n` +
                    `❤️ ${fmt(kw.totalLikes)}  🔁 ${fmt(kw.totalShares)}  💬 ${fmt(kw.totalComments)}`
                  }>
                    <div
                      style={{
                        display: "grid", gridTemplateColumns: gridCols,
                        alignItems: "center", padding: "5px 6px", borderRadius: 6,
                        borderLeft: `3px solid ${isTop ? "var(--mantine-color-yellow-4)" : "transparent"}`,
                        background: isTop ? "var(--mantine-color-default-hover)" : "transparent",
                        cursor: "default",
                      }}
                      onMouseEnter={e => { if (!isTop) e.currentTarget.style.background = "var(--mantine-color-default-hover)"; }}
                      onMouseLeave={e => { if (!isTop) e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Rank */}
                      <Text size="xs" c="dimmed" ta="right">{isTop ? medals[i] : i + 1}</Text>

                      {/* Keyword */}
                      <Text size="sm" fw={isTop ? 700 : 500} ml={6}>{kw.term}</Text>

                      {/* KPI bar */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <KpiBar value={kw.kpi} />
                      </div>

                      {/* Avg engagement */}
                      <Text size="xs" ta="center" c="dimmed" fw={500}>{fmt(kw.avgEngagement)}</Text>

                      {/* Posts */}
                      <Text size="xs" ta="center" c="dimmed">{kw.sampleSize}</Text>

                      {/* Consistency */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <Badge size="xs" variant="light"
                          color={kw.consistency >= 80 ? "green" : kw.consistency >= 60 ? "blue" : kw.consistency >= 40 ? "yellow" : "gray"}>
                          {kw.consistency}%
                        </Badge>
                      </div>

                      {/* Trend */}
                      <Group gap={3} justify="center">
                        <TrendIcon dir={kw.trendDir} />
                        <Text size="xs" c={kw.trendDir === "rising" ? "green" : kw.trendDir === "falling" ? "red" : "dimmed"}>
                          {kw.trendDir === "rising" ? `↑${kw.trend}x` : kw.trendDir === "falling" ? `↓${kw.trend}x` : "—"}
                        </Text>
                      </Group>
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