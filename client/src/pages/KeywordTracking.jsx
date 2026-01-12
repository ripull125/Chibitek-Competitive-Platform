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

/* Demo data (replace with API) */
const trending = [
  { term: "burger restaurants", volume: 21000, delta: +1 },
  { term: "brussels fast food", volume: 15000, delta: -3 },
  { term: "best burger in brussels", volume: 5000, delta: +1 },
  { term: "antwerp burgers", volume: 2000, delta: -4 },
  { term: "belgian fries", volume: 6000, delta: -8 },
  { term: "milkshakes in brussels", volume: 950, delta: -11 },
  { term: "vegetarian burgers", volume: 500, delta: -19 },
];

/* Category series with an avg engagement metric for overlay */
const BASE_SERIES = [
  { t: "W1", Burgers: 3200, Fries: 800,  Shakes: 160, Veggie: 120, avgEng: 92 },
  { t: "W2", Burgers: 3600, Fries: 920,  Shakes: 180, Veggie: 130, avgEng: 87 },
  { t: "W3", Burgers: 4100, Fries: 870,  Shakes: 210, Veggie: 150, avgEng: 101 },
  { t: "W4", Burgers: 3900, Fries: 780,  Shakes: 240, Veggie: 160, avgEng: 95 },
  { t: "W5", Burgers: 4550, Fries: 950,  Shakes: 220, Veggie: 190, avgEng: 108 },
  { t: "W6", Burgers: 4800, Fries: 1020, Shakes: 260, Veggie: 210, avgEng: 103 },
];

const CATEGORY_KEYS = ["Burgers", "Fries", "Shakes", "Veggie"];

/* Normalize counts to shares per bucket */
function toShare(points, keys) {
  return points.map((p) => {
    const total = keys.reduce((s, k) => s + (p[k] || 0), 0) || 1;
    const next = { ...p };
    keys.forEach((k) => (next[k] = (p[k] || 0) / total));
    return next;
  });
}

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  const [range, setRange] = React.useState("30d");
  const [mode, setMode] = React.useState("absolute"); // 'absolute' | 'share'
  const [overlay, setOverlay] = React.useState("none"); // 'none' | 'avg'
  const [infoOpen, setInfoOpen] = React.useState(false);

  const series = mode === "share" ? toShare(BASE_SERIES, CATEGORY_KEYS) : BASE_SERIES;
  const yLeftFormatter = mode === "share" ? formatPct : formatK;

  const tooltipFormatter = (value, name) => {
    if (name === "Avg engagement") return `${value}`;
    return mode === "share" ? formatPct(value) : formatK(value);
  };

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
              {trending.map((r) => (
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
                <LineChart data={series} margin={{ top: 8, right: 28, left: 10, bottom: 8 }}>
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
                  <Line yAxisId="left" type="monotone" dataKey="Burgers" dot={false} strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="Fries" dot={false} strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="Shakes" dot={false} strokeWidth={2} />
                  <Line yAxisId="left" type="monotone" dataKey="Veggie" dot={false} strokeWidth={2} />
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
