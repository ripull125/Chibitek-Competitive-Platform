// client/src/pages/DashboardPage.jsx
import React from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  List,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  Transition,
} from "@mantine/core";
import {
  IconArrowUp,
  IconArrowDown,
  IconBolt,
  IconExternalLink,
  IconSparkles,
  IconTargetArrow,
  IconChartDots,
  IconTrendingUp,
} from "@tabler/icons-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts";
import { useNavigate } from "react-router-dom";
import classes from "./DashboardPage.module.css";

/* ---------- Utils & demo data ---------- */
const fmtK = (n) =>
  n >= 1000 ? `${Math.round(n / 100) / 10}k` : n.toLocaleString();

const KPI = [
  { label: "Mentions", value: 18920, delta: +14 },
  { label: "Avg Eng / mention", value: 96, delta: +7 },
  { label: "Share of voice", value: "31%", delta: +2 },
  { label: "Momentum (WoW)", value: "+12%", delta: +12 },
];

const ALERTS = [
  {
    icon: IconTrendingUp,
    title: "Rising category: AI Security",
    detail: "+38% mentions, engagement holding steady",
    link: {
      to: "/keywords?focus=category&value=AI%20Security",
      label: "Open in Tracking",
    },
  },
  {
    icon: IconSparkles,
    title: "Niche hit: 24/7 SOC",
    detail: "Low volume, high resonance (120 avg/mention)",
    link: {
      to: "/keywords?term=24%2F7%20SOC",
      label: "Open in Tracking",
    },
  },
  {
    icon: IconChartDots,
    title: "Saturation risk: Zero Trust",
    detail: "Volume ↑, engagement ↓ week-over-week",
    link: {
      to: "/keywords?term=Zero%20Trust",
      label: "Investigate",
    },
  },
];

const EFFECTIVENESS = [
  { keyword: "AI security", mentions: 21000, avgEng: 108, totalEng: 226800 },
  { keyword: "Zero trust", mentions: 15000, avgEng: 82, totalEng: 123000 },
  { keyword: "Endpoint MDR", mentions: 5000, avgEng: 91, totalEng: 45500 },
  { keyword: "24/7 SOC", mentions: 2000, avgEng: 120, totalEng: 24000 },
  { keyword: "Threat intel", mentions: 6000, avgEng: 98, totalEng: 58800 },
];

const COMP_FEED = [
  { who: "Bytecore", platform: "LinkedIn", title: "Zero Trust explainer", kw: "zero trust", eng: 742 },
  { who: "Infonetic", platform: "X", title: "SOC behind-the-scenes", kw: "24/7 soc", eng: 520 },
  { who: "Kodex", platform: "LinkedIn", title: "AI Security launch recap", kw: "ai security", eng: 910 },
];

const TOP_POSTS = [
  { who: "Chibitek", platform: "LinkedIn", title: "AI Security launch recap", eng: 980 },
  { who: "Chibitek", platform: "X", title: "Endpoint MDR myths", eng: 488 },
  { who: "Chibitek", platform: "Instagram", title: "SOC night shift", eng: 420 },
];

const BRIEFS = [
  { kw: "AI security", idea: "Platform roundup with customer quote", platform: "LinkedIn", cta: "Draft brief", to: "/keywords?term=AI%20security" },
  { kw: "24/7 SOC", idea: "Behind-the-scenes reel (night ops)", platform: "Instagram", cta: "Draft brief", to: "/keywords?term=24%2F7%20SOC" },
];

