import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconChartBar,
  IconChartDots,
  IconChartLine,
  IconDownload,
  IconFileAnalytics,
  IconLayoutDashboard,
  IconMoodSmile,
  IconRefresh,
  IconSparkles,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";
import { useTranslation } from "react-i18next";
import { getModelMeta, loadAiSettings } from "../utils/aiModelSettings";
import { analyzeUniversalPosts, convertSavedPosts } from "./DataConverter";
import "../utils/ui.css";

const REPORT_PAGE_WIDTH = 816;
const REPORT_PAGE_HEIGHT = 1056;
const REPORT_PAGE_PADDING = 28;
const PDF_EXPORT_SCALE = 3;
const PAGE_GAP = 14;
const FIRST_PAGE_HEADER_HEIGHT = 58;
const CONTINUED_HEADER_HEIGHT = 30;

const PIE_COLORS = ["#339AF0", "#51CF66", "#FF6B6B", "#FCC419", "#845EF7", "#FF922B", "#15AABF"];
const PLATFORM_COLORS = {
  x: "#1DA1F2",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  instagram: "#E4405F",
  youtube: "#FF0000",
  tiktok: "#00f2ea",
  reddit: "#FF4500",
  other: "#868E96",
};

const SECTION_DEFS = [
  { id: "summary", label: "Smart takeaways", labelKey: "reports.smartTakeaways", type: "Insight", typeKey: "reports.typeInsight", icon: IconSparkles },
  { id: "kpis", label: "Scorecard", labelKey: "reports.scorecard", type: "Dashboard", typeKey: "reports.typeDashboard", icon: IconLayoutDashboard },
  { id: "timeline", label: "Performance trend", labelKey: "reports.performanceTrend", type: "Chart", typeKey: "reports.typeChart", icon: IconChartLine },
  { id: "platforms", label: "Platform performance", labelKey: "reports.platformPerformance", type: "Chart", typeKey: "reports.typeChart", icon: IconChartBar },
  { id: "tone", label: "Tone analysis", labelKey: "reports.toneAnalysis", type: "Tone", typeKey: "reports.typeTone", icon: IconMoodSmile },
  { id: "topPosts", label: "Top posts", labelKey: "reports.topPosts", type: "Table", typeKey: "reports.typeTable", icon: IconChartDots },
  { id: "competitors", label: "Competitors", labelKey: "reports.competitors", type: "Table", typeKey: "reports.typeTable", icon: IconUsers },
  { id: "keywords", label: "Keywords", labelKey: "reports.keywords", type: "Table", typeKey: "reports.typeTable", icon: IconTargetArrow },
  { id: "toneEngagement", label: "Tone performance", labelKey: "reports.tonePerformance", type: "Chart", typeKey: "reports.typeChart", icon: IconMoodSmile, hidden: true },
];

const VISIBLE_SECTION_DEFS = SECTION_DEFS.filter((s) => !s.hidden);
const DEFAULT_ORDER = VISIBLE_SECTION_DEFS.map((s) => s.id);
const VALID_SECTION_IDS = new Set(SECTION_DEFS.map((s) => s.id));
const PANEL_LAYOUT = {
  summary: { span: 1, height: 128 },
  kpis: { span: 1, height: 128 },
  timeline: { span: 1, height: 220 },
  platforms: { span: 1, height: 220 },
  tone: { span: 1, height: 220 },
  toneEngagement: { span: 1, height: 220 },
  topPosts: { span: 2, height: 264, chunkSize: 5 },
  competitors: { span: 1, height: 246, chunkSize: 7 },
  keywords: { span: 1, height: 246, chunkSize: 7 },
};

const REPORT_PRESETS = [
  {
    id: "executive",
    label: "Executive",
    labelKey: "reports.presetExecutive",
    description: "KPIs, trends, competitors, keywords.",
    descriptionKey: "reports.presetExecutiveDesc",
    sections: ["kpis", "summary", "timeline", "platforms", "competitors", "keywords"],
  },
  {
    id: "visual",
    label: "Visual",
    labelKey: "reports.presetVisual",
    description: "Charts and tone, fewer tables.",
    descriptionKey: "reports.presetVisualDesc",
    sections: ["kpis", "summary", "timeline", "platforms", "tone"],
  },
  {
    id: "data",
    label: "Data",
    labelKey: "reports.presetData",
    description: "Tables and rankings.",
    descriptionKey: "reports.presetDataDesc",
    sections: ["kpis", "summary", "topPosts", "competitors", "keywords"],
  },
];

const fmtK = (n) => {
  const value = Number(n || 0);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
};

const fmtDate = (d) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d || "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function guessPlatform(post) {
  const url = (post.url || "").toLowerCase();
  if (url.includes("twitter.com") || url.includes("x.com")) return "x";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("reddit.com")) return "reddit";
  if (post.extra?.platform) return String(post.extra.platform).toLowerCase();
  if (post.extra?.channelTitle || post.extra?.videoId) return "youtube";
  return "other";
}

function getPostTitle(post) {
  return post.content || post.extra?.title || post.extra?.description || "Untitled post";
}

function getCompetitorName(post) {
  return post.username || post.extra?.author_handle || post.extra?.username || post.competitors?.display_name || "Unknown";
}

