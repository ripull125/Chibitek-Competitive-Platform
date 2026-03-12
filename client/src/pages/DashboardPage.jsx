// client/src/pages/DashboardPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowUpRight,
  IconArrowDownRight,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandReddit,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconChartBar,
  IconChartDots,
  IconChartLine,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconHeart,
  IconMessage,
  IconMessageChatbot,
  IconMoodSmile,
  IconSparkles,
  IconTargetArrow,
  IconTrendingUp,
  IconUsers,
} from "@tabler/icons-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";
import classes from "./DashboardPage.module.css";
import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PLATFORM_COLORS = {
  x: "#1DA1F2",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  tiktok: "#00f2ea",
  reddit: "#FF4500",
};

const PLATFORM_ICONS = {
  x: IconBrandX,
  twitter: IconBrandX,
  linkedin: IconBrandLinkedin,
  instagram: IconBrandInstagram,
  youtube: IconBrandYoutube,
  tiktok: IconBrandTiktok,
  reddit: IconBrandReddit,
};

const PIE_COLORS = ["#339AF0", "#51CF66", "#FF6B6B", "#FCC419", "#845EF7", "#FF922B"];

const fmtK = (n) => {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
};

const fmtDate = (d) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/* ------------------------------------------------------------------ */
/*  Data fetching hook                                                 */
/* ------------------------------------------------------------------ */
function useDashboardData() {
  const [posts, setPosts] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [platformIdMap, setPlatformIdMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      let uid = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id || null;
      }
      if (mounted) setUserId(uid);

      const qs = uid ? "?user_id=" + uid : "";
      const [postsRes, kwRes, platRes] = await Promise.all([
        fetch(apiUrl("/api/posts" + qs)).then((r) => r.json()).catch(() => ({ posts: [] })),
        fetch(apiUrl("/api/keywords" + qs)).then((r) => r.json()).catch(() => ({ keywords: [] })),
        fetch(apiUrl("/api/platforms")).then((r) => r.json()).catch(() => ({ platforms: {} })),
      ]);

      // Build reverse map: numeric id → platform name
      const idToName = {};
      const platforms = platRes.platforms || {};
      for (const [name, id] of Object.entries(platforms)) {
        idToName[id] = name;
      }

      if (mounted) {
        setPosts(Array.isArray(postsRes.posts) ? postsRes.posts : []);
        setKeywords(Array.isArray(kwRes.keywords) ? kwRes.keywords : []);
        setPlatformIdMap(idToName);
        setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return { posts, keywords, platformIdMap, loading, userId };
}

/* ------------------------------------------------------------------ */
/*  Derived analytics                                                  */
/* ------------------------------------------------------------------ */
function guessPlatform(post) {
  const url = (post.url || "").toLowerCase();
  if (url.includes("twitter.com") || url.includes("x.com")) return "x";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("reddit.com")) return "reddit";
  const extra = post.extra || {};
  if (extra.channelTitle || extra.videoId) return "youtube";
  return "other";
}