/* ---------- Card shell ---------- */
function CardSection({ title, subtitle, right, children, className, pad = "xl" }) {
  return (
    <Card withBorder shadow="xs" radius="lg" p={pad} className={`${classes.card} ${className || ""}`}>
      {(title || subtitle || right) && (
        <>
          <Group justify="space-between" align="flex-start" className={classes.cardHeader}>
            <Stack gap={4}>
              {title && (
                <Text className={classes.cardTitle} fw={800} tt="uppercase" size="xs" c="dimmed">
                  {title}
                </Text>
              )}
              {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
            </Stack>
            {right}
          </Group>
          <Divider className={classes.cardDivider} />
        </>
      )}
      {children}
    </Card>
  );
}

/* ---------- Part 1 ---------- */
function KPIStrip() {
  return (
    <div data-tour="dashboard-kpis">
      <CardSection title="Engagement snapshot" right={<IconBolt className={classes.cardIcon} />}>
        <div className={classes.kpis}>
          {KPI.map((k) => (
            <div key={k.label} className={classes.kpi}>
              <Text size="xs" c="dimmed" fw={700} className={classes.kpiLabel}>{k.label}</Text>
              <Group gap="xs" align="end" wrap="nowrap">
                <Title order={2} className={classes.kpiValue}>
                  {typeof k.value === "number" ? fmtK(k.value) : k.value}
                </Title>
                <Badge radius="sm" variant="light" className={k.delta >= 0 ? classes.deltaUp : classes.deltaDown}>
                  {k.delta >= 0 ? `+${k.delta}%` : `${k.delta}%`}
                </Badge>
              </Group>
            </div>
          ))}
        </div>
      </CardSection>
    </div>
  );
}

function OpportunityAlerts() {
  const navigate = useNavigate();
  return (
    <div data-tour="dashboard-alerts">
      <CardSection title="Opportunity alerts" subtitle="Fast movers & watchouts">
        <Stack gap="md">
          {ALERTS.map((a, i) => {
            const Icon = a.icon;
            return (
              <Group key={i} justify="space-between" align="center" className={classes.rowPad}>
                <Group gap="sm">
                  <ThemeIcon variant="light" radius="lg" size={36}>
                    <Icon size={18} />
                  </ThemeIcon>
                  <Stack gap={2}>
                    <Text fw={800}>{a.title}</Text>
                    <Text size="sm" c="dimmed">{a.detail}</Text>
                  </Stack>
                </Group>
                <Button
                  variant="light"
                  rightSection={<IconExternalLink size={16} />}
                  onClick={() => navigate(a.link.to)}
                >
                  {a.link.label}
                </Button>
              </Group>
            );
          })}
        </Stack>
      </CardSection>
    </div>
  );
}

function EffectivenessScatter() {
  const navigate = useNavigate();
  return (
    <CardSection
      title="What works now"
      subtitle="X: mentions · Y: avg engagement/mention · Size: total engagement"
      right={<IconTargetArrow className={classes.cardIcon} />}
    >
      <div className={classes.chartBox}>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mentions" name="Mentions" tickFormatter={fmtK} />
            <YAxis dataKey="avgEng" name="Avg Eng/mention" />
            <ZAxis dataKey="totalEng" range={[80, 360]} />
            <RechartsTooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: 8 }}
              formatter={(v, n) => (n === "Mentions" ? fmtK(v) : v)}
              labelFormatter={() => ""}
            />
            <Scatter
              data={EFFECTIVENESS}
              name="Keywords"
              onClick={(data) => navigate(`/keywords?term=${encodeURIComponent(data.payload.keyword)}`)}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </CardSection>
  );
}

/* ---------- Part 2 ---------- */
function CompetitorMoves() {
  return (
    <CardSection title="Competitor moves" subtitle="Recent high-engagement posts by competitors" className={classes.tall}>
      <Stack gap="md">
        {COMP_FEED.map((p, idx) => (
          <Group key={idx} justify="space-between" align="center" className={classes.rowPad}>
            <Group gap="sm" wrap="nowrap" align="center" className={classes.feedLeft}>
              <Avatar size={22} radius="xl" className={classes.brandDot} />
              <Text fw={700}>{p.who}</Text>
              <Badge variant="light">{p.platform}</Badge>
              <Text c="dimmed">—</Text>
              <Text className={classes.linkText}>{p.title}</Text>
            </Group>
            <Badge variant="light">{fmtK(p.eng)} 👍</Badge>
          </Group>
        ))}
      </Stack>
    </CardSection>
  );
}

