// client/src/pages/DashboardPage.jsx
import React from "react";
import {
  Card,
  Group,
  Stack,
  Title,
  Text,
  Badge,
  Box,
  List,
  ThemeIcon,
  Divider,
  Avatar,
  Space,
  rem,
} from "@mantine/core";
import {
  IconArrowUpRight,
  IconChartBar,
  IconHeart,
  IconShare3,
  IconMessageCircle2,
  IconBolt,
  IconCircleCheck,
} from "@tabler/icons-react";
import classes from "./DashboardPage.module.css";

/* ---------- Card shell (compact) ---------- */
function CardSection({ title, subtitle, right, children, className }) {
  return (
    <Card withBorder shadow="xs" radius="lg" className={`${classes.card} ${className || ""}`} p="sm">
      <Stack gap="xs">
        {(title || right || subtitle) && (
          <>
            <Group justify="space-between" align="start" className={classes.cardHeader}>
              <Stack gap={2}>
                {title && (
                  <Text className={classes.cardTitle} fw={700}>
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text size="xs" c="dimmed">
                    {subtitle}
                  </Text>
                )}
              </Stack>
              {right}
            </Group>
            <Divider className={classes.cardDivider} />
          </>
        )}
        {children}
      </Stack>
    </Card>
  );
}

/* ---------- Mini bars (no chart lib) ---------- */
function MiniBars({ data = [], max = 100, labels = [], barWidth = 14 }) {
  const m = max || Math.max(...data, 1);
  return (
    <Group align="end" justify="center" gap="md" wrap="nowrap" className={classes.barsWrap}>
      {data.map((v, i) => {
        const h = Math.max(10, Math.round((v / m) * 160));
        return (
          <Stack key={i} gap={4} align="center" className={classes.barItem}>
            <Box
              className={classes.bar}
              style={{ height: rem(h), width: rem(barWidth), borderRadius: rem(8) }}
            />
            {labels[i] && (
              <Text size="xs" c="dimmed">
                {labels[i]}
              </Text>
            )}
          </Stack>
        );
      })}
    </Group>
  );
}

/* ---------- KPI card ---------- */
function EngagementSummary() {
  return (
    <CardSection
      title="ENGAGEMENT SUMMARY"
      right={<IconChartBar className={classes.cardIcon} />}
      className={classes.kpiCard}
    >
      <div className={classes.centerBox}>
        <Group align="end" gap="xs">
          <Title order={1} className={classes.kpiValue}>
            18,920
          </Title>
          <Badge radius="sm" leftSection={<IconArrowUpRight size={14} />} className={classes.kpiDelta}>
            +14%
          </Badge>
        </Group>

        <Space h={8} />

        <Group gap="lg" wrap="nowrap" justify="center">
          <Group gap={6}>
            <IconHeart size={18} />
            <Text fw={700}>9,2 k</Text>
            <Text size="sm" c="dimmed">
              Likes
            </Text>
          </Group>
          <Group gap={6}>
            <IconShare3 size={18} />
            <Text fw={700}>5,1 k</Text>
            <Text size="sm" c="dimmed">
              Shares
            </Text>
          </Group>
          <Group gap={6}>
            <IconMessageCircle2 size={18} />
            <Text fw={700}>4,6 k</Text>
            <Text size="sm" c="dimmed">
              Com
            </Text>
          </Group>
        </Group>
      </div>
    </CardSection>
  );
}

/* ---------- Data ---------- */
const topPostsA = {
  title: "TOP PERFORMING POSTS",
  subtitle: "Chibitek",
  values: [56, 68, 82, 104, 120],
  labels: ["1", "2", "3", "4", "5"],
};
const topPostsB = {
  title: "TOP PERFORMING POSTS",
  subtitleLink: "Competitors",
  values: [40, 52, 65, 80, 92, 128],
  labels: ["1", "2", "3", "4", "5", "6"],
};
const trendingList = ["Some IT stuff", "More IT stuff", "Other stuff", "More stuff", "Marketing stuff", "Cool trend"];

/* ---------- Page ---------- */
export default function DashboardPage() {
  return (
    <div className={classes.grid}>
      {/* Row 1 */}
      <div className={classes.cell}>
        <EngagementSummary />
      </div>

      <div className={classes.cell}>
        <CardSection
          title={topPostsA.title}
          subtitle={
            <Group gap={6}>
              <Avatar size={18} radius="xl" className={classes.brandDot} />
              <Text size="sm" fw={700}>
                {topPostsA.subtitle}
              </Text>
            </Group>
          }
          className={classes.squareCard}
        >
          <div className={classes.centerBox}>
            <MiniBars data={topPostsA.values} labels={topPostsA.labels} />
          </div>
        </CardSection>
      </div>

      <aside className={`${classes.cell} ${classes.sidebar}`}>
        <CardSection title="TRENDING" className={classes.sidebarCard}>
          <div className={classes.centerBox}>
            <List spacing="xs" className={classes.listReset} listStyleType="none">
              {trendingList.map((t, i) => (
                <List.Item key={i}>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <ThemeIcon variant="light" radius="xl" size={22}>
                      <IconCircleCheck size={14} />
                    </ThemeIcon>
                    <Text fw={700}>{t}</Text>
                  </Group>
                </List.Item>
              ))}
            </List>
          </div>
        </CardSection>
      </aside>

      {/* Row 2 */}
      <div className={classes.cell}>
        <CardSection
          title={topPostsB.title}
          subtitle={
            <Text size="sm" className={classes.linkText}>
              {topPostsB.subtitleLink}
            </Text>
          }
          className={classes.squareCard}
        >
          <div className={classes.centerBox}>
            <MiniBars data={topPostsB.values} labels={topPostsB.labels} />
          </div>
        </CardSection>
      </div>

      <div className={classes.cell} aria-hidden />

      <div className={`${classes.cell} ${classes.sidebar}`}>
        <CardSection title="AI QUICK SUMMARY OF PERFORMANCE THIS WEEK" className={classes.sidebarCard}>
          <div className={classes.centerBox}>
            <Group gap="md" align="center" wrap="nowrap" justify="center">
              <ThemeIcon size={34} radius="lg" variant="light">
                <IconBolt size={18} />
              </ThemeIcon>
              <Stack gap={4} ta="center">
                <Text fw={800}>Engagement has increased by 14%</Text>
                <Text c="dimmed" size="sm">
                  compared to last week, with growth in likes.
                </Text>
              </Stack>
            </Group>
          </div>
        </CardSection>
      </div>
    </div>
  );
}
