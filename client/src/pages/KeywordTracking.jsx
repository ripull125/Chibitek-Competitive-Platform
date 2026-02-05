// client/src/pages/KeywordTracking.jsx
import "../utils/ui.css";

import React, { forwardRef } from "react";
import {
  Card, Title, Group, Text, Anchor, Select, Modal, ActionIcon,
  Tooltip, Button, List, ThemeIcon, Divider
} from "@mantine/core";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Legend,
  Tooltip as RechartsTooltip, CartesianGrid
} from "recharts";
import {
  IconTriangleFilled, IconInfoCircle, IconTrendingUp, IconActivity, IconChartBar
} from "@tabler/icons-react";
import classes from "./KeywordTracking.module.css";
import { convertSavedPosts } from "./DataConverter";


/* Formatting */
const formatK = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : n.toLocaleString());
const formatPct = (v) => `${Math.round(v * 100)}%`; 

/* Rank delta badge (directional only) */
function DeltaBadge({ delta }) {
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "var(--kt-grey)" : up ? "var(--kt-green)" : "var(--kt-red)";
  const rotate = flat ? 90 : up ? 0 : 180;
  return (
    <Group gap={6} wrap="nowrap" className={classes.delta}>
      <IconTriangleFilled size={14} style={{ color, transform: `rotate(${rotate}deg)` }} />
      <Text fw={700} style={{ color }}>{Math.abs(delta)}</Text>
    </Group>
  );
}


/* Normalize counts to shares per bucket */
function toShare(points, keys) {
  return points.map((p) => {
    const total = keys.reduce((s, k) => s + (p[k] || 0), 0) || 1;
    const next = { ...p };
    keys.forEach((k) => (next[k] = (p[k] || 0) / total));
    return next;
  });
}

// -----------------------------
// Helpers to build charts from saved posts
// -----------------------------
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","so","to","of","in","on","for","with",
  "is","are","was","were","be","been","being","it","this","that","as","from","will","not"
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function parseRangeDays(range) {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0,0,0,0);
  return x;
}

function getPostDate(p) {
  return new Date(p.Date);
}