function TopPosts() {
  return (
    <CardSection title="Top posts (proof)" subtitle="Your best performers using winning keywords">
      <Stack gap="md">
        {TOP_POSTS.map((p, idx) => (
          <Group key={idx} justify="space-between" align="center" className={classes.rowPad}>
            <Group gap="sm" wrap="nowrap" align="center">
              <Avatar size={22} radius="xl" className={classes.brandDot} />
              <Text fw={700}>{p.who}</Text>
              <Badge variant="light">{p.platform}</Badge>
              <Text c="dimmed">—</Text>
              <Text className={classes.linkText}>{p.title}</Text>
            </Group>
            <Badge variant="light">{fmtK(p.eng)} 👍</Badge>
          </Group>
        ))}
      </Stack>
      <Divider my="md" />
      <Group gap="xs" justify="center" c="dimmed">
        <IconBolt size={16} />
        <Text size="sm">Upper-right dots in “What works now” guide quick wins.</Text>
      </Group>
    </CardSection>
  );
}

function NextActions() {
  const navigate = useNavigate();
  return (
    <CardSection title="Next actions" subtitle="Auto-suggested briefs based on momentum">
      <List spacing="sm" className={classes.listReset}>
        {BRIEFS.map((b, i) => (
          <List.Item key={i} className={`${classes.briefRow} ${classes.rowPad}`}>
            <Group justify="space-between" align="center">
              <Group gap="sm" align="center">
                <ThemeIcon variant="light" radius="xl" size={30}>
                  <IconSparkles size={16} />
                </ThemeIcon>
                <Stack gap={2}>
                  <Text fw={800}>{b.kw}</Text>
                  <Text size="sm" c="dimmed">{b.idea} · {b.platform}</Text>
                </Stack>
              </Group>
              <Button variant="light" onClick={() => navigate(b.to)}>{b.cta}</Button>
            </Group>
          </List.Item>
        ))}
      </List>
    </CardSection>
    <div data-tour="dashboard-chart">
      <CardSection
        title="What works now"
        subtitle="X: mentions · Y: avg engagement/mention · Size: total engagement"
        right={<IconTargetArrow className={classes.cardIcon} />}
      >
        <div className={classes.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mentions" name="Mentions" tickFormatter={fmtK} />
              <YAxis dataKey="avgEng" name="Avg Eng/mention" />
              <ZAxis dataKey="totalEng" range={[80, 360]} />
              <RechartsTooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ borderRadius: 8 }}
                formatter={(v, n) => (n === "Mentions" ? fmtK(v) : v)}
                labelFormatter={() => ""}
              />
              <Scatter
                data={EFFECTIVENESS}
                name="Keywords"
                onClick={(data) => navigate(`/keywords?term=${encodeURIComponent(data.payload.keyword)}`)}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardSection>
    </div>
  );
}

function RecentPosts() {
  const [recentPosts, setRecentPosts] = React.useState([]);

  React.useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('recentCompetitorPosts') || '[]');
    const chartData = stored.map((post, index) => ({
      index: index + 1,
      engagement: post.engagement,
      username: post.username,
      content: post.content,
    }));
    setRecentPosts(chartData);
  }, []);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <Text size="sm" fw={500}>{data.username}</Text>
          <Text size="sm">Post #{data.index}</Text>
          <Text size="sm">Engagement: {data.engagement}</Text>
        </div>
      );
    }
    return null;
  };

  return (
    <CardSection
      title="Recent posts"
      subtitle="Last 10 posts retrieved from Competitor Lookup"
      right={<IconChartDots className={classes.cardIcon} />}
    >
      {recentPosts.length > 0 ? (
        <div className={classes.chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" name="Post Index" type="number" />
              <YAxis dataKey="engagement" name="Engagement" />
              <RechartsTooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ borderRadius: 8 }}
                content={<CustomTooltip />}
              />
              <Scatter
                data={recentPosts}
                name="Posts"
                fill="#ff6b6b"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Text c="dimmed">No recent posts yet. Retrieve posts from Competitor Lookup to see them here.</Text>
      )}
    </CardSection>
  );
}