function stripJsonFence(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function safeParseJson(value) {
  const cleaned = stripJsonFence(value);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

function cleanSectionList(sections, fallback = REPORT_PRESETS[0].sections) {
  const list = Array.isArray(sections) ? sections : fallback;
  const next = [];
  list.forEach((id) => {
    if (VALID_SECTION_IDS.has(id) && !next.includes(id)) next.push(id);
  });
  return next.length ? next : fallback;
}

function deriveAnalytics(posts, keywords, platformIdMap) {
  if (!Array.isArray(posts) || posts.length === 0) return null;

  const taggedPosts = posts.map((p) => ({
    ...p,
    _platform: platformIdMap?.[p.platform_id] || guessPlatform(p),
    engagement: (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
  }));

  const totalPosts = taggedPosts.length;
  const totalLikes = taggedPosts.reduce((s, p) => s + (p.likes || 0), 0);
  const totalComments = taggedPosts.reduce((s, p) => s + (p.comments || 0), 0);
  const totalShares = taggedPosts.reduce((s, p) => s + (p.shares || 0), 0);
  const totalEngagement = totalLikes + totalComments + totalShares;
  const avgEngagement = totalPosts ? Math.round(totalEngagement / totalPosts) : 0;
  const platformNames = [...new Set(taggedPosts.map((p) => p._platform))];

  const byDay = {};
  taggedPosts.forEach((p) => {
    const date = (p.published_at || p.created_at || "").slice(0, 10);
    if (!date) return;
    if (!byDay[date]) byDay[date] = { date, likes: 0, comments: 0, shares: 0, engagement: 0, posts: 0 };
    byDay[date].likes += p.likes || 0;
    byDay[date].comments += p.comments || 0;
    byDay[date].shares += p.shares || 0;
    byDay[date].posts += 1;
    byDay[date].engagement = byDay[date].likes + byDay[date].comments + byDay[date].shares;
  });
  const engagementOverTime = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

  const byPlatform = {};
  taggedPosts.forEach((p) => {
    const platform = p._platform;
    if (!byPlatform[platform]) byPlatform[platform] = { platform, likes: 0, comments: 0, shares: 0, posts: 0, engagement: 0 };
    byPlatform[platform].likes += p.likes || 0;
    byPlatform[platform].comments += p.comments || 0;
    byPlatform[platform].shares += p.shares || 0;
    byPlatform[platform].posts += 1;
    byPlatform[platform].engagement = byPlatform[platform].likes + byPlatform[platform].comments + byPlatform[platform].shares;
  });
  const platformBreakdown = Object.values(byPlatform).sort((a, b) => b.engagement - a.engagement);

  const toneMap = {};
  taggedPosts.forEach((p) => {
    if (!p.tone) return;
    toneMap[p.tone] = (toneMap[p.tone] || 0) + 1;
  });
  const toneDistribution = Object.entries(toneMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const topPosts = [...taggedPosts]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 10);

  const byCompetitor = {};
  taggedPosts.forEach((p) => {
    const name = getCompetitorName(p);
    if (!byCompetitor[name]) byCompetitor[name] = { name, likes: 0, comments: 0, shares: 0, posts: 0, engagement: 0 };
    byCompetitor[name].likes += p.likes || 0;
    byCompetitor[name].comments += p.comments || 0;
    byCompetitor[name].shares += p.shares || 0;
    byCompetitor[name].posts += 1;
    byCompetitor[name].engagement = byCompetitor[name].likes + byCompetitor[name].comments + byCompetitor[name].shares;
  });
  const competitors = Object.values(byCompetitor).sort((a, b) => b.engagement - a.engagement).slice(0, 10);

  const topKeywords = [...(keywords || [])]
    .sort((a, b) => (b.kpi || 0) - (a.kpi || 0))
    .slice(0, 10);

  const toneEngagementData = convertSavedPosts(taggedPosts).map((p, index) => ({
    index: index + 1,
    source: p["Name/Source"],
    message: p.Message,
    tone: p.tone || "Unlabeled",
    engagement: p.Engagement || 0,
  }));

  return {
    totalPosts,
    totalLikes,
    totalComments,
    totalShares,
    totalEngagement,
    avgEngagement,
    platformNames,
    engagementOverTime,
    platformBreakdown,
    toneDistribution,
    topPosts,
    competitors,
    topKeywords,
    toneEngagementData,
  };
}

function getChunkTotal(id, analytics) {
  if (!analytics) return 0;
  if (id === "topPosts") return analytics.topPosts?.length || 0;
  if (id === "competitors") return analytics.competitors?.length || 0;
  if (id === "keywords") return analytics.topKeywords?.length || 0;
  return 0;
}

function buildReportBlocks(sectionIds, analytics) {
  const blocks = [];
  sectionIds.forEach((id) => {
    const layout = PANEL_LAYOUT[id] || { span: 1, height: 220 };
    const chunkSize = layout.chunkSize;
    if (chunkSize) {
      const total = getChunkTotal(id, analytics);
      const chunks = Math.max(1, Math.ceil(total / chunkSize));
      for (let chunk = 0; chunk < chunks; chunk += 1) {
        const start = chunk * chunkSize;
        const end = Math.min(start + chunkSize, Math.max(total, chunkSize));
        blocks.push({
          id,
          key: `${id}-${chunk}`,
          span: layout.span,
          height: layout.height,
          start,
          limit: chunkSize,
          rangeLabel: total > chunkSize ? `${start + 1}-${Math.min(end, total) || chunkSize}` : "",
        });
      }
      return;
    }
    blocks.push({ id, key: id, span: layout.span, height: layout.height });
  });
  return blocks;
}

function buildReportRows(blocks) {
  const rows = [];
  let pendingHalf = [];

  const flushHalf = () => {
    if (!pendingHalf.length) return;
    rows.push({
      items: [...pendingHalf],
      height: Math.max(...pendingHalf.map((block) => block.height || 220)),
    });
    pendingHalf = [];
  };

  blocks.forEach((block) => {
    if ((block.span || 1) === 1) {
      pendingHalf.push(block);
      if (pendingHalf.length === 2) flushHalf();
      return;
    }
    flushHalf();
    rows.push({ items: [block], height: block.height || 220 });
  });
  flushHalf();
  return rows;
}

function buildReportPages(sectionIds, analytics) {
  const blocks = buildReportBlocks(sectionIds, analytics);
  const rows = buildReportRows(blocks);
  const maxBodyHeight = REPORT_PAGE_HEIGHT - REPORT_PAGE_PADDING * 2 - 20;
  const pages = [];
  let currentRows = [];
  let used = FIRST_PAGE_HEADER_HEIGHT;

  rows.forEach((row) => {
    const addHeight = row.height + PAGE_GAP;
    if (currentRows.length && used + addHeight > maxBodyHeight) {
      pages.push(currentRows);
      currentRows = [];
      used = CONTINUED_HEADER_HEIGHT;
    }
    currentRows.push(row);
    used += addHeight;
  });

  pages.push(currentRows);
  return pages.length ? pages : [[]];
}
function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <Group gap={7} align="center" mb={6} wrap="nowrap">
      {Icon && (
        <ThemeIcon variant="light" radius="md" size={24}>
          <Icon size={13} />
        </ThemeIcon>
      )}
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text fw={800} size="xs" tt="uppercase" c="dimmed" lineClamp={1} style={{ letterSpacing: "0.045em" }}>{title}</Text>
        {subtitle && <Text size="9px" c="dimmed" lineClamp={1}>{subtitle}</Text>}
      </Stack>
    </Group>
  );
}

function EmptyReportState({ children }) {
  return (
    <Paper p="xs" radius="md" withBorder style={{ background: "#f8f9fa" }}>
      <Text size="10px" c="dimmed" ta="center">{children}</Text>
    </Paper>
  );
}

function titleCasePlatform(platform) {
  const value = String(platform || "platform").trim();
  if (!value) return "Platform";
  if (value.toLowerCase() === "x") return "X";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortenText(value, max = 42) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function cleanInsightLines(summary) {
  return String(summary || "")
    .split(/\n+/)
    .map((line) => line
      .replace(/^#+\s*/g, "")
      .replace(/\*\*/g, "")
      .replace(/^[-•*\d.)\s]+/, "")
      .replace(/^recommendations?:?\s*/i, "")
      .replace(/^ai\s+(insights?|recommendations?)\s*:*/i, "")
      .trim())
    .filter(Boolean)
    .filter((line) => !/^compact\s+ai\s+insights/i.test(line))
    .filter((line) => !/^here\s+are/i.test(line))
    .slice(0, 3);
}

function buildAutoTakeaways(analytics, t) {
  if (!analytics) return [];
  const lines = [];
  const topPlatform = analytics.platformBreakdown?.[0];
  const topPost = analytics.topPosts?.[0];
  const topCompetitor = analytics.competitors?.[0];
  const topKeyword = analytics.topKeywords?.[0];

  if (topPlatform) {
    lines.push(t("reports.leadPlatform", { platform: titleCasePlatform(topPlatform.platform), engagement: fmtK(topPlatform.engagement) }));
  }
  if (topPost) {
    lines.push(t("reports.reuseThemes", { title: shortenText(getPostTitle(topPost), 34) }));
  }
  if (topCompetitor) {
    lines.push(t("reports.watchCompetitor", { name: shortenText(topCompetitor.name, 28) }));
  }
  if (topKeyword) {
    lines.push(t("reports.testKeyword", { keyword: shortenText(topKeyword.term, 22) }));
  }
  if (!lines.length) lines.push(t("reports.saveMorePosts"));
  return lines.slice(0, 3);
}

function KpiReport({ analytics, t }) {
  const items = [
    [t("reports.kpiPosts"), analytics.totalPosts],
    [t("reports.kpiEngagement"), fmtK(analytics.totalEngagement)],
    [t("reports.kpiLikes"), fmtK(analytics.totalLikes)],
    [t("reports.kpiComments"), fmtK(analytics.totalComments)],
    [t("reports.kpiShares"), fmtK(analytics.totalShares)],
    [t("reports.kpiAvg"), fmtK(analytics.avgEngagement)],
  ];
  return (
    <SimpleGrid cols={3} spacing={6}>
      {items.map(([label, value]) => (
        <Paper key={label} p={7} radius="md" withBorder style={{ background: "#ffffff" }}>
          <Text size="9px" c="dimmed" fw={800} tt="uppercase" lineClamp={1}>{label}</Text>
          <Text fw={900} size="sm" mt={1}>{value}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

function TimelineReport({ data, t }) {
  if (!data.length) return <EmptyReportState>{t("reports.noTimeline")}</EmptyReportState>;
  return (
    <div style={{ height: 156 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="reportLikes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#339AF0" stopOpacity={0.25} /><stop offset="95%" stopColor="#339AF0" stopOpacity={0} /></linearGradient>
            <linearGradient id="reportComments" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#51CF66" stopOpacity={0.25} /><stop offset="95%" stopColor="#51CF66" stopOpacity={0} /></linearGradient>
            <linearGradient id="reportShares" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.25} /><stop offset="95%" stopColor="#FF6B6B" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={38} />
          <RechartsTooltip labelFormatter={fmtDate} formatter={(v) => fmtK(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area isAnimationActive={false} type="monotone" dataKey="likes" stroke="#339AF0" fill="url(#reportLikes)" strokeWidth={2} name={t("reports.kpiLikes")} />
          <Area isAnimationActive={false} type="monotone" dataKey="comments" stroke="#51CF66" fill="url(#reportComments)" strokeWidth={2} name={t("reports.kpiComments")} />
          <Area isAnimationActive={false} type="monotone" dataKey="shares" stroke="#FF6B6B" fill="url(#reportShares)" strokeWidth={2} name={t("reports.kpiShares")} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlatformReport({ data, t }) {
  if (!data.length) return <EmptyReportState>{t("reports.noPlatform")}</EmptyReportState>;
  return (
    <div style={{ height: 156 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
          <XAxis dataKey="platform" tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={38} />
          <RechartsTooltip formatter={(v) => fmtK(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar isAnimationActive={false} dataKey="likes" fill="#339AF0" name={t("reports.kpiLikes")} radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="comments" fill="#51CF66" name={t("reports.kpiComments")} radius={[4, 4, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="shares" fill="#FF6B6B" name={t("reports.kpiShares")} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ToneReport({ data, engagementData, t }) {
  if (!data.length) return <EmptyReportState>{t("reports.noTone")}</EmptyReportState>;

  const tonePerformance = {};
  (engagementData || []).forEach((item) => {
    const tone = item.tone || "Unlabeled";
    if (tone === "Unlabeled") return;
    if (!tonePerformance[tone]) tonePerformance[tone] = { tone, posts: 0, total: 0 };
    tonePerformance[tone].posts += 1;
    tonePerformance[tone].total += item.engagement || 0;
  });
  const rankedPerformance = Object.values(tonePerformance)
    .map((item) => ({ ...item, avg: item.posts ? Math.round(item.total / item.posts) : 0 }))
    .sort((a, b) => b.avg - a.avg);
  const mostUsed = data[0];
  const bestTone = rankedPerformance[0];

  return (
    <Group justify="center" align="center" gap="md" style={{ minHeight: 164 }} wrap="nowrap">
      <ResponsiveContainer width="38%" height={136}>
        <PieChart>
          <Pie isAnimationActive={false} data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={52} paddingAngle={3} dataKey="value" nameKey="name">
            {data.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
          </Pie>
          <RechartsTooltip />
        </PieChart>
      </ResponsiveContainer>
      <Stack gap={7} style={{ flex: 1, minWidth: 0 }}>
        <SimpleGrid cols={2} spacing={6}>
          <Paper p={7} radius="md" withBorder>
            <Text size="9px" c="dimmed" fw={800} tt="uppercase">{t("reports.mostUsed")}</Text>
            <Text size="xs" fw={800} lineClamp={1}>{mostUsed?.name || "N/A"}</Text>
            <Text size="9px" c="dimmed">{t("common.postsCount", { count: mostUsed?.value || 0 })}</Text>
          </Paper>
          <Paper p={7} radius="md" withBorder>
            <Text size="9px" c="dimmed" fw={800} tt="uppercase">{t("reports.bestResult")}</Text>
            <Text size="xs" fw={800} lineClamp={1}>{bestTone?.tone || "N/A"}</Text>
            <Text size="9px" c="dimmed">{bestTone ? `${fmtK(bestTone.avg)} ${t("dashboard.avgShort")}` : t("reports.runAnalysis")}</Text>
          </Paper>
        </SimpleGrid>
        {data.slice(0, 5).map((item, index) => (
          <Group key={item.name} gap={6} wrap="nowrap">
            <div style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[index % PIE_COLORS.length], flex: "0 0 auto" }} />
            <Text size="xs" fw={700} lineClamp={1}>{item.name}</Text>
            <Text size="9px" c="dimmed" style={{ whiteSpace: "nowrap" }}>{t("common.postsCount", { count: item.value })}</Text>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}

function TopPostsReport({ posts, start = 0, limit = 5, t }) {
  const visible = posts.slice(start, start + limit);
  if (!visible.length) return <EmptyReportState>{t("reports.noPosts")}</EmptyReportState>;
  return (
    <Stack gap={6}>
      {visible.map((post, index) => (
        <Paper key={post.id || `${start}-${index}`} p={7} radius="md" withBorder style={{ background: "#ffffff" }}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              <Text size="xs" fw={900} c="dimmed" style={{ width: 22, textAlign: "center", flex: "0 0 auto" }}>{start + index + 1}</Text>
              <Stack gap={1} style={{ minWidth: 0 }}>
                <Text size="xs" fw={800} lineClamp={1}>{getPostTitle(post)}</Text>
                <Group gap={5} wrap="nowrap">
                  <Text size="9px" c="dimmed" lineClamp={1}>@{getCompetitorName(post)}</Text>
                  <Badge size="xs" variant="light" color="gray">{post._platform}</Badge>
                </Group>
              </Stack>
            </Group>
            <Group gap={10} wrap="nowrap" style={{ flex: "0 0 auto" }}>
              <Text size="10px" fw={800}>♥ {fmtK(post.likes || 0)}</Text>
              <Text size="10px" fw={800}>☰ {fmtK(post.comments || 0)}</Text>
              <Text size="10px" fw={800}>↗ {fmtK(post.shares || 0)}</Text>
              <Badge size="xs" variant="light" color="blue">{fmtK(post.engagement)}</Badge>
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function CompetitorReport({ competitors, start = 0, limit = 7, t }) {
  const visible = competitors.slice(start, start + limit);
  if (!visible.length) return <EmptyReportState>{t("reports.noCompetitors")}</EmptyReportState>;
  return (
    <Table striped withTableBorder withColumnBorders verticalSpacing={2} fz="10px" style={{ tableLayout: "fixed" }}>
      <Table.Thead>
        <Table.Tr><Table.Th>{t("reports.tableCompetitor")}</Table.Th><Table.Th style={{ width: 42 }}>{t("reports.kpiPosts")}</Table.Th><Table.Th style={{ width: 58 }}>{t("reports.kpiLikes")}</Table.Th><Table.Th style={{ width: 58 }}>{t("reports.tableCom")}</Table.Th><Table.Th style={{ width: 58 }}>{t("reports.tableEng")}</Table.Th></Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {visible.map((c) => (
          <Table.Tr key={c.name}>
            <Table.Td><Text size="10px" lineClamp={1}>@{c.name}</Text></Table.Td>
            <Table.Td>{c.posts}</Table.Td>
            <Table.Td>{fmtK(c.likes)}</Table.Td>
            <Table.Td>{fmtK(c.comments)}</Table.Td>
            <Table.Td>{fmtK(c.engagement)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function KeywordReport({ keywords, meta, start = 0, limit = 7, t }) {
  const visible = keywords.slice(start, start + limit);
  if (!visible.length) {
    return <EmptyReportState>{t("reports.keywordAfterSaved")}</EmptyReportState>;
  }
  return (
    <Stack gap={6}>
      <Group gap={5}>
        <Badge size="xs" variant="light" color="blue">{t("reports.rankedCount", { count: keywords.length })}</Badge>
        {meta?.totalPosts != null && <Badge size="xs" variant="light" color="gray">{t("common.postsCount", { count: meta.totalPosts })}</Badge>}
      </Group>
      <Table striped withTableBorder withColumnBorders verticalSpacing={2} fz="10px" style={{ tableLayout: "fixed" }}>
        <Table.Thead>
          <Table.Tr><Table.Th style={{ width: 28 }}>#</Table.Th><Table.Th>{t("reports.tableKeyword")}</Table.Th><Table.Th style={{ width: 44 }}>{t("reports.tableKpi")}</Table.Th><Table.Th style={{ width: 64 }}>{t("reports.kpiAvg")}</Table.Th><Table.Th style={{ width: 48 }}>{t("reports.kpiPosts")}</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((kw, index) => (
            <Table.Tr key={kw.term || index}>
              <Table.Td>{start + index + 1}</Table.Td>
              <Table.Td><Text size="10px" lineClamp={1}>{kw.term}</Text></Table.Td>
              <Table.Td>{Math.round(kw.kpi || 0)}</Table.Td>
              <Table.Td>{fmtK(kw.avgEngagement || 0)}</Table.Td>
              <Table.Td>{kw.sampleSize || 0}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function ToneEngagementReport({ data, view, t }) {
  const chartData = data.filter((d) => d.engagement >= 0);
  if (!chartData.length) return <EmptyReportState>{t("reports.noToneEngagement")}</EmptyReportState>;

  const toneCounts = {};
  chartData.forEach((d) => {
    if (!toneCounts[d.tone]) toneCounts[d.tone] = { tone: d.tone, count: 0, totalEngagement: 0 };
    toneCounts[d.tone].count += 1;
    toneCounts[d.tone].totalEngagement += d.engagement || 0;
  });
  const barData = Object.values(toneCounts)
    .map((d) => ({ ...d, avgEngagement: d.count ? Math.round(d.totalEngagement / d.count) : 0 }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);
  const toneList = [...new Set(chartData.map((d) => d.tone))];

  return (
    <div style={{ height: 156 }}>
      <ResponsiveContainer width="100%" height="100%">
        {view === "bar" ? (
          <BarChart data={barData} margin={{ top: 8, right: 12, left: -8, bottom: 22 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
            <XAxis dataKey="tone" tick={{ fontSize: 10 }} angle={-16} textAnchor="end" height={48} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={38} />
            <RechartsTooltip formatter={(v) => fmtK(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar isAnimationActive={false} dataKey="avgEngagement" name={t("reports.kpiEngagement")} fill="#339AF0" radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="count" name={t("reports.kpiPosts")} fill="#868E96" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
            <XAxis dataKey="index" name="Post" tick={{ fontSize: 10 }} />
            <YAxis dataKey="engagement" name="Engagement" tickFormatter={fmtK} tick={{ fontSize: 10 }} width={38} />
            <RechartsTooltip formatter={(v) => fmtK(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {toneList.map((tone, index) => (
              <Scatter key={tone} isAnimationActive={false} name={tone} data={chartData.filter((d) => d.tone === tone)} dataKey="engagement" fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </ScatterChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function InsightReport({ summary, analytics, t }) {
  const lines = cleanInsightLines(summary);
  const takeaways = lines.length ? lines : buildAutoTakeaways(analytics, t);

  return (
    <SimpleGrid cols={1} spacing={5}>
      {takeaways.map((line, index) => (
        <Paper key={`${line}-${index}`} p={6} radius="md" withBorder style={{ background: "#f8fbff" }}>
          <Group gap={7} align="flex-start" wrap="nowrap">
            <ThemeIcon size={18} radius="xl" variant="light"><IconSparkles size={10} /></ThemeIcon>
            <Text size="10px" lineClamp={2} style={{ lineHeight: 1.3 }}>{line}</Text>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const pageRefs = useRef([]);
  const [posts, setPosts] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [keywordMeta, setKeywordMeta] = useState(null);
  const [platformIdMap, setPlatformIdMap] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [aiBuildLoading, setAiBuildLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [reportPrompt, setReportPrompt] = useState("");
  const [reportTitle, setReportTitle] = useState(() => t("reports.defaultTitle"));
  const [postLimit, setPostLimit] = useState(10);
  const [toneChartView, setToneChartView] = useState("scatter");
  const [selectedSections, setSelectedSections] = useState(REPORT_PRESETS[0].sections);
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_ORDER);
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingAutoDownload, setPendingAutoDownload] = useState(false);

  const analytics = useMemo(() => deriveAnalytics(posts, keywords, platformIdMap), [posts, keywords, platformIdMap]);
  const selectedOrderedSections = useMemo(
    () => sectionOrder.filter((id) => selectedSections.includes(id)),
    [sectionOrder, selectedSections],
  );
  const reportPages = useMemo(
    () => buildReportPages(selectedOrderedSections, analytics),
    [selectedOrderedSections, analytics],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatusMessage("");
    try {
      let uid = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id || null;
        setCurrentUserId(uid);
      }
      const qs = uid ? `?user_id=${encodeURIComponent(uid)}` : "";
      const [postsRes, keywordRes, platformRes] = await Promise.all([
        fetch(apiUrl(`/api/posts${qs}`)).then((r) => r.json()).catch(() => ({ posts: [] })),
        fetch(apiUrl(`/api/keywords${qs}`)).then((r) => r.json()).catch(() => ({ keywords: [], totalPosts: 0 })),
        fetch(apiUrl("/api/platforms")).then((r) => r.json()).catch(() => ({ platforms: {} })),
      ]);

      const idToName = {};
      Object.entries(platformRes.platforms || {}).forEach(([name, id]) => { idToName[id] = name; });
      setPosts(Array.isArray(postsRes.posts) ? postsRes.posts : []);
      setKeywords(Array.isArray(keywordRes.keywords) ? keywordRes.keywords : []);
      setKeywordMeta({
        totalPosts: Number(keywordRes.totalPosts || 0),
        debug: keywordRes.debug || "",
      });
      setPlatformIdMap(idToName);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "reports" } }));
  }, [loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("startTone") === "1" && posts.length && currentUserId && !toneLoading) {
      runToneAnalysis();
      params.delete("startTone");
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length, currentUserId]);

  const generatePDF = useCallback(async () => {
    const pages = reportPages.map((_, index) => pageRefs.current[index]).filter(Boolean);
    if (!pages.length || generatingPdf) return;
    setGeneratingPdf(true);
    setStatusMessage("");
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 300)));

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let index = 0; index < pages.length; index += 1) {
        const node = pages[index];
        const canvas = await html2canvas(node, {
          scale: PDF_EXPORT_SCALE,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: REPORT_PAGE_WIDTH,
          height: REPORT_PAGE_HEIGHT,
          windowWidth: REPORT_PAGE_WIDTH,
          windowHeight: REPORT_PAGE_HEIGHT,
          scrollX: 0,
          scrollY: 0,
        });
        if (index > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, pageHeight, undefined, "SLOW");
      }

      pdf.save(`chibitek-report-${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
      setStatusMessage("PDF export failed. Try again after the charts finish rendering.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [generatingPdf, reportPages]);

  useEffect(() => {
    if (!pendingAutoDownload || aiBuildLoading || generatingPdf) return;
    const timer = setTimeout(() => {
      setPendingAutoDownload(false);
      generatePDF();
    }, 550);
    return () => clearTimeout(timer);
  }, [pendingAutoDownload, aiBuildLoading, generatingPdf, selectedOrderedSections, aiSummary, generatePDF]);

  const applyPreset = (preset) => {
    setSelectedSections(preset.sections);
    setSectionOrder([...preset.sections, ...DEFAULT_ORDER.filter((id) => !preset.sections.includes(id))]);
    if (preset.id === "visual") setToneChartView("bar");
    if (preset.id === "executive") setToneChartView("scatter");
    setStatusMessage(t("reports.layoutApplied", { layout: t(preset.labelKey) }));
  };

  const toggleSection = (id) => {
    setSelectedSections((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      if (!next.includes("summary") && id !== "summary") return next;
      return next;
    });
    setSectionOrder((prev) => prev.includes(id) ? prev : [...prev, id]);
  };

  const runToneAnalysis = useCallback(async () => {
    if (!posts.length || toneLoading) return;
    setToneLoading(true);
    setStatusMessage("Analyzing tone…");
    try {
      let uid = currentUserId;
      if (!uid && supabase) {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id || null;
        if (uid) setCurrentUserId(uid);
      }
      const newestPosts = postLimit > 0 ? posts.slice(0, postLimit) : posts;
      const candidates = newestPosts
        .map((post) => ({
          id: post.id,
          "Name/Source": getCompetitorName(post),
          Engagement: (post.likes || 0) + (post.comments || 0) + (post.shares || 0),
          Message: getPostTitle(post),
          tone: post.tone || null,
        }))
        .filter((post) => String(post.Message || "").trim())
        .filter((post) => !post.tone || String(post.tone).toLowerCase() === "unlabeled");

      if (!candidates.length) {
        setSelectedSections((prev) => prev.includes("tone") ? prev : [...prev, "tone"]);
        setStatusMessage(t("reports.toneAlreadyAvailable"));
        return;
      }

      const analyzed = await analyzeUniversalPosts(candidates, uid || undefined);
      const toneById = new Map();
      analyzed.forEach((post) => {
        if (post.id && post.tone) toneById.set(post.id, post.tone);
      });

      if (!toneById.size) {
        const firstError = analyzed.find((post) => post._toneError)?._toneError;
        setStatusMessage(firstError ? t("reports.toneNoLabelsWithError", { error: firstError }) : t("reports.toneNoLabels"));
        return;
      }

      setPosts((prev) => prev.map((post) => toneById.has(post.id) ? { ...post, tone: toneById.get(post.id) } : post));
      setSelectedSections((prev) => prev.includes("tone") ? prev : [...prev, "tone"]);
      setSectionOrder((prev) => prev.includes("tone") ? prev : [...prev, "tone"]);
      setStatusMessage(t("reports.toneComplete", { count: toneById.size }));
    } catch (error) {
      console.error("Tone analysis failed:", error);
      setStatusMessage(t("reports.toneFailed"));
    } finally {
      setToneLoading(false);
    }
  }, [currentUserId, posts, postLimit, toneLoading]);

  const generateSummary = useCallback(async () => {
    if (!analytics || summaryLoading) return;
    setSummaryLoading(true);
    setStatusMessage("");
    try {
      const topPlatforms = analytics.platformBreakdown.slice(0, 3).map((p) => `${p.platform}: ${p.engagement} engagement across ${p.posts} posts`).join("; ");
      const topCompetitors = analytics.competitors.slice(0, 3).map((c) => `@${c.name}: ${c.engagement} engagement`).join("; ");
      const topKeywords = analytics.topKeywords.slice(0, 5).map((k) => `"${k.term}" KPI ${Math.round(k.kpi || 0)}`).join("; ");
      const prompt = `Write compact recommendations for a Chibitek social analytics PDF. Use 3 bullets max. Each bullet must be under 12 words and action-oriented. No intro paragraph, heading, markdown bold, or title.\n\nData:\n- Posts: ${analytics.totalPosts}\n- Total engagement: ${analytics.totalEngagement}\n- Average engagement: ${analytics.avgEngagement}\n- Top platforms: ${topPlatforms || "N/A"}\n- Top competitors: ${topCompetitors || "N/A"}\n- Top keywords: ${topKeywords || "N/A"}`;
      const aiSettings = loadAiSettings();
      const modelMeta = getModelMeta(aiSettings?.modelChoice);
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          user_id: currentUserId || undefined,
          llmProvider: modelMeta?.provider,
          chatModel: aiSettings?.modelChoice,
        }),
      });
      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
      const json = await res.json();
      setAiSummary(json.reply || json.message || t("reports.noInsights"));
      setSelectedSections((prev) => prev.includes("summary") ? prev : [...prev, "summary"]);
      setSectionOrder((prev) => {
        const withoutSummary = prev.filter((id) => id !== "summary");
        const kpiIndex = withoutSummary.indexOf("kpis");
        if (kpiIndex >= 0) {
          return [
            ...withoutSummary.slice(0, kpiIndex + 1),
            "summary",
            ...withoutSummary.slice(kpiIndex + 1),
          ];
        }
        return ["summary", ...withoutSummary];
      });
      setStatusMessage(t("reports.recommendationsUpdated"));
    } catch (error) {
      console.error("Summary failed:", error);
      setStatusMessage(t("reports.recommendationsFailed"));
    } finally {
      setSummaryLoading(false);
    }
  }, [analytics, currentUserId, summaryLoading]);

  const buildReportWithAi = useCallback(async ({ download = false } = {}) => {
    if (!analytics || !reportPrompt.trim() || aiBuildLoading) return;
    setAiBuildLoading(true);
    setStatusMessage("");
    try {
      const availableSections = VISIBLE_SECTION_DEFS.map((s) => `${s.id}: ${t(s.labelKey)} (${t(s.typeKey)})`).join("\n");
      const dataSnapshot = {
        totalPosts: analytics.totalPosts,
        totalEngagement: analytics.totalEngagement,
        avgEngagement: analytics.avgEngagement,
        platforms: analytics.platformBreakdown.slice(0, 6),
        competitors: analytics.competitors.slice(0, 6),
        keywords: analytics.topKeywords.slice(0, 10),
        tones: analytics.toneDistribution,
      };
      const prompt = `You are configuring a clean dashboard-style PDF report builder for Chibitek. Return only valid JSON.\n\nUser request:\n${reportPrompt}\n\nAvailable section IDs:\n${availableSections}\n\nData snapshot:\n${JSON.stringify(dataSnapshot)}\n\nReturn JSON with this shape:\n{\n  "title": "short report title",\n  "sections": ["summary", "kpis"],\n  "toneChartView": "scatter" or "bar",\n  "summary": "3 short bullets, each under 12 words, no heading"\n}\nRules: use only available section IDs; keep the report light; put kpis and summary near the top; do not include markdown headings in summary; include tone only when tone data exists or user asks for tone; include keywords only if keyword data exists or the user asks for keywords.`;
      const aiSettings = loadAiSettings();
      const modelMeta = getModelMeta(aiSettings?.modelChoice);
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          user_id: currentUserId || undefined,
          llmProvider: modelMeta?.provider,
          chatModel: aiSettings?.modelChoice,
        }),
      });
      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
      const json = await res.json();
      const plan = safeParseJson(json.reply || json.message || "") || {};
      const sections = cleanSectionList(plan.sections, REPORT_PRESETS[0].sections);

      setReportTitle(String(plan.title || t("reports.defaultTitle")).slice(0, 80));
      setAiSummary(String(plan.summary || plan.notes || "").trim());
      setSelectedSections(sections);
      setSectionOrder([...sections, ...DEFAULT_ORDER.filter((id) => !sections.includes(id))]);
      if (["scatter", "bar"].includes(plan.toneChartView)) setToneChartView(plan.toneChartView);
      setStatusMessage(download ? t("reports.aiBuiltDownloading") : t("reports.aiBuiltPreview"));
      if (download) setPendingAutoDownload(true);
    } catch (error) {
      console.error("AI report builder failed:", error);
      setStatusMessage(t("reports.aiBuilderFailed"));
    } finally {
      setAiBuildLoading(false);
    }
  }, [analytics, reportPrompt, aiBuildLoading, currentUserId]);

  const renderPanel = (block) => {
    if (!analytics) return null;
    const id = typeof block === "string" ? block : block.id;
    const def = SECTION_DEFS.find((section) => section.id === id);
    const panelSubtitle = block?.rangeLabel ? t("reports.rows", { range: block.rangeLabel }) : "";
    const body = {
      summary: <InsightReport summary={aiSummary} analytics={analytics} t={t} />,
      kpis: <KpiReport analytics={analytics} t={t} />,
      timeline: <TimelineReport data={analytics.engagementOverTime} t={t} />,
      platforms: <PlatformReport data={analytics.platformBreakdown} t={t} />,
      tone: <ToneReport data={analytics.toneDistribution} engagementData={analytics.toneEngagementData} t={t} />,
      toneEngagement: <ToneEngagementReport data={analytics.toneEngagementData} view={toneChartView} t={t} />,
      topPosts: <TopPostsReport posts={analytics.topPosts} start={block?.start || 0} limit={block?.limit || 5} t={t} />,
      competitors: <CompetitorReport competitors={analytics.competitors} start={block?.start || 0} limit={block?.limit || 7} t={t} />,
      keywords: <KeywordReport keywords={analytics.topKeywords} meta={keywordMeta} start={block?.start || 0} limit={block?.limit || 7} t={t} />,
    }[id];

    return (
      <Card key={block?.key || id} withBorder radius="lg" p="xs" style={{ height: "100%", overflow: "hidden", boxShadow: "0 6px 14px rgba(15,23,42,0.03)" }}>
        <SectionTitle icon={def?.icon} title={def?.labelKey ? t(def.labelKey) : def?.label || id} subtitle={panelSubtitle} />
        {body}
      </Card>
    );
  };

  const keywordStatus = keywordMeta?.debug
    ? keywordMeta.debug
    : t("reports.keywordStatus", { count: keywords.length, posts: keywordMeta?.totalPosts || 0 });
  const keywordHelp = (keywordMeta?.totalPosts || 0) >= 10
    ? t("reports.filteringOneOff")
    : t("reports.morePostsCleaner");

  const renderReportPage = (pageRows, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    return (
      <div
        key={`page-${pageIndex}`}
        ref={(el) => { if (el) pageRefs.current[pageIndex] = el; }}
        style={{
          width: REPORT_PAGE_WIDTH,
          height: REPORT_PAGE_HEIGHT,
          padding: REPORT_PAGE_PADDING,
          boxSizing: "border-box",
          background: "#ffffff",
          color: "#1f2937",
          borderRadius: 18,
          border: "1px solid #e9ecef",
          boxShadow: "0 14px 34px rgba(15,23,42,0.07)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {isFirstPage ? (
          <Group justify="space-between" align="flex-start" mb={8} style={{ height: FIRST_PAGE_HEADER_HEIGHT - 8 }}>
            <div>
              <Text fw={900} size="lg" lineClamp={1}>{reportTitle}</Text>
              <Text size="10px" c="dimmed">{t("reports.generatedOn", { date: new Date().toLocaleString() })}</Text>
            </div>
            <Group gap="xs">
              <Badge variant="light" color="blue">{analytics ? t("common.postsCount", { count: analytics.totalPosts }) : t("common.noData")}</Badge>
              <Badge variant="light" color="gray">{t("common.page")} {pageIndex + 1}</Badge>
            </Group>
          </Group>
        ) : (
          <Group justify="space-between" mb="sm" style={{ height: CONTINUED_HEADER_HEIGHT - 6 }}>
            <Text fw={800} size="sm" c="dimmed">{reportTitle}</Text>
            <Badge variant="light" color="gray">{t("common.page")} {pageIndex + 1}</Badge>
          </Group>
        )}

        {!analytics ? (
          <EmptyReportState>{t("reports.noReportData")}</EmptyReportState>
        ) : selectedOrderedSections.length === 0 ? (
          <EmptyReportState>{t("reports.selectPanel")}</EmptyReportState>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: PAGE_GAP }}>
            {pageRows.map((row, rowIndex) => row.items.map((block) => (
              <div
                key={`${pageIndex}-${rowIndex}-${block.key || block.id}`}
                style={{
                  gridColumn: row.items.length === 1 || (block.span || 1) === 2 ? "1 / -1" : "span 1",
                  height: row.height,
                  breakInside: "avoid",
                  pageBreakInside: "avoid",
                }}
              >
                {renderPanel(block)}
              </div>
            )))}
          </div>
        )}

        <Text size="9px" c="dimmed" style={{ position: "absolute", bottom: 14, left: REPORT_PAGE_PADDING, right: REPORT_PAGE_PADDING, textAlign: "center" }}>
          {t("reports.footer")}
        </Text>
      </div>
    );
  };

  const activePresetId = REPORT_PRESETS.find((preset) => (
    preset.sections.length === selectedSections.length && preset.sections.every((id) => selectedSections.includes(id))
  ))?.id;

  return (
    <Container size="xl" py="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} />

      <Group justify="space-between" align="flex-start" mb="lg">
        <Group gap="xs" align="flex-start">
          <ThemeIcon radius="lg" size={42} variant="light"><IconFileAnalytics size={22} /></ThemeIcon>
          <div>
            <Title order={1}>{t("reports.title")}</Title>
            <Text size="sm" c="dimmed">{t("reports.subtitle")}</Text>
          </div>
        </Group>
        <Badge variant="light" color="blue">{analytics ? t("common.savedPostsCount", { count: analytics.totalPosts }) : t("common.loading")}</Badge>
      </Group>

      {statusMessage && (
        <Alert mb="lg" color={statusMessage.toLowerCase().includes("failed") || statusMessage.toLowerCase().includes("could not") ? "red" : "blue"}>
          {statusMessage}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mb="lg">
        <Card withBorder shadow="sm" radius="xl" p="md" data-tour="reports-ai">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Title order={2} size="h4">{t("reports.askAi")}</Title>
              <Badge variant="light" color="blue">{t("reports.bestOption")}</Badge>
            </Group>
            <Textarea
              autosize
              minRows={2}
              maxRows={3}
              value={reportPrompt}
              onChange={(event) => setReportPrompt(event.currentTarget.value)}
              placeholder={t("reports.promptPlaceholder")}
            />
            <Group gap="xs" grow>
              <Button size="sm" leftSection={<IconSparkles size={15} />} onClick={() => buildReportWithAi({ download: false })} loading={aiBuildLoading} disabled={!analytics || !reportPrompt.trim()}>
                {t("reports.build")}
              </Button>
              <Button size="sm" variant="light" leftSection={<IconDownload size={15} />} onClick={() => buildReportWithAi({ download: true })} loading={aiBuildLoading || pendingAutoDownload || generatingPdf} disabled={!analytics || !reportPrompt.trim()}>
                {t("common.download")}
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder shadow="sm" radius="xl" p="md" data-tour="reports-layout">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Title order={2} size="h4">{t("reports.quickLayout")}</Title>
              <Badge variant="light" color="gray">{t("common.pagesCount", { count: reportPages.length })}</Badge>
            </Group>
            <SimpleGrid cols={1} spacing={6}>
              {REPORT_PRESETS.map((preset) => (
                <Button key={preset.id} variant={activePresetId === preset.id ? "filled" : "light"} size="xs" radius="xl" onClick={() => applyPreset(preset)} justify="space-between">
                  {t(preset.labelKey)}
                </Button>
              ))}
            </SimpleGrid>
            <TextInput size="xs" label={t("reports.pdfTitle")} value={reportTitle} onChange={(event) => setReportTitle(event.currentTarget.value)} />
            <Button size="sm" leftSection={<IconDownload size={15} />} onClick={generatePDF} loading={generatingPdf} disabled={!analytics || selectedOrderedSections.length === 0}>
              {t("reports.downloadPdf")}
            </Button>
          </Stack>
        </Card>

        <Card withBorder shadow="sm" radius="xl" p="md" data-tour="reports-tools">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Title order={2} size="h4">{t("reports.dataTools")}</Title>
              <Badge variant="light" color="gray">{analytics ? t("common.postsCount", { count: analytics.totalPosts }) : t("common.loading")}</Badge>
            </Group>
            <SimpleGrid cols={2} spacing={6}>
              <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} onClick={generateSummary} loading={summaryLoading} disabled={!analytics}>
                {t("reports.improveTakeaways")}
              </Button>
              <Button size="xs" variant="light" leftSection={<IconMoodSmile size={14} />} onClick={runToneAnalysis} loading={toneLoading} disabled={!posts.length}>
                {t("reports.analyzeTone")}
              </Button>
            </SimpleGrid>
            <NumberInput size="xs" label={t("reports.tonePostSample")} value={postLimit} min={1} max={100} onChange={(value) => setPostLimit(Number(value) || 10)} />
            <Group gap={5} wrap="wrap">
              {VISIBLE_SECTION_DEFS.map((section) => {
                const Icon = section.icon;
                const active = selectedSections.includes(section.id);
                return (
                  <Button key={section.id} size="xs" radius="xl" variant={active ? "filled" : "light"} leftSection={<Icon size={11} />} onClick={() => toggleSection(section.id)}>
                    {t(section.labelKey)}
                  </Button>
                );
              })}
            </Group>
            <Group gap={5}>
              <Badge size="xs" variant="light" color="gray">{t("reports.keywordStatus", { count: keywords.length, posts: keywordMeta?.totalPosts || 0 })}</Badge>
              <Button size="xs" variant="subtle" leftSection={<IconRefresh size={13} />} onClick={loadData} disabled={loading}>{t("common.refresh")}</Button>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder shadow="sm" radius="xl" p="lg" data-tour="reports-preview">
        <Group justify="space-between" mb="md" align="flex-start">
          <div>
            <Title order={2} size="h3">{t("reports.livePreview")}</Title>
            <Text size="sm" c="dimmed">{t("reports.livePreviewDesc")}</Text>
          </div>
          <Group gap="xs">
            <Badge variant="light" color="blue">{t("common.exportScale", { scale: PDF_EXPORT_SCALE })}</Badge>
            <Badge variant="light" color="gray">{t("common.pagesCount", { count: reportPages.length })}</Badge>
          </Group>
        </Group>

        <ScrollArea h={1120} offsetScrollbars type="auto">
          <Stack align="center" gap="lg" style={{ minWidth: REPORT_PAGE_WIDTH + 40, background: "var(--surface-2)", padding: 20, borderRadius: 18 }}>
            {reportPages.map(renderReportPage)}
          </Stack>
        </ScrollArea>
      </Card>
    </Container>
  );
}
