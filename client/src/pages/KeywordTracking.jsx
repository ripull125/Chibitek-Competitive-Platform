import "../utils/ui.css";
import React, { forwardRef, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Card, Collapse, Group,
  Skeleton, Stack, Text, Title, Tooltip,
} from "@mantine/core";
import { IconAlertCircle, IconArrowUp, IconArrowDown, IconMinus, IconRefresh, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  const [keywords, setKeywords]       = useState([]);
  const [trending, setTrending]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [meta, setMeta]               = useState(null);
  const [currentUserId, setCurrentUserId] = useState(undefined);
  const [showTrending, setShowTrending]   = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) { if (mounted) setCurrentUserId(null); return; }
      try {
        const { data } = await supabase.auth.getUser();
        if (mounted) setCurrentUserId(data?.user?.id ?? null);
      } catch { if (mounted) setCurrentUserId(null); }
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  const fetchKeywords = () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    const url = apiUrl(`/api/keywords?user_id=${encodeURIComponent(currentUserId)}`);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        if (d.error) throw new Error(d.error);
        setKeywords(d.keywords || []);
        setTrending(d.trendingKeywords || []);
        setMeta({ totalPosts: d.totalPosts, totalTopPosts: d.totalTopPosts, debug: d.debug });
      })
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

  function liftColor(lift) {
    if (lift >= 2)   return "green";
    if (lift >= 1.2) return "blue";
    if (lift >= 0.8) return "gray";
    return "red";
  }

  function liftLabel(lift) {
    if (lift >= 2)   return "Strong";
    if (lift >= 1.2) return "Good";
    if (lift >= 0.8) return "Weak";
    return "Poor";
  }

  function TrendIcon({ dir }) {
    if (dir === "rising")  return <IconArrowUp  size={13} color="var(--mantine-color-green-6)" />;
    if (dir === "falling") return <IconArrowDown size={13} color="var(--mantine-color-red-6)"  />;
    return <IconMinus size={13} color="var(--mantine-color-gray-5)" />;
  }

  const skeletonRows = Array.from({ length: 8 });

  return (
    <div ref={ref}>
      <Stack gap="md">

        {/* ── Header card ── */}
        <Card withBorder shadow="xs" radius="lg" p="lg">
          <Group justify="space-between" align="center" mb={meta ? "xs" : 0}>
            <div>
              <Title order={3}>Keyword Analysis</Title>
              <Text size="sm" c="dimmed" mt={2}>
                Words most overrepresented in your top-performing posts
              </Text>
            </div>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={loading}
              onClick={fetchKeywords}
              disabled={!currentUserId}
            >
              Refresh
            </Button>
          </Group>

          {meta && (
            <Text size="xs" c="dimmed">{meta.debug}</Text>
          )}

          {error && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" mt="sm">
              {error}
            </Alert>
          )}
        </Card>

        {/* ── Trending keywords (collapsible) ── */}
        {(loading || trending.length > 0) && (
          <Card withBorder shadow="xs" radius="lg" p="lg">
            <Group justify="space-between" align="center" mb={showTrending ? "md" : 0}
              style={{ cursor: "pointer" }} onClick={() => setShowTrending(v => !v)}>
              <Group gap="xs">
                <IconArrowUp size={16} color="var(--mantine-color-green-6)" />
                <Text fw={600} size="sm">Trending Keywords</Text>
                <Text size="xs" c="dimmed">recently gaining momentum</Text>
              </Group>
              {showTrending ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </Group>

            <Collapse in={showTrending}>
              {loading ? (
                <Group gap="xs" wrap="wrap">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={28} width={80 + i * 10} radius="xl" />
                  ))}
                </Group>
              ) : trending.length === 0 ? (
                <Text size="sm" c="dimmed">Not enough post history to detect trends yet. Save more posts over time.</Text>
              ) : (
                <Group gap="xs" wrap="wrap">
                  {trending.map(kw => (
                    <Tooltip key={kw.term}
                      label={`${kw.trend}x more common in recent posts · appears in ${kw.sampleSize} posts`}
                      withArrow
                    >
                      <Badge
                        size="md"
                        variant="light"
                        color="green"
                        leftSection={<IconArrowUp size={11} />}
                        style={{ cursor: "default" }}
                      >
                        {kw.term}
                        <Text span size="xs" c="dimmed" ml={4}>↑{kw.trend}x</Text>
                      </Badge>
                    </Tooltip>
                  ))}
                </Group>
              )}
            </Collapse>
          </Card>
        )}

        {/* ── Main keyword table ── */}
        <Card withBorder shadow="xs" radius="lg" p="lg">
          <Text fw={600} size="sm" mb="md">Power Keywords</Text>

          {/* Column headers */}
          {!loading && keywords.length > 0 && (
            <Group px="xs" mb="xs" gap={0}>
              <Text size="xs" c="dimmed" fw={600} style={{ flex: 1 }}>KEYWORD</Text>
              <Text size="xs" c="dimmed" fw={600} w={70}  ta="center">LIFT</Text>
              <Text size="xs" c="dimmed" fw={600} w={70}  ta="center">TOP %</Text>
              <Text size="xs" c="dimmed" fw={600} w={80}  ta="center">OVERALL %</Text>
              <Text size="xs" c="dimmed" fw={600} w={55}  ta="center">POSTS</Text>
              <Text size="xs" c="dimmed" fw={600} w={60}  ta="center">TREND</Text>
            </Group>
          )}

          <Stack gap="xs">
            {loading ? (
              skeletonRows.map((_, i) => (
                <Card key={i} withBorder radius="md" p="sm" style={{ background: "var(--mantine-color-default-hover)" }}>
                  <Group gap="sm">
                    <Skeleton height={12} width="35%" radius="sm" />
                    <Skeleton height={20} width={50} radius="xl" ml="auto" />
                    <Skeleton height={12} width={50} radius="sm" />
                    <Skeleton height={12} width={60} radius="sm" />
                    <Skeleton height={12} width={35} radius="sm" />
                    <Skeleton height={12} width={40} radius="sm" />
                  </Group>
                </Card>
              ))
            ) : keywords.length === 0 ? (
              <Card withBorder radius="md" p="xl">
                <Text c="dimmed" ta="center">
                  No keywords found yet. Save posts from Competitor Lookup first.
                </Text>
              </Card>
            ) : (
              keywords.map((kw, i) => (
                <Card key={kw.term} withBorder radius="md" p="sm"
                  style={{
                    background: i < 3 ? "var(--mantine-color-default-hover)" : undefined,
                    borderLeft: i < 3 ? "3px solid var(--mantine-color-blue-4)" : undefined,
                  }}
                >
                  <Group align="center" gap={0}>
                    {/* Rank + term */}
                    <Group gap="xs" style={{ flex: 1 }}>
                      <Text size="xs" c="dimmed" w={18} ta="right">{i + 1}</Text>
                      <Text fw={i < 3 ? 700 : 500} size="sm">{kw.term}</Text>
                    </Group>

                    {/* Lift badge */}
                    <Tooltip label={`${liftLabel(kw.lift)}: keyword is ${kw.lift}x more common in top posts`} withArrow>
                      <Badge color={liftColor(kw.lift)} variant="filled" w={70} ta="center" style={{ cursor: "default" }}>
                        {kw.lift}x
                      </Badge>
                    </Tooltip>

                    {/* Top % */}
                    <Tooltip label={`In ${kw.topFreq}% of your top-performing posts`} withArrow>
                      <Text size="sm" w={70} ta="center" fw={500} c={kw.topFreq > 50 ? "blue" : undefined}>
                        {kw.topFreq}%
                      </Text>
                    </Tooltip>

                    {/* Overall % */}
                    <Tooltip label={`In ${kw.overallFreq}% of all posts`} withArrow>
                      <Text size="sm" w={80} ta="center" c="dimmed">
                        {kw.overallFreq}%
                      </Text>
                    </Tooltip>

                    {/* Sample size */}
                    <Tooltip label={`Appears in ${kw.sampleSize} total posts`} withArrow>
                      <Text size="sm" w={55} ta="center" c="dimmed">{kw.sampleSize}</Text>
                    </Tooltip>

                    {/* Trend */}
                    <Tooltip label={`Trend: ${kw.trendDir} (${kw.trend}x in recent vs older posts)`} withArrow>
                      <Group gap={3} w={60} justify="center">
                        <TrendIcon dir={kw.trendDir} />
                        <Text size="xs" c={kw.trendDir === "rising" ? "green" : kw.trendDir === "falling" ? "red" : "dimmed"}>
                          {kw.trendDir === "rising" ? "↑" : kw.trendDir === "falling" ? "↓" : "—"}
                        </Text>
                      </Group>
                    </Tooltip>
                  </Group>
                </Card>
              ))
            )}
          </Stack>
        </Card>

      </Stack>
    </div>
  );
});

export default KeywordTracking;