/* ---------- Page ---------- */
export default function DashboardPage() {
  const [page, setPage] = React.useState(0);
  const [dir, setDir] = React.useState(1);

  const go = React.useCallback((next) => {
    setPage((prev) => {
      const clamped = Math.max(0, Math.min(1, next));
      setDir(clamped > prev ? 1 : -1);
      return clamped;
    });
  }, []);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "dashboard" } }));
  }, []);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("chibitek:dashboard", { detail: { page } }));
  }, [page]);

  React.useEffect(() => {
    const onTour = (e) => {
      const d = e?.detail;
      if (!d) return;
      if (d.type === "setDashboardSlide") go(d.page);
    };
    window.addEventListener("chibitek:tour", onTour);
    return () => window.removeEventListener("chibitek:tour", onTour);
  }, [go]);

  return (
    <div className={classes.page}>
      <div className={classes.shell}>
        <header className={classes.header}>
          <Title order={2} className={classes.title}>Dashboard</Title>
        </header>

        <div className={classes.sliderWrap}>
          <Box className={classes.viewport}>
            <Transition
              mounted={page === 0}
              transition={dir === 1 ? "slide-up" : "slide-down"}
              duration={260}
              timingFunction="ease"
            >
              {(styles) => (
                <Box style={styles} className={classes.slide}>
                  <div className={classes.grid}>
                    <div className={`${classes.col} ${classes.span12}`}><KPIStrip /></div>
                    <div className={`${classes.col} ${classes.span5}`}><OpportunityAlerts /></div>
                    <div className={`${classes.col} ${classes.span7}`}><EffectivenessScatter /></div>
                  </div>
                </Box>
              )}
            </Transition>

            <Transition
              mounted={page === 1}
              transition={dir === 1 ? "slide-up" : "slide-down"}
              duration={260}
              timingFunction="ease"
            >
              {(styles) => (
                <Box style={styles} className={classes.slide}>
                  {/* CENTERED SLIDE 2 CONTENT */}
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 16,
                    }}
                  >
                    {/* Tight wrapper so spotlight hugs the card, no gutters */}
                    <div
                      data-tour="dashboard-slide-2"
                      style={{
                        width: "min(920px, 96%)",
                        borderRadius: 16,
                      }}
                    >
                      <CardSection title="Competitor moves" subtitle="Recent high-engagement posts by competitors">
                        <Stack gap="md">
                          {COMP_FEED.map((p, idx) => (
                            <Group key={idx} justify="space-between" align="center" className={classes.rowPad}>
                              <Group gap="sm" wrap="nowrap" align="center" className={classes.feedLeft}>
                                <Avatar size={22} radius="xl" className={classes.brandDot} />
                                <Text fw={700}>{p.who}</Text>
                                <Badge variant="light">{p.platform}</Badge>
                                <Text c="dimmed">—</Text>
                                <Text className={classes.linkText}>{p.title}</Text>
                              </Group>
                              <Badge variant="light">{fmtK(p.eng)} 👍</Badge>
                            </Group>
                          ))}
                        </Stack>
                      </CardSection>
                    </div>
                  </div>
                </Box>
              )}
            </Transition>
          </Box>

          <div className={classes.sideNav}>
            <Tooltip label="Previous">
              <ActionIcon
                variant="light"
                radius="xl"
                size="lg"
                onClick={() => go(page - 1)}
                disabled={page === 0}
                className={classes.navBtn}
              >
                <IconArrowUp size={18} />
              </ActionIcon>
            </Tooltip>

            <div className={classes.vDots}>
              <span className={`${classes.dot} ${page === 0 ? classes.dotActive : ""}`} />
              <span className={`${classes.dot} ${page === 1 ? classes.dotActive : ""}`} />
            </div>

            <Tooltip label="Next">
              <ActionIcon
                variant="light"
                radius="xl"
                size="lg"
                onClick={() => go(page + 1)}
                disabled={page === 1}
                className={classes.navBtn}
              >
                <IconArrowDown size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
