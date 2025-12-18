// client/src/pages/KeywordTracking.jsx
import React, { forwardRef } from "react";
import { Card, Title, Table, Group, Text, Anchor, Box } from "@mantine/core";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { IconTriangleFilled } from "@tabler/icons-react";
import classes from "./KeywordTracking.module.css";

const formatK = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : n.toLocaleString());

function RankCell({ value, trend }) {
  const map = {
    up: { color: "var(--kt-green)", rotate: 0 },
    down: { color: "var(--kt-red)", rotate: 180 },
    flat: { color: "var(--kt-grey)", rotate: 90 },
  };
  const { color, rotate } = map[trend] || map.flat;
  return (
    <Group gap={8} wrap="nowrap">
      <IconTriangleFilled size={16} style={{ color, transform: `rotate(${rotate}deg)` }} />
      <Text fw={700}>{value}</Text>
    </Group>
  );
}

// demo stacked-bar strip
const chartData = Array.from({ length: 28 }).map((_, i) => {
  const base = 8 + Math.round(Math.sin(i / 2.3) * 5 + (i / 28) * 10);
  const low = Math.max(1, Math.round(base * 0.4));
  const mid = Math.max(1, Math.round(base * 0.35));
  const high = Math.max(1, Math.round(base * 0.25));
  return { idx: i + 1, low, mid, high };
});

const rows = [
  { keyword: "burger restaurants",      volume: 21000, your: 1,  yourTrend: "up",   comp: 2,     compTrend: "down" },
  { keyword: "brussels fast food",      volume: 15000, your: 3,  yourTrend: "down", comp: 2,     compTrend: "flat" },
  { keyword: "best burger in brussels", volume:  5000, your: 1,  yourTrend: "up",   comp: 4,     compTrend: "up" },
  { keyword: "antwerp burgers",         volume:  2000, your: 4,  yourTrend: "down", comp: 5,     compTrend: "down" },
  { keyword: "belgian fries",           volume:  6000, your: 8,  yourTrend: "down", comp: 1,     compTrend: "up" },
  { keyword: "milkshakes in brussels",  volume:   950, your: 11, yourTrend: "down", comp: 15,    compTrend: "down" },
  { keyword: "vegetarian burgers",      volume:   500, your: 19, yourTrend: "down", comp: "+100", compTrend: "down" },
];

const KeywordTracking = forwardRef(function KeywordTracking(_, ref) {
  return (
    <div ref={ref} className={classes.wrap}>
      <Card withBorder shadow="xs" radius="lg" p="md" className={classes.cardCenter}>
        {/* Top stacked bar strip */}
        <Box className={classes.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="ktLow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#CFE2FF" stopOpacity="1" />
                  <stop offset="100%" stopColor="#CFE2FF" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="ktMid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7FB3FF" stopOpacity="1" />
                  <stop offset="100%" stopColor="#7FB3FF" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="ktHigh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E6CF6" stopOpacity="1" />
                  <stop offset="100%" stopColor="#2E6CF6" stopOpacity="0.95" />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="idx" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} height={16} />
              <YAxis width={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 8 }} />
              <Bar dataKey="low"  stackId="s" fill="url(#ktLow)"  radius={[3, 3, 0, 0]} />
              <Bar dataKey="mid"  stackId="s" fill="url(#ktMid)"  radius={[3, 3, 0, 0]} />
              <Bar dataKey="high" stackId="s" fill="url(#ktHigh)" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>

        {/* Table fills remaining card space; scrolls if needed */}
        <Title order={6} className={classes.visuallyHidden}>Keyword Rankings</Title>
        <div className={classes.tablePane}>
          <Table withRowBorders={false} verticalSpacing="md" className={classes.table}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className={classes.th}>Your Keywords</Table.Th>
                <Table.Th className={classes.th}>Volume</Table.Th>
                <Table.Th className={classes.th}>Your Ranking</Table.Th>
                <Table.Th className={classes.th}>Competitor Ranking</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.keyword} className={classes.tr}>
                  <Table.Td className={classes.tdKeyword}>
                    <Anchor href="#" underline="never" className={classes.link}>
                      {r.keyword}
                    </Anchor>
                  </Table.Td>
                  <Table.Td className={classes.tdNumber}>
                    <Text fw={600}>{formatK(r.volume)}</Text>
                  </Table.Td>
                  <Table.Td className={classes.tdRank}>
                    <RankCell value={r.your} trend={r.yourTrend} />
                  </Table.Td>
                  <Table.Td className={classes.tdRank}>
                    <RankCell value={r.comp} trend={r.compTrend} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
});

export default KeywordTracking;
