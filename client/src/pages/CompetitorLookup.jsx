import React, { useEffect, useMemo, useState } from "react";

import {
  ActionIcon,
  Alert,
  AspectRatio,
  Avatar,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  LoadingOverlay,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  Tabs,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconBrandX,
  IconBrandYoutube,
  IconBrandLinkedin,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandReddit,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconHeart,
  IconInfoCircle,
  IconMessage,
  IconRepeat,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { getConnectedPlatforms } from "../utils/connectedPlatforms";
import { Checkbox, Transition } from "@mantine/core";
import { useTranslation } from "react-i18next";

function LabelWithInfo({ label, info }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Text size="sm">{label}</Text>
      <Tooltip label={info} multiline w={260} withArrow>
        <ActionIcon variant="subtle" size="xs" color="gray" radius="xl">
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function ExpandableText({ text, size = "sm", dimmed = false, collapsedLines = 3, threshold = 180 }) {
  const { t } = useTranslation();
  const value = String(text || "");
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > threshold;

  if (!value) return null;

  return (
    <Stack gap={4}>
      <Text
        size={size}
        c={dimmed ? "dimmed" : undefined}
        lineClamp={!expanded && isLong ? collapsedLines : undefined}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {value}
      </Text>

      {isLong && (
        <Button
          type="button"
          variant="subtle"
          size="compact-sm"
          px={0}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          style={{ alignSelf: "flex-start" }}
        >
          {expanded ? t("common.less") : t("common.more")}
        </Button>
      )}
    </Stack>
  );
}

function isHiddenCount(value) {
  return Number(value) === -1;
}

function shortCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function formatCount(value) {
  return isHiddenCount(value) ? "Hidden" : shortCount(value);
}

function HiddenCountNote({ likes, comments }) {
  const { t } = useTranslation();
  const likesHidden = isHiddenCount(likes);
  const commentsHidden = isHiddenCount(comments);
  if (!likesHidden && !commentsHidden) return null;

  const hiddenLabel = likesHidden && commentsHidden
    ? t("competitorLookup.likesAndComments")
    : likesHidden
      ? t("competitorLookup.likes")
      : t("competitorLookup.comments");

  return (
    <Text size="xs" c="dimmed">
      {t("competitorLookup.hiddenByCreator", { label: hiddenLabel })}
    </Text>
  );
}

const DEFAULT_SORT_MODE = "date_desc";
const SORT_OPTIONS = [
  { value: "date_desc", labelKey: "common.newestFirst" },
  { value: "date_asc", labelKey: "common.oldestFirst" },
  { value: "metrics_desc", labelKey: "common.highestTotalMetrics" },
  { value: "likes_desc", labelKey: "common.mostLikes" },
  { value: "comments_desc", labelKey: "common.mostComments" },
  { value: "shares_desc", labelKey: "common.mostShares" },
];

function parseMetricValue(value) {
  if (value == null || value === "" || isHiddenCount(value)) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return 0;
  const match = text.match(/^(-?[0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }
  const base = Number(match[1]);
  const suffix = String(match[2] || "").toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Number.isFinite(base) ? Math.max(0, Math.round(base * multiplier)) : 0;
}

function firstMetric(...values) {
  for (const value of values) {
    if (value == null || value === "" || isHiddenCount(value)) continue;
    const parsed = parseMetricValue(value);
    if (parsed !== 0) return parsed;
    const numericZero = Number(value) === 0 || String(value).trim() === "0";
    if (numericZero) return 0;
  }
  return 0;
}

function getSortableLikes(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || {};
  const metrics = post.public_metrics || post.metrics || {};
  return firstMetric(
    post.likes,
    post.likeCount,
    post.like_count,
    post.likesCount,
    post.reactionCount,
    post.reactions_count,
    post.score,
    post.ups,
    stats.likes,
    stats.likeCount,
    stats.like_count,
    stats.diggCount,
    stats.digg_count,
    statisticsValue(stats, "like"),
    metrics.like_count,
    metrics.likes
  );
}

function statisticsValue(stats = {}, prefix) {
  if (!stats || typeof stats !== "object") return undefined;
  if (prefix === "like") return stats.digg_count ?? stats.diggCount ?? stats.like_count ?? stats.likeCount ?? stats.likes;
  if (prefix === "comment") return stats.comment_count ?? stats.commentCount ?? stats.comments;
  if (prefix === "share") return stats.share_count ?? stats.shareCount ?? stats.forward_count ?? stats.share_count_total ?? stats.shares;
  return undefined;
}

function getSortableComments(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || {};
  const metrics = post.public_metrics || post.metrics || {};
  return firstMetric(
    post.comments,
    post.commentCount,
    post.comment_count,
    post.commentsCount,
    post.num_comments,
    post.replyCount,
    post.reply_count,
    stats.comments,
    stats.commentCount,
    stats.comment_count,
    statisticsValue(stats, "comment"),
    metrics.reply_count,
    metrics.comment_count,
    metrics.comments
  );
}

function getSortableShares(post = {}) {
  const stats = post.stats || post.statsV2 || post.statistics || post.stats_v2 || {};
  const metrics = post.public_metrics || post.metrics || {};
  return firstMetric(
    post.shares,
    post.shareCount,
    post.share_count,
    post.retweetCount,
    post.retweet_count,
    post.reposts,
    stats.shares,
    stats.shareCount,
    stats.share_count,
    stats.forward_count,
    statisticsValue(stats, "share"),
    metrics.retweet_count,
    metrics.share_count,
    metrics.shares
  );
}

function getSortableTotalMetrics(post = {}) {
  return getSortableLikes(post) + getSortableComments(post) + getSortableShares(post);
}

function getSortableDate(post = {}) {
  const raw =
    post.published_at ??
    post.publishedAt ??
    post.datePublished ??
    post.created_at ??
    post.createdAt ??
    post.created_utc ??
    post.created ??
    post.createdTime ??
    post.createTime ??
    post.create_time ??
    post.publishTime ??
    post.timestamp ??
    post.taken_at ??
    post.taken_at_timestamp;

  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortPostsForDisplay(posts = [], sortMode = DEFAULT_SORT_MODE) {
  if (!Array.isArray(posts)) return [];
  const mode = sortMode || DEFAULT_SORT_MODE;
  const decorated = posts.map((post, index) => ({ post, index }));

  decorated.sort((a, b) => {
    let diff = 0;
    if (mode === "date_asc") diff = getSortableDate(a.post) - getSortableDate(b.post);
    else if (mode === "metrics_desc") diff = getSortableTotalMetrics(b.post) - getSortableTotalMetrics(a.post);
    else if (mode === "likes_desc") diff = getSortableLikes(b.post) - getSortableLikes(a.post);
    else if (mode === "comments_desc") diff = getSortableComments(b.post) - getSortableComments(a.post);
    else if (mode === "shares_desc") diff = getSortableShares(b.post) - getSortableShares(a.post);
    else diff = getSortableDate(b.post) - getSortableDate(a.post);

    return diff || a.index - b.index;
  });

  return decorated.map(({ post }) => post);
}

function SortSelect({ value, onChange, compact = false }) {
  const { t } = useTranslation();
  const options = SORT_OPTIONS.map((option) => ({ ...option, label: t(option.labelKey) }));
  return (
    <Select
      label={compact ? undefined : t("common.sortPosts")}
      aria-label={t("common.sortPosts")}
      size="xs"
      value={value}
      onChange={(next) => onChange(next || DEFAULT_SORT_MODE)}
      data={options}
      checkIconPosition="right"
      allowDeselect={false}
      w={compact ? 190 : 210}
    />
  );
}

/* ─── LinkedIn Results Display ───────────────────────────────────────────── */

function isAlreadySavedResult(result) {
  return result?.already_saved === true || result?.code === "already_saved";
}

function SaveButton({ label, onSave }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'already_saved' | 'error'
  const isDone = status === "saved" || status === "already_saved";

  return (
    <Button
      size="xs"
      variant={status === "already_saved" ? "default" : "light"}
      loading={status === "saving"}
      color={status === "saved" ? "green" : status === "error" ? "red" : "blue"}
      disabled={isDone}
      onClick={async () => {
        setStatus("saving");
        try {
          const result = await onSave();
          setStatus(isAlreadySavedResult(result) ? "already_saved" : "saved");
        } catch (err) {
          console.error("[SaveButton] Save failed:", err);
          setStatus("error");
        }
      }}
    >
      {status === "saved"
        ? t("competitorLookup.saved")
        : status === "already_saved"
          ? "Saved already"
          : status === "error"
            ? t("competitorLookup.retry")
            : label || t("competitorLookup.save")}
    </Button>
  );
}

function SaveAllButton({ items, onSave, saveFn, type = "post", label }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'already_saved' | 'mixed' | 'error'
  const [progress, setProgress] = useState({ done: 0, total: 0, saved: 0, already: 0, failed: 0 });

  if (!items?.length || items.length <= 1) return null;

  const isDone = ["saved", "already_saved", "mixed"].includes(status);

  return (
    <Button
      size="xs"
      variant={status === "already_saved" ? "default" : "filled"}
      loading={status === "saving"}
      color={status === "saved" || status === "mixed" ? "green" : status === "error" ? "orange" : "blue"}
      disabled={isDone}
      onClick={async () => {
        setStatus("saving");
        setProgress({ done: 0, total: items.length, saved: 0, already: 0, failed: 0 });
        let saved = 0;
        let already = 0;
        let failed = 0;
        for (let i = 0; i < items.length; i++) {
          try {
            const result = saveFn ? await saveFn(items[i]) : await onSave(type, items[i]);
            if (isAlreadySavedResult(result)) already++;
            else saved++;
          } catch (err) {
            console.error(`[SaveAll] Item ${i} failed:`, err);
            failed++;
          }
          setProgress({ done: i + 1, total: items.length, saved, already, failed });
        }

        if (failed === items.length) setStatus("error");
        else if (already === items.length) setStatus("already_saved");
        else if (saved > 0 && already > 0) setStatus("mixed");
        else setStatus("saved");
      }}
    >
      {status === "saving"
        ? t("competitorLookup.savingProgress", { done: progress.done, total: progress.total })
        : status === "already_saved"
          ? "All saved already"
          : status === "mixed"
            ? `${progress.saved} saved, ${progress.already} already saved`
            : status === "saved"
              ? t("competitorLookup.savedAll", { failed: progress.failed })
              : status === "error"
                ? t("competitorLookup.allFailedRetry")
                : label || t("competitorLookup.saveAllCount", { count: items.length })}
    </Button>
  );
}

function LinkedinProfileCard({ profile, onSave }) {
  const { t } = useTranslation();
  if (!profile) return null;
  const posts = profile.activity || profile.recentPosts || [];
  const articles = profile.articles || [];
  const recommendations = profile.recommendations || [];
  const projects = profile.projects || [];
  const publications = profile.publications || [];

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="start">
          <Group align="center" gap="md">
            <div>
              <Text fw={700} size="xl">{profile.name}</Text>
              {profile.location && <Text size="sm" c="dimmed">{profile.location}</Text>}
            </div>
          </Group>
          <Badge color="blue" variant="light" size="lg">
            <IconBrandLinkedin size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.profile")}
          </Badge>
        </Group>

        {/* Key Metrics */}
        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            {profile.followers != null && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{Number(profile.followers).toLocaleString()}</Text>
                <Text size="xs" c="dimmed">{t("competitorLookup.followers")}</Text>
              </div>
            )}
            {profile.connections && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{profile.connections}</Text>
                <Text size="xs" c="dimmed">{t("competitorLookup.connections")}</Text>
              </div>
            )}
            {posts.length > 0 && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{posts.length}</Text>
                <Text size="xs" c="dimmed">{t("competitorLookup.recentPosts")}</Text>
              </div>
            )}
            {articles.length > 0 && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{articles.length}</Text>
                <Text size="xs" c="dimmed">{t("competitorLookup.articles")}</Text>
              </div>
            )}
          </Group>
        </Card>

        {/* About */}
        {profile.about && (
          <div>
            <Text fw={600} size="sm" mb={4}>{t("competitorLookup.about")}</Text>
            <ScrollArea h={profile.about.length > 300 ? 150 : undefined}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{profile.about}</Text>
            </ScrollArea>
          </div>
        )}

        {/* Experience */}
        {profile.experience?.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.experience")} my="xs" />
            <Stack gap="sm">
              {profile.experience.slice(0, 5).map((exp, i) => {
                // Detect encoded/redacted text (mostly non-ASCII characters)
                const isEncoded = (s) => {
                  if (!s) return true;
                  const ascii = s.replace(/[^\x20-\x7E]/g, '');
                  return ascii.length < s.length * 0.3; // less than 30% readable
                };
                const companyName = isEncoded(exp.name) ? null : exp.name;
                const title = exp.member?.title && !isEncoded(exp.member.title) ? exp.member.title : null;
                const description = exp.member?.description && !isEncoded(exp.member.description) ? exp.member.description : null;
                const dateRange = [exp.member?.startDate, exp.member?.endDate || t("competitorLookup.present")].filter(Boolean).join(' – ');
                const location = exp.location && !isEncoded(exp.location) ? exp.location : null;

                // Skip entries where everything is encoded
                if (!companyName && !title && !description) return null;

                return (
                  <Card key={i} withBorder radius="sm" p="sm">
                    <Group gap="xs" wrap="nowrap" align="start">
                      <div style={{ flex: 1 }}>
                        {title && <Text size="sm" fw={600}>{title}</Text>}
                        {companyName && (
                          <Text size="xs" c={title ? "dimmed" : undefined} fw={title ? undefined : 600}>
                            {companyName}
                          </Text>
                        )}
                        {dateRange && <Text size="xs" c="dimmed">{dateRange}</Text>}
                        {location && <Text size="xs" c="dimmed">{location}</Text>}
                        {description && (
                          <Text size="xs" c="dimmed" mt={4} lineClamp={2}>{description}</Text>
                        )}
                      </div>
                      {exp.url && companyName && (
                        <Text size="xs" c="blue" component="a" href={exp.url} target="_blank">{companyName}</Text>
                      )}
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          </div>
        )}

        {/* Education */}
        {profile.education?.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.education")} my="xs" />
            <Stack gap="sm">
              {profile.education.map((ed, i) => (
                <Group key={i} gap="xs" justify="space-between">
                  <Group gap="xs">
                    <Text size="sm" fw={500}>{ed.name}</Text>
                    {ed.url && (
                      <Text size="xs" c="blue" component="a" href={ed.url} target="_blank">{t("competitorLookup.view")}</Text>
                    )}
                  </Group>
                  {ed.member?.startDate && (
                    <Badge size="sm" variant="light" color="gray">
                      {ed.member.startDate}–{ed.member.endDate || t("competitorLookup.present")}
                    </Badge>
                  )}
                </Group>
              ))}
            </Stack>
          </div>
        )}

        {/* Articles */}
        {articles.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.articles")} my="xs" />
            <Stack gap="sm">
              {articles.slice(0, 5).map((a, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" wrap="nowrap" align="start">
                    <div style={{ flex: 1 }}>
                      <Text size="sm" fw={500} lineClamp={1}>{a.headline}</Text>
                      <Group gap="xs" mt={2}>
                        {a.datePublished && (
                          <Text size="xs" c="dimmed">{new Date(a.datePublished).toLocaleDateString()}</Text>
                        )}
                      </Group>
                    </div>
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {/* Publications */}
        {publications.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.publications")} my="xs" />
            <Stack gap="xs">
              {publications.slice(0, 5).map((pub, i) => (
                <Group key={i} gap="xs">
                  <Text size="sm">{pub.name}</Text>
                  {pub.url && (
                    <Text size="xs" c="blue" component="a" href={pub.url} target="_blank">{t("competitorLookup.link")}</Text>
                  )}
                </Group>
              ))}
            </Stack>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.projects")} my="xs" />
            <Stack gap="sm">
              {projects.slice(0, 5).map((proj, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="xs" justify="space-between">
                    <Text size="sm" fw={500}>{proj.name}</Text>
                    {proj.dateRange && <Badge size="xs" variant="light" color="gray">{proj.dateRange}</Badge>}
                  </Group>
                  {proj.description && <Text size="xs" mt={4} lineClamp={2}>{proj.description}</Text>}
                  {proj.contributors?.length > 0 && (
                    <Group gap={4} mt={4}>
                      {proj.contributors.map((c, j) => (
                        <Tooltip key={j} label={c.name} withArrow>
                          <Badge size="xs" variant="light">{c.name?.charAt(0)}</Badge>
                        </Tooltip>
                      ))}
                    </Group>
                  )}
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div>
            <Divider label={t("competitorLookup.recommendations")} my="xs" />
            <Stack gap="sm">
              {recommendations.slice(0, 3).map((rec, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" mb={4}>
                    <Text size="sm" fw={500}>{rec.name}</Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={3} style={{ fontStyle: "italic" }}>{rec.text}</Text>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {/* Recent Activity */}
        {posts.length > 0 && (
          <div>
            <Group justify="space-between" align="center" my="xs">
              <Divider label={t("competitorLookup.recentActivity")} style={{ flex: 1 }} />
              {posts.length > 1 && (
                <SaveAllButton items={posts.slice(0, 10)} onSave={(_type, p) => onSave("activity", { text: p.title || p.text || "", url: p.link || "", activityType: p.activityType, profileName: profile.name })} type="activity" />
              )}
            </Group>
            <Stack gap="sm">
              {posts.slice(0, 10).map((p, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" wrap="nowrap" align="start">
                    <div style={{ flex: 1 }}>
                      <Text size="sm" lineClamp={2}>{p.title || p.text || "—"}</Text>
                      <Group gap="xs" mt={4}>
                        {p.activityType && <Badge size="xs" variant="light" color="gray">{p.activityType}</Badge>}
                        {p.link && (
                          <Text size="xs" c="blue" component="a" href={p.link} target="_blank">{t("competitorLookup.viewArrow")}</Text>
                        )}
                      </Group>
                    </div>
                    <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("activity", { text: p.title || p.text || "", url: p.link || "", activityType: p.activityType, profileName: profile.name })} />
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function LinkedinCompanyCard({ company, onSave }) {
  const { t } = useTranslation();
  if (!company) return null;
  const posts = company.posts || [];

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="start">
          <Group align="center" gap="md">
            <div>
              <Text fw={700} size="lg">{company.name}</Text>
              {company.slogan && <Text size="sm" c="dimmed">{company.slogan}</Text>}
            </div>
          </Group>
          <Badge color="blue" variant="light">
            <IconBrandLinkedin size={12} style={{ marginRight: 4 }} /> {t("competitorLookup.company")}
          </Badge>
        </Group>

        <Group gap="lg" wrap="wrap">
          {company.employeeCount != null && (
            <div>
              <Text fw={600} size="lg">{Number(company.employeeCount).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.employees")}</Text>
            </div>
          )}
          {company.size && (
            <div>
              <Text fw={600} size="lg">{company.size}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.companySize")}</Text>
            </div>
          )}
          {company.founded && (
            <div>
              <Text fw={600} size="lg">{company.founded}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.founded")}</Text>
            </div>
          )}
        </Group>

        <Group gap="xs" wrap="wrap">
          {company.industry && <Badge variant="light">{company.industry}</Badge>}
          {company.type && <Badge variant="light" color="gray">{company.type}</Badge>}
          {company.headquarters && <Badge variant="light" color="gray">{company.headquarters}</Badge>}
        </Group>

        {company.description && (
          <div>
            <Text fw={500} size="sm" mb={4}>{t("competitorLookup.about")}</Text>
            <Text size="sm" lineClamp={6} style={{ whiteSpace: "pre-wrap" }}>{company.description}</Text>
          </div>
        )}

        {company.website && (
          <Text size="sm">
            <Text fw={500} span>{t("competitorLookup.websiteLabel")} </Text>
            <Text c="blue" component="a" href={company.website} target="_blank" span>
              {company.website}
            </Text>
          </Text>
        )}

        {company.specialties?.length > 0 && (
          <div>
            <Text fw={500} size="sm" mb={4}>{t("competitorLookup.specialties")}</Text>
            <Group gap={6} wrap="wrap">
              {company.specialties.map((s, i) => (
                <Badge key={i} size="sm" variant="outline" color="gray">{s}</Badge>
              ))}
            </Group>
          </div>
        )}

        {company.funding && (
          <div>
            <Text fw={500} size="sm" mb={4}>{t("competitorLookup.funding")}</Text>
            <Group gap="xs">
              <Text size="sm">{t("competitorLookup.roundsLabel")} {company.funding.numberOfRounds}</Text>
              {company.funding.lastRound && (
                <Badge variant="light" color="green">
                  {company.funding.lastRound.type} – {company.funding.lastRound.amount}
                </Badge>
              )}
            </Group>
          </div>
        )}

        {posts.length > 0 && (
          <div>
            <Group justify="space-between" align="center" my="xs">
              <Divider label={t("competitorLookup.recentPosts")} style={{ flex: 1 }} />
              {posts.length > 1 && (
                <SaveAllButton items={posts.slice(0, 10)} onSave={(_type, p) => onSave("companyPost", { text: p.text || "", datePublished: p.datePublished, url: p.url, companyName: company.name })} type="companyPost" />
              )}
            </Group>
            <Stack gap="sm">
              {posts.slice(0, 10).map((p, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Text size="sm" lineClamp={4} style={{ whiteSpace: "pre-wrap" }}>{p.text || "—"}</Text>
                  <Group gap="xs" mt={4} justify="space-between">
                    <Group gap="xs">
                      {p.datePublished && (
                        <Text size="xs" c="dimmed">{new Date(p.datePublished).toLocaleDateString()}</Text>
                      )}
                      {p.url && (
                        <Text size="xs" c="blue" component="a" href={p.url} target="_blank">
                          {t("competitorLookup.viewArrow")}
                        </Text>
                      )}
                    </Group>
                    <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("companyPost", { text: p.text || "", datePublished: p.datePublished, url: p.url, companyName: company.name })} />
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </Card>
  );
}

function LinkedinPostCard({ post, onSave }) {
  const { t } = useTranslation();
  if (!post) return null;

  // Decode HTML entities that Scrape Creators sometimes returns (e.g. &#39; &amp;)
  const decode = (str) => {
    if (!str) return str;
    const el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  };

  const title = decode(post.name || post.title || "");
  const headline = decode(post.headline);
  const content = decode(post.description || post.text || "");
  const authorName = post.author?.name || post.author;
  const authorFollowers = post.author?.followers;
  const thumb = post.thumbnailUrl;
  const likes = post.likeCount || 0;
  const comments = post.commentCount || 0;
  const moreArticles = post.moreArticles || [];

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="start">
          <div style={{ flex: 1 }}>
            {title && (
              <Text fw={700} size="lg" lineClamp={2}>{title}</Text>
            )}
            {headline && headline !== title && (
              <Text size="sm" c="dimmed" mt={title ? 4 : 0} lineClamp={2}>{headline}</Text>
            )}
          </div>
          <Group gap="xs">
            <Badge color="blue" variant="light" size="lg">
              <IconBrandLinkedin size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.post")}
            </Badge>
            <SaveButton label={t("competitorLookup.savePost")} onSave={() => onSave("post", post)} />
          </Group>
        </Group>

        {/* Author */}
        {authorName && (
          <Group gap="sm">
            {typeof authorName === "string" && (
              <Group gap="xs">
                <IconUser size={16} />
                <Text size="sm" fw={500}>{decode(authorName)}</Text>
              </Group>
            )}
            {authorFollowers != null && (
              <Badge size="sm" variant="light" color="gray">
                {t("competitorLookup.followersCount", { count: Number(authorFollowers).toLocaleString() })}
              </Badge>
            )}
          </Group>
        )}

        {/* Metrics */}
        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{likes.toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.likes")}</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{comments.toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.comments")}</Text>
            </div>
            {post.datePublished && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="md" c="blue">
                  {new Date(post.datePublished).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
                <Text size="xs" c="dimmed">{t("competitorLookup.published")}</Text>
              </div>
            )}
          </Group>
        </Card>

        {/* Thumbnail + Content */}
        {content && (
          <div>
            <Text fw={600} size="sm" mb={4}>{t("competitorLookup.content")}</Text>
            <ScrollArea h={content.length > 400 ? 180 : undefined}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{content}</Text>
            </ScrollArea>
          </div>
        )}

        {/* More Articles */}
        {moreArticles.length > 0 && (
          <div>
            <Group justify="space-between" align="center" my="xs">
              <Divider label={t("competitorLookup.relatedArticles")} style={{ flex: 1 }} />
              {moreArticles.length > 1 && (
                <SaveAllButton items={moreArticles.slice(0, 5)} onSave={(_type, a) => onSave("article", { headline: decode(a.headline || a.name), author: a.author, url: a.url })} type="article" />
              )}
            </Group>
            <Stack gap="xs">
              {moreArticles.slice(0, 5).map((a, i) => (
                <Group key={i} gap="sm" wrap="nowrap">
                  <div style={{ flex: 1 }}>
                    <Text size="sm" lineClamp={1} fw={500}>{decode(a.headline || a.name)}</Text>
                    {a.author && <Text size="xs" c="dimmed">{a.author}</Text>}
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    {a.url && (
                      <Text size="xs" c="blue" component="a" href={a.url} target="_blank">{t("competitorLookup.view")}</Text>
                    )}
                    <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("article", { headline: decode(a.headline || a.name), author: a.author, url: a.url })} />
                  </Group>
                </Group>
              ))}
            </Stack>
          </div>
        )}

        {/* Link */}
        {post.url && (
          <Group justify="flex-end">
            <Text size="sm" c="blue" component="a" href={post.url} target="_blank" fw={500}>
              {t("competitorLookup.viewOnLinkedinArrow")}
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

/* ─── X / Twitter Result Components ──────────────────────────────────────── */

function bestVideoVariant(mediaOrVariants = []) {
  const media = Array.isArray(mediaOrVariants) ? {} : (mediaOrVariants || {});
  const variants = Array.isArray(mediaOrVariants)
    ? mediaOrVariants
    : [
        ...(Array.isArray(media.variants) ? media.variants : []),
        ...(Array.isArray(media.video_info?.variants) ? media.video_info.variants : []),
        ...(Array.isArray(media.videoInfo?.variants) ? media.videoInfo.variants : []),
        ...(Array.isArray(media.video?.variants) ? media.video.variants : []),
      ];

  const directCandidates = Array.isArray(mediaOrVariants)
    ? []
    : [
        media.video_url,
        media.videoUrl,
        media.playback_url,
        media.playbackUrl,
        media.source_url,
        media.sourceUrl,
        media.video?.url,
        media.video?.src,
      ];

  const normalized = [
    ...variants,
    ...directCandidates.filter(Boolean).map((url) => ({ url })),
  ]
    .filter((v) => v?.url)
    .map((v) => ({
      ...v,
      _contentType: String(v.content_type || v.contentType || v.mime_type || v.mimeType || v.type || "").toLowerCase(),
      _url: String(v.url || ""),
    }));

  const mp4s = normalized
    .filter((v) => v._contentType.includes("mp4") || /\.mp4(?:\?|$)/i.test(v._url))
    .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));

  const hls = normalized.find((v) => v._contentType.includes("mpegurl") || /\.m3u8(?:\?|$)/i.test(v._url));

  return mp4s[0]?.url || hls?.url || null;
}

function normalizeMediaUrlKey(url) {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("format");
    parsed.searchParams.delete("name");
    parsed.searchParams.delete("tag");
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(url).split("?")[0].toLowerCase();
  }
}

function mediaQualityScore(item = {}) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  const url = String(item.url || item.preview_image_url || "");
  let score = width * height;
  if (/name=(orig|4096x4096|large)/i.test(url)) score += 1_000_000;
  if (item.type === "video" || item.type === "animated_gif") score += 500_000;
  return score;
}

function dedupeMediaForDisplay(media = []) {
  const byKey = new Map();

  for (const item of Array.isArray(media) ? media : []) {
    if (!item) continue;
    const urlKey = normalizeMediaUrlKey(item.url || item.preview_image_url);
    const key = item.media_key || urlKey;
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing || mediaQualityScore(item) > mediaQualityScore(existing)) {
      byKey.set(key, item);
    }
  }

  const values = Array.from(byKey.values());
  const looksLikeCardPreviewSet =
    values.length > 1 &&
    values.every((item) => {
      const url = String(item.url || item.preview_image_url || "");
      const key = String(item.media_key || "");
      return /card_img|card-image|thumbnail_image|player_image|summary/i.test(url + " " + key);
    });

  if (looksLikeCardPreviewSet) {
    return values.sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a)).slice(0, 1);
  }

  return values.slice(0, 4);
}

function cleanDisplayTextForMedia(text = "", mediaItems = []) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (!mediaItems?.length) return raw;

  return raw
    .replace(/(?:\s|^)https?:\/\/t\.co\/[A-Za-z0-9_]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function XMediaPreview({ media, postUrl = null }) {
  const items = dedupeMediaForDisplay(media);
  if (!items.length) return null;

  return (
    <div style={{ maxWidth: items.length === 1 ? 520 : 680 }}>
      <SimpleGrid cols={items.length === 1 ? 1 : 2} spacing="xs">
        {items.map((item, index) => {
          const key = item.media_key || item.url || item.preview_image_url || index;
          const isVideo = item.type === "video" || item.type === "animated_gif" || Boolean(item.video_url || item.videoUrl);
          const videoUrl = bestVideoVariant(item);
          const rawImageUrl = item.preview_image_url || item.thumbnail_url || item.thumbnailUrl || item.poster || item.url;
          const imageUrl = isVideo && /\.(mp4|m3u8)(?:\?|$)/i.test(String(rawImageUrl || ""))
            ? item.preview_image_url || item.thumbnail_url || item.thumbnailUrl || item.poster || null
            : rawImageUrl;

          const mediaStyle = {
            width: "100%",
            maxHeight: 240,
            objectFit: "contain",
            borderRadius: 12,
            display: "block",
            background: isVideo ? "#000" : "#f8f9fa",
            border: "1px solid #edf2f7",
          };

          if (isVideo && videoUrl) {
            return (
              <video
                key={key}
                controls
                playsInline
                preload="metadata"
                poster={item.preview_image_url || undefined}
                style={mediaStyle}
              >
                <source src={videoUrl} type={/\.m3u8(?:\?|$)/i.test(videoUrl) ? "application/vnd.apple.mpegurl" : "video/mp4"} />
              </video>
            );
          }

          if (imageUrl) {
            const image = (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                style={mediaStyle}
              />
            );

            if (isVideo && postUrl) {
              return (
                <a key={key} href={postUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative" }}>
                  {image}
                  <span
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 10,
                      background: "rgba(0,0,0,0.72)",
                      color: "white",
                      borderRadius: 999,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {t("competitorLookup.openVideoOnX")}
                  </span>
                </a>
              );
            }

            return <div key={key}>{image}</div>;
          }

          return null;
        })}
      </SimpleGrid>

    </div>
  );
}
function cleanXImageUrl(url) {
  if (!url || typeof url !== "string") return null;

  return url.replace("_normal", "_400x400");
}

function getFullTweetText(tweet = {}) {
  return (
    tweet.note_tweet?.text ||
    tweet.note_tweet?.note_tweet_results?.result?.text ||
    tweet.note_tweet_results?.result?.text ||
    tweet.legacy?.note_tweet?.note_tweet_results?.result?.text ||
    tweet.full_text ||
    tweet.legacy?.full_text ||
    tweet.text ||
    ""
  );
}


function XUserCard({ user, onSave }) {
  const { t } = useTranslation();

  if (!user) return null;

  const m = user.public_metrics || {};
  const metricsUnavailable = user.metrics_unavailable === true;
  const avatarUrl = cleanXImageUrl(user.profile_image_url);
  const profileUrl = user.username ? `https://x.com/${user.username}` : user.url;

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" align="center" wrap="nowrap">
            <Avatar
              src={avatarUrl}
              alt={user.name || user.username || "X profile"}
              radius="xl"
              size={56}
            >
              {(user.name || user.username || "?").charAt(0).toUpperCase()}
            </Avatar>

            <Stack gap={2}>
              <Group gap={6}>
                <Text fw={700}>{user.name || user.username}</Text>
                {user.verified && <Badge size="xs">✓</Badge>}
              </Group>

              {user.username && (
                <Text size="sm" c="dimmed">
                  @{user.username}
                </Text>
              )}

              {user.location && (
                <Text size="xs" c="dimmed">
                  {typeof user.location === "string"
                    ? user.location
                    : user.location?.location || ""}
                </Text>
              )}
            </Stack>
          </Group>

          {onSave && <SaveButton onSave={() => onSave("user", user)} />}
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Card withBorder p="sm" radius="md">
            <Text fw={700}>
              {metricsUnavailable ? "—" : (m.followers_count || 0).toLocaleString()}
            </Text>
            <Text size="xs" c="dimmed">
              {t("competitorLookup.followers")}
            </Text>
          </Card>

          <Card withBorder p="sm" radius="md">
            <Text fw={700}>
              {metricsUnavailable ? "—" : (m.following_count || 0).toLocaleString()}
            </Text>
            <Text size="xs" c="dimmed">
              {t("competitorLookup.following")}
            </Text>
          </Card>

          <Card withBorder p="sm" radius="md">
            <Text fw={700}>
              {metricsUnavailable ? "—" : (m.tweet_count || 0).toLocaleString()}
            </Text>
            <Text size="xs" c="dimmed">
              {t("competitorLookup.tweets")}
            </Text>
          </Card>

          <Card withBorder p="sm" radius="md">
            <Text fw={700}>
              {metricsUnavailable ? "—" : (m.listed_count || 0).toLocaleString()}
            </Text>
            <Text size="xs" c="dimmed">
              {t("competitorLookup.listed")}
            </Text>
          </Card>
        </SimpleGrid>

        {metricsUnavailable && (
          <Text size="xs" c="dimmed">
            {t("competitorLookup.metricsUnavailable", {
              defaultValue: "Metrics unavailable from fallback results.",
            })}
          </Text>
        )}

        {user.description && (
          <Text size="sm">
            <strong>{t("competitorLookup.bio")}</strong> {user.description}
          </Text>
        )}

        {user.created_at && (
          <Text size="xs" c="dimmed">
            {t("competitorLookup.joined")}{" "}
            {new Date(user.created_at).toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </Text>
        )}

        {profileUrl && (
          <Button
            component="a"
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="light"
            size="xs"
          >
            {t("competitorLookup.viewProfile", { defaultValue: "View Profile" })}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function XTweetCard({ tweet, authorUsername, onSave }) {
  const { t } = useTranslation();

  if (!tweet) return null;

  const m = tweet.public_metrics || {};
  const metricsUnavailable = tweet.metrics_unavailable === true;

  const date = tweet.created_at
    ? new Date(tweet.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const likeCount = m.like_count ?? 0;
  const shareCount = m.retweet_count ?? 0;
  const commentCount = m.reply_count ?? 0;

  const author = tweet.author || {};
  const displayName = author.name || "";
  const username = author.username || tweet._authorUsername || authorUsername || "";
  const avatarUrl = cleanXImageUrl(author.profile_image_url || tweet._authorProfileImageUrl);
  const mediaItems = dedupeMediaForDisplay(tweet.media);

  const authorLabel =
    displayName && username
      ? `${displayName} @${username}`
      : username
        ? `@${username}`
        : "";

  const initials = String(displayName || username || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const postUrl =
    tweet.url ||
    (tweet.id
      ? username
        ? `https://x.com/${username}/status/${tweet.id}`
        : `https://x.com/i/web/status/${tweet.id}`
      : null);

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="center" wrap="nowrap">
            <Avatar
              src={avatarUrl}
              alt={displayName || username || "X author"}
              radius="xl"
              size={38}
            >
              {initials}
            </Avatar>
            <Stack gap={0}>
              {authorLabel ? (
                <Text size="sm" fw={600}>
                  {t("competitorLookup.postedBy", { name: authorLabel })}
                </Text>
              ) : (
                <Text size="sm" fw={600}>
                  {t("competitorLookup.xPost")}
                </Text>
              )}

              {date && (
                <Text size="xs" c="dimmed">
                  {date}
                </Text>
              )}

            </Stack>
          </Group>

          {onSave && (
            <SaveButton
              onSave={() =>
                onSave("tweet", {
                  ...tweet,
                  _authorUsername: username,
                  _authorProfileImageUrl: avatarUrl,
                })
              }
            />
          )}
        </Group>

        <ExpandableText
          text={cleanDisplayTextForMedia(tweet.text || "", mediaItems)}
          size="sm"
          collapsedLines={3}
          threshold={180}
        />

        <XMediaPreview media={mediaItems} postUrl={postUrl} />

        <Group justify="space-between" align="center">
          <Group gap="lg" c="dimmed">
            <Group gap={4}>
              <IconHeart size={16} />
              <Text size="sm">
                {metricsUnavailable
                  ? "—"
                  : isHiddenCount(likeCount)
                    ? "Hidden"
                    : likeCount.toLocaleString()}
              </Text>
            </Group>

            <Group gap={4}>
              <IconRepeat size={16} />
              <Text size="sm">
                {metricsUnavailable ? "—" : shareCount.toLocaleString()}
              </Text>
            </Group>

            <Group gap={4}>
              <IconMessage size={16} />
              <Text size="sm">
                {metricsUnavailable
                  ? "—"
                  : isHiddenCount(commentCount)
                    ? "Hidden"
                    : commentCount.toLocaleString()}
              </Text>
            </Group>
          </Group>

          {postUrl && (
            <Button
              component="a"
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              size="xs"
            >
              {t("competitorLookup.viewArrow", { defaultValue: "View →" })}
            </Button>
          )}
        </Group>

        <HiddenCountNote likes={likeCount} comments={commentCount} />
      </Stack>
    </Card>
  );
}

function XUserListCard({ users, title, onSaveUser }) {
  const { t } = useTranslation();
  if (!users?.length) return null;

  return (
    <div>
      <Group justify="space-between" align="center" my="xs">
        <Divider label={`${title} (${users.length})`} style={{ flex: 1 }} />
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
        {users.slice(0, 12).map((u, i) => (
          <Card key={u.id || i} withBorder radius="sm" p="xs">
            <Group gap={8} wrap="nowrap" align="start">
              <div style={{ flex: 1, overflow: "hidden" }}>
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" fw={600} lineClamp={1}>{u.name}</Text>
                  {u.verified && <Badge size="xs" color="blue" variant="filled" p={2}>✓</Badge>}
                </Group>
                <Text size="xs" c="dimmed">@{u.username}</Text>
                {u.public_metrics && (
                  <Text size="xs" c="dimmed">
                    {t("competitorLookup.followersCount", { count: (u.public_metrics.followers_count || 0).toLocaleString() })}
                  </Text>
                )}
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </div>
  );
}

function XResults({ data, onSave, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  if (!data?.results) return null;
  const { results, errors } = data;
  const resultCount = Object.keys(results).length;

  // Helper to find author username from includes.users
  const findAuthor = (authorId, users) => {
    const u = (users || []).find(u => u.id === authorId);
    return u?.username || "";
  };

  const userTweets = sortPostsForDisplay(results.userTweets || [], sortMode);
  const mentionTweets = sortPostsForDisplay(results.userMentions?.tweets || [], sortMode);
  const searchTweets = sortPostsForDisplay(results.searchTweets?.tweets || [], sortMode);

  return (
    <Stack gap="md">
      <Divider label={t("competitorLookup.xResultsReturned", { count: resultCount })} />

      {errors?.length > 0 && (
        <Alert variant="light" color="orange" title={t("competitorLookup.someRequestsFailed")} icon={<IconAlertCircle />}>
          {errors.map((e, i) => (
            <Text key={i} size="sm"><b>{e.endpoint}:</b> {e.error}</Text>
          ))}
        </Alert>
      )}

      {resultCount === 0 && !errors?.length && (
        <Alert variant="light" color="gray" title={t("competitorLookup.noResults")}>
          {t("competitorLookup.noDataReturnedInputs")}
        </Alert>
      )}

      {/* User Lookup */}
      {results.userLookup && <XUserCard user={results.userLookup} onSave={onSave} />}

      {/* Followers */}
      {results.followers && <XUserListCard users={results.followers} title={t("competitorLookup.followers")} onSaveUser={(u) => onSave("user", u)} />}

      {/* Following */}
      {results.following && <XUserListCard users={results.following} title={t("competitorLookup.following")} onSaveUser={(u) => onSave("user", u)} />}

      {/* User Tweets */}
      {userTweets.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.tweetsCount", { count: userTweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={userTweets} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {userTweets.map((t, i) => (
              <XTweetCard
                key={t.id || i}
                tweet={t}
                authorUsername={results.userLookup?.username || ""}
                onSave={onSave}
              />
            ))}
          </Stack>
        </div>
      )}

      {/* User Mentions */}
      {mentionTweets.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.mentionsCount", { count: mentionTweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={mentionTweets.map(t => ({ ...t, _authorUsername: findAuthor(t.author_id, results.userMentions.users) }))} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {mentionTweets.map((t, i) => (
              <XTweetCard
                key={t.id || i}
                tweet={t}
                authorUsername={findAuthor(t.author_id, results.userMentions.users)}
                onSave={onSave}
              />
            ))}
          </Stack>
        </div>
      )}

      {/* Tweet Lookup */}
      {results.tweetLookup?.tweet && (
        <div>
          <Divider label={t("competitorLookup.tweetLookup")} my="xs" />
          <XTweetCard
            tweet={results.tweetLookup.tweet}
            authorUsername={findAuthor(results.tweetLookup.tweet.author_id, results.tweetLookup.users)}
            onSave={onSave}
          />
        </div>
      )}

      {/* Search Tweets */}
      {searchTweets.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.searchResultsCount", { count: searchTweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={searchTweets.map(t => ({ ...t, _authorUsername: findAuthor(t.author_id, results.searchTweets.users) }))} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {searchTweets.map((t, i) => (
              <XTweetCard
                key={t.id || i}
                tweet={t}
                authorUsername={findAuthor(t.author_id, results.searchTweets.users)}
                onSave={onSave}
              />
            ))}
          </Stack>
        </div>
      )}
    </Stack>
  );
}

/* ─── End X Results ──────────────────────────────────────────────────────── */

function LinkedinPostList({ title, posts, onSave, sortMode = DEFAULT_SORT_MODE }) {
  if (!posts?.length) return null;
  const sortedPosts = sortPostsForDisplay(posts, sortMode);

  return (
    <div>
      <Group justify="space-between" align="center" my="xs">
        <Divider label={`${title} (${posts.length})`} style={{ flex: 1 }} />
        <SaveAllButton items={sortedPosts} onSave={onSave} type="post" />
      </Group>
      <Stack gap="sm">
        {sortedPosts.map((post, i) => (
          <LinkedinPostCard key={post.url || post.id || i} post={post} onSave={onSave} />
        ))}
      </Stack>
    </div>
  );
}

function LinkedinResults({ data, onSave, sortMode = DEFAULT_SORT_MODE }) {
  const { t } = useTranslation();
  if (!data?.results) return null;
  const { results, errors } = data;
  const resultCount = Object.keys(results).length;
  const profileResults = [];
  const companyResults = [];
  const postResults = [];

  Object.entries(results).forEach(([key, value]) => {
    if (!value) return;
    if (key === "profile" || key.startsWith("keyword_profile_")) profileResults.push(value);
    if (key === "company" || key.startsWith("keyword_company_")) companyResults.push(value);
    if (key === "post" || key.startsWith("keyword_post_")) postResults.push(value);
  });

  const profilePosts = sortPostsForDisplay(Array.isArray(results.profilePosts) ? results.profilePosts : [], sortMode);
  const companyPosts = sortPostsForDisplay(Array.isArray(results.companyPosts) ? results.companyPosts : [], sortMode);
  const searchPosts = sortPostsForDisplay(Array.isArray(results.searchPosts) ? results.searchPosts : [], sortMode);
  const sortedPostResults = sortPostsForDisplay(postResults, sortMode);

  return (
    <Stack gap="md">
      <Divider label={t("competitorLookup.linkedinResultsReturned", { count: resultCount })} />

      {errors?.length > 0 && (
        <Alert variant="light" color="orange" title={t("competitorLookup.someRequestsFailed")} icon={<IconAlertCircle />}>
          {errors.map((e, i) => (
            <Text key={i} size="sm"><b>{e.endpoint}:</b> {e.error}</Text>
          ))}
        </Alert>
      )}

      {resultCount === 0 && !errors?.length && (
        <Alert variant="light" color="gray" title={t("competitorLookup.noResults")}>
          {t("competitorLookup.noDataReturnedUrls")}
        </Alert>
      )}

      {profileResults.map((profile, i) => (
        <LinkedinProfileCard key={`profile-${i}`} profile={profile} onSave={onSave} />
      ))}

      <LinkedinPostList title={t("competitorLookup.recentPosts")} posts={profilePosts} onSave={onSave} sortMode={sortMode} />

      {companyResults.map((company, i) => (
        <LinkedinCompanyCard key={`company-${i}`} company={company} onSave={onSave} />
      ))}

      <LinkedinPostList title={t("competitorLookup.companyPosts")} posts={companyPosts} onSave={onSave} sortMode={sortMode} />
      <LinkedinPostList title={t("competitorLookup.searchResults")} posts={searchPosts} onSave={onSave} sortMode={sortMode} />

      {sortedPostResults.map((post, i) => (
        <LinkedinPostCard key={`post-${i}`} post={post} onSave={onSave} />
      ))}
    </Stack>
  );
}

const LOOKUP_CACHE_KEY = 'competitorLookup_cache';
function loadLookupCache() {
  try {
    const raw = sessionStorage.getItem(LOOKUP_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveLookupCache(data) {
  try { sessionStorage.setItem(LOOKUP_CACHE_KEY, JSON.stringify(data)); } catch { }
}

export default function CompetitorLookup() {
  const [connectedPlatforms, setConnectedPlatforms] = useState(getConnectedPlatforms);
  const { t } = useTranslation();

  const [cached] = useState(loadLookupCache);

  useEffect(() => {
    // Listen for toggle changes from ConnectedIntegrations (or other tabs)
    const handler = () => setConnectedPlatforms(getConnectedPlatforms());
    window.addEventListener("connectedPlatformsChanged", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("connectedPlatformsChanged", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "competitor-lookup" } })
    );
  }, []);

  const [username, setUsername] = useState(cached.username || "");
  const [youtubeUrl, setYoutubeUrl] = useState(cached.youtubeUrl || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(cached.result || null);
  const [convertedData, setConvertedData] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [linkedinOptions, setLinkedinOptions] = useState({
    profile: false,
    company: false,
    post: false,
  });
  const [linkedinInputs, setLinkedinInputs] = useState(
    cached.linkedinInputs || { profile: "", company: "", post: "" }
  );
  const [instagramOptions, setInstagramOptions] = useState({});
  const [instagramInputs, setInstagramInputs] = useState(cached.instagramInputs || {});
  const [tiktokOptions, setTiktokOptions] = useState({});
  const [tiktokInputs, setTiktokInputs] = useState(cached.tiktokInputs || {});
  const [xOptions, setXOptions] = useState({});
  const [xInputs, setXInputs] = useState(cached.xInputs || {});
  const [youtubeOptions, setYoutubeOptions] = useState({});
  const [youtubeInputs, setYoutubeInputs] = useState(cached.youtubeInputs || {});
  const [redditOptions, setRedditOptions] = useState({});
  const [redditInputs, setRedditInputs] = useState(cached.redditInputs || {});
  const [scrapePostCount, setScrapePostCount] = useState(10);
  const [linkedinResult, setLinkedinResult] = useState(cached.linkedinResult || null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);
  const [xResult, setXResult] = useState(cached.xResult || null);
  const [xLoading, setXLoading] = useState(false);
  const [xLoadingMore, setXLoadingMore] = useState(false);
  const [xError, setXError] = useState(null);
  const [youtubeResult, setYoutubeResult] = useState(cached.youtubeResult || null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState(null);
  const [instagramResult, setInstagramResult] = useState(cached.instagramResult || null);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState(null);
  const [tiktokResult, setTiktokResult] = useState(cached.tiktokResult || null);
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokError, setTiktokError] = useState(null);
  const [redditResult, setRedditResult] = useState(cached.redditResult || null);
  const [redditLoading, setRedditLoading] = useState(false);
  const [redditError, setRedditError] = useState(null);
  const [creditsRemaining, setCreditsRemaining] = useState(null);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickLookupLoading, setQuickLookupLoading] = useState(false);
  const [quickLookupError, setQuickLookupError] = useState(null);
  const [quickLookupResult, setQuickLookupResult] = useState(cached.quickLookupResult || null);
  const [simpleQueries, setSimpleQueries] = useState(cached.simpleQueries || {
    x: "",
    youtube: "",
    linkedin: "",
    instagram: "",
    tiktok: "",
    reddit: "",
  });
  const [sortMode, setSortMode] = useState(cached.sortMode || DEFAULT_SORT_MODE);

  // Persist results + inputs to sessionStorage so they survive tab navigation
  useEffect(() => {
    saveLookupCache({
      result, linkedinResult, xResult, youtubeResult,
      instagramResult, tiktokResult, redditResult,
      username, youtubeUrl,
      linkedinInputs, instagramInputs, tiktokInputs,
      xInputs, youtubeInputs, redditInputs,
      quickLookupResult,
      simpleQueries,
      sortMode,
    });
  }, [
    result, linkedinResult, xResult, youtubeResult,
    instagramResult, tiktokResult, redditResult,
    username, youtubeUrl,
    linkedinInputs, instagramInputs, tiktokInputs,
    xInputs, youtubeInputs, redditInputs,
    quickLookupResult,
    simpleQueries,
    sortMode,
  ]);

  // Platform name → id mapping from server (e.g. { x: 1, instagram: 3, tiktok: 5, reddit: 10, youtube: 8 })
  const [platformIds, setPlatformIds] = useState({
    x: 1, instagram: 3, tiktok: 5, reddit: 10, youtube: 8, linkedin: 9,
  });

  useEffect(() => {
    fetch(apiUrl("/api/platforms"))
      .then(r => r.json())
      .then(data => { if (data.platforms) setPlatformIds(data.platforms); })
      .catch(() => { }); // fallback to defaults
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      // The database foreign key points at public.users.id, not Supabase Auth's user.id.
      // Only use the backend-approved public user id to avoid creating duplicate rows.
      if (session?.access_token) {
        try {
          const response = await fetch(apiUrl("/api/auth/access"), {
            cache: "no-store",
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const payload = await response.json().catch(() => ({}));
          if (mounted) setCurrentUserId(response.ok && payload?.authorized && payload?.user_id ? String(payload.user_id) : null);
          return;
        } catch {
          // Fall back below.
        }
      }

      if (mounted) setCurrentUserId(null);
    };
    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  const backends = useMemo(() => {
    const bases = new Set();
    if (apiBase) bases.add(apiBase);
    if (import.meta.env.DEV) bases.add('http://localhost:8080');
    return Array.from(bases);
  }, []);

  async function tryFetch(usernameToFetch) {
    const trimmed = String(usernameToFetch || "").trim().replace(/^@/, "");
    if (!trimmed) throw new Error("Please enter a username.");
    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/x/fetch/${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg = json?.error || `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const notFoundAttempt = attempts.find(a => {
      const errorLower = a.error.toLowerCase();
      return (
        a.error.includes("404") ||
        errorLower.includes("not found") ||
        errorLower.includes("user does not exist") ||
        errorLower.includes("no user found")
      );
    });

    if (notFoundAttempt) {
      const err = new Error(
        `Username "@${trimmed}" not found. Please check the spelling and try again.`
      );
      err.type = "not_found";
      throw err;
    }

    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = username.trim();
    if (!u) {
      setError("Please enter a username.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetch(u);
      setResult(data);

      // Convert the data using DataConverter
      try {
        const converted = convertXInput(data);
        setConvertedData(converted);
        console.log('Converted data:', converted);

        // Save last 10 posts to localStorage
        const postsToSave = (data.posts || []).slice(0, 10).map((post, index) => {
          const metrics = post.public_metrics || {};
          const engagement =
            (metrics.like_count || 0) +
            (metrics.retweet_count || 0) +
            (metrics.reply_count || 0);
          return {
            id: post.id,
            username: data.username,
            content: post.text,
            engagement: engagement,
            likes: metrics.like_count || 0,
            shares: metrics.retweet_count || 0,
            comments: metrics.reply_count || 0,
            timestamp: post.created_at,
          };
        });

        // Get existing posts from localStorage and prepend new ones
        const storageKey = currentUserId
          ? `recentCompetitorPosts_${currentUserId}`
          : 'recentCompetitorPosts';
        const existingPosts = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const allPosts = [...postsToSave, ...existingPosts];
        // Keep only the last 10 overall
        const recentTen = allPosts.slice(0, 10);
        localStorage.setItem(storageKey, JSON.stringify(recentTen));

      } catch (conversionError) {
        console.error('Error converting data:', conversionError);
        setError(`Data fetched successfully but conversion failed: ${conversionError.message}`);
      }
    } catch (e) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function tryPostJson(path, body) {
    const attempts = [];
    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}${path}`;
      try {
        const headers = { "Content-Type": "application/json" };
        if (currentUserId) headers["x-user-id"] = currentUserId;
        if (supabase?.auth?.getSession) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);
        return json;
      } catch (e) {
        attempts.push({ base, error: e?.message || String(e) });
      }
    }
    const err = new Error(
      `Couldn't connect to the server. Please make sure it's running and try again.`
    );
    err.type = "backend_error";
    err.attempts = attempts;
    throw err;
  }

  async function handleQuickLookupSubmit(e) {
    e?.preventDefault?.();
    const q = String(quickQuery || "").trim();
    setQuickLookupError(null);

    if (!q) {
      setQuickLookupError("Please enter a search query.");
      return;
    }

    setQuickLookupLoading(true);
    try {
      const json = await tryPostJson("/api/lookup/search", {
        query: q,
        limit: Math.min(120, Math.max(20, scrapePostCount * 3)),
      });
      setQuickLookupResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (err) {
      setQuickLookupError(err?.message || "Lookup failed.");
      setQuickLookupResult(null);
    } finally {
      setQuickLookupLoading(false);
    }
  }

  const cleanHandle = (value) => String(value || "").trim().replace(/^@/, "");

async function handleSimpleXSubmit() {
  const q = String(simpleQueries.x || "").trim();
  setXError(null);
  setXResult(null);

  if (!q) {
    setXError("Please enter an X username, tweet URL, or keyword.");
    return;
  }

  setXLoading(true);
  try {
    const json = await tryPostJson("/api/x/search", {
      q,
      limit: 10,
    });

    setXResult(json);
    if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
  } catch (e) {
    setXError(e?.message || "Unknown error");
  } finally {
    setXLoading(false);
  }
}

function mergeXSearchResults(previous, nextPage) {
  if (!previous || !nextPage) return nextPage;

  if (previous?.results?.searchTweets && nextPage?.results?.searchTweets) {
    const existingTweets = previous.results.searchTweets.tweets || [];
    const nextTweets = nextPage.results.searchTweets.tweets || [];
    const seen = new Set(existingTweets.map((tweet) => String(tweet.id || "")).filter(Boolean));
    const mergedTweets = [...existingTweets];

    for (const tweet of nextTweets) {
      const key = String(tweet.id || "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      mergedTweets.push(tweet);
    }

    const usersById = new Map();
    for (const user of previous.results.searchTweets.users || []) {
      if (user?.id) usersById.set(String(user.id), user);
    }
    for (const user of nextPage.results.searchTweets.users || []) {
      if (user?.id) usersById.set(String(user.id), user);
    }

    return {
      ...nextPage,
      results: {
        ...nextPage.results,
        searchTweets: {
          ...nextPage.results.searchTweets,
          tweets: mergedTweets,
          users: Array.from(usersById.values()),
        },
      },
    };
  }

  if (previous?.results?.userTweets && nextPage?.results?.userTweets) {
    const existingTweets = previous.results.userTweets || [];
    const nextTweets = nextPage.results.userTweets || [];
    const seen = new Set(existingTweets.map((tweet) => String(tweet.id || "")).filter(Boolean));
    const mergedTweets = [...existingTweets];

    for (const tweet of nextTweets) {
      const key = String(tweet.id || "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      mergedTweets.push(tweet);
    }

    return {
      ...nextPage,
      results: {
        ...nextPage.results,
        userLookup: previous.results.userLookup || nextPage.results.userLookup,
        userTweets: mergedTweets,
        userTweetsMeta: nextPage.results.userTweetsMeta || {},
      },
    };
  }

  return nextPage;
}

function getXNextToken(result) {
  return (
    result?.results?.searchTweets?.meta?.next_token ||
    result?.results?.userTweetsMeta?.next_token ||
    null
  );
}

async function handleLoadMoreX() {
  const q = String(simpleQueries.x || "").trim();
  const nextToken = getXNextToken(xResult);
  if (!q || !nextToken) return;

  setXError(null);
  setXLoadingMore(true);
  try {
    const json = await tryPostJson("/api/x/search", {
      q,
      limit: 10,
      pagination_token: nextToken,
    });

    setXResult((prev) => mergeXSearchResults(prev, json));
    if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
  } catch (e) {
    setXError(e?.message || "Unknown error");
  } finally {
    setXLoadingMore(false);
  }
}

  async function handleSimpleYoutubeSubmit() {
    const q = String(simpleQueries.youtube || "").trim();
    setYoutubeError(null);
    setYoutubeResult(null);
    if (!q) {
      setYoutubeError("Please enter a YouTube URL, channel, or keyword.");
      return;
    }

    const isVideo = /youtu\.be\//i.test(q) || /youtube\.com\/watch\?/i.test(q);
    const isChannel = /youtube\.com\/(channel|@)/i.test(q) || /^UC[A-Za-z0-9_-]{20,}$/i.test(q);

    setYoutubeLoading(true);
    try {
      const payload = isVideo
        ? { options: { videoDetails: true }, inputs: { videoUrl: q }, limit: scrapePostCount }
        : isChannel
          ? { options: { channelDetails: true, channelVideos: true }, inputs: { channelUrl: q }, limit: scrapePostCount }
          : { options: { search: true }, inputs: { searchQuery: q }, limit: scrapePostCount };

      const json = await tryPostJson("/api/youtube/search", payload);
      setYoutubeResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setYoutubeError(e?.message || "Unknown error");
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function handleSimpleLinkedinSubmit() {
    const q = String(simpleQueries.linkedin || "").trim();
    setLinkedinError(null);
    setLinkedinResult(null);

    if (!q) {
      setLinkedinError("Please enter a LinkedIn @username, profile/company/post URL, or keywords.");
      return;
    }

    setLinkedinLoading(true);
    try {
      const json = await tryPostJson("/api/linkedin/search", {
        q,
        limit: 10,
      });

      setLinkedinResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setLinkedinError(e?.message || "Unknown error");
    } finally {
      setLinkedinLoading(false);
    }
  }

  async function handleSimpleInstagramSubmit() {
    const q = String(simpleQueries.instagram || "").trim();
    setInstagramError(null);
    setInstagramResult(null);

    if (!q) {
      setInstagramError("Please enter an Instagram @username, profile/post/reel URL, or keyword.");
      return;
    }

    setInstagramLoading(true);
    try {
      const json = await tryPostJson("/api/instagram/search", {
        q,
        limit: 10,
      });

      setInstagramResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setInstagramError(e?.message || "Unknown error");
    } finally {
      setInstagramLoading(false);
    }
  }

  async function handleSimpleTiktokSubmit() {
    const q = String(simpleQueries.tiktok || "").trim();
    setTiktokError(null);
    setTiktokResult(null);
    if (!q) {
      setTiktokError("Please enter a TikTok @username, profile/video URL, hashtag, or keyword.");
      return;
    }

    setTiktokLoading(true);
    try {
      const json = await tryPostJson("/api/tiktok/search", {
        q,
        limit: 10,
      });
      setTiktokResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setTiktokError(e?.message || "Unknown error");
    } finally {
      setTiktokLoading(false);
    }
  }

  async function handleSimpleRedditSubmit() {
    const q = String(simpleQueries.reddit || "").trim();
    setRedditError(null);
    setRedditResult(null);
    if (!q) {
      setRedditError("Please enter a Reddit @user, u/user, r/subreddit, URL, or keyword.");
      return;
    }

    setRedditLoading(true);
    try {
      const json = await tryPostJson("/api/reddit/search", {
        q,
        limit: scrapePostCount,
      });
      setRedditResult(json);
      if (json?.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setRedditError(e?.message || "Unknown error");
    } finally {
      setRedditLoading(false);
    }
  }

  async function handleLinkedinSubmit() {
    setLinkedinError(null);
    setLinkedinResult(null);

    // Validate that at least one option is selected with input
    const hasInput =
      (linkedinOptions.profile && linkedinInputs.profile?.trim()) ||
      (linkedinOptions.company && linkedinInputs.company?.trim()) ||
      (linkedinOptions.post && linkedinInputs.post?.trim());

    if (!hasInput) {
      setLinkedinError("Please select an option and provide the required input.");
      return;
    }

    setLinkedinLoading(true);
    try {
      const json = await tryPostJson("/api/linkedin/search", {
        options: linkedinOptions,
        inputs: linkedinInputs,
      });
      setLinkedinResult(json);
      // Show errors from individual endpoints if any
      if (json.errors?.length > 0 && !json.results?.profile && !json.results?.company && !json.results?.post) {
        setLinkedinError(`LinkedIn API errors: ${json.errors.map(e => `${e.endpoint}: ${e.error}`).join("; ")}`);
      }
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setLinkedinError(e?.message || "Unknown error");
    } finally {
      setLinkedinLoading(false);
    }
  }

  async function handleLinkedinSave(type, data) {
    if (!currentUserId) {
      setLinkedinError("Please sign in to save data.");
      return;
    }
    return tryPostJson("/api/linkedin/save", { type, data, user_id: currentUserId });
  }

  async function handleXSubmit() {
    setXError(null);
    setXResult(null);

    const hasInput =
      ((xOptions.userLookup || xOptions.followers || xOptions.following) && xInputs.username?.trim()) ||
      ((xOptions.userTweets || xOptions.userMentions) && (xInputs.tweetsUsername?.trim() || xInputs.username?.trim())) ||
      (xOptions.tweetLookup && xInputs.tweetUrl?.trim()) ||
      (xOptions.searchTweets && xInputs.searchQuery?.trim());

    if (!hasInput) {
      setXError("Please select an option and provide the required input.");
      return;
    }

    setXLoading(true);
    try {
      const json = await tryPostJson("/api/x/search", {
        options: xOptions,
        inputs: xInputs,
        limit: scrapePostCount,
      });
      setXResult(json);
    } catch (e) {
      setXError(e?.message || "Unknown error");
    } finally {
      setXLoading(false);
    }
  }

  async function handleXSave(type, data) {
    if (!currentUserId) {
      setXError("Please sign in to save data.");
      return;
    }

    // Save X posts via the existing /api/posts endpoint. Keep the full author
    // object and media array so Saved Posts can render the card the same way
    // Competitor Lookup does.
    if (type === "tweet" && data) {
      const metrics = data.public_metrics || {};
      const author = data.author || {};
      const authorHandle = author.username || data._authorUsername || "";
      const authorName = author.name || authorHandle || "X user";
      const authorProfileImageUrl = author.profile_image_url || data._authorProfileImageUrl || "";
      const postUrl =
        data.url ||
        (data.id
          ? authorHandle
            ? `https://x.com/${authorHandle}/status/${data.id}`
            : `https://x.com/i/web/status/${data.id}`
          : null);

      const resp = await fetch(apiUrl("/api/saved-items"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_name: "x",
          platform_id: platformIds.x,
          platform_user_id: String(author.id || data.author_id || authorHandle || "unknown"),
          username: authorHandle,
          platform_post_id: String(data.id || Date.now()),
          url: postUrl,
          content: getFullTweetText(data),
          published_at: data.created_at || null,
          likes: metrics.like_count ?? 0,
          shares: metrics.retweet_count ?? 0,
          comments: metrics.reply_count ?? 0,
          user_id: currentUserId,
          author_name: authorName,
          author_handle: authorHandle,
          author_profile_image_url: authorProfileImageUrl,
          media: dedupeMediaForDisplay(data.media),
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  async function handleYoutubeSubmit() {
    setYoutubeError(null);
    setYoutubeResult(null);

    const hasInput =
      ((youtubeOptions.channelDetails || youtubeOptions.channelVideos) && youtubeInputs.channelUrl?.trim()) ||
      ((youtubeOptions.videoDetails) && youtubeInputs.videoUrl?.trim()) ||
      (youtubeOptions.search && youtubeInputs.searchQuery?.trim());

    if (!hasInput) {
      setYoutubeError("Please select an option and provide the required input.");
      return;
    }

    setYoutubeLoading(true);
    try {
      const json = await tryPostJson("/api/youtube/search", {
        options: youtubeOptions,
        inputs: youtubeInputs,
        limit: scrapePostCount,
      });
      setYoutubeResult(json);
    } catch (e) {
      setYoutubeError(e?.message || "Unknown error");
    } finally {
      setYoutubeLoading(false);
    }
  }

  async function handleYoutubeSave(type, data) {
    if (!currentUserId) {
      setYoutubeError("Please sign in to save data.");
      return;
    }
    // Save video as a post via /api/posts
    if (type === "video" && data) {
      const resp = await fetch(apiUrl("/api/saved-items"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_name: "youtube",
          platform_id: platformIds.youtube,
          platform_user_id: String(data.channelId || data.channelTitle || "unknown"),
          username: data.channelTitle || "",
          platform_post_id: String(data.id || data.videoId || Date.now()),
          content: data.title + (data.description ? "\n\n" + data.description : ""),
          published_at: data.publishedAt,
          likes: data.likes ?? 0,
          shares: 0,
          comments: data.comments ?? 0,
          user_id: currentUserId,
          title: data.title || "",
          description: data.description || "",
          channelTitle: data.channelTitle || "",
          videoId: data.id || data.videoId || "",
          url: data.url || ((data.id || data.videoId) ? `https://www.youtube.com/watch?v=${data.id || data.videoId}` : null),
          thumbnails: data.thumbnails || null,
          thumbnailUrl: data.thumbnailUrl || getYoutubeThumbnailUrl(data.thumbnails),
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  async function handleInstagramSubmit() {
    setInstagramError(null);
    setInstagramResult(null);

    const hasInput =
      (instagramOptions.profile && instagramInputs.username?.trim()) ||
      (instagramOptions.userPosts && instagramInputs.userPostsUsername?.trim()) ||
      (instagramOptions.singlePost && instagramInputs.postUrl?.trim()) ||
      (instagramOptions.reelsSearch && instagramInputs.reelsSearchTerm?.trim()) ||
      (instagramOptions.userReels && instagramInputs.userReelsUsername?.trim()) ||
      (instagramOptions.highlightDetail && instagramInputs.highlightUrl?.trim());

    if (!hasInput) {
      setInstagramError("Please select an option and provide the required input.");
      return;
    }

    setInstagramLoading(true);
    try {
      const json = await tryPostJson("/api/instagram/search", {
        options: instagramOptions,
        inputs: instagramInputs,
        limit: scrapePostCount,
      });
      setInstagramResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setInstagramError(e?.message || "Unknown error");
    } finally {
      setInstagramLoading(false);
    }
  }

  async function handleInstagramSave(type, data) {
    if (!currentUserId) {
      setInstagramError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const platformUserId = String(
        data.user?.pk || data.user?.id || data.owner?.pk || data.owner?.id ||
        data.user?.username || data.owner?.username || "unknown"
      );
      const platformPostId = String(
        data.pk || data.id || data.media_id || data.code ||
        data.shortcode || data.ig_id || data.fbid || Date.now()
      );
      let publishedAt = null;
      if (data.taken_at) {
        const d = typeof data.taken_at === "number"
          ? new Date(data.taken_at * 1000)
          : new Date(data.taken_at);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }
      const ownerUsername = data.user?.username || data.owner?.username || data.author?.username || data.username || "";
      const ownerFullName = data.user?.full_name || data.owner?.full_name || data.author?.full_name || data.author?.name || "";
      const mediaItems = getIgMediaItems(data);
      const shortCode = data.code || data.shortcode;
      const postUrl = getInstagramPostUrl(data, data.media_type === 2 || data.is_video === true);
      const commentCount = data.comment_count ?? data.comments ?? data.commentCount ?? data.commentsCount;
      const resp = await fetch(apiUrl("/api/saved-items"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_name: "instagram",
          platform_id: platformIds.instagram, // Instagram
          platform_user_id: platformUserId,
          username: ownerUsername || ownerFullName || platformUserId,
          platform_post_id: platformPostId,
          url: postUrl,
          media: mediaItems,
          code: data.code || data.shortcode || null,
          shortcode: data.shortcode || data.code || null,
          is_video: data.is_video === true || data.media_type === 2,
          product_type: data.product_type || null,
          content: data.caption?.text || data.caption || data.text || "",
          published_at: publishedAt,
          likes: Math.max(0, data.like_count ?? data.likes ?? 0),
          shares: null,
          comments: Number.isFinite(Number(commentCount)) ? Math.max(0, Number(commentCount)) : 0,
          user_id: currentUserId,
          author_name: ownerFullName || ownerUsername,
          author_handle: ownerUsername,
          author_profile_image_url: data.user?.profile_pic_url || data.owner?.profile_pic_url || data.user?.profile_pic_url_hd || null,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── TikTok Handler ──────────────────────────────────────────────────── */

  async function handleTiktokSubmit() {
    setTiktokError(null);
    setTiktokResult(null);

    const hasInput =
      ((tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && tiktokInputs.username?.trim()) ||
      (tiktokOptions.profileVideos && tiktokInputs.videosUsername?.trim()) ||
      (tiktokOptions.transcript && tiktokInputs.videoUrl?.trim()) ||
      (tiktokOptions.searchUsers && tiktokInputs.userSearchQuery?.trim()) ||
      (tiktokOptions.searchHashtag && tiktokInputs.hashtag?.trim()) ||
      (tiktokOptions.searchKeyword && tiktokInputs.keyword?.trim());

    if (!hasInput) {
      setTiktokError("Please select an option and provide the required input.");
      return;
    }

    setTiktokLoading(true);
    try {
      const json = await tryPostJson("/api/tiktok/search", {
        options: tiktokOptions,
        inputs: tiktokInputs,
        limit: scrapePostCount,
      });
      setTiktokResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setTiktokError(e?.message || "Unknown error");
    } finally {
      setTiktokLoading(false);
    }
  }

  async function handleTiktokSave(type, data) {
    if (!currentUserId) {
      setTiktokError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const resp = await fetch(apiUrl("/api/saved-items"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.tiktok, // TikTok
          platform_user_id: String(data.author?.id || data.author?.uniqueId || data.author?.unique_id || data.author?.uid || "unknown"),
          username: data.author?.uniqueId || data.author?.unique_id || data.author?.nickname || "",
          author_name: data.author?.nickname || data.author?.uniqueId || "",
          author_handle: data.author?.uniqueId || data.author?.unique_id || "",
          platform_post_id: String(data.aweme_id || data.awemeId || data.id_str || data.id || data.video_id || data.video?.id || Date.now()),
          content: data.desc || data.title || "",
          published_at: (() => { if (!data.createTime) return null; const d = new Date(typeof data.createTime === 'number' ? data.createTime * 1000 : data.createTime); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
          likes: Math.max(0, data.stats?.diggCount ?? data.statsV2?.diggCount ?? data.statistics?.digg_count ?? data.statistics?.diggCount ?? data.diggCount ?? data.digg_count ?? 0),
          shares: Math.max(0, data.stats?.shareCount ?? data.statsV2?.shareCount ?? data.statistics?.share_count ?? data.statistics?.shareCount ?? data.shareCount ?? data.share_count ?? 0),
          comments: Math.max(0, data.stats?.commentCount ?? data.statsV2?.commentCount ?? data.statistics?.comment_count ?? data.statistics?.commentCount ?? data.commentCount ?? data.comment_count ?? 0),
          user_id: currentUserId,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── Reddit Handler ──────────────────────────────────────────────────── */

  async function handleRedditSubmit() {
    setRedditError(null);
    setRedditResult(null);

    const hasInput =
      ((redditOptions.subredditDetails || redditOptions.subredditPosts) && redditInputs.subreddit?.trim()) ||
      (redditOptions.subredditSearch && redditInputs.subreddit?.trim() && redditInputs.subredditQuery?.trim()) ||
      (redditOptions.postComments && redditInputs.postUrl?.trim()) ||
      (redditOptions.search && redditInputs.searchQuery?.trim()) ||
      (redditOptions.searchAds && redditInputs.adSearchQuery?.trim()) ||
      (redditOptions.getAd && redditInputs.adUrl?.trim());

    if (!hasInput) {
      setRedditError("Please select an option and provide the required input.");
      return;
    }

    setRedditLoading(true);
    try {
      const json = await tryPostJson("/api/reddit/search", {
        options: redditOptions,
        inputs: redditInputs,
        limit: scrapePostCount,
      });
      setRedditResult(json);
      if (json.credits_remaining != null) setCreditsRemaining(json.credits_remaining);
    } catch (e) {
      setRedditError(e?.message || "Unknown error");
    } finally {
      setRedditLoading(false);
    }
  }

  async function handleRedditSave(type, data) {
    if (!currentUserId) {
      setRedditError("Please sign in to save data.");
      return;
    }
    if (type === "post" && data) {
      const resp = await fetch(apiUrl("/api/saved-items"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.reddit, // Reddit
          platform_user_id: String(data.author || data.author_fullname || "unknown"),
          username: data.author || "",
          platform_post_id: String(data.id || data.name || Date.now()),
          content: [data.title, data.selftext || data.body || data.description || data.caption].filter(Boolean).join("\n\n"),
          published_at: (() => {
            if (!data.created_utc && !data.created_at && !data.created) return null;
            const raw = data.created_utc ?? data.created_at ?? data.created;
            const n = Number(raw);
            const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(raw);
            return isNaN(d.getTime()) ? null : d.toISOString();
          })(),
          likes: Math.max(0, data.score ?? data.ups ?? data.upvote_count ?? 0),
          shares: 0,
          comments: Math.max(0, data.num_comments ?? data.comment_count ?? 0),
          user_id: currentUserId,
          author_name: data.author || "",
          author_handle: data.author || "",
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Save failed: ${resp.status} ${text}`);
      }
      return resp.json();
    }
  }

  /* ─── Generic save helper (for profiles, comments, transcripts, users, ads) ─── */

  async function handleGenericSave(platformKey, payload = {}) {
    if (!currentUserId) throw new Error("Please sign in to save data.");
    const {
      platformUserId,
      platform_user_id,
      username,
      postId,
      platform_post_id,
      content,
      publishedAt,
      published_at,
      likes,
      shares,
      comments,
      authorName,
      author_name,
      authorHandle,
      author_handle,
    } = payload;
    const pid = platformIds[platformKey];
    if (!pid) throw new Error(`Unknown platform: ${platformKey}`);
    const normalizedPlatformUserId = String(platformUserId || platform_user_id || "unknown");
    const normalizedPostId = String(postId || platform_post_id || Date.now());
    const normalizedUsername = String(username || normalizedPlatformUserId || "unknown");
    const resp = await fetch(apiUrl("/api/saved-items"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform_name: platformKey,
        platform_id: pid,
        platform_user_id: normalizedPlatformUserId,
        username: normalizedUsername,
        platform_post_id: normalizedPostId,
        content: String(content || ""),
        published_at: publishedAt || published_at || null,
        likes: likes ?? 0,
        shares: shares ?? 0,
        comments: comments ?? 0,
        user_id: currentUserId,
        author_name: authorName || author_name || normalizedUsername || "",
        author_handle: authorHandle || author_handle || normalizedUsername || "",
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Save failed: ${resp.status} ${text}`);
    }
    return resp.json();
  }

  // TikTok transcript save
  function saveTiktokTranscript(transcript) {
    const text = typeof transcript === "string" ? transcript : JSON.stringify(transcript, null, 2);
    return handleGenericSave("tiktok", {
      platformUserId: "transcript",
      username: "transcript",
      postId: `transcript_${Date.now()}`,
      content: `[TikTok Transcript]\n\n${text}`,
      authorName: "TikTok Transcript",
    });
  }

  // Reddit comment save
  function saveRedditComment(comment) {
    return handleGenericSave("reddit", {
      platformUserId: comment.author || "deleted",
      username: comment.author || "deleted",
      postId: `comment_${comment.id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: comment.body || comment.text || "",
      likes: comment.score ?? 0,
      authorName: comment.author || "deleted",
      authorHandle: comment.author || "deleted",
    });
  }

  // Reddit ad save
  function saveRedditAd(ad) {
    const creative = ad.creative || {};
    const profile = ad.profile_info || {};
    return handleGenericSave("reddit", {
      platformUserId: profile.name || ad.advertiser_id || "ad",
      username: profile.name || "Advertiser",
      postId: `ad_${ad.id || Date.now()}`,
      content: `${creative.title || creative.headline || ""}\n${creative.body || ""}`,
      authorName: profile.name || "Advertiser",
      authorHandle: profile.name || "",
    });
  }

  // LinkedIn sub-item saves (activity posts, company posts, comments, articles)
  function saveLinkedinSubItem(type, item) {
    const { type: liType, data } = { type, data: item };
    return fetch(apiUrl("/api/linkedin/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: liType,
        data,
        user_id: currentUserId,
      }),
    }).then(async r => { if (!r.ok) { const t = await r.text(); throw new Error(t); } return r.json(); });
  }

  function BackendBadge({ base }) {
    const label = base?.replace(/^https?:\/\//, "");
    return (
      <Badge variant="light" radius="sm" title={base}>
        {label || "unknown"}
      </Badge>
    );
  }

  function Copyable({ value, label }) {
    const [copied, handlers] = useDisclosure(false);
    return (
      <Group gap="xs" wrap="nowrap">
        <Text fw={500}>{label}:</Text>
        <Code>{value || "—"}</Code>
        <Tooltip label={copied ? "Copied" : "Copy"} withArrow withinPortal>
          <ActionIcon
            aria-label={`Copy ${label}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(String(value ?? ""));
                handlers.open();
                setTimeout(handlers.close, 900);
              } catch {
              }
            }}
            variant="subtle"
          >
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  function PostCard({ post }) {
    if (!post?.text) return null;

    const metrics = post.public_metrics || {};
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const isLong = post.text.length > 280;
    const preview = isLong && !expanded ? post.text.slice(0, 280) + "…" : post.text;
    const date = post.created_at
      ? new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    async function handleSave() {
      try {
        if (!currentUserId) {
          throw new Error("Please sign in to save posts.");
        }
        setSaving(true);
        setSaveStatus(null);
        const resp = await fetch(apiUrl("/api/saved-items"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_id: platformIds.x,
            platform_user_id: result.userId,
            username: result.username,
            platform_post_id: post.id,
            content: post.text,
            published_at: post.created_at,
            likes: metrics.like_count ?? 0,
            shares: metrics.retweet_count ?? 0,
            comments: metrics.reply_count ?? 0,
            user_id: currentUserId,
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Failed to save post: ${resp.status} ${errorText}`);
        }

        await resp.json();
        setSaveStatus('saved');
      } catch (e) {
        console.error("Error saving post:", e);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    }

    return (
      <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #1d9bf0" }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "#e8f5fd",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 15, color: "#1d9bf0", flexShrink: 0,
              }}>
                {avatarInitial(result?.name || result?.username)}
              </div>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} size="sm" lh={1.3} truncate>{result?.name || result?.username}</Text>
                <Text size="xs" c="dimmed" lh={1.2}>@{result?.username}</Text>
              </div>
            </Group>
            <IconBrandX size={18} style={{ opacity: 0.5, flexShrink: 0 }} />
          </Group>

          <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{preview}</Text>

          {isLong && (
            <Button variant="subtle" size="xs" p={0} h="auto"
              leftSection={expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          )}

          {date && <Text size="xs" c="dimmed" mt={-4}>{date}</Text>}

          <Divider my={0} />

          <Group justify="space-between" align="center">
            <Group gap="lg">
              <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{(metrics.like_count ?? 0).toLocaleString()}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconRepeat size={14} color="#17bf63" /><Text size="xs" c="dimmed">{(metrics.retweet_count ?? 0).toLocaleString()}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#1d9bf0" /><Text size="xs" c="dimmed">{(metrics.reply_count ?? 0).toLocaleString()}</Text></Group>
            </Group>
            <Button size="xs" variant="light" loading={saving}
              color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
              onClick={handleSave}
              disabled={saveStatus === 'saved'}
            >
              {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error – Retry' : 'Save'}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  function YouTubeCard({ data, t }) {
    if (!data) return null;

    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [showDesc, setShowDesc] = useState(false);
    const descLong = (data.video?.description || "").length > 200;
    const videoId = data.videoId || data.video?.id || data.video?.videoId;
    const postUrl = data.video?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const date = data.video?.publishedAt
      ? new Date(data.video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    async function handleSave() {
      try {
        setSaving(true);
        setSaveStatus(null);
        const resp = await fetch(apiUrl("/api/saved-items"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_name: "youtube",
            platform_id: platformIds.youtube,
            platform_user_id: data.video.channelId,
            username: data.video.channelTitle,
            platform_post_id: videoId,
            content: data.video.description,
            published_at: data.video.publishedAt,
            likes: data.video.stats.likes || 0,
            shares: 0,
            comments: data.video.stats.comments || 0,
            title: data.video.title,
            description: data.video.description,
            channelTitle: data.video.channelTitle,
            videoId,
            url: postUrl,
            thumbnails: data.video?.thumbnails || null,
            thumbnailUrl: data.video?.thumbnailUrl || getYoutubeThumbnailUrl(data.video?.thumbnails),
            user_id: currentUserId,
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Failed to save video: ${resp.status} ${errorText}`);
        }

        await resp.json();
        setSaveStatus('saved');
      } catch (e) {
        console.error("Error saving video:", e);
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
    }

    return (
      <Card withBorder radius="md" p="lg" style={{ borderLeft: "3px solid #ff0000" }}>
        <Stack gap="sm">
          {/* header */}
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "#fde8e8",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <IconBrandYoutube size={22} color="#ff0000" />
              </div>
              <div style={{ minWidth: 0 }}>
                <Text fw={700} size="sm" lh={1.3} truncate>{data.video?.channelTitle || t("competitorLookup.unknownChannel")}</Text>
                {date && <Text size="xs" c="dimmed" lh={1.2}>{date}</Text>}
              </div>
            </Group>
          </Group>

          {/* title */}
          <Text fw={600} size="md" lh={1.3}>{data.video?.title || t("competitorLookup.untitledVideo")}</Text>

          <YoutubeThumbnailPreview video={{ ...data.video, videoId }} postUrl={postUrl} />

          {/* description */}
          {data.video?.description && (
            <div>
              <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {descLong && !showDesc ? data.video.description.slice(0, 200) + "…" : data.video.description}
              </Text>
              {descLong && (
                <Button variant="subtle" size="xs" p={0} h="auto" mt={4}
                  leftSection={showDesc ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                  onClick={() => setShowDesc(!showDesc)}
                >
                  {showDesc ? t("common.showLess") : t("common.showMore")}
                </Button>
              )}
            </div>
          )}

          <Divider my={0} />

          {/* metrics + save */}
          <Group justify="space-between" align="center">
            <Group gap="lg">
              <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{(data.video?.stats?.likes || 0).toLocaleString()}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#606060" /><Text size="xs" c="dimmed">{(data.video?.stats?.comments || 0).toLocaleString()}</Text></Group>
            </Group>
            <Button size="xs" variant="light" loading={saving}
              color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
              disabled={saveStatus === 'saved'}
              onClick={handleSave}
            >
              {saveStatus === 'saved' ? t("competitorLookup.savedCheck") : saveStatus === 'error' ? t("competitorLookup.errorRetry") : t("competitorLookup.saveVideo")}
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  /* ── YouTube Display Components ───────────────────────────────────────── */

  function fmtNum(n) {
    if (n == null) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString();
  }

  function parseDuration(iso) {
    if (!iso) return "";
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return iso;
    const h = m[1] ? `${m[1]}:` : "";
    const min = (m[2] || "0").padStart(h ? 2 : 1, "0");
    const sec = (m[3] || "0").padStart(2, "0");
    return `${h}${min}:${sec}`;
  }

  function getYoutubeThumbnailUrl(thumbnails = null) {
    if (!thumbnails) return null;
    if (typeof thumbnails === "string") return thumbnails;
    return (
      thumbnails.maxres?.url ||
      thumbnails.standard?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      null
    );
  }

  function getYoutubeVideoId(video = {}, postUrl = null) {
    const direct =
      video?.videoId ||
      video?.youtubeVideoId ||
      video?.id?.videoId ||
      (typeof video?.id === "string" ? video.id : null);

    if (typeof direct === "string" && /^[a-zA-Z0-9_-]{11}$/.test(direct)) {
      return direct;
    }

    const candidates = [
      postUrl,
      video?.url,
      video?.link,
      video?.videoUrl,
      video?.embedUrl,
      video?.permalink,
    ].filter(Boolean);

    for (const raw of candidates) {
      const url = String(raw);
      const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match?.[1]) return match[1];

      try {
        const parsed = new URL(url);
        const v = parsed.searchParams.get("v");
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      } catch {
        // Ignore non-URL values.
      }
    }

    return null;
  }

  function YoutubeThumbnailPreview({ video, postUrl = null, compact = false }) {
    const videoId = getYoutubeVideoId(video, postUrl);
    const thumbUrl = video?.thumbnailUrl || getYoutubeThumbnailUrl(video?.thumbnails);
    const maxWidth = compact ? 280 : 520;

    if (videoId) {
      return (
        <AspectRatio
          ratio={16 / 9}
          mt="xs"
          style={{
            maxWidth,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid #edf2f7",
            background: "#f8f9fa",
          }}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}`}
            title={video?.title || "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ border: 0, width: "100%", height: "100%" }}
          />
        </AspectRatio>
      );
    }

    if (!thumbUrl) return null;

    return (
      <a
        href={postUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block",
          position: "relative",
          maxWidth,
          textDecoration: "none",
        }}
      >
        <img
          src={thumbUrl}
          alt={video?.title || "YouTube video thumbnail"}
          loading="lazy"
          style={{
            width: "100%",
            maxHeight: compact ? 160 : 260,
            objectFit: "cover",
            borderRadius: 12,
            border: "1px solid #edf2f7",
            background: "#f8f9fa",
            display: "block",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(255, 0, 0, 0.88)",
            color: "white",
            borderRadius: 999,
            padding: compact ? "6px 10px" : "8px 13px",
            fontSize: compact ? 11 : 13,
            fontWeight: 800,
            boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
          }}
        >
          ▶
        </span>
      </a>
    );
  }

  function YTChannelCard({ data }) {
    if (!data) return null;
    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="start">
            <Group gap="sm">
              <div>
                <Title order={4}>{data.title}</Title>
                {data.customUrl && <Text size="xs" c="dimmed">{data.customUrl}</Text>}
              </div>
            </Group>
            <Badge variant="light" color="red">
              <IconBrandYoutube size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.channel")}
            </Badge>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: t("competitorLookup.subscribers"), value: fmtNum(data.subscribers) },
              { label: t("competitorLookup.videos"), value: fmtNum(data.videoCount) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="lg">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>

          {data.description && (
            <ScrollArea h={80}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{data.description}</Text>
            </ScrollArea>
          )}

          {data.country && (
            <Text size="xs" c="dimmed">{t("competitorLookup.countryJoined", { country: data.country, date: new Date(data.publishedAt).toLocaleDateString() })}</Text>
          )}

          {data.keywords && (
            <Group gap={4} wrap="wrap">
              {data.keywords.split(/\s+/).slice(0, 15).map((kw, i) => (
                <Badge key={i} size="xs" variant="outline">{kw.replace(/"/g, "")}</Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function YTVideoCard({ video, onSave, compact }) {
    if (!video) return null;
    const videoId = video.id?.videoId || video.videoId || video.id;
    const postUrl = video.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const likeCount = video.likes;
    const commentCount = video.comments;
    const description = video.description || video.snippet?.description || "";
    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size={compact ? "sm" : "md"} lineClamp={2}>{video.title}</Text>
          <Text size="xs" c="dimmed">{video.channelTitle} · {new Date(video.publishedAt).toLocaleDateString()}{video.duration ? ` · ${parseDuration(video.duration)}` : ""}</Text>
          <YoutubeThumbnailPreview video={video} postUrl={postUrl} compact={compact} />
          {description && (
            <ExpandableText
              text={description}
              size={compact ? "xs" : "sm"}
              dimmed
              collapsedLines={compact ? 2 : 3}
              threshold={compact ? 110 : 180}
            />
          )}
          {video.channelTitle && <Text size="xs" c="dimmed">{t("competitorLookup.postedBy", { name: video.channelTitle })}</Text>}
          <Group gap="xs">
            {[
              { label: t("competitorLookup.likes"), val: video.likes },
              { label: t("competitorLookup.comments"), val: video.comments },
            ].map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label}: {formatCount(val)}</Badge>
            ))}
          </Group>
          <HiddenCountNote likes={likeCount} comments={commentCount} />
          {onSave && (
            <Group justify="flex-end">
              {postUrl && (
                <Button size="xs" variant="subtle" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  {t("competitorLookup.viewPost")}
                </Button>
              )}
              <SaveButton label={t("competitorLookup.saveVideo")} onSave={() => onSave("video", { ...video, channelId: video.channelId || "" })} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function YoutubeResults({ data, onSave, t, sortMode = DEFAULT_SORT_MODE }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;
    const sortedChannelVideos = sortPostsForDisplay(results.channelVideos || [], sortMode);
    const sortedSearch = sortPostsForDisplay(results.search || [], sortMode);
    const count =
      (results.channelDetails ? 1 : 0) +
      sortedChannelVideos.length +
      (results.videoDetails ? 1 : 0) +
      sortedSearch.length;

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>{t("competitorLookup.youtubeResults")}</Text>
          <Badge variant="light">{count} item{count !== 1 ? "s" : ""}</Badge>
        </Group>

        {errors.length > 0 && (
          <Alert color="orange" title={t("competitorLookup.someRequestsFailed")}>
            {errors.map((e, i) => (
              <Text key={i} size="sm">{e.endpoint}: {e.error}</Text>
            ))}
          </Alert>
        )}

        {results.channelDetails && (
          <>
            <Divider label={t("competitorLookup.channelDetails")} labelPosition="center" />
            <YTChannelCard data={results.channelDetails} />
          </>
        )}

        {sortedChannelVideos.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.channelVideosCount", { count: sortedChannelVideos.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={sortedChannelVideos.map(v => ({ ...v, channelId: v.channelId || "" }))} onSave={onSave} type="video" />
            </Group>
            <Stack gap="xs">
              {sortedChannelVideos.map((v) => (
                <YTVideoCard key={v.id} video={v} onSave={onSave} compact />
              ))}
            </Stack>
          </>
        )}

        {results.videoDetails && (
          <>
            <Divider label="Video Details" labelPosition="center" />
            <YouTubeCard data={{
              video: {
                ...results.videoDetails,
                stats: {
                  likes: results.videoDetails.likes,
                  comments: results.videoDetails.comments,
                },
              },
              videoId: results.videoDetails.id,
            }} t={t} />
          </>
        )}

        {sortedSearch.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.searchResultsCount", { count: sortedSearch.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={sortedSearch.map(v => ({ ...v, channelId: v.channelId || "" }))} onSave={onSave} type="video" />
            </Group>
            <Stack gap="xs">
              {sortedSearch.map((v) => (
                <YTVideoCard key={v.id} video={v} onSave={onSave} compact />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    );
  }

  /* ── Instagram Display Components ──────────────────────────────────── */


  function getInstagramPostUrl(post = {}, forceReel = false) {
    const rawUrl = String(post?.url || post?.permalink || post?.shortcode_url || "").trim();
    const match = rawUrl.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    const code = String(post?.code || post?.shortcode || match?.[2] || "").trim();

    if (!code && match?.[1] && match?.[2]) {
      return `https://www.instagram.com/${match[1]}/${match[2]}/`;
    }
    if (!code) return null;

    // If the source URL points to the same shortcode, preserve whether it was
    // /p/, /reel/, or /tv/. This prevents View from opening a mismatched post.
    if (match?.[1] && match?.[2] === code) {
      return `https://www.instagram.com/${match[1]}/${code}/`;
    }

    const isReel =
      forceReel ||
      post?.product_type === "clips" ||
      post?.__typename === "XDTGraphVideo" ||
      post?.is_video === true ||
      post?.media_type === 2;

    return `https://www.instagram.com/${isReel ? "reel" : "p"}/${code}/`;
  }

  function bestIgVideoVariant(variants = []) {
    if (!Array.isArray(variants)) return null;
    const mp4s = variants
      .filter((v) => v?.url && String(v.content_type || "video/mp4").includes("mp4"))
      .sort((a, b) => (Number(b.width) || Number(b.bitrate) || 0) - (Number(a.width) || Number(a.bitrate) || 0));
    return mp4s[0]?.url || null;
  }

  function normalizeIgMediaKey(url) {
    if (!url || typeof url !== "string") return "";
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete("se");
      parsed.searchParams.delete("stp");
      parsed.searchParams.delete("_nc_cat");
      parsed.searchParams.delete("_nc_ht");
      return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    } catch {
      return String(url).split("?")[0].toLowerCase();
    }
  }

  function dedupeIgMedia(media = []) {
    const seen = new Set();
    const out = [];
    for (const item of Array.isArray(media) ? media : []) {
      if (!item) continue;
      const key = item.media_key || normalizeIgMediaKey(item.url || item.preview_image_url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function instagramEmbedUrl(url) {
    const text = String(url || "").trim();
    const match = text.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
  }

  function getIgMediaItems(post) {
    const direct = Array.isArray(post?.media) ? post.media : [];
    if (direct.length) return dedupeIgMedia(direct.filter(Boolean)).slice(0, 10);

    const carousel = [
      ...(Array.isArray(post?.carousel_media) ? post.carousel_media : []),
      ...(Array.isArray(post?.carousel_media_items) ? post.carousel_media_items : []),
      ...(Array.isArray(post?.children) ? post.children : []),
      ...(Array.isArray(post?.resources) ? post.resources : []),
      ...(Array.isArray(post?.edge_sidecar_to_children?.edges) ? post.edge_sidecar_to_children.edges.map((e) => e?.node).filter(Boolean) : []),
    ];
    const fromCarousel = carousel.map((raw, index) => {
      const m = raw?.node || raw?.media || raw;
      const imageUrl =
        m.image_versions2?.candidates?.[0]?.url ||
        m.image_versions?.candidates?.[0]?.url ||
        m.display_resources?.[0]?.src ||
        m.display_url ||
        m.displayUrl ||
        m.thumbnail_src ||
        m.thumbnail_url ||
        m.thumbnailUrl ||
        m.photo_url ||
        m.photoUrl ||
        m.photo ||
        m.image_url ||
        m.imageUrl ||
        m.media_url ||
        m.url;
      const videoUrl = m.video_url || m.videoUrl || m.video_versions?.[0]?.url || m.video_versions2?.[0]?.url;
      return {
        media_key: m.id || m.pk || m.code || `${post?.id || "ig"}-${index}`,
        type: m.media_type === 2 || m.mediaType === 2 || m.is_video || videoUrl ? "video" : "photo",
        url: videoUrl || imageUrl,
        preview_image_url: imageUrl || m.preview_image_url || null,
        variants: m.video_versions || m.video_versions2 || (videoUrl ? [{ url: videoUrl, content_type: "video/mp4" }] : []),
      };
    }).filter((m) => m.url || m.preview_image_url);
    if (fromCarousel.length) return dedupeIgMedia(fromCarousel).slice(0, 10);

    const imageUrl = post?.image_url || post?.imageUrl || post?.photo_url || post?.photoUrl || post?.photo || post?.display_url || post?.displayUrl || post?.display_resources?.[0]?.src || post?.thumbnail_src || post?.thumbnail_url || post?.thumbnailUrl || post?.image_versions2?.candidates?.[0]?.url || post?.media_url || post?.url;
    const videoUrl = post?.video_url || post?.videoUrl || post?.video_versions?.[0]?.url || post?.video_versions2?.[0]?.url;
    if (videoUrl || imageUrl) {
      return [{
        media_key: post?.id || post?.pk || post?.code || "ig-media",
        type: videoUrl ? "video" : "photo",
        url: videoUrl || imageUrl,
        preview_image_url: imageUrl || post?.thumbnail_url || null,
        variants: post?.video_versions || (videoUrl ? [{ url: videoUrl, content_type: "video/mp4" }] : []),
      }];
    }

    return [];
  }

  function isUsableImageUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url) && !/\.(mp4|mov|m3u8)(\?|$)/i.test(url);
  }

  function IgMediaPreview({ media, compact = false, postUrl = null }) {
    const items = dedupeIgMedia(Array.isArray(media) ? media.filter(Boolean) : []).slice(0, 10);
    const imageItems = items
      .map((item, index) => {
        const isVideo = item?.type === "video" || item?.type === "animated_gif";
        const imageUrl = item?.preview_image_url || (!isVideo ? item?.url : null);
        return imageUrl && isUsableImageUrl(imageUrl)
          ? { ...item, _displayUrl: imageUrl, _displayKey: item.media_key || imageUrl || index }
          : null;
      })
      .filter(Boolean);

    const hasHiddenMedia = items.length > imageItems.length;
    const showUnavailableNote = postUrl && (!imageItems.length || hasHiddenMedia);
    const maxWidth = imageItems.length === 1 ? 420 : 620;
    const maxHeight = compact ? 180 : 240;

    if (!imageItems.length) {
      if (!showUnavailableNote) return null;
      return (
        <Card withBorder radius="md" p="sm" bg="gray.0" style={{ maxWidth: 520 }}>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              {t("competitorLookup.instagramPreviewUnavailable")}
            </Text>
            <Text size="xs" c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
              {t("competitorLookup.viewInstagramMedia")}
            </Text>
          </Stack>
        </Card>
      );
    }

    return (
      <Stack gap={6} style={{ maxWidth, width: "100%" }}>
        <SimpleGrid cols={imageItems.length === 1 ? 1 : imageItems.length > 4 ? 3 : 2} spacing="xs">
          {imageItems.map((item, index) => (
            <img
              key={item._displayKey || index}
              src={item._displayUrl}
              alt=""
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              style={{
                width: "100%",
                maxHeight,
                objectFit: "contain",
                borderRadius: 12,
                display: "block",
                background: "#f8f9fa",
                border: "1px solid #edf2f7",
              }}
            />
          ))}
        </SimpleGrid>

        {showUnavailableNote && (
          <Text size="xs" c="dimmed">
            {t("competitorLookup.someInstagramMediaMayNotPreview")} {postUrl && (
              <Text span c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                {t("competitorLookup.viewPostArrow")}
              </Text>
            )}
          </Text>
        )}
      </Stack>
    );
  }

  function IgProfileCard({ profile }) {
    if (!profile) return null;
    const p = profile.data?.user || profile.data || profile.user || profile;
    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="start">
            <Group gap="sm">
              <div>
                <Group gap="xs">
                  <Title order={4}>{p.full_name || p.fullName || p.username}</Title>
                  {(p.is_verified || p.isVerified) && <Badge size="xs" color="blue">{t("competitorLookup.verified")}</Badge>}
                  {(p.is_private || p.isPrivate) && <Badge size="xs" color="gray">{t("competitorLookup.private")}</Badge>}
                </Group>
                <Text size="xs" c="dimmed">@{p.username}</Text>
                {p.category && <Badge size="xs" variant="outline" mt={2}>{p.category}</Badge>}
              </div>
            </Group>
            <Badge variant="light" color="pink">
              <IconBrandInstagram size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.profile")}
            </Badge>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: t("competitorLookup.posts"), value: fmtNum(p.media_count ?? p.edge_owner_to_timeline_media?.count ?? p.postsCount) },
              { label: t("competitorLookup.followers"), value: fmtNum(p.follower_count ?? p.edge_followed_by?.count ?? p.followersCount) },
              { label: t("competitorLookup.following"), value: fmtNum(p.following_count ?? p.edge_follow?.count ?? p.followingCount) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="lg">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>

          {(p.biography || p.bio) && (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{p.biography || p.bio}</Text>
          )}

          {p.external_url && (
            <Text size="xs" c="blue">{p.external_url}</Text>
          )}
        </Stack>
      </Card>
    );
  }

  function firstFiniteMetric(...values) {
    for (const value of values) {
      if (value == null || value === "") continue;
      if (typeof value === "object") {
        const nested = value.count ?? value.value ?? value.total_count ?? value.totalCount;
        if (nested != null && Number.isFinite(Number(nested))) return Number(nested);
        continue;
      }
      const raw = String(value).trim().replace(/,/g, "");
      const match = raw.match(/^([0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
      if (match) {
        const base = Number(match[1]);
        const suffix = String(match[2] || "").toLowerCase();
        const multiplier = suffix === "k" ? 1000 : suffix === "m" ? 1000000 : suffix === "b" ? 1000000000 : 1;
        return Math.round(base * multiplier);
      }
      if (Number.isFinite(Number(raw))) return Number(raw);
    }
    return null;
  }

  function findIgNestedValue(root, keyTests = [], maxDepth = 5) {
    const seen = new WeakSet();
    const queue = [{ value: root, depth: 0, path: "root" }];
    while (queue.length) {
      const { value, depth, path } = queue.shift();
      if (!value || typeof value !== "object" || depth > maxDepth) continue;
      if (seen.has(value)) continue;
      seen.add(value);

      for (const [key, child] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        const lowerPath = `${path}.${key}`.toLowerCase();
        const isMatch = keyTests.some((test) => test.test(lowerKey) || test.test(lowerPath));
        if (isMatch && child != null && typeof child !== "object") return child;
        if (isMatch && child && typeof child === "object") {
          const metric = firstFiniteMetric(child);
          if (metric != null) return metric;
        }
        if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1, path: lowerPath });
      }
    }
    return null;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getIgMetric(post, names = []) {
    const directValues = names.flatMap((name) => [
      post?.[name],
      post?.metrics?.[name],
      post?.insights?.[name],
    ]);
    const direct = firstFiniteMetric(...directValues);
    if (direct != null) return direct;
    const tests = names.map((name) => new RegExp(`^${escapeRegExp(name)}$`, "i"));
    return firstFiniteMetric(findIgNestedValue(post, tests));
  }

  function getIgAuthorHandle(post) {
    return cleanHandle(
      post?.user?.username ||
      post?.owner?.username ||
      post?.author?.username ||
      post?.account?.username ||
      post?.profile?.username ||
      post?.caption?.user?.username ||
      post?.caption?.owner?.username ||
      post?.username ||
      post?.handle ||
      post?.ownerUsername ||
      post?.owner_username ||
      post?.authorUsername ||
      post?.author_username ||
      post?.user_username ||
      post?.user_name ||
      findIgNestedValue(post, [/^username$/, /owner\.username$/, /user\.username$/, /author\.username$/]) ||
      "unknown"
    );
  }

  function getIgPostDate(post) {
    return post?.taken_at ||
      post?.taken_at_timestamp ||
      post?.timestamp ||
      post?.created_at ||
      post?.createdAt ||
      post?.date ||
      post?.caption?.created_at ||
      post?.caption?.created_at_utc ||
      null;
  }

  function getIgCaptionText(post) {
    if (!post) return "";
    if (typeof post.caption === "string") return post.caption;
    return post.caption?.text || post.caption?.caption || post.text || post.description || post.title || "";
  }

  function IgPostCard({ post, onSave, compact }) {
    if (!post) return null;
    const caption = getIgCaptionText(post);
    const mediaItems = getIgMediaItems(post);
    const isVideo = post.media_type === 2 || post.mediaType === 2 || post.video_url || post.videoUrl || post.is_video || mediaItems.some((m) => m.type === "video");
    const postUrl = getInstagramPostUrl(post, isVideo);
    const likeCount = getIgMetric(post, ["like_count", "likeCount", "likesCount", "likes_count", "likes"]);
    const commentCount = getIgMetric(post, ["comment_count", "commentCount", "commentsCount", "comments_count", "num_comments", "comments"]);
    const authorHandle = getIgAuthorHandle(post);
    const rawDate = getIgPostDate(post);
    const parsedDate = rawDate
      ? new Date(Number(rawDate) < 1e12 ? Number(rawDate) * 1000 : rawDate)
      : null;
    const date = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const likeLabel = likeCount == null ? "—" : formatCount(likeCount);
    const commentLabel = commentCount == null ? "—" : formatCount(commentCount);

    return (
      <Card withBorder radius="md" p={compact ? "sm" : "md"} style={{ borderLeft: "3px solid #E1306C" }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#fde6ef",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, color: "#E1306C", flexShrink: 0,
              }}>
                {(authorHandle || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Group gap="xs" wrap="wrap" mb={4}>
                  <Text size="xs" fw={600}>@{authorHandle}</Text>
                  {isVideo && <Badge size="xs" variant="light">{t("competitorLookup.video")}</Badge>}
                  {post.carousel_media_count > 1 && (
                    <Badge size="xs" variant="light">{t("competitorLookup.carouselCount", { count: post.carousel_media_count })}</Badge>
                  )}
                </Group>
                <ExpandableText text={caption} size={compact ? "xs" : "sm"} collapsedLines={compact ? 2 : 4} threshold={compact ? 90 : 180} />
              </div>
            </Group>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <IconBrandInstagram size={16} style={{ opacity: 0.6 }} />
              {onSave && (
                <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("post", post)} />
              )}
            </Group>
          </Group>

          <IgMediaPreview media={mediaItems} compact={compact} postUrl={postUrl} />

          {date && <Text size="xs" c="dimmed">{date}</Text>}

          <Divider my={0} />

          <Group justify="space-between" align="center">
            <Group gap="lg">
              <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{likeLabel}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#1d9bf0" /><Text size="xs" c="dimmed">{commentLabel}</Text></Group>
            </Group>
            {postUrl && (
              <Text size="xs" c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                {t("competitorLookup.viewArrow")}
              </Text>
            )}
          </Group>
          <HiddenCountNote likes={likeCount} comments={commentCount} />
        </Stack>
      </Card>
    );
  }

  function IgReelCard({ reel, onSave, compact }) {
    if (!reel) return null;
    const caption = getIgCaptionText(reel);
    const mediaItems = getIgMediaItems(reel);
    const postUrl = getInstagramPostUrl(reel, true);
    const likeCount = getIgMetric(reel, ["like_count", "likeCount", "likesCount", "likes_count", "likes"]);
    const commentCount = getIgMetric(reel, ["comment_count", "commentCount", "commentsCount", "comments_count", "num_comments", "comments"]);
    const authorHandle = getIgAuthorHandle(reel);
    const rawDate = getIgPostDate(reel);
    const parsedDate = rawDate
      ? new Date(Number(rawDate) < 1e12 ? Number(rawDate) * 1000 : rawDate)
      : null;
    const date = parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const likeLabel = likeCount == null ? "—" : formatCount(likeCount);
    const commentLabel = commentCount == null ? "—" : formatCount(commentCount);
    return (
      <Card withBorder radius="md" p={compact ? "sm" : "xs"} style={{ borderLeft: "3px solid #E1306C" }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "#fde6ef",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 12, color: "#E1306C", flexShrink: 0,
              }}>
                {(authorHandle || "?")[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text size="xs" fw={600} mb={4}>@{authorHandle}</Text>
                <ExpandableText text={caption} size="xs" collapsedLines={2} threshold={90} />
              </div>
            </Group>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <IconBrandInstagram size={14} style={{ opacity: 0.6 }} />
              {onSave && (
                <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("post", reel)} />
              )}
            </Group>
          </Group>

          <IgMediaPreview media={mediaItems} compact={compact} postUrl={postUrl} />

          {date && <Text size="xs" c="dimmed">{date}</Text>}

          <Divider my={0} />

          <Group justify="space-between" align="center">
            <Group gap="lg">
              <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{likeLabel}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#1d9bf0" /><Text size="xs" c="dimmed">{commentLabel}</Text></Group>
            </Group>
            {postUrl && (
              <Text size="xs" c="blue" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                {t("competitorLookup.viewArrow")}
              </Text>
            )}
          </Group>
          <HiddenCountNote likes={likeCount} comments={commentCount} />
        </Stack>
      </Card>
    );
  }

  function objectValuesArray(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.values(value).filter(Boolean);
  }

  function toIgArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (Array.isArray(value.posts)) return value.posts;
    if (Array.isArray(value.reels)) return value.reels;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.medias)) return value.medias;
    if (Array.isArray(value.media) && !isLikelyNormalizedIgPost(value)) return value.media;
    if (Array.isArray(value.highlights)) return value.highlights;
    if (Array.isArray(value.data?.items)) return value.data.items;
    if (Array.isArray(value.data?.posts)) return value.data.posts;
    if (Array.isArray(value.data?.reels)) return value.data.reels;
    if (Array.isArray(value.data?.medias)) return value.data.medias;
    if (Array.isArray(value.edges)) return value.edges.map((edge) => edge?.node || edge).filter(Boolean);

    const objectBacked =
      objectValuesArray(value.posts).length ? objectValuesArray(value.posts) :
      objectValuesArray(value.reels).length ? objectValuesArray(value.reels) :
      objectValuesArray(value.items).length ? objectValuesArray(value.items) :
      objectValuesArray(value.medias).length ? objectValuesArray(value.medias) :
      objectValuesArray(value.data?.items).length ? objectValuesArray(value.data.items) :
      objectValuesArray(value.data?.posts).length ? objectValuesArray(value.data.posts) :
      objectValuesArray(value.data?.reels).length ? objectValuesArray(value.data.reels) :
      [];

    return objectBacked;
  }

  function isLikelyNormalizedIgPost(value) {
    if (!value || typeof value !== "object") return false;
    const hasIdentity = Boolean(
      value.code ||
      value.shortcode ||
      value.pk ||
      value.id ||
      value.url ||
      value.permalink
    );
    const hasDisplayData = Boolean(
      value.user?.username ||
      value.owner?.username ||
      value.username ||
      value.like_count != null ||
      value.comment_count != null ||
      value.taken_at ||
      value.taken_at_timestamp ||
      value.created_at ||
      value.media?.length
    );
    return hasIdentity && hasDisplayData;
  }

  function hasUsefulIgShellFields(value) {
    if (!value || typeof value !== "object") return false;
    return Boolean(
      value.user?.username ||
      value.owner?.username ||
      value.username ||
      value.like_count != null ||
      value.comment_count != null ||
      value.taken_at ||
      value.taken_at_timestamp ||
      value.created_at ||
      value.url ||
      value.permalink ||
      value.code ||
      value.shortcode
    );
  }

  function mergeIgPostShell(shell, inner) {
    if (!shell || typeof shell !== "object" || !inner || typeof inner !== "object") return inner || shell;
    const shellCaption = shell.caption?.text || (typeof shell.caption === "string" ? shell.caption : null);
    return {
      ...inner,
      ...shell,
      user: shell.user?.username ? shell.user : (inner.user || shell.user),
      owner: shell.owner?.username ? shell.owner : (inner.owner || shell.owner),
      caption: shellCaption || inner.caption || shell.caption,
      media: Array.isArray(shell.media) && shell.media.length ? shell.media : inner.media,
      like_count: shell.like_count ?? inner.like_count,
      comment_count: shell.comment_count ?? inner.comment_count,
      taken_at: shell.taken_at ?? inner.taken_at,
      taken_at_timestamp: shell.taken_at_timestamp ?? inner.taken_at_timestamp,
      created_at: shell.created_at ?? inner.created_at,
      url: shell.url || shell.permalink || inner.url || inner.permalink,
      permalink: shell.permalink || shell.url || inner.permalink || inner.url,
    };
  }

  function unwrapIgResultPost(value) {
    if (!value) return value;

    // Server-normalized posts intentionally keep the original raw response on
    // fields like `data`. Do not unwrap those normalized posts back into the raw
    // nested payload, or the card loses username/date/metric fields and shows
    // @unknown plus dashes.
    if (isLikelyNormalizedIgPost(value)) return value;

    const inner =
      value?.node ||
      value?.media ||
      value?.item ||
      value?.result ||
      value?.response ||
      value?.data?.xdt_shortcode_media ||
      value?.data?.shortcode_media ||
      value?.data?.media ||
      value?.data?.post ||
      value?.data ||
      value;

    if (inner !== value && hasUsefulIgShellFields(value)) return mergeIgPostShell(value, inner);
    return inner;
  }

  function InstagramResults({ data, onSave, sortMode = DEFAULT_SORT_MODE }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    // Normalize arrays defensively. Some ScrapeCreators Instagram account
    // responses return { posts: [...] }, some return { data: { items: [...] } },
    // and some return a single object. Never call .map on a non-array.
    const postsArr = sortPostsForDisplay(toIgArray(results.userPosts).map(unwrapIgResultPost).filter(Boolean), sortMode);
    const reelsSearchArr = sortPostsForDisplay(toIgArray(results.reelsSearch).map(unwrapIgResultPost).filter(Boolean), sortMode);
    const userReelsArr = sortPostsForDisplay(toIgArray(results.userReels).map((r) => {
      if (isLikelyNormalizedIgPost(r)) return r;
      const candidate = r?.media && !Array.isArray(r.media) ? r.media : r;
      return unwrapIgResultPost(candidate);
    }).filter(Boolean), sortMode);
    const highlightItems = sortPostsForDisplay(toIgArray(results.highlightDetail).map(unwrapIgResultPost).filter(Boolean), sortMode);
    const searchPostsArr = sortPostsForDisplay(toIgArray(results.searchPosts).map(unwrapIgResultPost).filter(Boolean), sortMode);

    const count =
      (results.profile ? 1 : 0) +
      (Array.isArray(postsArr) ? postsArr.length : 0) +
      (results.singlePost ? 1 : 0) +
      (Array.isArray(searchPostsArr) ? searchPostsArr.length : 0) +
      (Array.isArray(reelsSearchArr) ? reelsSearchArr.length : 0) +
      (Array.isArray(userReelsArr) ? userReelsArr.length : 0) +
      (Array.isArray(highlightItems) ? highlightItems.length : 0);

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>{t("competitorLookup.instagramResults")}</Text>
          <Badge variant="light">{count} item{count !== 1 ? "s" : ""}</Badge>
        </Group>

        {errors.length > 0 && (
          <Alert color="orange" title={t("competitorLookup.someRequestsFailed")}>
            {errors.map((e, i) => (
              <Text key={i} size="sm">{e.endpoint}: {e.error}</Text>
            ))}
          </Alert>
        )}

        {results.profile && (
          <>
            <Divider label="Profile" labelPosition="center" />
            <IgProfileCard profile={results.profile} />
          </>
        )}

        {postsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`User Posts (${postsArr.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={postsArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {postsArr.map((p, i) => <IgPostCard key={p.pk || p.id || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {results.singlePost && (
          <>
            <Divider label={t("competitorLookup.postDetail")} labelPosition="center" />
            <IgPostCard post={results.singlePost?.data?.xdt_shortcode_media || results.singlePost?.data || results.singlePost} onSave={onSave} />
          </>
        )}

        {searchPostsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`Search Posts (${searchPostsArr.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={searchPostsArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {searchPostsArr.map((p, i) => <IgPostCard key={p.pk || p.id || p.code || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {reelsSearchArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`Reels Search (${reelsSearchArr.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={reelsSearchArr} onSave={onSave} type="post" />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {reelsSearchArr.map((r, i) => <IgReelCard key={r.pk || r.id || i} reel={r} onSave={onSave} compact />)}
            </SimpleGrid>
          </>
        )}

        {userReelsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`User Reels (${userReelsArr.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={userReelsArr} onSave={onSave} type="post" />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {userReelsArr.map((r, i) => <IgReelCard key={r.pk || r.id || i} reel={r} onSave={onSave} compact />)}
            </SimpleGrid>
          </>
        )}

        {highlightItems.length > 0 && (
          <>
            <Divider label={`Highlight (${highlightItems.length} stories)`} labelPosition="center" />
            <Text size="sm" c="dimmed">{highlightItems.length} highlight stories found.</Text>
          </>
        )}
      </Stack>
    );
  }

  /* ─── TikTok Results Display ─────────────────────────────────────────── */

  function TkProfileCard({ profile }) {
    if (!profile) return null;
    const u = profile.user || profile.data?.user || profile;
    const stats = profile.stats || profile.statsV2 || u.stats || {};
    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="start">
            <Group gap="sm">
              <div>
                <Group gap="xs">
                  <Title order={4}>{u.nickname || u.uniqueId}</Title>
                  {u.verified && <Badge size="xs" color="blue">{t("competitorLookup.verified")}</Badge>}
                  {u.privateAccount && <Badge size="xs" color="gray">{t("competitorLookup.private")}</Badge>}
                </Group>
                <Text size="xs" c="dimmed">@{u.uniqueId}</Text>
                {u.commerceUserInfo?.category && <Badge size="xs" variant="outline" mt={2}>{u.commerceUserInfo.category}</Badge>}
              </div>
            </Group>
            <Badge variant="light" color="dark">
              <IconBrandTiktok size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.profile")}
            </Badge>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: t("competitorLookup.followers"), value: fmtNum(stats.followerCount ?? u.followerCount) },
              { label: t("competitorLookup.following"), value: fmtNum(stats.followingCount ?? u.followingCount) },
              { label: t("competitorLookup.likes"), value: fmtNum(stats.heartCount ?? stats.heart ?? u.heartCount) },
              { label: t("competitorLookup.videos"), value: fmtNum(stats.videoCount ?? u.videoCount) },
            ].map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="lg">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>

          {u.signature && (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{u.signature}</Text>
          )}

          {u.bioLink?.link && (
            <Text size="xs" c="blue">{u.bioLink.link}</Text>
          )}
        </Stack>
      </Card>
    );
  }

  function looksLikeTikTokVideo(video) {
    if (!video || typeof video !== "object" || Array.isArray(video)) return false;
    return Boolean(
      video.aweme_id ||
      video.awemeId ||
      video.id_str ||
      video.item_id ||
      video.desc ||
      video.description ||
      video.statistics ||
      video.stats ||
      video.statsV2 ||
      video.author ||
      video.author_info ||
      video.share_url ||
      video.create_time ||
      video.createTime ||
      video.create_time_utc
    );
  }

  function unwrapTikTokVideo(video) {
    if (!video || typeof video !== "object") return video || null;
    if (looksLikeTikTokVideo(video)) return video;
    const wrapped = video.aweme_info || video.awemeInfo || video.aweme_detail || video.awemeDetail || video.aweme || video.item || video.post || video.result || video.data;
    return wrapped && wrapped !== video ? unwrapTikTokVideo(wrapped) : video;
  }

  function getFirstUrl(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.find(Boolean) || null;
    if (Array.isArray(value.url_list)) return value.url_list.find(Boolean) || null;
    return value.url || value.uri || null;
  }

  function getTikTokAuthor(video) {
    const v = unwrapTikTokVideo(video) || {};
    const candidate = v.author_info || v.author || v.user || v.userInfo?.user || v.user_info || {};
    const a = typeof candidate === "string" ? { uniqueId: candidate, unique_id: candidate, nickname: candidate } : (candidate || {});
    const unique = a.uniqueId || a.unique_id || a.username || a.handle || v.author_unique_id || v.authorHandle || v.author_username || v.owner_handle || null;
    return {
      ...a,
      id: a.id || a.uid || a.secUid || a.sec_uid || v.author_user_id || v.author_id || v.authorId || null,
      uniqueId: unique,
      unique_id: unique,
      nickname: a.nickname || a.nick_name || a.name || a.displayName || v.author_name || unique || null,
      avatarThumb: a.avatarThumb || getFirstUrl(a.avatar_thumb) || a.avatarMedium || getFirstUrl(a.avatar_medium) || getFirstUrl(a.avatar_168x168) || getFirstUrl(a.avatar) || null,
    };
  }

  function getTikTokCount(stats, ...keys) {
    for (const key of keys) {
      const raw = stats?.[key];
      if (raw == null || raw === "") continue;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      const text = String(raw).trim().replace(/,/g, "");
      const match = text.match(/^([0-9]*\.?[0-9]+)\s*([kKmMbB])?$/);
      if (match) {
        const base = Number(match[1]);
        const suffix = String(match[2] || "").toLowerCase();
        const multiplier = suffix === "k" ? 1000 : suffix === "m" ? 1000000 : suffix === "b" ? 1000000000 : 1;
        return Math.round(base * multiplier);
      }
      const n = Number(text);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function formatTikTokDate(value) {
    if (!value) return "";
    const n = Number(value);
    const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "";
  }

  function TkVideoCard({ video, onSave, compact }) {
    if (!video) return null;
    const v = unwrapTikTokVideo(video) || {};
    const desc = v.desc || v.description || v.video_description || v.title || "";
    const stats = v.stats || v.statsV2 || v.statistics || v.stats_v2 || {};
    const author = getTikTokAuthor(v);
    const created = formatTikTokDate(v.createTime ?? v.create_time ?? v.created_at ?? v.publishTime ?? v.create_time_utc);
    const authorHandle = author.uniqueId || author.unique_id || author.nickname;
    const videoId = v.aweme_id || v.awemeId || v.id_str || v.id || v.video_id || v.item_id;
    const postUrl = v.share_url || v.url || v.webVideoUrl || v.share_info?.share_url || (videoId ? `https://www.tiktok.com/@${authorHandle || 'user'}/video/${videoId}` : null);
    const likeCount = getTikTokCount(stats, "diggCount", "digg_count", "likeCount", "like_count") ?? getTikTokCount(v, "diggCount", "digg_count", "likeCount", "like_count");
    const commentCount = getTikTokCount(stats, "commentCount", "comment_count") ?? getTikTokCount(v, "commentCount", "comment_count");
    const shareCount = getTikTokCount(stats, "shareCount", "share_count", "forward_count") ?? getTikTokCount(v, "shareCount", "share_count", "forward_count");

    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <ExpandableText text={desc} size={compact ? "xs" : "sm"} collapsedLines={compact ? 2 : 4} threshold={compact ? 90 : 180} />
          <Text size="xs" c="dimmed">
            {t("competitorLookup.postedBy", { name: author.uniqueId || author.unique_id || author.nickname || t("common.unknown") })}
            {created ? ` · ${created}` : ""}
          </Text>
          <Group gap="xs">
            {[
              { label: "❤️", val: likeCount },
              { label: "💬", val: commentCount },
              { label: "🔗", val: shareCount },
            ].filter(x => x.val != null).map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label} {formatCount(val)}</Badge>
            ))}
          </Group>
          <HiddenCountNote likes={likeCount} comments={commentCount} />
          {onSave && (
            <Group justify="flex-end">
              {postUrl && (
                <Button size="xs" variant="subtle" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  {t("competitorLookup.viewPost")}
                </Button>
              )}
              <SaveButton label={t("competitorLookup.savePost")} onSave={() => onSave("post", { ...v, author, stats: { ...stats, diggCount: likeCount ?? 0, commentCount: commentCount ?? 0, shareCount: shareCount ?? 0 }, url: postUrl, share_url: postUrl })} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function TkUserListCard({ users, title }) {
    const list = Array.isArray(users) ? users : [];
    if (!list.length) return <Text size="sm" c="dimmed">{t("competitorLookup.noUsersFound")}</Text>;
    return (
      <Stack gap="xs">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
          {list.slice(0, 30).map((u, i) => {
            const user = u.user_info || u;
            return (
              <Card key={user.uid || user.id || i} withBorder radius="sm" p="xs">
                <Group gap="sm" wrap="nowrap">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} lineClamp={1}>{user.nickname || user.unique_id || user.uniqueId}</Text>
                    <Text size="xs" c="dimmed" lineClamp={1}>@{user.unique_id || user.uniqueId}</Text>
                    <Group gap="xs" mt={2}>
                      {user.follower_count != null && <Badge size="xs" variant="light">{t("competitorLookup.followersCount", { count: fmtNum(user.follower_count) })}</Badge>}
                    </Group>
                  </div>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    );
  }

  function TiktokResults({ data, onSave, sortMode = DEFAULT_SORT_MODE }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    // Profile & stats
    const profileData = results.profile;
    // Profile videos from profile endpoint's itemList OR from profileVideos call
    const profileVideos = sortPostsForDisplay((results.profileVideos?.itemList || results.profile?.itemList || []).map(unwrapTikTokVideo).filter(Boolean), sortMode);
    const showProfileVideos = results.profileVideos || (results.profile?.itemList?.length > 0 && !results.profileVideos);
    // Following & Followers
    const followingList = results.following?.followings || results.following?.following_list || [];
    const followersList = results.followers?.followers || [];
    // Transcript
    const transcript = results.transcript?.transcript;
    // Single video/post result
    const singleVideo = results.video || results.post || null;
    // Search results
    const searchUsersList = results.searchUsers?.user_list || [];
    const searchHashtagList = sortPostsForDisplay((results.searchHashtag?.challenge_aweme_list || results.searchHashtag?.aweme_list || []).map(unwrapTikTokVideo).filter(Boolean), sortMode);
    const searchKeywordList = sortPostsForDisplay((results.searchKeyword?.search_item_list || []).map(unwrapTikTokVideo).filter(Boolean), sortMode);

    const count =
      (profileData ? 1 : 0) +
      profileVideos.length +
      followingList.length +
      followersList.length +
      (transcript ? 1 : 0) +
      (singleVideo ? 1 : 0) +
      searchUsersList.length +
      searchHashtagList.length +
      searchKeywordList.length;

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>{t("competitorLookup.tiktokResults")}</Text>
          <Badge variant="light">{t("competitorLookup.itemsCount", { count })}</Badge>
        </Group>

        {errors.length > 0 && (
          <Alert color="orange" title={t("competitorLookup.someRequestsFailed")}>
            {errors.map((e, i) => (
              <Text key={i} size="sm">{e.endpoint}: {e.error}</Text>
            ))}
          </Alert>
        )}

        {profileData && (
          <>
            <Divider label={t("competitorLookup.profile")} labelPosition="center" />
            <TkProfileCard profile={profileData} />
          </>
        )}

        {profileVideos.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.profileVideosCount", { count: profileVideos.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={profileVideos} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {profileVideos.map((v, i) => <TkVideoCard key={v.id || i} video={v} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {followingList.length > 0 && (
          <>
            <Divider label={t("competitorLookup.followingCount", { count: followingList.length })} labelPosition="center" />
            <TkUserListCard users={followingList} title={t("competitorLookup.following")} />
          </>
        )}

        {followersList.length > 0 && (
          <>
            <Divider label={t("competitorLookup.followersCountLabel", { count: followersList.length })} labelPosition="center" />
            <TkUserListCard users={followersList} title={t("competitorLookup.followers")} />
          </>
        )}

        {transcript != null && (
          <>
            <Divider label={t("competitorLookup.transcript")} labelPosition="center" />
            <Card withBorder radius="md" p="md">
              {transcript ? (
                <>
                  <Group justify="flex-end" mb="xs">
                    <SaveButton label={t("competitorLookup.saveTranscript")} onSave={() => saveTiktokTranscript(transcript)} />
                  </Group>
                  <ScrollArea h={300}>
                    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{typeof transcript === 'string' ? transcript : JSON.stringify(transcript, null, 2)}</Text>
                  </ScrollArea>
                </>
              ) : (
                <Text size="sm" c="dimmed">{t("competitorLookup.noTranscriptAvailable")}</Text>
              )}
            </Card>
          </>
        )}

        {singleVideo && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.tiktokPost")} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={[singleVideo]} onSave={onSave} type="post" />
            </Group>
            <TkVideoCard video={singleVideo} onSave={onSave} compact />
          </>
        )}

        {searchUsersList.length > 0 && (
          <>
            <Divider label={t("competitorLookup.searchUsersCount", { count: searchUsersList.length })} labelPosition="center" />
            <TkUserListCard users={searchUsersList} title={t("competitorLookup.searchUsers")} />
          </>
        )}

        {searchHashtagList.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.hashtagVideosCount", { count: searchHashtagList.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={searchHashtagList} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {searchHashtagList.map((v, i) => <TkVideoCard key={v.aweme_id || v.id || i} video={v} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {searchKeywordList.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.keywordSearchCount", { count: searchKeywordList.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={searchKeywordList} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {searchKeywordList.map((v, i) => (
                <TkVideoCard key={v.aweme_id || v.id || i} video={v} onSave={onSave} compact />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    );
  }

  /* ─── Reddit Results Display ─────────────────────────────────────────── */

  function RedditSubredditCard({ details }) {
    if (!details) return null;
    const rulesArray = Array.isArray(details.rules) ? details.rules : (details.rules ? [details.rules] : []);
    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="start">
            <div>
              <Group gap="xs">
                <Title order={4}>r/{details.display_name}</Title>
              </Group>
              {details.advertiser_category && (
                <Badge size="xs" variant="outline" mt={2}>{details.advertiser_category}</Badge>
              )}
            </div>
            <Badge variant="light" color="orange">
              <IconBrandReddit size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.subreddit")}
            </Badge>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: t("competitorLookup.subscribers"), value: fmtNum(details.subscribers) },
              { label: t("competitorLookup.weeklyActive"), value: fmtNum(details.weekly_active_users) },
              { label: t("competitorLookup.weeklyPosts"), value: fmtNum(details.weekly_contributions) },
            ].filter(x => x.value != null).map(({ label, value }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="lg">{value}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>

          {details.description && (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }} lineClamp={6}>{details.description}</Text>
          )}

          {details.submit_text && (
            <Text size="xs" c="dimmed" lineClamp={3}>{details.submit_text}</Text>
          )}

          {rulesArray.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={4}>{t("competitorLookup.rulesCount", { count: rulesArray.length })}</Text>
              {rulesArray.slice(0, 5).map((r, i) => (
                <Text key={i} size="xs" c="dimmed">• {r?.short_name || r?.title || r}</Text>
              ))}
            </div>
          )}
        </Stack>
      </Card>
    );
  }

  function RedditUserCard({ profile }) {
    if (!profile) return null;
    const username = profile.username || profile.name || profile.display_name || "unknown";
    const created = profile.created_utc ? new Date(Number(profile.created_utc) * 1000).toLocaleDateString() : "";
    const profileUrl = profile.url || `https://www.reddit.com/user/${username}/`;
    const avatar = profile.icon_img || profile.avatar || profile.profile_img;

    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="start" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar src={avatar} radius="xl" color="orange">
                <IconBrandReddit size={18} />
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <Title order={4} lineClamp={1}>u/{username}</Title>
                <Text size="xs" c="dimmed" lineClamp={1}>{profileUrl}</Text>
              </div>
            </Group>
            <Button size="xs" variant="subtle" component="a" href={profileUrl} target="_blank" rel="noopener noreferrer">
              {t("competitorLookup.viewProfile")}
            </Button>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: t("competitorLookup.totalKarma"), raw: profile.total_karma },
              { label: t("competitorLookup.postKarma"), raw: profile.link_karma },
              { label: t("competitorLookup.commentKarma"), raw: profile.comment_karma },
              { label: t("competitorLookup.awardeeKarma"), raw: profile.awardee_karma },
            ].filter(x => x.raw != null).map(({ label, raw }) => (
              <Stack key={label} align="center" gap={0}>
                <Text fw={700} size="lg">{fmtNum(raw)}</Text>
                <Text size="xs" c="dimmed">{label}</Text>
              </Stack>
            ))}
          </Group>

          <Group gap="xs">
            {created && <Badge variant="light" size="xs">{t("competitorLookup.createdDate", { date: created })}</Badge>}
            {profile.is_gold === true && <Badge variant="outline" size="xs">{t("competitorLookup.redditPremium")}</Badge>}
            {profile.is_mod === true && <Badge variant="outline" size="xs">{t("competitorLookup.moderator")}</Badge>}
            {profile.verified === true && <Badge variant="outline" size="xs">{t("common.verified")}</Badge>}
          </Group>
        </Stack>
      </Card>
    );
  }

  function redditCleanMediaUrl(value) {
    const text = String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (!/^https?:\/\//i.test(text)) return "";
    if (/^(self|default|nsfw|spoiler|image|video)$/i.test(text)) return "";
    return text;
  }

  function redditLooksLikeImage(value) {
    return /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(String(value || ""));
  }

  function redditLooksLikeVideo(value) {
    return /\.(mp4|m3u8|mov|webm)(?:[?#].*)?$/i.test(String(value || ""));
  }

  function redditPostDate(post = {}) {
    const raw = post.created_utc ?? post.createdUtc ?? post.created_at ?? post.createdAt ?? post.created;
    if (!raw) return "";
    const numeric = Number(raw);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
      : new Date(raw);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "";
  }

  function addRedditMediaItem(items, item = {}) {
    const url = redditCleanMediaUrl(item.url || item.src || item.source);
    const thumbnail = redditCleanMediaUrl(item.thumbnail || item.preview || item.poster || item.thumbnail_url || url);
    if (!url && !thumbnail) return;
    const type = item.type || (redditLooksLikeVideo(url) ? "video" : "image");
    const next = { type, url: url || thumbnail, thumbnail: thumbnail || url };
    const key = `${next.type}:${next.url}`;
    if (!items.some((existing) => `${existing.type}:${existing.url}` === key)) items.push(next);
  }

  function getRedditMediaItems(post = {}) {
    const items = [];
    const arrays = [post.media, post.media_preview, post.images, post.gallery, post.mediaItems].filter(Array.isArray);
    arrays.forEach((arr) => arr.forEach((item) => addRedditMediaItem(items, item)));

    const previewImages = post.preview?.images;
    if (Array.isArray(previewImages)) {
      previewImages.forEach((image) => {
        const source = image?.source || {};
        const resolutions = Array.isArray(image?.resolutions) ? image.resolutions : [];
        const best = resolutions[resolutions.length - 1] || source;
        addRedditMediaItem(items, {
          type: "image",
          url: source.url || best.url,
          thumbnail: best.url || source.url,
        });
      });
    }

    const directUrl = redditCleanMediaUrl(post.media_url || post.url_overridden_by_dest || post.external_url || "");
    if (directUrl && (redditLooksLikeImage(directUrl) || redditLooksLikeVideo(directUrl))) {
      addRedditMediaItem(items, { type: redditLooksLikeVideo(directUrl) ? "video" : "image", url: directUrl, thumbnail: post.thumbnail });
    }

    if (post.thumbnail) addRedditMediaItem(items, { type: "image", url: post.thumbnail, thumbnail: post.thumbnail });

    return items.slice(0, 4);
  }

  function RedditMediaPreview({ post, compact }) {
    const items = getRedditMediaItems(post);
    if (!items.length) return null;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: items.length === 1 ? "minmax(120px, 220px)" : "repeat(auto-fit, minmax(110px, 160px))",
          gap: 8,
          maxWidth: items.length === 1 ? 240 : 700,
          marginTop: 6,
        }}
      >
        {items.map((item, index) => {
          const src = item.thumbnail || item.url;
          const isVideo = item.type === "video" || redditLooksLikeVideo(item.url);
          return (
            <a
              key={`${item.url || src}-${index}`}
              href={item.url || src}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: "relative",
                display: "block",
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid var(--mantine-color-gray-3)",
                background: "var(--mantine-color-gray-0)",
                height: compact ? 96 : 130,
              }}
            >
              {isVideo && redditLooksLikeVideo(src) ? (
                <Group justify="center" align="center" style={{ width: "100%", height: "100%" }}>
                  <Badge size="sm" variant="light">{t("common.video")}</Badge>
                </Group>
              ) : (
                <img
                  src={src}
                  alt={t("competitorLookup.redditMediaPreview")}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
              {isVideo && (
                <Badge size="xs" variant="filled" style={{ position: "absolute", left: 6, bottom: 6 }}>
                  {t("common.video")}
                </Badge>
              )}
            </a>
          );
        })}
      </div>
    );
  }

  function RedditPostCard({ post, onSave, compact }) {
    if (!post) return null;
    const title = post.title || "";
    const body = post.selftext || post.body || post.description || post.caption || post.text || "";
    const created = redditPostDate(post);
    const postUrl = post.reddit_url || (post.permalink ? `https://reddit.com${post.permalink}` : post.url);
    const flair = post.link_flair_text || post.flair || post.post_flair;

    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Text size={compact ? "sm" : "md"} fw={600} lineClamp={2}>{title || <i>{t("competitorLookup.noTitle")}</i>}</Text>
          <Text size="xs" c="dimmed">
            {post.author ? t("competitorLookup.postedBy", { name: `u/${post.author}` }) : ""}
            {post.subreddit ? ` · r/${post.subreddit}` : ""}
            {created ? ` · ${created}` : ""}
          </Text>
          <Group gap="xs">
            {[
              { label: "⬆", val: post.score ?? post.ups },
              { label: "💬", val: post.num_comments },
              { label: "🏆", val: post.total_awards_received },
            ].filter(x => x.val != null && x.val > 0).map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label} {fmtNum(val)}</Badge>
            ))}
            {flair && <Badge variant="outline" size="xs">{flair}</Badge>}
          </Group>
          <RedditMediaPreview post={post} compact={compact} />
          {body && <ExpandableText text={body} size="xs" dimmed collapsedLines={compact ? 3 : 5} threshold={compact ? 140 : 260} />}
          {onSave && (
            <Group justify="flex-end">
              {postUrl && (
                <Button size="xs" variant="subtle" component="a" href={postUrl} target="_blank" rel="noopener noreferrer">
                  {t("competitorLookup.viewPost")}
                </Button>
              )}
              <SaveButton label={t("competitorLookup.savePost")} onSave={() => onSave("post", post)} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function RedditCommentsList({ comments }) {
    const list = Array.isArray(comments) ? comments : [];
    if (!list.length) return <Text size="sm" c="dimmed">{t("competitorLookup.noCommentsFound")}</Text>;
    return (
      <Stack gap="xs">
        <Group justify="flex-end">
          <SaveAllButton items={list} onSave={(_type, c) => saveRedditComment(c)} type="comment" />
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {list.slice(0, 30).map((c, i) => (
            <Card key={c.id || i} withBorder radius="sm" p="xs">
              <Group gap={6} mb={4} wrap="nowrap">
                <Text size="xs" fw={600} lineClamp={1} style={{ flex: 1 }}>u/{c.author || t("competitorLookup.deleted")}</Text>
                {(c.score > 0) && <Badge size="xs" variant="light">{c.score} ⬆</Badge>}
              </Group>
              <Text size="xs" lineClamp={4}>{c.body || c.text || ""}</Text>
              {c.replies?.length > 0 && (
                <Text size="xs" c="dimmed" mt={2}>{t("competitorLookup.repliesCount", { count: c.replies.length })}</Text>
              )}
              <Group justify="flex-end" mt={4}>
                <SaveButton label={t("competitorLookup.save")} onSave={() => saveRedditComment(c)} />
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  function RedditAdCard({ ad }) {
    if (!ad) return null;
    const creative = ad.creative || {};
    const profile = ad.profile_info || {};
    return (
      <Card withBorder radius="md" shadow="sm" p="sm">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm" lineClamp={2}>{creative.title || creative.headline || ad.id}</Text>
            <Group gap="xs">
              <Badge variant="light" color="orange" size="xs">Ad</Badge>
              <SaveButton label={t("competitorLookup.save")} onSave={() => saveRedditAd(ad)} />
            </Group>
          </Group>
          {creative.body && <Text size="xs" lineClamp={3}>{creative.body}</Text>}
          <Group gap="xs">
            {ad.objective && <Badge size="xs" variant="outline">{ad.objective}</Badge>}
            {ad.industry && <Badge size="xs" variant="outline">{ad.industry}</Badge>}
            {ad.budget_category && <Badge size="xs" variant="outline">{ad.budget_category}</Badge>}
          </Group>
          {profile.name && <Text size="xs" c="dimmed">{t("competitorLookup.by")} {profile.name}</Text>}
        </Stack>
      </Card>
    );
  }

  function RedditResults({ data, onSave, sortMode = DEFAULT_SORT_MODE }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    const profileData = results.profile || results.userProfile;
    const detailsData = results.subredditDetails;
    const singlePost = results.post || results.postDetails || results.postComments?.post;
    const userPostsArr = sortPostsForDisplay(results.userPosts?.posts || results.userPosts?.items || [], sortMode);
    const subredditPostsArr = sortPostsForDisplay(results.subredditPosts?.posts || [], sortMode);
    const subredditSearchArr = sortPostsForDisplay(results.subredditSearch?.posts || [], sortMode);
    const commentsArr = sortPostsForDisplay(results.postComments?.comments || [], sortMode);
    const searchArr = sortPostsForDisplay(results.search?.posts || [], sortMode);
    const adsArr = sortPostsForDisplay(results.searchAds?.ads || [], sortMode);
    const adDetail = results.getAd?.data || results.getAd;

    const count =
      (profileData ? 1 : 0) +
      (detailsData ? 1 : 0) +
      (singlePost ? 1 : 0) +
      userPostsArr.length +
      subredditPostsArr.length +
      subredditSearchArr.length +
      commentsArr.length +
      searchArr.length +
      adsArr.length +
      (adDetail ? 1 : 0);

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>{t("competitorLookup.redditResults")}</Text>
          <Badge variant="light">{t("competitorLookup.itemsCount", { count })}</Badge>
        </Group>

        {errors.length > 0 && (
          <Alert color="orange" title={t("competitorLookup.someRequestsFailed")}>
            {errors.map((e, i) => (
              <Text key={i} size="sm">{e.endpoint}: {e.error}</Text>
            ))}
          </Alert>
        )}

        {profileData && (
          <>
            <Divider label={t("competitorLookup.userProfile")} labelPosition="center" />
            <RedditUserCard profile={profileData} />
          </>
        )}

        {detailsData && (
          <>
            <Divider label={t("competitorLookup.subredditDetails")} labelPosition="center" />
            <RedditSubredditCard details={detailsData} />
          </>
        )}

        {singlePost && (
          <>
            <Divider label={t("competitorLookup.postMetrics")} labelPosition="center" />
            <RedditPostCard post={singlePost} onSave={onSave} compact />
          </>
        )}

        {userPostsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`User Posts (${userPostsArr.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={userPostsArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {userPostsArr.map((p, i) => <RedditPostCard key={p.id || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {subredditPostsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.subredditPostsCount", { count: subredditPostsArr.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={subredditPostsArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {subredditPostsArr.map((p, i) => <RedditPostCard key={p.id || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {subredditSearchArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.subredditSearchCount", { count: subredditSearchArr.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={subredditSearchArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {subredditSearchArr.map((p, i) => <RedditPostCard key={p.id || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {commentsArr.length > 0 && (
          <>
            <Divider label={t("competitorLookup.commentsCount", { count: commentsArr.length })} labelPosition="center" />
            <RedditCommentsList comments={commentsArr} />
          </>
        )}

        {searchArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.searchResultsCount", { count: searchArr.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={searchArr} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {searchArr.map((p, i) => <RedditPostCard key={p.id || i} post={p} onSave={onSave} compact />)}
            </Stack>
          </>
        )}

        {adsArr.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.adsCount", { count: adsArr.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={adsArr} onSave={(_type, a) => saveRedditAd(a)} type="ad" />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {adsArr.map((a, i) => <RedditAdCard key={a.id || i} ad={a} />)}
            </SimpleGrid>
          </>
        )}

        {adDetail && (
          <>
            <Divider label={t("competitorLookup.adDetail")} labelPosition="center" />
            <RedditAdCard ad={adDetail} />
          </>
        )}
      </Stack>
    );
  }

  const posts = sortPostsForDisplay(Array.isArray(result?.posts) ? result.posts : [], sortMode);
  const SHOW_GLOBAL_LOOKUP = false;
  const SHOW_ADVANCED_LOOKUP = false;

  return (
    <Card withBorder radius="lg" shadow="sm" p="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} zIndex={1000} />
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>{t("competitorLookup.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("competitorLookup.subtitle")}
            </Text>
          </div>
          <Stack align="flex-end" gap={6}>
            <SortSelect value={sortMode} onChange={setSortMode} />
            {creditsRemaining != null && (
              <Card withBorder radius="md" p="xs" px="md" shadow="xs" style={{ minWidth: 160, textAlign: "center" }}>
                <Text size="xs" c="dimmed" fw={500}>{t("competitorLookup.creditsRemaining")}</Text>
                <Text fw={700} size="lg" c={creditsRemaining < 10 ? "red" : creditsRemaining < 50 ? "orange" : "teal"}>
                  {creditsRemaining.toLocaleString()}
                </Text>
              </Card>
            )}
          </Stack>
        </Group>

        {!Object.values(connectedPlatforms).some(Boolean) && (
          <Alert variant="light" color="blue" title={t("competitorLookup.noPlatformsConnected")}>
            {t("competitorLookup.goToConnectedIntegrations")}
          </Alert>
        )}

        {Object.values(connectedPlatforms).some(Boolean) && (
          <Tabs
            data-tour="competitor-lookup-search"
            defaultValue={Object.keys(connectedPlatforms).find((k) => connectedPlatforms[k]) || "x"}
            keepMounted={false}
          >
            <Tabs.List>
              {connectedPlatforms.x && <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>X / Twitter</Tabs.Tab>}
              {connectedPlatforms.linkedin && <Tabs.Tab value="linkedin" leftSection={<IconBrandLinkedin size={16} color="#0A66C2" />}>LinkedIn</Tabs.Tab>}
              {connectedPlatforms.instagram && <Tabs.Tab value="instagram" leftSection={<IconBrandInstagram size={16} color="#E1306C" />}>Instagram</Tabs.Tab>}
              {connectedPlatforms.tiktok && <Tabs.Tab value="tiktok" leftSection={<IconBrandTiktok size={16} />}>TikTok</Tabs.Tab>}
              {connectedPlatforms.reddit && <Tabs.Tab value="reddit" leftSection={<IconBrandReddit size={16} color="#FF4500" />}>Reddit</Tabs.Tab>}
              {connectedPlatforms.youtube && <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} color="#FF0000" />}>YouTube</Tabs.Tab>}
            </Tabs.List>


            {connectedPlatforms.x && (
              <Tabs.Panel value="x" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.xSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.searchX")}
                      placeholder={t("competitorLookup.xSimplePlaceholder")}
                      value={simpleQueries.x}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, x: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleXSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={xLoading} onClick={handleSimpleXSubmit}>{t("competitorLookup.searchX")}</Button>
                  </Group>
                  <Alert variant="light" color="blue" radius="md" icon={<IconInfoCircle size={16} />}>
                    {t("competitorLookup.xVideoFallback")}
                  </Alert>
                  {xError && <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>{xError}</Alert>}
                  {xResult && <XResults data={xResult} onSave={handleXSave} sortMode={sortMode} />}
                  {getXNextToken(xResult) && (
                    <Group justify="center">
                      <Button variant="light" loading={xLoadingMore} onClick={handleLoadMoreX}>
                        {xResult?.mode === "account" ? t("competitorLookup.loadNextPosts") : t("competitorLookup.loadNextResults")}
                      </Button>
                    </Group>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.youtube && (
              <Tabs.Panel value="youtube" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.youtubeSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.searchYouTube")}
                      placeholder={t("competitorLookup.youtubeSimplePlaceholder")}
                      value={simpleQueries.youtube}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, youtube: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleYoutubeSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={youtubeLoading} onClick={handleSimpleYoutubeSubmit}>{t("competitorLookup.searchYouTube")}</Button>
                  </Group>
                  {youtubeError && <Alert color="red" title={t("competitorLookup.youtubeError")}>{youtubeError}</Alert>}
                  {youtubeResult && <YoutubeResults data={youtubeResult} onSave={handleYoutubeSave} t={t} sortMode={sortMode} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.linkedin && (
              <Tabs.Panel value="linkedin" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.linkedinSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.linkedinSearch")}
                      placeholder={t("competitorLookup.linkedinSimplePlaceholder")}
                      value={simpleQueries.linkedin}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, linkedin: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleLinkedinSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={linkedinLoading} onClick={handleSimpleLinkedinSubmit}>{t("competitorLookup.searchLinkedin")}</Button>
                  </Group>
                  {linkedinError && <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>{linkedinError}</Alert>}
                  {linkedinResult && <LinkedinResults data={linkedinResult} onSave={handleLinkedinSave} sortMode={sortMode} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.instagram && (
              <Tabs.Panel value="instagram" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.instagramSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.instagramSearch")}
                      placeholder={t("competitorLookup.instagramSimplePlaceholder")}
                      value={simpleQueries.instagram}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, instagram: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleInstagramSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={instagramLoading} onClick={handleSimpleInstagramSubmit}>{t("competitorLookup.searchInstagram")}</Button>
                  </Group>
                  {instagramError && <Alert color="red" title={t("competitorLookup.instagramError")}>{instagramError}</Alert>}
                  {instagramResult && <InstagramResults data={instagramResult} onSave={handleInstagramSave} sortMode={sortMode} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.tiktok && (
              <Tabs.Panel value="tiktok" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.tiktokSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.tiktokSearch")}
                      placeholder={t("competitorLookup.tiktokSimplePlaceholder")}
                      value={simpleQueries.tiktok}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, tiktok: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleTiktokSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={tiktokLoading} onClick={handleSimpleTiktokSubmit}>{t("competitorLookup.searchTikTok")}</Button>
                  </Group>
                  {tiktokError && <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>{tiktokError}</Alert>}
                  {tiktokResult && <TiktokResults data={tiktokResult} onSave={handleTiktokSave} sortMode={sortMode} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.reddit && (
              <Tabs.Panel value="reddit" pt="md">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">{t("competitorLookup.redditSimpleDesc")}</Text>
                  <Group align="end">
                    <TextInput
                      label={t("competitorLookup.redditSearch")}
                      placeholder={t("competitorLookup.redditSimplePlaceholder")}
                      value={simpleQueries.reddit}
                      onChange={(e) => setSimpleQueries((p) => ({ ...p, reddit: e.target.value }))}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleSimpleRedditSubmit()}
                    />
                    <Button leftSection={<IconSearch size={16} />} loading={redditLoading} onClick={handleSimpleRedditSubmit}>{t("competitorLookup.searchReddit")}</Button>
                  </Group>
                  {redditError && <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>{redditError}</Alert>}
                  {redditResult && <RedditResults data={redditResult} onSave={handleRedditSave} sortMode={sortMode} />}
                </Stack>
              </Tabs.Panel>
            )}
          </Tabs>
        )}

        {SHOW_GLOBAL_LOOKUP && (
          <Stack gap="md">
            <Card withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <div>
                    <Text fw={700}>{t("competitorLookup.quickLookup")}</Text>
                    <Text size="xs" c="dimmed">{t("competitorLookup.quickLookupDesc")}</Text>
                  </div>
                  {quickLookupResult?.callsUsed != null && (
                    <Badge variant="light" color="teal">{t("competitorLookup.callsUsed", { count: quickLookupResult.callsUsed })}</Badge>
                  )}
                </Group>

                <Group align="end">
                  <TextInput
                    label="Search"
                    placeholder="Examples: https://linkedin.com/in/... , @natgeo instagram , ai video tools"
                    value={quickQuery}
                    onChange={(e) => setQuickQuery(e.target.value)}
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleQuickLookupSubmit(e);
                    }}
                  />
                  <Button
                    leftSection={<IconSearch size={16} />}
                    loading={quickLookupLoading}
                    onClick={handleQuickLookupSubmit}
                  >
                    {t("common.search")}
                  </Button>
                </Group>

                {quickLookupError && (
                  <Alert variant="light" color="red" title={t("competitorLookup.quickLookupError")} icon={<IconAlertCircle />}>
                    {quickLookupError}
                  </Alert>
                )}

                {quickLookupResult?.results?.length > 0 && (
                  <Stack gap="xs">
                    <Group gap="xs" wrap="wrap">
                      <Badge variant="light" color="blue">{t("competitorLookup.resultsCount", { count: quickLookupResult.total || quickLookupResult.results.length })}</Badge>
                      {quickLookupResult.intent && (
                        <Badge variant="light" color="grape">{t("competitorLookup.intent", { intent: quickLookupResult.intent })}</Badge>
                      )}
                      {quickLookupResult.routeUsed && (
                        <Badge variant="outline" color="teal">{t("competitorLookup.route", { route: quickLookupResult.routeUsed })}</Badge>
                      )}
                      {Object.entries(quickLookupResult.bySource || {}).map(([source, items]) => (
                        <Badge key={source} variant="outline" color="gray">
                          {source}: {Array.isArray(items) ? items.length : 0}
                        </Badge>
                      ))}
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                      {quickLookupResult.results.map((item, idx) => (
                        <Card key={item.id || item.url || idx} withBorder radius="sm" p="xs">
                          <Stack gap={4}>
                            <Group justify="space-between" align="start" wrap="nowrap">
                              <Text fw={600} size="sm" lineClamp={2} style={{ flex: 1 }}>
                                {item.title || item.url || t("competitorLookup.untitledResult")}
                              </Text>
                              <Badge size="xs" variant="light">{item.source}</Badge>
                            </Group>

                            {item.text && (
                              <Text size="xs" c="dimmed" lineClamp={3}>{item.text}</Text>
                            )}

                            {item.author && (
                              <Text size="xs" c="dimmed">@{item.author}</Text>
                            )}

                            {item.url && (
                              <Text
                                size="xs"
                                c="blue"
                                component="a"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                lineClamp={1}
                              >
                                {item.url}
                              </Text>
                            )}
                          </Stack>
                        </Card>
                      ))}
                    </SimpleGrid>
                  </Stack>
                )}
              </Stack>
            </Card>

            {SHOW_ADVANCED_LOOKUP && Object.values(connectedPlatforms).some(Boolean) && (
              <Tabs
                defaultValue={Object.keys(connectedPlatforms).find((k) => connectedPlatforms[k]) || "x"}
                keepMounted={false}
              >
                <Tabs.List>
                  {connectedPlatforms.x && (
                    <Tabs.Tab value="x" leftSection={<IconBrandX size={16} />}>
                      X / Twitter
                    </Tabs.Tab>
                  )}
                  {connectedPlatforms.linkedin && (
                    <Tabs.Tab value="linkedin" leftSection={<IconBrandLinkedin size={16} color="#0A66C2" />}>
                      LinkedIn
                    </Tabs.Tab>
                  )}
                  {connectedPlatforms.instagram && (
                    <Tabs.Tab value="instagram" leftSection={<IconBrandInstagram size={16} color="#E1306C" />}>
                      Instagram
                    </Tabs.Tab>
                  )}
                  {connectedPlatforms.tiktok && (
                    <Tabs.Tab value="tiktok" leftSection={<IconBrandTiktok size={16} />}>
                      TikTok
                    </Tabs.Tab>
                  )}
                  {connectedPlatforms.reddit && (
                    <Tabs.Tab value="reddit" leftSection={<IconBrandReddit size={16} color="#FF4500" />}>
                      Reddit
                    </Tabs.Tab>
                  )}
                  {connectedPlatforms.youtube && (
                    <Tabs.Tab value="youtube" leftSection={<IconBrandYoutube size={16} color="#FF0000" />}>
                      YouTube
                    </Tabs.Tab>
                  )}
                </Tabs.List>


                {connectedPlatforms.x && (
                  <Tabs.Panel value="x" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>X / Twitter {t("competitorLookup.lookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.selectDataFetch")}
                      </Text>

                      {/* PROFILE & ACCOUNT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userLookup")} info={t("competitorLookup.userLookupDesc")} />}
                            checked={xOptions.userLookup || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, userLookup: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.followers")} info={t("competitorLookup.followersDesc")} />}
                            checked={xOptions.followers || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, followers: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.following")} info={t("competitorLookup.followingDesc")} />}
                            checked={xOptions.following || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, following: e.target.checked }))}
                          />

                          {(xOptions.userLookup || xOptions.followers || xOptions.following) && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@jack" value={xInputs.username || ""}
                              onChange={(e) => setXInputs(prev => ({ ...prev, username: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* TWEETS & CONTENT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📝 {t("competitorLookup.tweetsContent")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userTweets")} info={t("competitorLookup.userTweetsDesc")} />}
                            checked={xOptions.userTweets || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, userTweets: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userMentions")} info={t("competitorLookup.userMentionsDesc")} />}
                            checked={xOptions.userMentions || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, userMentions: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.tweetLookup")} info={t("competitorLookup.tweetLookupDesc")} />}
                            checked={xOptions.tweetLookup || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, tweetLookup: e.target.checked }))}
                          />

                          {(xOptions.userTweets || xOptions.userMentions) && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@jack" value={xInputs.tweetsUsername || ""}
                              onChange={(e) => setXInputs(prev => ({ ...prev, tweetsUsername: e.target.value }))} />
                          )}

                          {xOptions.tweetLookup && (
                            <TextInput label={t("competitorLookup.tweetUrlId")} placeholder="https://x.com/user/status/123..." value={xInputs.tweetUrl || ""}
                              onChange={(e) => setXInputs(prev => ({ ...prev, tweetUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* SEARCH */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🔍 {t("competitorLookup.search")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchTweets")} info={t("competitorLookup.searchTweetsDesc")} />}
                            checked={xOptions.searchTweets || false}
                            onChange={(e) => setXOptions(prev => ({ ...prev, searchTweets: e.target.checked }))}
                          />

                          {xOptions.searchTweets && (
                            <TextInput label={t("competitorLookup.searchQuery")} placeholder="from:elonmusk OR #tech" value={xInputs.searchQuery || ""}
                              onChange={(e) => setXInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        disabled={!Object.values(xOptions).some(Boolean)}
                        loading={xLoading}
                        onClick={handleXSubmit}
                      >
                        {t("competitorLookup.searchX")}
                      </Button>

                      {xError && (
                        <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                          {xError}
                        </Alert>
                      )}

                      {xResult && <XResults data={xResult} onSave={handleXSave} sortMode={sortMode} />}
                    </Stack>
                  </Tabs.Panel>
                )}

                {connectedPlatforms.youtube && (
                  <Tabs.Panel value="youtube" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>{t("competitorLookup.youtubeLookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.selectDataFetch")}
                      </Text>

                      {/* CHANNEL */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📺 {t("competitorLookup.channel")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.channelDetails")} info={t("competitorLookup.channelDetailsDesc")} />}
                            checked={youtubeOptions.channelDetails || false}
                            onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelDetails: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.channelVideos")} info={t("competitorLookup.channelVideosDesc")} />}
                            checked={youtubeOptions.channelVideos || false}
                            onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelVideos: e.target.checked }))}
                          />

                          {(youtubeOptions.channelDetails || youtubeOptions.channelVideos) && (
                            <TextInput label={t("competitorLookup.channelUrl")} placeholder="https://youtube.com/@MrBeast or UCX6OQ3..." value={youtubeInputs.channelUrl || ""}
                              onChange={(e) => setYoutubeInputs(prev => ({ ...prev, channelUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* VIDEO & CONTENT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🎬 {t("competitorLookup.videoContent")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.videoDetails")} info={t("competitorLookup.videoDetailsDesc")} />}
                            checked={youtubeOptions.videoDetails || false}
                            onChange={(e) => setYoutubeOptions(prev => ({ ...prev, videoDetails: e.target.checked }))}
                          />

                          {youtubeOptions.videoDetails && (
                            <TextInput label={t("competitorLookup.videoUrl")} placeholder="https://youtube.com/watch?v=..." value={youtubeInputs.videoUrl || ""}
                              onChange={(e) => setYoutubeInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* SEARCH */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🔍 {t("competitorLookup.search")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.search")} info={t("competitorLookup.searchDesc")} />}
                            checked={youtubeOptions.search || false}
                            onChange={(e) => setYoutubeOptions(prev => ({ ...prev, search: e.target.checked }))}
                          />

                          {youtubeOptions.search && (
                            <TextInput label={t("competitorLookup.searchQuery")} placeholder="react tutorial, #coding" value={youtubeInputs.searchQuery || ""}
                              onChange={(e) => setYoutubeInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        disabled={!Object.values(youtubeOptions).some(Boolean)}
                        loading={youtubeLoading}
                        onClick={handleYoutubeSubmit}
                      >
                        {t("competitorLookup.searchYouTube")}
                      </Button>

                      {youtubeError && (
                        <Alert color="red" title={t("competitorLookup.youtubeError")} withCloseButton onClose={() => setYoutubeError(null)}>
                          {youtubeError}
                        </Alert>
                      )}

                      {youtubeResult && (
                        <YoutubeResults data={youtubeResult} onSave={handleYoutubeSave} t={t} sortMode={sortMode} />
                      )}
                    </Stack>
                  </Tabs.Panel>
                )}

                {connectedPlatforms.linkedin && (
                  <Tabs.Panel value="linkedin" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>{t("competitorLookup.linkedinLookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.endpointCostsPrefix")} <b>{t("competitorLookup.oneCredit")}</b>.
                      </Text>

                      {/* PROFILE & COMPANY */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>👔 {t("competitorLookup.profileCompany")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.personProfile")} info={t("competitorLookup.personProfileDesc")} />}
                            checked={linkedinOptions.profile || false}
                            onChange={(e) => setLinkedinOptions(prev => ({ ...prev, profile: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.companyPage")} info={t("competitorLookup.companyPageDesc")} />}
                            checked={linkedinOptions.company || false}
                            onChange={(e) => setLinkedinOptions(prev => ({ ...prev, company: e.target.checked }))}
                          />

                          {linkedinOptions.profile && (
                            <TextInput label={t("competitorLookup.profileUrlUsername")} placeholder="https://linkedin.com/in/..."
                              value={linkedinInputs.profile}
                              onChange={(e) => setLinkedinInputs(prev => ({ ...prev, profile: e.target.value }))} />
                          )}

                          {linkedinOptions.company && (
                            <TextInput label={t("competitorLookup.companyUrlName")} placeholder="https://linkedin.com/company/..."
                              value={linkedinInputs.company}
                              onChange={(e) => setLinkedinInputs(prev => ({ ...prev, company: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* POSTS */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📝 {t("competitorLookup.postsContent")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.post")} info={t("competitorLookup.postDesc")} />}
                            checked={linkedinOptions.post || false}
                            onChange={(e) => setLinkedinOptions(prev => ({ ...prev, post: e.target.checked }))}
                          />

                          {linkedinOptions.post && (
                            <TextInput label={t("competitorLookup.postUrl")} placeholder="https://linkedin.com/posts/..."
                              value={linkedinInputs.post}
                              onChange={(e) => setLinkedinInputs(prev => ({ ...prev, post: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        disabled={!linkedinOptions.profile && !linkedinOptions.company && !linkedinOptions.post}
                        loading={linkedinLoading}
                        onClick={handleLinkedinSubmit}
                      >
                        {t("competitorLookup.searchLinkedin")}
                      </Button>

                      {linkedinError && (
                        <Alert variant="light" color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                          {linkedinError}
                        </Alert>
                      )}

                      {linkedinResult && <LinkedinResults data={linkedinResult} onSave={handleLinkedinSave} sortMode={sortMode} />}
                    </Stack>
                  </Tabs.Panel>
                )}

                {connectedPlatforms.instagram && (
                  <Tabs.Panel value="instagram" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>{t("competitorLookup.instagramLookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.endpointCostsPrefix")} <b>{t("competitorLookup.oneCredit")}</b>.
                      </Text>

                      {/* PROFILE SECTION */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.profile")} info={t("competitorLookup.profileDesc")} />}
                            checked={instagramOptions.profile || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, profile: e.target.checked }))}
                          />

                          {instagramOptions.profile && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.username || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, username: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* POSTS SECTION */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📝 {t("competitorLookup.postsContent")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userPosts")} info={t("competitorLookup.userPostsDesc")} />}
                            checked={instagramOptions.userPosts || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, userPosts: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.postReelInfo")} info={t("competitorLookup.postReelInfoDesc")} />}
                            checked={instagramOptions.singlePost || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, singlePost: e.target.checked }))}
                          />

                          {instagramOptions.userPosts && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.userPostsUsername || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, userPostsUsername: e.target.value }))} />
                          )}

                          {instagramOptions.singlePost && (
                            <TextInput label={t("competitorLookup.postUrl")} placeholder="https://instagram.com/p/..." value={instagramInputs.postUrl || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* REELS SECTION */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🎥 {t("competitorLookup.reels")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchReels")} info={t("competitorLookup.searchReelsDesc")} />}
                            checked={instagramOptions.reelsSearch || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, reelsSearch: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userReels")} info={t("competitorLookup.userReelsDesc")} />}
                            checked={instagramOptions.userReels || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, userReels: e.target.checked }))}
                          />

                          {instagramOptions.reelsSearch && (
                            <TextInput label={t("competitorLookup.searchTerm")} placeholder="fitness, #workout" value={instagramInputs.reelsSearchTerm || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, reelsSearchTerm: e.target.value }))} />
                          )}

                          {instagramOptions.userReels && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.userReelsUsername || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, userReelsUsername: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* HIGHLIGHTS SECTION */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>⭐ {t("competitorLookup.highlights")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.userHighlights")} info={t("competitorLookup.userHighlightsDesc")} />}
                            checked={instagramOptions.highlightDetail || false}
                            onChange={(e) => setInstagramOptions(prev => ({ ...prev, highlightDetail: e.target.checked }))}
                          />

                          {instagramOptions.highlightDetail && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={instagramInputs.highlightUrl || ""}
                              onChange={(e) => setInstagramInputs(prev => ({ ...prev, highlightUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        disabled={!Object.values(instagramOptions).some(Boolean)}
                        loading={instagramLoading}
                        onClick={handleInstagramSubmit}
                      >
                        {t("competitorLookup.searchInstagram")}
                      </Button>

                      {instagramError && (
                        <Alert color="red" title={t("competitorLookup.instagramError")} withCloseButton onClose={() => setInstagramError(null)}>
                          {instagramError}
                        </Alert>
                      )}

                      {instagramResult && (
                        <InstagramResults data={instagramResult} onSave={handleInstagramSave} sortMode={sortMode} />
                      )}
                    </Stack>
                  </Tabs.Panel>
                )}


                {connectedPlatforms.tiktok && (
                  <Tabs.Panel value="tiktok" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>{t("competitorLookup.tiktokLookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.endpointCostsPrefix")} <b>{t("competitorLookup.oneCredit")}</b>.
                      </Text>

                      {/* PROFILE & ACCOUNT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>👤 {t("competitorLookup.profileAccount")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.profile")} info={t("competitorLookup.tiktokProfileDesc")} />}
                            checked={tiktokOptions.profile || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, profile: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.following")} info={t("competitorLookup.tiktokFollowingDesc")} />}
                            checked={tiktokOptions.following || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, following: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.followers")} info={t("competitorLookup.tiktokFollowersDesc")} />}
                            checked={tiktokOptions.followers || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, followers: e.target.checked }))}
                          />

                          {(tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={tiktokInputs.username || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, username: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* VIDEOS & CONTENT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🎬 {t("competitorLookup.videosContent")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.profileVideos")} info={t("competitorLookup.profileVideosDesc")} />}
                            checked={tiktokOptions.profileVideos || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, profileVideos: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.transcript")} info={t("competitorLookup.tiktokTranscriptDesc")} />}
                            checked={tiktokOptions.transcript || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, transcript: e.target.checked }))}
                          />

                          {tiktokOptions.profileVideos && (
                            <TextInput label={t("competitorLookup.username")} placeholder="@username" value={tiktokInputs.videosUsername || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, videosUsername: e.target.value }))} />
                          )}

                          {tiktokOptions.transcript && (
                            <TextInput label={t("competitorLookup.videoUrl")} placeholder="https://tiktok.com/@user/video/..." value={tiktokInputs.videoUrl || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* SEARCH & DISCOVERY */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>🔍 {t("competitorLookup.searchDiscovery")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchUsers")} info={t("competitorLookup.searchUsersDesc")} />}
                            checked={tiktokOptions.searchUsers || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchUsers: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchByHashtag")} info={t("competitorLookup.searchByHashtagDesc")} />}
                            checked={tiktokOptions.searchHashtag || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchHashtag: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchByKeyword")} info={t("competitorLookup.searchByKeywordDesc")} />}
                            checked={tiktokOptions.searchKeyword || false}
                            onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchKeyword: e.target.checked }))}
                          />

                          {tiktokOptions.searchUsers && (
                            <TextInput label={t("competitorLookup.userSearchQuery")} placeholder="fitness creator" value={tiktokInputs.userSearchQuery || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, userSearchQuery: e.target.value }))} />
                          )}

                          {tiktokOptions.searchHashtag && (
                            <TextInput label={t("competitorLookup.hashtag")} placeholder="#fitness" value={tiktokInputs.hashtag || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, hashtag: e.target.value }))} />
                          )}

                          {tiktokOptions.searchKeyword && (
                            <TextInput label={t("competitorLookup.keyword")} placeholder="workout routine" value={tiktokInputs.keyword || ""}
                              onChange={(e) => setTiktokInputs(prev => ({ ...prev, keyword: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        loading={tiktokLoading}
                        disabled={!Object.values(tiktokOptions).some(Boolean)}
                        onClick={handleTiktokSubmit}
                      >
                        {t("competitorLookup.searchTikTok")}
                      </Button>

                      {tiktokError && (
                        <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                          {tiktokError}
                        </Alert>
                      )}

                      {tiktokResult && (
                        <TiktokResults data={tiktokResult} onSave={handleTiktokSave} sortMode={sortMode} />
                      )}
                    </Stack>
                  </Tabs.Panel>
                )}

                {connectedPlatforms.reddit && (
                  <Tabs.Panel value="reddit" pt="md">
                    <Stack gap="lg">

                      <Title order={4}>{t("competitorLookup.redditLookup")}</Title>

                      <Text size="sm" c="dimmed">
                        {t("competitorLookup.endpointCostsPrefix")} <b>{t("competitorLookup.oneCredit")}</b>.
                      </Text>

                      {/* SUBREDDIT */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📋 {t("competitorLookup.subreddit")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.subredditDetails")} info={t("competitorLookup.subredditDetailsDesc")} />}
                            checked={redditOptions.subredditDetails || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditDetails: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.subredditPosts")} info={t("competitorLookup.subredditPostsDesc")} />}
                            checked={redditOptions.subredditPosts || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditPosts: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.subredditSearch")} info={t("competitorLookup.subredditSearchDesc")} />}
                            checked={redditOptions.subredditSearch || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditSearch: e.target.checked }))}
                          />

                          {(redditOptions.subredditDetails || redditOptions.subredditPosts || redditOptions.subredditSearch) && (
                            <TextInput label={t("competitorLookup.subreddit")} placeholder="r/reactjs" value={redditInputs.subreddit || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, subreddit: e.target.value }))} />
                          )}

                          {redditOptions.subredditSearch && (
                            <TextInput label={t("competitorLookup.searchQuery")} placeholder="state management" value={redditInputs.subredditQuery || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, subredditQuery: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* POSTS & SEARCH */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>💬 {t("competitorLookup.postsSearch")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.postComments")} info={t("competitorLookup.postCommentsDesc")} />}
                            checked={redditOptions.postComments || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, postComments: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.search")} info={t("competitorLookup.redditSearchDesc")} />}
                            checked={redditOptions.search || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, search: e.target.checked }))}
                          />

                          {redditOptions.postComments && (
                            <TextInput label={t("competitorLookup.postUrl")} placeholder="https://reddit.com/r/reactjs/comments/..." value={redditInputs.postUrl || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                          )}

                          {redditOptions.search && (
                            <TextInput label={t("competitorLookup.searchQuery")} placeholder="best javascript framework" value={redditInputs.searchQuery || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      {/* ADS */}
                      <Card withBorder radius="md" p="md">
                        <Stack gap="xs">
                          <Text fw={600}>📢 {t("competitorLookup.ads")}</Text>

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.searchAds")} info={t("competitorLookup.searchAdsDesc")} />}
                            checked={redditOptions.searchAds || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, searchAds: e.target.checked }))}
                          />

                          <Checkbox
                            label={<LabelWithInfo label={t("competitorLookup.getAd")} info={t("competitorLookup.getAdDesc")} />}
                            checked={redditOptions.getAd || false}
                            onChange={(e) => setRedditOptions(prev => ({ ...prev, getAd: e.target.checked }))}
                          />

                          {redditOptions.searchAds && (
                            <TextInput label={t("competitorLookup.adSearchQuery")} placeholder="software, SaaS" value={redditInputs.adSearchQuery || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, adSearchQuery: e.target.value }))} />
                          )}

                          {redditOptions.getAd && (
                            <TextInput label={t("competitorLookup.adUrlId")} placeholder="https://reddit.com/..." value={redditInputs.adUrl || ""}
                              onChange={(e) => setRedditInputs(prev => ({ ...prev, adUrl: e.target.value }))} />
                          )}
                        </Stack>
                      </Card>

                      <Button
                        leftSection={<IconSearch size={16} />}
                        loading={redditLoading}
                        disabled={!Object.values(redditOptions).some(Boolean)}
                        onClick={handleRedditSubmit}
                      >
                        {t("competitorLookup.searchReddit")}
                      </Button>

                      {redditError && (
                        <Alert color="red" title={t("competitorLookup.error")} icon={<IconAlertCircle />}>
                          {redditError}
                        </Alert>
                      )}

                      {redditResult && (
                        <RedditResults data={redditResult} onSave={handleRedditSave} sortMode={sortMode} />
                      )}
                    </Stack>
                  </Tabs.Panel>
                )}
              </Tabs>
            )}
          </Stack>
        )}

        {error && (
          <Alert
            variant="light"
            color={error.includes("not found") || error.includes("Invalid") ? "yellow" : "orange"}
            title={
              error.includes("not found") ? "Not found" :
                error.includes("Invalid") ? "Invalid input" :
                  "Connection error"
            }
            icon={<IconAlertCircle />}
            styles={{
              label: { fontWeight: 500 },
              message: { fontSize: "14px" }
            }}
          >
            <Text>{error}</Text>
          </Alert>
        )}

        {result && (
          <Stack gap="lg" data-tour="competitor-results">
            <Card withBorder radius="md">
              <Stack gap="xs">
                <Title order={4}>{t("competitorLookup.summary")}</Title>
                <Group gap="md" wrap="wrap">
                  <Group gap="xs">
                    <Text fw={500}>{t("competitorLookup.username")}:</Text>
                    <Code>{result.username || "—"}</Code>
                  </Group>
                  <Copyable value={result.userId} label="User ID" />
                  <Group gap="xs">
                    <Text fw={500}>{t("competitorLookup.backend")}:</Text>
                    <BackendBadge base={result._usedBackend} />
                  </Group>
                  <Group gap="xs">
                    <Text fw={500}>{t("competitorLookup.posts")}:</Text>
                    <Badge variant="light" radius="sm">
                      {posts.length}
                    </Badge>
                  </Group>
                </Group>
              </Stack>
            </Card>

            {convertedData && convertedData.length > 0 && (
              <>
                <Divider label={t("competitorLookup.convertedData")} />
                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>{t("competitorLookup.universalDataFormat")}</Title>
                    {convertedData.map((item, idx) => (
                      <Card key={idx} withBorder radius="sm" p="sm">
                        <Group gap="md" wrap="wrap">
                          <Group gap="xs">
                            <Text fw={500}>{t("competitorLookup.nameSource")}:</Text>
                            <Badge variant="light">{item["Name/Source"]}</Badge>
                          </Group>
                          <Group gap="xs">
                            <Text fw={500}>{t("competitorLookup.engagement")}:</Text>
                            <Badge variant="light" color="green">{item.Engagement}</Badge>
                          </Group>
                        </Group>
                        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
                          <Text fw={500} span>{t("competitorLookup.message")}:</Text> {item.Message.substring(0, 150)}
                          {item.Message.length > 150 ? "..." : ""}
                        </Text>
                      </Card>
                    ))}
                  </Stack>
                </Card>
              </>
            )}

            <Group justify="space-between" align="center">
              <Divider label="Posts" style={{ flex: 1 }} />
              {posts.length > 1 && (
                <SaveAllButton
                  items={posts.filter(p => p?.text)}
                  saveFn={(p) => {
                    const m = p.public_metrics || {};
                    return handleGenericSave("x", {
                      platform_post_id: p.id,
                      username: result.username,
                      platform_user_id: result.userId,
                      content: p.text,
                      published_at: p.created_at,
                      likes: m.like_count ?? 0,
                      shares: m.retweet_count ?? 0,
                      comments: m.reply_count ?? 0,
                    });
                  }}
                  label={t("competitorLookup.saveAllPosts")}
                />
              )}
            </Group>

            <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
              {t("competitorLookup.metricsMayBeUnavailable", {
                defaultValue: "Some engagement metrics may appear as 0 when they are private or unavailable from the platform's API.",
              })}
            </Alert>

            {posts.length === 0 ? (
              <Alert variant="light" color="gray" title={t("watchlist.noPostsReturned")}>
                {t("competitorLookup.noDataReturnedInputs")}
              </Alert>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" verticalSpacing="md">
                {posts.map((p) => (
                  <PostCard key={p?.id ?? Math.random()} post={p} />
                ))}
              </SimpleGrid>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}