function useAnalytics(posts, keywords, platformIdMap) {
  return useMemo(() => {
    if (!posts.length) return null;

    // Resolve platform name: prefer server-provided ID map, then URL heuristic
    const resolvePlatform = (p) => {
      if (platformIdMap[p.platform_id]) return platformIdMap[p.platform_id];
      if (p.extra?.platform) return p.extra.platform.toLowerCase();
      return guessPlatform(p);
    };

    // Tag every post with its resolved platform name
    const taggedPosts = posts.map((p) => ({
      ...p,
      _platform: resolvePlatform(p),
    }));

    const totalPosts = taggedPosts.length;
    const totalLikes = taggedPosts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalComments = taggedPosts.reduce((s, p) => s + (p.comments || 0), 0);
    const totalViews = taggedPosts.reduce((s, p) => s + (p.views || p.extra?.views || 0), 0);
    const totalShares = taggedPosts.reduce((s, p) => s + (p.shares || 0), 0);
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagement = totalPosts ? Math.round(totalEngagement / totalPosts) : 0;

    // Unique platform names
    const platformNames = [...new Set(taggedPosts.map((p) => p._platform))];

    // Engagement over time (with per-platform breakdown)
    const byDay = {};
    taggedPosts.forEach((p) => {
      const d = (p.published_at || p.created_at || "").slice(0, 10);
      if (!d) return;
      if (!byDay[d]) byDay[d] = { date: d, likes: 0, comments: 0, shares: 0, views: 0, posts: 0, _byPlatform: {} };
      byDay[d].likes += p.likes || 0;
      byDay[d].comments += p.comments || 0;
      byDay[d].shares += p.shares || 0;
      byDay[d].views += p.views || p.extra?.views || 0;
      byDay[d].posts += 1;
      // per-platform
      const plat = p._platform;
      if (!byDay[d]._byPlatform[plat]) byDay[d]._byPlatform[plat] = { likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
      byDay[d]._byPlatform[plat].likes += p.likes || 0;
      byDay[d]._byPlatform[plat].comments += p.comments || 0;
      byDay[d]._byPlatform[plat].shares += p.shares || 0;
      byDay[d]._byPlatform[plat].views += p.views || p.extra?.views || 0;
      byDay[d]._byPlatform[plat].posts += 1;
    });
    const engagementOverTime = Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, engagement: d.likes + d.comments + d.shares }));

    // Engagement by platform
    const byPlatform = {};
    taggedPosts.forEach((p) => {
      const name = p._platform;
      if (!byPlatform[name]) byPlatform[name] = { platform: name, likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
      byPlatform[name].likes += p.likes || 0;
      byPlatform[name].comments += p.comments || 0;
      byPlatform[name].shares += p.shares || 0;
      byPlatform[name].views += p.views || p.extra?.views || 0;
      byPlatform[name].posts += 1;
    });
    const platformBreakdown = Object.values(byPlatform)
      .map((d) => ({ ...d, engagement: d.likes + d.comments + d.shares }))
      .sort((a, b) => b.engagement - a.engagement);

    // Top posts
    const topPosts = [...taggedPosts]
      .map((p) => ({
        ...p,
        engagement: (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
        platformName: p._platform,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 8);

    // Top keywords
    const topKeywords = [...keywords]
      .sort((a, b) => (b.kpi || 0) - (a.kpi || 0))
      .slice(0, 10);

    // Tone distribution
    const tones = {};
    taggedPosts.forEach((p) => {
      if (p.tone) { tones[p.tone] = (tones[p.tone] || 0) + 1; }
    });
    const toneDistribution = Object.entries(tones)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Competitors
    const byCompetitor = {};
    taggedPosts.forEach((p) => {
      const name = p.username || p.extra?.author_handle || p.extra?.username || "Unknown";
      if (!byCompetitor[name]) byCompetitor[name] = { name, likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
      byCompetitor[name].likes += p.likes || 0;
      byCompetitor[name].comments += p.comments || 0;
      byCompetitor[name].shares += p.shares || 0;
      byCompetitor[name].views += p.views || p.extra?.views || 0;
      byCompetitor[name].posts += 1;
    });
    const competitors = Object.values(byCompetitor)
      .map((c) => ({ ...c, engagement: c.likes + c.comments + c.shares }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 6);

    return {
      totalPosts, totalLikes, totalComments, totalViews, totalShares,
      totalEngagement, avgEngagement, engagementOverTime, platformBreakdown,
      platformNames, topPosts, topKeywords, toneDistribution, competitors,
    };
  }, [posts, keywords, platformIdMap]);
}

/* ------------------------------------------------------------------ */
/*  Reusable Section Card                                              */
/* ------------------------------------------------------------------ */
function SectionCard({ title, subtitle, icon: Icon, children, onViewData, right, tourId }) {
  return (
    <Card withBorder shadow="sm" radius="lg" p="xl" className={classes.sectionCard} data-tour={tourId}>
      <Group justify="space-between" align="flex-start" mb="md">
        <Group gap="sm" align="center">
          {Icon && (
            <ThemeIcon variant="light" radius="lg" size={38}>
              <Icon size={20} />
            </ThemeIcon>
          )}
          <Stack gap={2}>
            <Text fw={800} tt="uppercase" size="xs" c="dimmed" style={{ letterSpacing: "0.06em" }}>
              {title}
            </Text>
            {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
          </Stack>
        </Group>
        <Group gap="xs">
          {right}
          {onViewData && (
            <Tooltip label="View raw data">
              <ActionIcon variant="light" radius="lg" size="lg" onClick={onViewData}>
                <IconExternalLink size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <Divider mb="md" opacity={0.15} />
      {children}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Strip                                                          */
/* ------------------------------------------------------------------ */
function KPIStrip({ analytics }) {
  const { t } = useTranslation();
  const kpis = [
    { label: t("dashboard.kpiTotalPosts", { defaultValue: "Total Posts" }), value: analytics.totalPosts, icon: IconChartDots, color: "blue" },
    { label: t("dashboard.kpiTotalEngagement", { defaultValue: "Total Engagement" }), value: fmtK(analytics.totalEngagement), icon: IconHeart, color: "pink" },
    { label: t("dashboard.kpiAvgEngagement", { defaultValue: "Avg Engagement" }), value: fmtK(analytics.avgEngagement), icon: IconTrendingUp, color: "teal" },
    { label: t("dashboard.kpiTotalViews", { defaultValue: "Total Views" }), value: fmtK(analytics.totalViews), icon: IconEye, color: "violet" },
    { label: t("dashboard.kpiTotalComments", { defaultValue: "Total Comments" }), value: fmtK(analytics.totalComments), icon: IconMessage, color: "orange" },
    { label: t("dashboard.kpiPlatforms", { defaultValue: "Platforms" }), value: analytics.platformNames.length, icon: IconUsers, color: "cyan" },
  ];

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md" data-tour="dashboard-kpis">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <Card key={k.label} withBorder shadow="xs" radius="lg" p="lg" className={classes.kpiCard}>
            <Group gap="sm" align="center" mb={8}>
              <ThemeIcon variant="light" color={k.color} radius="md" size={32}>
                <Icon size={18} />
              </ThemeIcon>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: "0.04em" }}>
                {k.label}
              </Text>
            </Group>
            <Text fw={800} size="xl" className={classes.kpiValue}>{k.value}</Text>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

/* ------------------------------------------------------------------ */
/*  Engagement Over Time (with filters)                                */
/* ------------------------------------------------------------------ */
function EngagementTimeline({ data, platformNames }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [metric, setMetric] = useState("all");

  const DATE_RANGES = [
    { value: "all", label: t("dashboard.dateAllTime", { defaultValue: "All time" }) },
    { value: "7", label: t("dashboard.dateLast7", { defaultValue: "Last 7 days" }) },
    { value: "30", label: t("dashboard.dateLast30", { defaultValue: "Last 30 days" }) },
    { value: "90", label: t("dashboard.dateLast90", { defaultValue: "Last 90 days" }) },
  ];

  const platformOptions = useMemo(() => [
    { value: "all", label: t("dashboard.allPlatforms", { defaultValue: "All platforms" }) },
    ...platformNames.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) })),
  ], [platformNames, t]);

  const filteredData = useMemo(() => {
    let result = data;

    // Date range filter
    if (dateRange !== "all") {
      const days = parseInt(dateRange, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      result = result.filter((d) => d.date >= cutoffStr);
    }

    // Platform filter: re-aggregate from per-platform breakdown
    if (platformFilter !== "all") {
      result = result.map((d) => {
        const platData = d._byPlatform?.[platformFilter];
        if (!platData) return { ...d, likes: 0, comments: 0, shares: 0, views: 0, engagement: 0 };
        return {
          ...d,
          likes: platData.likes,
          comments: platData.comments,
          shares: platData.shares,
          views: platData.views,
          engagement: platData.likes + platData.comments + platData.shares,
        };
      }).filter((d) => d.engagement > 0 || d.likes > 0 || d.comments > 0 || d.shares > 0 || d.views > 0);
    }

    return result;
  }, [data, platformFilter, dateRange, metric]);

  const filterControls = (
    <Group gap="xs" wrap="wrap">
      <Select
        size="xs"
        data={platformOptions}
        value={platformFilter}
        onChange={setPlatformFilter}
        style={{ width: 150 }}
        allowDeselect={false}
      />
      <Select
        size="xs"
        data={DATE_RANGES}
        value={dateRange}
        onChange={setDateRange}
        style={{ width: 130 }}
        allowDeselect={false}
      />
      <SegmentedControl
        size="xs"
        value={metric}
        onChange={setMetric}
        data={[
          { value: "all", label: t("dashboard.filterAll", { defaultValue: "All" }) },
          { value: "likes", label: t("dashboard.likes", { defaultValue: "Likes" }) },
          { value: "comments", label: t("dashboard.comments", { defaultValue: "Comments" }) },
          { value: "shares", label: t("dashboard.shares", { defaultValue: "Shares" }) },
        ]}
      />
    </Group>
  );

  return (
    <SectionCard
      title={t("dashboard.engagementOverTime", { defaultValue: "Engagement Over Time" })}
      subtitle={t("dashboard.engagementOverTimeDesc", { defaultValue: "Daily likes, comments & shares from collected posts" })}
      icon={IconChartLine}
      onViewData={() => navigate("/reports")}
      right={filterControls}
      tourId="dashboard-timeline"
    >
      {filteredData.length > 0 ? (
        <div className={classes.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#339AF0" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#339AF0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradComments" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#51CF66" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#51CF66" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradShares" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ borderRadius: 10, border: "1px solid rgba(100,116,139,0.2)" }}
                labelFormatter={fmtDate}
                formatter={(v) => fmtK(v)}
              />
              <Legend />
              {(metric === "all" || metric === "likes") && (
                <Area type="monotone" dataKey="likes" stroke="#339AF0" fill="url(#gradLikes)" strokeWidth={2} name={t("dashboard.likes", { defaultValue: "Likes" })} />
              )}
              {(metric === "all" || metric === "comments") && (
                <Area type="monotone" dataKey="comments" stroke="#51CF66" fill="url(#gradComments)" strokeWidth={2} name={t("dashboard.comments", { defaultValue: "Comments" })} />
              )}
              {(metric === "all" || metric === "shares") && (
                <Area type="monotone" dataKey="shares" stroke="#FF6B6B" fill="url(#gradShares)" strokeWidth={2} name={t("dashboard.shares", { defaultValue: "Shares" })} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState msg={platformFilter !== "all"
          ? t("dashboard.noTimelineForPlatform", { defaultValue: "No data for this platform in the selected time range." })
          : t("dashboard.noTimelineData", { defaultValue: "No timeline data yet. Start collecting posts from Competitor Lookup." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform Breakdown                                                 */
/* ------------------------------------------------------------------ */
function PlatformBreakdown({ data }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SectionCard
      title={t("dashboard.engagementByPlatform", { defaultValue: "Engagement by Platform" })}
      subtitle={t("dashboard.engagementByPlatformDesc", { defaultValue: "How each social platform is performing" })}
      icon={IconChartBar}
      onViewData={() => navigate("/reports")}
      tourId="dashboard-platforms"
    >
      {data.length > 0 ? (
        <div className={classes.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="platform" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <RechartsTooltip
                contentStyle={{ borderRadius: 10, border: "1px solid rgba(100,116,139,0.2)" }}
                formatter={(v) => fmtK(v)}
              />
              <Legend />
              <Bar dataKey="likes" fill="#339AF0" name={t("dashboard.likes", { defaultValue: "Likes" })} radius={[4, 4, 0, 0]} />
              <Bar dataKey="comments" fill="#51CF66" name={t("dashboard.comments", { defaultValue: "Comments" })} radius={[4, 4, 0, 0]} />
              <Bar dataKey="shares" fill="#FF6B6B" name={t("dashboard.shares", { defaultValue: "Shares" })} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState msg={t("dashboard.noPlatformData", { defaultValue: "No platform data yet." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Top Posts                                                          */
/* ------------------------------------------------------------------ */
function TopPostsList({ posts }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SectionCard
      title={t("dashboard.topPerformingPosts", { defaultValue: "Top Performing Posts" })}
      subtitle={t("dashboard.topPerformingPostsDesc", { defaultValue: "Highest engagement posts collected so far" })}
      icon={IconTrendingUp}
      onViewData={() => navigate("/savedPosts")}
      tourId="dashboard-top-posts"
    >
      {posts.length > 0 ? (
        <Stack gap="sm">
          {posts.map((p, i) => {
            const PlatIcon = PLATFORM_ICONS[p.platformName] || IconChartDots;
            const platformColor = PLATFORM_COLORS[p.platformName] || "#868e96";
            return (
              <Paper
                key={p.id || i}
                withBorder
                p="sm"
                radius="md"
                className={classes.postRow}
                component={p.url ? "a" : "div"}
                href={p.url || undefined}
                target={p.url ? "_blank" : undefined}
                rel={p.url ? "noopener noreferrer" : undefined}
                style={{ textDecoration: "none", color: "inherit", cursor: p.url ? "pointer" : "default" }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <Text fw={800} c="dimmed" size="sm" style={{ width: 24, textAlign: "center" }}>
                      {i + 1}
                    </Text>
                    <ThemeIcon variant="light" radius="md" size={30} color={platformColor}>
                      <PlatIcon size={16} />
                    </ThemeIcon>
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" lineClamp={1}>
                        {p.content || p.extra?.title || p.extra?.description || t("dashboard.untitledPost", { defaultValue: "Untitled post" })}
                      </Text>
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          @{p.username || p.extra?.author_handle || t("dashboard.unknown", { defaultValue: "unknown" })}
                        </Text>
                        <Badge size="xs" variant="light" color={platformColor}>
                          {p.platformName}
                        </Badge>
                      </Group>
                    </Stack>
                  </Group>
                  <Group gap="lg" wrap="nowrap">
                    <Tooltip label={t("dashboard.likes", { defaultValue: "Likes" })}>
                      <Group gap={4}>
                        <IconHeart size={14} color="#FF6B6B" />
                        <Text size="sm" fw={600}>{fmtK(p.likes || 0)}</Text>
                      </Group>
                    </Tooltip>
                    <Tooltip label={t("dashboard.comments", { defaultValue: "Comments" })}>
                      <Group gap={4}>
                        <IconMessage size={14} color="#51CF66" />
                        <Text size="sm" fw={600}>{fmtK(p.comments || 0)}</Text>
                      </Group>
                    </Tooltip>
                    <Tooltip label={t("dashboard.views", { defaultValue: "Views" })}>
                      <Group gap={4}>
                        <IconEye size={14} color="#845EF7" />
                        <Text size="sm" fw={600}>{fmtK(p.views || p.extra?.views || 0)}</Text>
                      </Group>
                    </Tooltip>
                    {p.url && (
                      <Tooltip label={t("dashboard.openOriginal", { defaultValue: "Open original" })}>
                        <ActionIcon variant="subtle" size="sm" component="a" href={p.url} target="_blank" rel="noopener">
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <EmptyState msg={t("dashboard.noPostsCollected", { defaultValue: "No posts collected yet. Use Competitor Lookup to gather data." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Competitor Comparison                                               */
/* ------------------------------------------------------------------ */
function CompetitorComparison({ competitors }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SectionCard
      title={t("dashboard.topCompetitors", { defaultValue: "Top Competitors" })}
      subtitle={t("dashboard.topCompetitorsDesc", { defaultValue: "Engagement breakdown by account" })}
      icon={IconUsers}
      onViewData={() => navigate("/competitors")}
      tourId="dashboard-competitors"
    >
      {competitors.length > 0 ? (
        <Stack gap="sm">
          {competitors.map((c) => (
            <Paper key={c.name} withBorder p="sm" radius="md" className={classes.postRow}>
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" align="center">
                  <Avatar size={32} radius="xl" color="teal">
                    {c.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Stack gap={2}>
                    <Text fw={700} size="sm">@{c.name}</Text>
                    <Text size="xs" c="dimmed">{t("dashboard.postsCollected", { count: c.posts, defaultValue: "{{count}} posts collected" })}</Text>
                  </Stack>
                </Group>
                <Group gap="lg" wrap="nowrap">
                  <Tooltip label={t("dashboard.likes", { defaultValue: "Likes" })}>
                    <Group gap={4}>
                      <IconHeart size={14} color="#FF6B6B" />
                      <Text size="sm" fw={600}>{fmtK(c.likes)}</Text>
                    </Group>
                  </Tooltip>
                  <Tooltip label={t("dashboard.comments", { defaultValue: "Comments" })}>
                    <Group gap={4}>
                      <IconMessage size={14} color="#51CF66" />
                      <Text size="sm" fw={600}>{fmtK(c.comments)}</Text>
                    </Group>
                  </Tooltip>
                  <Tooltip label={t("dashboard.views", { defaultValue: "Views" })}>
                    <Group gap={4}>
                      <IconEye size={14} color="#845EF7" />
                      <Text size="sm" fw={600}>{fmtK(c.views)}</Text>
                    </Group>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : (
        <EmptyState msg={t("dashboard.noCompetitorData", { defaultValue: "No competitor data yet. Look up competitors to start tracking." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyword Performance                                                */
/* ------------------------------------------------------------------ */
function KeywordPerformance({ keywords }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SectionCard
      title={t("dashboard.keywordRankings", { defaultValue: "Keyword Rankings" })}
      subtitle={t("dashboard.keywordRankingsDesc", { defaultValue: "Performance index from all collected posts" })}
      icon={IconTargetArrow}
      onViewData={() => navigate("/keywords")}
      tourId="dashboard-keywords"
    >
      {keywords.length > 0 ? (
        <Stack gap="sm">
          {keywords.map((kw, i) => {
            const trendColor = kw.trendDir === "rising" ? "teal" : kw.trendDir === "falling" ? "red" : "gray";
            const TrendIcon = kw.trendDir === "rising" ? IconArrowUpRight : kw.trendDir === "falling" ? IconArrowDownRight : IconTrendingUp;
            return (
              <Paper key={kw.term} withBorder p="sm" radius="md" className={classes.postRow}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" align="center" style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={800} c="dimmed" size="sm" style={{ width: 24, textAlign: "center" }}>{i + 1}</Text>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Text fw={700} size="sm">{kw.term}</Text>
                      <Group gap={6}>
                        {kw.platforms?.map((pl) => (
                          <Badge key={pl.label} size="xs" variant="light" color={pl.color}>{pl.label}</Badge>
                        ))}
                      </Group>
                    </Stack>
                  </Group>
                  <Group gap="md" wrap="nowrap">
                    <Tooltip label={t("dashboard.performanceIndexTooltip", { defaultValue: "Performance Index (0-100)" })}>
                      <div className={classes.kpiBarWrap}>
                        <div className={classes.kpiBarBg}>
                          <div className={classes.kpiBarFill} style={{ width: (kw.kpi || 0) + "%" }} />
                        </div>
                        <Text size="xs" fw={700} ml={6}>{Math.round(kw.kpi || 0)}</Text>
                      </div>
                    </Tooltip>
                    <Tooltip label={t("dashboard.avgEngagementTooltip", { value: kw.avgEngagement || 0, defaultValue: "Avg engagement: {{value}}" })}>
                      <Badge variant="light" color="blue" size="sm">{fmtK(kw.avgEngagement || 0)} {t("dashboard.avgShort", { defaultValue: "avg" })}</Badge>
                    </Tooltip>
                    <Tooltip label={t("dashboard.trendTooltip", { value: kw.trendDir || t("dashboard.stable", { defaultValue: "stable" }), defaultValue: "Trend: {{value}}" })}>
                      <Badge variant="light" color={trendColor} size="sm" leftSection={<TrendIcon size={12} />}>
                        {kw.trendDir || t("dashboard.stable", { defaultValue: "stable" })}
                      </Badge>
                    </Tooltip>
                  </Group>
                </Group>
              </Paper>
            );
          })}
          <Button variant="light" fullWidth mt="xs" onClick={() => navigate("/keywords")} rightSection={<IconExternalLink size={16} />}>
            {t("dashboard.viewAllKeywords", { defaultValue: "View all keywords" })}
          </Button>
        </Stack>
      ) : (
        <EmptyState msg={t("dashboard.noKeywordData", { defaultValue: "No keyword data yet. Collect posts to see keyword performance." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Tone Distribution                                                  */
/* ------------------------------------------------------------------ */
function ToneBreakdown({ data }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <SectionCard
      title={t("dashboard.contentTone", { defaultValue: "Content Tone" })}
      subtitle={t("dashboard.contentToneDesc", { defaultValue: "Tone distribution across collected posts" })}
      icon={IconMoodSmile}
      onViewData={() => navigate("/reports")}
      tourId="dashboard-tone"
    >
      {data.length > 0 ? (
        <Group justify="center" align="center" gap="xl" style={{ minHeight: 240 }}>
          <ResponsiveContainer width={220} height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
                label={false}
                labelLine={false}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
          <Stack gap="xs">
            {data.map((toneItem, idx) => (
              <Group key={toneItem.name} gap="xs">
                <div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                <Text size="sm" fw={600}>{toneItem.name}</Text>
                <Text size="xs" c="dimmed">({t("dashboard.postsCount", { count: toneItem.value, defaultValue: "{{count}} posts" })})</Text>
              </Group>
            ))}
          </Stack>
        </Group>
      ) : (
        <EmptyState msg={t("dashboard.noToneData", { defaultValue: "No tone data yet. Run tone analysis from the Reports page." })} />
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  AI Summary                                                         */
/* ------------------------------------------------------------------ */
function AISummary({ analytics, userId }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const topPlatforms = analytics.platformBreakdown
        .slice(0, 3)
        .map((p) => p.platform + ": " + p.engagement + " engagement across " + p.posts + " posts")
        .join("; ");
      const topCompetitors = analytics.competitors
        .slice(0, 3)
        .map((c) => "@" + c.name + ": " + c.engagement + " engagement, " + c.views + " views")
        .join("; ");
      const topKws = analytics.topKeywords
        .slice(0, 5)
        .map((k) => '"' + k.term + '" (KPI: ' + Math.round(k.kpi || 0) + ", trend: " + (k.trendDir || "stable") + ")")
        .join("; ");

      const prompt = "You are a social media analytics assistant for Chibitek. Analyze this data and provide a concise, actionable summary with 3-4 key insights and recommended next steps.\n\nData overview:\n- Total posts analyzed: " + analytics.totalPosts + "\n- Total engagement: " + analytics.totalEngagement + " (" + analytics.totalLikes + " likes, " + analytics.totalComments + " comments, " + analytics.totalShares + " shares)\n- Total views: " + analytics.totalViews + "\n- Average engagement per post: " + analytics.avgEngagement + "\n- Top platforms: " + (topPlatforms || "N/A") + "\n- Top competitors: " + (topCompetitors || "N/A") + "\n- Top keywords: " + (topKws || "N/A") + "\n\nFormat your response with clear headings using **bold** for emphasis. Keep it under 200 words.";

      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, user_id: userId, conversation: [] }),
      });
      const json = await res.json();
      setSummary(json.reply || json.message || t("dashboard.noSummaryGenerated", { defaultValue: "No summary generated." }));
    } catch (e) {
      setError(t("dashboard.summaryError", { defaultValue: "Could not generate summary. Check that the AI service is running." }));
    } finally {
      setLoading(false);
    }
  }, [analytics, userId, t]);

  return (
    <SectionCard
      title={t("dashboard.aiPoweredInsights", { defaultValue: "AI-Powered Insights" })}
      subtitle={t("dashboard.aiPoweredInsightsDesc", { defaultValue: "Automated analysis of your engagement data" })}
      icon={IconSparkles}
      tourId="dashboard-ai"
    >
      {summary ? (
        <Stack gap="md">
          <Paper withBorder p="md" radius="md" className={classes.summaryBox}>
            <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{summary}</Text>
          </Paper>
          <Group>
            <Button variant="light" size="sm" onClick={generate} loading={loading}>{t("dashboard.regenerate", { defaultValue: "Regenerate" })}</Button>
            <Button variant="light" size="sm" onClick={() => navigate("/chat")} rightSection={<IconMessageChatbot size={16} />}>
              {t("dashboard.continueInChat", { defaultValue: "Continue in Chat" })}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack align="center" gap="md" py="lg">
          {error && <Text size="sm" c="red">{error}</Text>}
          <Text size="sm" c="dimmed">{t("dashboard.generateSummaryHint", { defaultValue: "Generate an AI summary of trends, engagement patterns, and recommended actions." })}</Text>
          <Button variant="light" leftSection={<IconSparkles size={16} />} onClick={generate} loading={loading}>
            {t("dashboard.generateAiSummary", { defaultValue: "Generate AI Summary" })}
          </Button>
        </Stack>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */
function EmptyState({ msg }) {
  return (
    <Stack align="center" py="xl" gap="sm">
      <IconChartDots size={40} opacity={0.3} />
      <Text size="sm" c="dimmed" ta="center" maw={360}>{msg}</Text>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */
function DashboardSkeleton() {
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={100} radius="lg" />
        ))}
      </SimpleGrid>
      <Skeleton height={380} radius="lg" />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Skeleton height={380} radius="lg" />
        <Skeleton height={380} radius="lg" />
      </SimpleGrid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function DashboardPage() {
  const { t } = useTranslation();
  const { posts, keywords, platformIdMap, loading, userId } = useDashboardData();
  const analytics = useAnalytics(posts, keywords, platformIdMap);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "dashboard" } }));
  }, []);

  const navigate = useNavigate();

  return (
    <div className={classes.page}>
      <div className={classes.shell}>
        <header className={classes.header}>
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              <Title order={2} className={classes.title}>{t("dashboard.title")}</Title>
              <Text size="sm" c="dimmed">
                {loading
                  ? t("dashboard.loadingEngagementData", { defaultValue: "Loading your engagement data..." })
                  : analytics
                    ? t("dashboard.postsTrackedAcrossPlatforms", {
                      count: analytics.totalPosts,
                      platformCount: analytics.platformNames.length,
                      defaultValue: "{{count}} posts tracked across {{platformCount}} platforms",
                    })
                    : t("dashboard.noDataStartCompetitor", {
                      defaultValue: "No data yet — start by looking up a competitor",
                    })}
              </Text>
            </Stack>
          </Group>
        </header>

        {loading ? (
          <DashboardSkeleton />
        ) : !analytics ? (
          <Card withBorder shadow="sm" radius="lg" p="xl">
            <Stack align="center" py={60} gap="md">
              <ThemeIcon variant="light" radius="xl" size={72} color="gray">
                <IconChartBar size={36} />
              </ThemeIcon>
              <Title order={3} ta="center">{t("dashboard.noDataToDisplayYet", { defaultValue: "No data to display yet" })}</Title>
              <Text size="sm" c="dimmed" ta="center" maw={420}>
                {t("dashboard.noDataHint", {
                  defaultValue: "Look up competitors or track keywords to start seeing analytics here.",
                })}
              </Text>
              <Group gap="sm" mt="xs">
                <Button variant="filled" onClick={() => navigate('/competitor-lookup')}>
                  {t("dashboard.goToCompetitorLookup", { defaultValue: "Competitor Lookup" })}
                </Button>
                <Button variant="light" onClick={() => navigate('/keywords')}>
                  {t("dashboard.goToKeywordTracking", { defaultValue: "Keyword Tracking" })}
                </Button>
              </Group>
            </Stack>
          </Card>
        ) : (
          <Stack gap="lg">
            <KPIStrip analytics={analytics} />
            <EngagementTimeline data={analytics.engagementOverTime} platformNames={analytics.platformNames} />
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <PlatformBreakdown data={analytics.platformBreakdown} />
              <ToneBreakdown data={analytics.toneDistribution} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <TopPostsList posts={analytics.topPosts} />
              <CompetitorComparison competitors={analytics.competitors} />
            </SimpleGrid>
            <KeywordPerformance keywords={analytics.topKeywords} />
            <AISummary analytics={analytics} userId={userId} />
          </Stack>
        )}
      </div>
    </div>
  );
}