// TEMP categories — change later to MSP keywords
const CATEGORY_DEFS = {
  Links: ["http", "https", "t.co"],
  AI: ["ai", "grok", "chatgpt", "openai"],
  Security: ["edr", "mdr", "soc", "ransomware", "zero trust", "siem"],
  Cloud: ["azure", "aws", "cloud", "m365", "office 365"],
};



  const CATEGORY_KEYS = Object.keys(CATEGORY_DEFS);
  const KeywordTracking = forwardRef(function KeywordTracking({ posts = [] }, ref) {
  const [range, setRange] = React.useState("30d");
  const [mode, setMode] = React.useState("absolute"); // 'absolute' | 'share'
  const [overlay, setOverlay] = React.useState("none"); // 'none' | 'avg'

  const [localPosts, setLocalPosts] = React.useState([]);
  const effectivePosts = posts.length ? posts : localPosts;

  React.useEffect(() => {
    if (posts.length) return; // if parent passed posts, don't fetch

    fetch("http://localhost:8080/api/posts")
      .then((r) => r.json())
      .then((data) => {
        const converted = convertSavedPosts(data.posts || []);
        setLocalPosts(converted);
      })
      .catch((e) => console.error("KeywordTracking fetch failed:", e));
  }, [posts.length]);

  const [infoOpen, setInfoOpen] = React.useState(false);
  const yLeftFormatter = mode === "share" ? formatPct : formatK;

  const tooltipFormatter = (value, name) => {
    if (name === "Avg engagement") return `${value}`;
    return mode === "share" ? formatPct(value) : formatK(value);
  };

  const { trendingRows, series } = React.useMemo(() => {
    if (!effectivePosts.length) return { trendingRows: [], series: [] };

  const days = parseRangeDays(range);
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - days);

  const filtered = effectivePosts.filter((p) => {
  const d = getPostDate(p);
  return d >= windowStart && d <= now;
  });

  console.log("effectivePosts:", effectivePosts.length);
  console.log("unique messages:", new Set(effectivePosts.map(p => p.Message)).size);
  console.log("sample messages:", effectivePosts.slice(0, 3).map(p => p.Message));




  // --- Trending keywords ---
  const counts = new Map();
  filtered.forEach(p => {
    tokenize(p.Message).forEach(w => {
      counts.set(w, (counts.get(w) || 0) + 1);
    });
  });

  const trendingRows = [...counts.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0,7)
    .map(([term, volume], i) => ({
      term,
      volume,
      delta: 0 // placeholder for now
    }));

  // --- Category time series ---
  const byWeek = new Map();

  filtered.forEach(p => {
    const week = startOfWeek(getPostDate(p));
    const key = week.toISOString();

    if (!byWeek.has(key)) {
      byWeek.set(key, {
        t: week.toLocaleDateString(),
        ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])),
        _eng: 0,
        _n: 0,
    });

    }

    const bucket = byWeek.get(key);
    const msg = (p.Message || "").toLowerCase();

    CATEGORY_KEYS.forEach((cat) => {
      if (CATEGORY_DEFS[cat].some((kw) => msg.includes(kw))) {
        bucket[cat] += 1;
      }
    });


    bucket._eng += p.Engagement || 0;
    bucket._n++;
  });

  const series = [...byWeek.values()]
  .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
  .map((v) => ({
    t: v.t,
    ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, v[k] ?? 0])),
    avgEng: v._n ? Math.round(v._eng / v._n) : 0,
  }));

  return { trendingRows, series };
}, [effectivePosts, range]);


  return (
    <div ref={ref} className={classes.wrap}>
      <Card withBorder shadow="xs" radius="lg" p="lg" className={classes.card}>
        {/* Header */}
        <Group justify="space-between" align="center" className={classes.header}>
          <Title order={3}>Keyword Trends</Title>
          <Select
            value={range}
            onChange={(v) => setRange(v ?? "30d")}
            data={[
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              { value: "90d", label: "Last 90 days" },
            ]}
            w={180}
          />
        </Group>

        {/* Grid */}
        <div className={classes.grid}>
          {/* Trending list */}
          <Card withBorder radius="md" p="lg" className={classes.panel}>
            <Title order={5} className={classes.panelTitle}>Trending Keywords</Title>
            <div className={classes.listHeader}>
              <Text className={classes.colTerm}>Keyword</Text>
              <Text className={classes.colVol}>Volume</Text>
              <Text className={classes.colDelta}>Δ Rank</Text>
            </div>
            <div className={classes.list}>
              {trendingRows.map((r) => (
                <div key={r.term} className={classes.row}>
                  <Anchor href="#" underline="never" className={classes.term}>{r.term}</Anchor>
                  <Text fw={600} className={classes.vol}>{formatK(r.volume)}</Text>
                  <DeltaBadge delta={r.delta} />
                </div>
              ))}
            </div>
          </Card>

          {/* Category chart */}
          <Card withBorder radius="md" p="lg" className={classes.panel}>
            <Group justify="space-between" align="center" className={classes.controls}>
              <Group gap="xs" align="center">
                <Title order={5} className={classes.panelTitle}>Keyword Categories Over Time</Title>
                <Tooltip label="How to read this fast">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setInfoOpen(true)}
                    aria-label="How to read this chart"
                    className={classes.infoIcon}
                  >
                    <IconInfoCircle size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Group gap="sm" wrap="wrap">
                <Select
                  value={mode}
                  onChange={(v) => setMode(v ?? "absolute")}
                  data={[
                    { value: "absolute", label: "Mode: Absolute" },
                    { value: "share", label: "Mode: % Share" },
                  ]}
                  w={180}
                />
                <Select
                  value={overlay}
                  onChange={(v) => setOverlay(v ?? "none")}
                  data={[
                    { value: "none", label: "Overlay: None" },
                    { value: "avg", label: "Overlay: Avg engagement" },
                  ]}
                  w={240}
                />
              </Group>
            </Group>

            <div className={classes.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mode === "share" ? toShare(series, CATEGORY_KEYS) : series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="left"
                    tickFormatter={yLeftFormatter}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    domain={mode === "share" ? [0, 1] : ["auto", "auto"]}
                  />
                  {overlay === "avg" && (
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                  )}
                  <RechartsTooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={{ borderRadius: 8 }}
                    formatter={tooltipFormatter}
                  />
                  <Legend />
                  {/* Theme-driven colors */}
                  {CATEGORY_KEYS.map((k) => (
                    <Line
                      key={k}
                      yAxisId="left"
                      type="monotone"
                      dataKey={k}
                      name={k}
                      dot={false}
                      strokeWidth={2}
                    />
                  ))}

                  {overlay === "avg" && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgEng"
                      name="Avg engagement"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </Card>

      {/* Info modal — polished */}
      <Modal
        opened={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How to read this chart"
        centered
        size="lg"
        radius="lg"
        overlayProps={{ opacity: 0.2, blur: 2 }}
      >
        <div className={classes.infoContent}>
          <Text c="dimmed" mb="sm">
            Quick rules to scan the chart correctly:
          </Text>
          <div className={classes.infoSection}>
            <List spacing="xs" size="sm" icon={
              <ThemeIcon radius="xl" size={20}><IconChartBar size={14} /></ThemeIcon>
            }>
              <List.Item><b>Left axis:</b> keyword frequency (mentions) per bucket. In “% Share” mode it shows share of total.</List.Item>
              <List.Item icon={<ThemeIcon radius="xl" size={20}><IconActivity size={14} /></ThemeIcon>}>
                <b>Right axis (overlay):</b> average engagement per mention.
              </List.Item>
              <List.Item icon={<ThemeIcon radius="xl" size={20}><IconTrendingUp size={14} /></ThemeIcon>}>
                <b>Fast read:</b> ↑ frequency & ↑ engagement = strong momentum; ↑ frequency & ↓ engagement = saturation risk.
              </List.Item>
            </List>
          </div>
          <Divider my="md" />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setInfoOpen(false)}>Got it</Button>
          </Group>
        </div>
      </Modal>
    </div>
  );
});

export default KeywordTracking;
