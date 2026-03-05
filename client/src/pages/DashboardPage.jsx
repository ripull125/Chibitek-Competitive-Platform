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
  LoadingOverlay,
  MultiSelect,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  Transition,
  Select,
  Paper,
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
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { convertSavedPosts, analyzeUniversalPosts } from "./DataConverter";
import { apiUrl } from "../utils/api";
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
  const [keywords, setKeywords] = React.useState([]);
  const [currentUserId, setCurrentUserId] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (!currentUserId) {
      setKeywords([]);
      setLoading(false);
      return;
    }

    fetch(apiUrl(`/api/keywords?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((data) => {
        const kws = (data.keywords || []).sort((a, b) => (b.kpi || 0) - (a.kpi || 0)).slice(0, 3);
        setKeywords(kws);
      })
      .catch((error) => console.error("Error fetching keywords:", error))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  return (
    <div data-tour="dashboard-kpis">
      <CardSection title="Engagement snapshot" right={<IconBolt className={classes.cardIcon} />}>
        {!loading && keywords.length > 0 ? (
          <Stack gap="xs">
            {keywords.map((kw, idx) => (
              <Group key={idx} justify="space-between" align="center" style={{ paddingY: 4 }}>
                <Text fw={600} size="sm">{kw.term}</Text>
                <Group gap={6} wrap="nowrap">
                  <Badge size="xs" variant="light">KPI: {kw.kpi || 0}</Badge>
                  <Badge size="xs" variant="light" color="blue">{fmtK(kw.avgEngagement || 0)}</Badge>
                </Group>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">Loading keywords...</Text>
        )}
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
    <>
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
    </>
  );
}

function RecentPosts() {
  const [recentPosts, setRecentPosts] = React.useState([]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      let userId = null;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id || null;
      }
      if (!mounted) return;
      const storageKey = userId
        ? `recentCompetitorPosts_${userId}`
        : 'recentCompetitorPosts';
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const chartData = stored.map((post, index) => ({
        index: index + 1,
        engagement: post.engagement,
        username: post.username,
        content: post.content,
      }));
      setRecentPosts(chartData);
    };
    load();
    return () => { mounted = false; };
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

function ToneAnalysisCompact() {
  const [toneEngagementData, setToneEngagementData] = React.useState([]);
  const [convertedData, setConvertedData] = React.useState([]);
  const [analysisStarted, setAnalysisStarted] = React.useState(false);
  const [postLimit, setPostLimit] = React.useState("10");
  const [currentUserId, setCurrentUserId] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [filterUsername, setFilterUsername] = React.useState(null);
  const [filterPlatform, setFilterPlatform] = React.useState(null);
  const [filterTone, setFilterTone] = React.useState([]);
  const [rawPosts, setRawPosts] = React.useState([]);

  // Platform ID to name mapping
  const PLATFORM_MAP = {
    1: "X",
    3: "Instagram",
    4: "X",
    5: "TikTok",
    8: "YouTube",
    9: "LinkedIn",
    10: "Reddit",
  };

  const TONES = [
    'Professional', 'Promotional', 'Informative', 'Persuasive', 'Confident',
    'Approachable', 'Authoritative', 'Inspirational', 'Conversational', 'Assertive',
    'Casual', 'Customer-centric', 'Urgent', 'Optimistic', 'Polished'
  ];

  const PALETTE = [
    '#2f6fdb','#ff7a59','#51cf66','#ffd43b','#845ef7',
    '#20c997','#0ca678','#f783ac','#15aabf','#d9480f',
    '#868e96','#364fc7','#fa5252','#12b886','#495057'
  ];

  const TONE_COLOR = TONES.reduce((acc, t, i) => (acc[t] = PALETTE[i % PALETTE.length], acc), {});

  React.useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (!currentUserId) {
      setToneEngagementData([]);
      setLoading(false);
      setConvertedData([]);
      return;
    }

    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((data) => {
        const posts = data.posts || [];
        setRawPosts(posts);
        const converted = convertSavedPosts(posts);
        setConvertedData(converted);

        const chartData = converted.map((post, index) => {
          const rawPost = posts[index] || {};
          const platformId = rawPost.platform_id || 0;
          const platformName = PLATFORM_MAP[platformId] || "Unknown";
          const author = rawPost.author || rawPost.extra?.author_name || rawPost.username || "Unknown";
          
          return {
            index: index + 1,
            engagement: post.Engagement,
            source: post['Name/Source'],
            message: post.Message,
            tone: post.tone,
            platform: platformName,
            author: author,
          };
        });

        setToneEngagementData(chartData);
      })
      .catch((error) => console.error("Error fetching posts:", error))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  const handleAnalysis = async () => {
    setLoading(true);
    setAnalysisStarted(true);
    try {
      let displayPosts = convertedData.slice();
      const limit = Number(postLimit) || 0;
      if (limit > 0 && displayPosts.length > limit) {
        displayPosts = displayPosts.slice(-limit);
      }

      const missing = displayPosts.filter((p) => !p.tone);
      let analyzed = [];
      if (missing.length) {
        try {
          analyzed = await analyzeUniversalPosts(missing, currentUserId);
        } catch (err) {
          console.error('Tone analysis failed:', err);
        }
      }

      let aiIndex = 0;
      const merged = displayPosts.map((post) => {
        if (post.tone) return post;
        const result = analyzed[aiIndex++] || {};
        return { ...post, tone: result.tone || null };
      });

      if (analyzed.length) {
        const updateMap = new Map();
        merged.forEach((p) => {
          if (p.tone) {
            updateMap.set(`${p.Message}###${p.Engagement}`, p.tone);
          }
        });
        const updatedAll = convertedData.map((p) => {
          const key = `${p.Message}###${p.Engagement}`;
          if (!p.tone && updateMap.has(key)) {
            return { ...p, tone: updateMap.get(key) };
          }
          return p;
        });
        setConvertedData(updatedAll);
      }

      const chartData = merged.map((post, index) => {
        const rawPost = rawPosts[index] || {};
        const platformId = rawPost.platform_id || 0;
        const platformName = PLATFORM_MAP[platformId] || "Unknown";
        const author = rawPost.author || rawPost.extra?.author_name || rawPost.username || "Unknown";
        
        return {
          index: index + 1,
          engagement: post.Engagement,
          source: post['Name/Source'],
          message: post.Message,
          tone: post.tone || null,
          platform: platformName,
          author: author,
        };
      });
      setToneEngagementData(chartData);
    } finally {
      setLoading(false);
    }
  };

  // Get unique values for filters
  const uniqueUsernames = Array.from(new Set(toneEngagementData.map((p) => p.author))).sort();
  const uniquePlatforms = Array.from(new Set(toneEngagementData.map((p) => p.platform))).sort();
  const uniqueTones = Array.from(new Set(toneEngagementData.filter((p) => p.tone).map((p) => p.tone))).sort();

  // Filter data based on selected filters
  const filteredData = toneEngagementData.filter((post) => {
    if (filterUsername && filterUsername !== "" && post.author !== filterUsername) return false;
    if (filterPlatform && filterPlatform !== "" && post.platform !== filterPlatform) return false;
    if (filterTone.length > 0 && !filterTone.includes(post.tone)) return false;
    return true;
  });

  // Calculate linear regression trendline for a dataset
  const calculateTrendline = (data) => {
    if (data.length < 2) return [];
    
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    data.forEach((point) => {
      const x = point.index;
      const y = point.engagement;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Return trendline points for each data point
    return data.map((point) => ({
      index: point.index,
      trendline: slope * point.index + intercept,
    }));
  };

  return (
    <CardSection
      title="Tone Analysis"
      subtitle="Analyze saved posts for content tone"
    >
      <Stack gap="md">
        <Group gap="md" align="flex-end">
          <Button
            onClick={handleAnalysis}
            disabled={loading}
            size="sm"
          >
            {analysisStarted ? 'Re-run' : 'Analyze'}
          </Button>
        </Group>

        {toneEngagementData.length > 0 && (
          <Group grow>
            <Select
              label="Username"
              placeholder="All users"
              searchable
              clearable
              data={[
                { value: "", label: "All Users" },
                ...uniqueUsernames.map((u) => ({ value: u, label: u })),
              ]}
              value={filterUsername}
              onChange={setFilterUsername}
              size="xs"
            />
            <Select
              label="Platform"
              placeholder="All platforms"
              searchable
              clearable
              data={[
                { value: "", label: "All Platforms" },
                ...uniquePlatforms.map((p) => ({ value: p, label: p })),
              ]}
              value={filterPlatform}
              onChange={setFilterPlatform}
              size="xs"
            />
            <MultiSelect
              label="Tone"
              placeholder="All tones"
              searchable
              clearable
              data={uniqueTones}
              value={filterTone}
              onChange={setFilterTone}
              size="xs"
            />
          </Group>
        )}

        {toneEngagementData.length > 0 ? (
          <>
            <div className={classes.chartBox} style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" name="Post Index" />
                  <YAxis dataKey="engagement" name="Engagement" />
                  <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                  {TONES.map((tone) => {
                    const pts = filteredData.filter((d) => d.tone === tone);
                    if (!pts || !pts.length) return null;
                    const trendlineData = calculateTrendline(pts);
                    return (
                      <React.Fragment key={tone}>
                        <Scatter
                          name={tone}
                          data={pts}
                          dataKey="engagement"
                          fill={TONE_COLOR[tone]}
                        />
                        <Line
                          name={`${tone} Trend`}
                          data={trendlineData}
                          dataKey="trendline"
                          stroke={TONE_COLOR[tone]}
                          strokeWidth={2}
                          dot={false}
                          type="monotone"
                          isAnimationActive={false}
                          strokeOpacity={0.7}
                        />
                      </React.Fragment>
                    );
                  })}
                  {toneEngagementData.some((d) => !d.tone) && (
                    <Scatter
                      name="Unlabeled"
                      data={filteredData.filter((d) => !d.tone)}
                      dataKey="engagement"
                      fill="#adb5bd"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <Group grow>
              <div>
                <Text size="xs" c="dimmed">Total Posts</Text>
                <Text fw={700}>{filteredData.length}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Avg Engagement</Text>
                <Text fw={700}>{filteredData.length > 0 ? (filteredData.reduce((sum, p) => sum + p.engagement, 0) / filteredData.length).toFixed(0) : 0}</Text>
              </div>
            </Group>
          </>
        ) : (
          <Text size="sm" c="dimmed">No saved posts available</Text>
        )}
      </Stack>
    </CardSection>
  );
}

function SavedPostsList() {
  const [allPosts, setAllPosts] = React.useState([]);
  const [currentUserId, setCurrentUserId] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [filterUsername, setFilterUsername] = React.useState(null);
  const [filterPlatform, setFilterPlatform] = React.useState(null);
  const [sortBy, setSortBy] = React.useState("engagement");

  // Platform ID to name mapping
  const PLATFORM_MAP = {
    1: "X",
    3: "Instagram",
    4: "X",
    5: "TikTok",
    8: "YouTube",
    9: "LinkedIn",
    10: "Reddit",
  };

  React.useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (!currentUserId) {
      setAllPosts([]);
      setLoading(false);
      return;
    }

    fetch(apiUrl(`/api/posts?user_id=${encodeURIComponent(currentUserId)}`))
      .then((r) => r.json())
      .then((data) => {
        const posts = data.posts || [];
        // Keep all posts with full metrics for flexible sorting
        const allPostsData = posts.map((post, idx) => {
            const platformId = post.platform_id || 0;
            const platformName = PLATFORM_MAP[platformId] || "Unknown";
            const author = post.author || post.extra?.author_name || post.username || "Unknown";
            const likes = post.likes || 0;
            const shares = post.shares || post.retweets || 0;
            const comments = post.comments || post.replies || 0;
            const views = post.views || 0;
            
            return {
              id: idx,
              author: author,
              platform: platformName,
              message: post.content?.substring(0, 50) + (post.content?.length > 50 ? '...' : ''),
              likes: likes,
              shares: shares,
              comments: comments,
              views: views,
              engagement: likes + shares + comments + (views > 0 ? Math.round(views / 10) : 0),
            };
          });
        setAllPosts(allPostsData);
      })
      .catch((error) => console.error("Error fetching posts:", error))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  // Calculate metric value for sorting
  const getMetricValue = (post, metric) => {
    switch (metric) {
      case "likes":
        return post.likes;
      case "shares":
        return post.shares;
      case "comments":
        return post.comments;
      case "views":
        return post.views;
      case "engagement":
      default:
        return post.engagement;
    }
  };

  // Get unique usernames and platforms for filters
  const uniqueUsernames = Array.from(new Set(allPosts.map((p) => p.author))).sort();
  const uniquePlatforms = Array.from(new Set(allPosts.map((p) => p.platform))).sort();

  // Filter posts based on selected filters and sort by metric
  const filteredPosts = allPosts
    .filter((post) => {
      if (filterUsername && filterUsername !== "" && post.author !== filterUsername) return false;
      if (filterPlatform && filterPlatform !== "" && post.platform !== filterPlatform) return false;
      return true;
    })
    .sort((a, b) => getMetricValue(b, sortBy) - getMetricValue(a, sortBy))
    .slice(0, 5); // Show top 5 filtered posts

  return (
    <CardSection title="Top Saved Posts" subtitle="By engagement">
      <Stack gap="md">
        {/* Filters and Sort */}
        <Group grow>
          <Select
            label="Username"
            placeholder="All users"
            searchable
            clearable
            data={[
              { value: "", label: "All Users" },
              ...uniqueUsernames.map((u) => ({ value: u, label: u })),
            ]}
            value={filterUsername}
            onChange={setFilterUsername}
            size="xs"
          />
          <Select
            label="Platform"
            placeholder="All platforms"
            searchable
            clearable
            data={[
              { value: "", label: "All Platforms" },
              ...uniquePlatforms.map((p) => ({ value: p, label: p })),
            ]}
            value={filterPlatform}
            onChange={setFilterPlatform}
            size="xs"
          />
          <Select
            label="Sort by"
            placeholder="Engagement"
            data={[
              { value: "engagement", label: "Engagement (Overall)" },
              { value: "likes", label: "Likes" },
              { value: "shares", label: "Shares/Retweets" },
              { value: "comments", label: "Comments/Replies" },
              { value: "views", label: "Views" },
            ]}
            value={sortBy}
            onChange={(val) => setSortBy(val || "engagement")}
            size="xs"
          />
        </Group>

        {/* Posts List */}
        {filteredPosts.length > 0 ? (
          <Stack gap="xs">
            {filteredPosts.map((post) => (
              <Group key={post.id} justify="space-between" align="flex-start" style={{ paddingY: 4 }}>
                <Stack gap={1} style={{ flex: 1 }}>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light">{post.platform}</Badge>
                    <Text size="xs" c="dimmed">{post.author}</Text>
                  </Group>
                  <Text size="sm" fw={500} lineClamp={1} fs={!post.message ? "italic" : "normal"} c={!post.message ? "dimmed" : "inherit"}>{post.message || "no message"}</Text>
                </Stack>
                <Badge variant="light">{fmtK(getMetricValue(post, sortBy))}</Badge>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">No saved posts match your filters</Text>
        )}
      </Stack>
    </CardSection>
  );
}



function MainDashboard() {
  return (
    <div style={{ position: "relative" }}>
      <Stack gap="md">
        {/* Engagement snapshot with Top Keywords */}
        <KPIStrip />

        {/* Two column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <SavedPostsList />
          <ToneAnalysisCompact />
        </div>
      </Stack>
    </div>
  );
}

/* ---------- Page ---------- */
export default function DashboardPage() {
  const [page, setPage] = React.useState(0);
  const [dir, setDir] = React.useState(1);

  const go = React.useCallback((next) => {
    setPage((prev) => {
      const clamped = Math.max(0, Math.min(2, next));
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
                  <div style={{ height: "100%", padding: 16, overflow: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 32 }}>
                    <div style={{ width: "min(1200px, 96%)" }}>
                      <MainDashboard />
                    </div>
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
                  <div className={classes.grid}>
                    <div className={`${classes.col} ${classes.span12}`}><KPIStrip /></div>
                    <div className={`${classes.col} ${classes.span5}`}><OpportunityAlerts /></div>
                    <div className={`${classes.col} ${classes.span7}`}><EffectivenessScatter /></div>
                  </div>
                </Box>
              )}
            </Transition>

            <Transition
              mounted={page === 2}
              transition={dir === 1 ? "slide-up" : "slide-down"}
              duration={260}
              timingFunction="ease"
            >
              {(styles) => (
                <Box style={styles} className={classes.slide}>
                  {/* CENTERED SLIDE 3 CONTENT */}
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
              <span className={`${classes.dot} ${page === 2 ? classes.dotActive : ""}`} />
            </div>

            <Tooltip label="Next">
              <ActionIcon
                variant="light"
                radius="xl"
                size="lg"
                onClick={() => go(page + 1)}
                disabled={page === 2}
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
