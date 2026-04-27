import React, { useEffect, useMemo, useState } from "react";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  LoadingOverlay,
  ScrollArea,
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
  IconEye,
  IconHeart,
  IconInfoCircle,
  IconMessage,
  IconQuote,
  IconRepeat,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { getConnectedPlatforms } from "../utils/connectedPlatforms";
import { Checkbox, NumberInput, Transition } from "@mantine/core";
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

/* ─── LinkedIn Results Display ───────────────────────────────────────────── */

function SaveButton({ label, onSave }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  return (
    <Button
      size="xs"
      variant="light"
      loading={status === "saving"}
      color={status === "saved" ? "green" : status === "error" ? "red" : "blue"}
      disabled={status === "saved"}
      onClick={async () => {
        setStatus("saving");
        try {
          await onSave();
          setStatus("saved");
        } catch (err) {
          console.error("[SaveButton] Save failed:", err);
          setStatus("error");
        }
      }}
    >
      {status === "saved" ? t("competitorLookup.saved") : status === "error" ? t("competitorLookup.retry") : label || t("competitorLookup.save")}
    </Button>
  );
}

function SaveAllButton({ items, onSave, type = "post" }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  if (!items?.length || items.length <= 1) return null;

  return (
    <Button
      size="xs"
      variant="filled"
      loading={status === "saving"}
      color={status === "saved" ? "green" : status === "error" ? "orange" : "blue"}
      disabled={status === "saved"}
      onClick={async () => {
        setStatus("saving");
        setProgress({ done: 0, total: items.length, failed: 0 });
        let failed = 0;
        for (let i = 0; i < items.length; i++) {
          try {
            await onSave(type, items[i]);
          } catch (err) {
            console.error(`[SaveAll] Item ${i} failed:`, err);
            failed++;
          }
          setProgress(p => ({ ...p, done: i + 1, failed }));
        }
        setStatus(failed === items.length ? "error" : "saved");
      }}
    >
      {status === "saving"
        ? t("competitorLookup.savingProgress", { done: progress.done, total: progress.total })
        : status === "saved"
          ? t("competitorLookup.savedAll", { failed: progress.failed })
          : status === "error"
            ? t("competitorLookup.allFailedRetry")
            : t("competitorLookup.saveAllCount", { count: items.length })}
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
                <SaveAllButton items={posts.slice(0, 5)} onSave={(_type, p) => onSave("activity", { text: p.title || p.text || "", url: p.link || "", activityType: p.activityType, profileName: profile.name })} type="activity" />
              )}
            </Group>
            <Stack gap="sm">
              {posts.slice(0, 5).map((p, i) => (
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
                <SaveAllButton items={posts.slice(0, 5)} onSave={(_type, p) => onSave("companyPost", { text: p.text || "", datePublished: p.datePublished, url: p.url, companyName: company.name })} type="companyPost" />
              )}
            </Group>
            <Stack gap="sm">
              {posts.slice(0, 5).map((p, i) => (
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

  const title = decode(post.name) || t("competitorLookup.untitledPost");
  const headline = decode(post.headline);
  const content = decode(post.description);
  const authorName = post.author?.name || post.author;
  const authorFollowers = post.author?.followers;
  const thumb = post.thumbnailUrl;
  const likes = post.likeCount || 0;
  const comments = post.commentCount || 0;
  const commentsArr = post.comments || [];
  const moreArticles = post.moreArticles || [];

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="start">
          <div style={{ flex: 1 }}>
            <Text fw={700} size="lg" lineClamp={2}>{title}</Text>
            {headline && headline !== title && (
              <Text size="sm" c="dimmed" mt={4} lineClamp={2}>{headline}</Text>
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

        {/* Comments */}
        {commentsArr.length > 0 && (
          <div>
            <Group justify="space-between" align="center" my="xs">
              <Divider label={t("competitorLookup.commentsCount", { count: commentsArr.length })} style={{ flex: 1 }} />
              {commentsArr.length > 1 && (
                <SaveAllButton items={commentsArr.slice(0, 6)} onSave={(_type, c) => onSave("comment", { text: decode(c.text || c.description) || "", author: decode(c.author || c.name) || t("competitorLookup.unknown"), likeCount: c.likeCount, datePublished: c.datePublished, postTitle: title })} type="comment" />
              )}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {commentsArr.slice(0, 6).map((c, i) => (
                <Card key={i} withBorder radius="sm" p="xs" style={{ minHeight: 0 }}>
                  <Group gap={6} wrap="nowrap" mb={2}>
                    <Text size="xs" fw={600} lineClamp={1} style={{ flex: 1 }}>{decode(c.author || c.name) || t("competitorLookup.unknown")}</Text>
                    {c.datePublished && (
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{new Date(c.datePublished).toLocaleDateString()}</Text>
                    )}
                  </Group>
                  <Text size="xs" lineClamp={2} c="dimmed">{decode(c.text || c.description) || "—"}</Text>
                  {(c.likeCount != null || c.commentCount != null) && (
                    <Group gap={4} mt={2}>
                      {c.likeCount != null && <Badge size="xs" variant="light">❤️ {c.likeCount}</Badge>}
                      {c.commentCount != null && <Badge size="xs" variant="light">💬 {c.commentCount}</Badge>}
                    </Group>
                  )}
                  <Group justify="flex-end" mt={4}>
                    <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("comment", { text: decode(c.text || c.description) || "", author: decode(c.author || c.name) || t("competitorLookup.unknown"), likeCount: c.likeCount, datePublished: c.datePublished, postTitle: title })} />
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
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

function XUserCard({ user, onSave }) {
  const { t } = useTranslation();
  if (!user) return null;
  const m = user.public_metrics || {};

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="start">
          <Group align="center" gap="md">
            <div>
              <Group gap="xs" align="center">
                <Text fw={700} size="xl">{user.name}</Text>
                {user.verified && <Badge size="xs" color="blue" variant="filled">✓</Badge>}
              </Group>
              <Text size="sm" c="dimmed">@{user.username}</Text>
              {user.location && <Text size="xs" c="dimmed">{user.location}</Text>}
            </div>
          </Group>
          <Badge color="dark" variant="light" size="lg">
            <IconBrandX size={14} style={{ marginRight: 4 }} /> {t("competitorLookup.profile")}
          </Badge>
        </Group>

        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.followers_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.followers")}</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.following_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.following")}</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.tweet_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.tweets")}</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.listed_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">{t("competitorLookup.listed")}</Text>
            </div>
          </Group>
        </Card>

        {user.description && (
          <div>
            <Text fw={600} size="sm" mb={4}>{t("competitorLookup.bio")}</Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{user.description}</Text>
          </div>
        )}

        {user.created_at && (
          <Text size="xs" c="dimmed">
            {t("competitorLookup.joined")} {new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
        )}

        {user.url && (
          <Text size="sm" c="blue" component="a" href={user.url} target="_blank">
            {user.url}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function XTweetCard({ tweet, authorUsername, onSave }) {
  const { t } = useTranslation();
  if (!tweet) return null;
  const m = tweet.public_metrics || {};
  const date = tweet.created_at
    ? new Date(tweet.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: "3px solid #1d9bf0" }}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {authorUsername && (
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#e8f5fd",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, color: "#1d9bf0", flexShrink: 0,
              }}>
                {(authorUsername || "?")[0].toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }} lineClamp={4}>{tweet.text}</Text>
            </div>
          </Group>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <IconBrandX size={16} style={{ opacity: 0.5 }} />
            {onSave && (
              <SaveButton label={t("competitorLookup.save")} onSave={() => onSave("tweet", { ...tweet, _authorUsername: authorUsername })} />
            )}
          </Group>
        </Group>

        {date && <Text size="xs" c="dimmed">{date}</Text>}

        <Divider my={0} />

        <Group justify="space-between" align="center">
          <Group gap="lg">
            <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{(m.like_count || 0).toLocaleString()}</Text></Group>
            <Group gap={4} wrap="nowrap"><IconRepeat size={14} color="#17bf63" /><Text size="xs" c="dimmed">{(m.retweet_count || 0).toLocaleString()}</Text></Group>
            <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#1d9bf0" /><Text size="xs" c="dimmed">{(m.reply_count || 0).toLocaleString()}</Text></Group>
            {m.quote_count > 0 && <Group gap={4} wrap="nowrap"><IconQuote size={14} color="#794bc4" /><Text size="xs" c="dimmed">{m.quote_count.toLocaleString()}</Text></Group>}
          </Group>
          <Text size="xs" c="blue" component="a" href={`https://x.com/i/web/status/${tweet.id}`} target="_blank">
            {t("competitorLookup.viewArrow")}
          </Text>
        </Group>
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

function XResults({ data, onSave }) {
  const { t } = useTranslation();
  if (!data?.results) return null;
  const { results, errors } = data;
  const resultCount = Object.keys(results).length;

  // Helper to find author username from includes.users
  const findAuthor = (authorId, users) => {
    const u = (users || []).find(u => u.id === authorId);
    return u?.username || "";
  };

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
      {results.userTweets?.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.tweetsCount", { count: results.userTweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={results.userTweets} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {results.userTweets.map((t, i) => (
              <XTweetCard key={t.id || i} tweet={t} onSave={onSave} />
            ))}
          </Stack>
        </div>
      )}

      {/* User Mentions */}
      {results.userMentions?.tweets?.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.mentionsCount", { count: results.userMentions.tweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={results.userMentions.tweets.map(t => ({ ...t, _authorUsername: findAuthor(t.author_id, results.userMentions.users) }))} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {results.userMentions.tweets.map((t, i) => (
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
      {results.searchTweets?.tweets?.length > 0 && (
        <div>
          <Group justify="space-between" align="center" my="xs">
            <Divider label={t("competitorLookup.searchResultsCount", { count: results.searchTweets.tweets.length })} style={{ flex: 1 }} />
            <SaveAllButton items={results.searchTweets.tweets.map(t => ({ ...t, _authorUsername: findAuthor(t.author_id, results.searchTweets.users) }))} onSave={onSave} type="tweet" />
          </Group>
          <Stack gap="xs">
            {results.searchTweets.tweets.map((t, i) => (
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

function LinkedinResults({ data, onSave }) {
  const { t } = useTranslation();
  if (!data?.results) return null;
  const { results, errors } = data;
  const resultCount = Object.keys(results).length;

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

      {results.profile && <LinkedinProfileCard profile={results.profile} onSave={onSave} />}
      {results.company && <LinkedinCompanyCard company={results.company} onSave={onSave} />}
      {results.post && <LinkedinPostCard post={results.post} onSave={onSave} />}
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

  // Persist results + inputs to sessionStorage so they survive tab navigation
  useEffect(() => {
    saveLookupCache({
      result, linkedinResult, xResult, youtubeResult,
      instagramResult, tiktokResult, redditResult,
      username, youtubeUrl,
      linkedinInputs, instagramInputs, tiktokInputs,
      xInputs, youtubeInputs, redditInputs,
    });
  }, [
    result, linkedinResult, xResult, youtubeResult,
    instagramResult, tiktokResult, redditResult,
    username, youtubeUrl,
    linkedinInputs, instagramInputs, tiktokInputs,
    xInputs, youtubeInputs, redditInputs,
  ]);

  // Platform name → id mapping from server (e.g. { x: 1, instagram: 3, tiktok: 5, reddit: 10, youtube: 8 })
  const [platformIds, setPlatformIds] = useState({
    x: 1, instagram: 3, tiktok: 5, reddit: 6, youtube: 8, linkedin: 2,
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
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
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
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    // Save posts via the existing /api/posts endpoint
    if (type === "tweet" && data) {
      const metrics = data.public_metrics || {};
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.x,
          platform_user_id: String(data.author_id || data._authorUsername || "unknown"),
          username: data._authorUsername || "",
          platform_post_id: String(data.id || Date.now()),
          content: data.text,
          published_at: data.created_at,
          likes: metrics.like_count ?? 0,
          shares: metrics.retweet_count ?? 0,
          comments: metrics.reply_count ?? 0,
          views: metrics.impression_count ?? 0,
          user_id: currentUserId,
          author_name: data._authorUsername || "",
          author_handle: data._authorUsername || "",
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
      const resp = await fetch(apiUrl("/api/posts"), {
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
          views: data.views ?? 0,
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
      const ownerUsername = data.user?.username || data.owner?.username || "";
      const ownerFullName = data.user?.full_name || data.owner?.full_name || "";
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.instagram, // Instagram
          platform_user_id: platformUserId,
          username: ownerUsername || ownerFullName || platformUserId,
          platform_post_id: platformPostId,
          content: data.caption?.text || data.caption || "",
          published_at: publishedAt,
          likes: Math.max(0, data.like_count ?? data.likes ?? 0),
          shares: 0,
          comments: Math.max(0, data.comment_count ?? data.comments ?? 0),
          views: Math.max(0, data.play_count ?? data.video_view_count ?? 0),
          user_id: currentUserId,
          author_name: ownerFullName || ownerUsername,
          author_handle: ownerUsername,
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
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.tiktok, // TikTok
          platform_user_id: String(data.author?.id || data.author?.uniqueId || data.author?.uid || "unknown"),
          username: data.author?.uniqueId || data.author?.nickname || data.author?.unique_id || "",
          author_name: data.author?.nickname || data.author?.uniqueId || "",
          author_handle: data.author?.uniqueId || data.author?.unique_id || "",
          platform_post_id: String(data.id || data.aweme_id || data.video?.id || Date.now()),
          content: data.desc || data.title || "",
          published_at: (() => { if (!data.createTime) return null; const d = new Date(typeof data.createTime === 'number' ? data.createTime * 1000 : data.createTime); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
          likes: Math.max(0, data.stats?.diggCount ?? data.statsV2?.diggCount ?? data.statistics?.digg_count ?? data.statistics?.diggCount ?? data.diggCount ?? data.digg_count ?? 0),
          shares: Math.max(0, data.stats?.shareCount ?? data.statsV2?.shareCount ?? data.statistics?.share_count ?? data.statistics?.shareCount ?? data.shareCount ?? data.share_count ?? 0),
          comments: Math.max(0, data.stats?.commentCount ?? data.statsV2?.commentCount ?? data.statistics?.comment_count ?? data.statistics?.commentCount ?? data.commentCount ?? data.comment_count ?? 0),
          views: Math.max(0, data.stats?.playCount ?? data.statsV2?.playCount ?? data.statistics?.play_count ?? data.statistics?.playCount ?? data.playCount ?? data.play_count ?? 0),
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
      const resp = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_id: platformIds.reddit, // Reddit
          platform_user_id: String(data.author || data.author_fullname || "unknown"),
          username: data.author || "",
          platform_post_id: String(data.id || data.name || Date.now()),
          content: data.title || data.selftext || "",
          published_at: (() => { if (!data.created_utc) return null; const d = new Date(typeof data.created_utc === 'number' ? data.created_utc * 1000 : data.created_utc); return isNaN(d.getTime()) ? null : d.toISOString(); })(),
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

  async function handleGenericSave(platformKey, { platformUserId, username, postId, content, publishedAt, likes, shares, comments, views, authorName, authorHandle }) {
    if (!currentUserId) throw new Error("Please sign in to save data.");
    const pid = platformIds[platformKey];
    if (!pid) throw new Error(`Unknown platform: ${platformKey}`);
    const resp = await fetch(apiUrl("/api/posts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform_name: platformKey,
        platform_id: pid,
        platform_user_id: String(platformUserId || "unknown"),
        username: String(username || platformUserId || "unknown"),
        platform_post_id: String(postId || Date.now()),
        content: String(content || ""),
        published_at: publishedAt || null,
        likes: likes ?? 0,
        shares: shares ?? 0,
        comments: comments ?? 0,
        views: views ?? 0,
        user_id: currentUserId,
        author_name: authorName || username || "",
        author_handle: authorHandle || username || "",
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
        const resp = await fetch(apiUrl("/api/posts"), {
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
            views: metrics.impression_count ?? 0,
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
    const date = data.video?.publishedAt
      ? new Date(data.video.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;

    async function handleSave() {
      try {
        setSaving(true);
        setSaveStatus(null);
        const resp = await fetch(apiUrl("/api/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_name: "youtube",
            platform_id: platformIds.youtube,
            platform_user_id: data.video.channelId,
            username: data.video.channelTitle,
            platform_post_id: data.videoId,
            content: data.video.description,
            published_at: data.video.publishedAt,
            likes: data.video.stats.likes || 0,
            shares: 0,
            comments: data.video.stats.comments || 0,
            title: data.video.title,
            description: data.video.description,
            channelTitle: data.video.channelTitle,
            videoId: data.videoId,
            views: data.video.stats.views,
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
                <Text fw={700} size="sm" lh={1.3} truncate>{data.video?.channelTitle || "Unknown Channel"}</Text>
                {date && <Text size="xs" c="dimmed" lh={1.2}>{date}</Text>}
              </div>
            </Group>
          </Group>

          {/* title */}
          <Text fw={600} size="md" lh={1.3}>{data.video?.title || "Untitled Video"}</Text>

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
                  {showDesc ? "Show less" : "Show more"}
                </Button>
              )}
            </div>
          )}

          <Divider my={0} />

          {/* metrics + save */}
          <Group justify="space-between" align="center">
            <Group gap="lg">
              <Group gap={4} wrap="nowrap"><IconEye size={14} color="#606060" /><Text size="xs" c="dimmed">{(data.video?.stats?.views || 0).toLocaleString()}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconHeart size={14} color="#e0245e" /><Text size="xs" c="dimmed">{(data.video?.stats?.likes || 0).toLocaleString()}</Text></Group>
              <Group gap={4} wrap="nowrap"><IconMessage size={14} color="#606060" /><Text size="xs" c="dimmed">{(data.video?.stats?.comments || 0).toLocaleString()}</Text></Group>
            </Group>
            <Button size="xs" variant="light" loading={saving}
              color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
              disabled={saveStatus === 'saved'}
              onClick={handleSave}
            >
              {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error – Retry' : 'Save Video'}
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
              <IconBrandYoutube size={14} style={{ marginRight: 4 }} /> Channel
            </Badge>
          </Group>

          <Group gap="lg" justify="center">
            {[
              { label: "Subscribers", value: fmtNum(data.subscribers) },
              { label: "Total Views", value: fmtNum(data.totalViews) },
              { label: "Videos", value: fmtNum(data.videoCount) },
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
            <Text size="xs" c="dimmed">Country: {data.country} · Joined {new Date(data.publishedAt).toLocaleDateString()}</Text>
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
    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size={compact ? "sm" : "md"} lineClamp={2}>{video.title}</Text>
          <Text size="xs" c="dimmed">{video.channelTitle} · {new Date(video.publishedAt).toLocaleDateString()}{video.duration ? ` · ${parseDuration(video.duration)}` : ""}</Text>
          <Group gap="xs">
            {[
              { label: "Views", val: video.views },
              { label: "Likes", val: video.likes },
              { label: "Comments", val: video.comments },
            ].map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label}: {fmtNum(val)}</Badge>
            ))}
          </Group>
          {!compact && video.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>{video.description}</Text>
          )}
          {onSave && (
            <Group justify="flex-end">
              <SaveButton label="Save Video" onSave={() => onSave("video", { ...video, channelId: video.channelId || "" })} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function YoutubeResults({ data, onSave, t }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;
    const count =
      (results.channelDetails ? 1 : 0) +
      (results.channelVideos?.length || 0) +
      (results.videoDetails ? 1 : 0) +
      (results.search?.length || 0);

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>YouTube Results</Text>
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
            <Divider label="Channel Details" labelPosition="center" />
            <YTChannelCard data={results.channelDetails} />
          </>
        )}

        {results.channelVideos?.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={`Channel Videos (${results.channelVideos.length})`} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={results.channelVideos.map(v => ({ ...v, channelId: v.channelId || "" }))} onSave={onSave} type="video" />
            </Group>
            <Stack gap="xs">
              {results.channelVideos.map((v) => (
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
                  views: results.videoDetails.views,
                  likes: results.videoDetails.likes,
                  comments: results.videoDetails.comments,
                },
              },
              videoId: results.videoDetails.id,
            }} t={t} />
          </>
        )}

        {results.search?.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Divider label={t("competitorLookup.searchResultsCount", { count: results.search.length })} labelPosition="center" style={{ flex: 1 }} />
              <SaveAllButton items={results.search.map(v => ({ ...v, channelId: v.channelId || "" }))} onSave={onSave} type="video" />
            </Group>
            <Stack gap="xs">
              {results.search.map((v) => (
                <YTVideoCard key={v.id} video={v} onSave={onSave} compact />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    );
  }

  /* ── Instagram Display Components ──────────────────────────────────── */

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

  function IgPostCard({ post, onSave, compact }) {
    if (!post) return null;
    const caption = post.caption?.text || post.caption || "";
    const isVideo = post.media_type === 2 || post.video_url || post.is_video;

    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            {isVideo && <Badge size="xs" variant="light">{t("competitorLookup.video")}</Badge>}
            {post.carousel_media_count > 1 && <Badge size="xs" variant="light">{t("competitorLookup.carouselCount", { count: post.carousel_media_count })}</Badge>}
          </Group>
          <Text size={compact ? "xs" : "sm"} lineClamp={compact ? 2 : 4}>{caption || <i>{t("competitorLookup.noCaption")}</i>}</Text>
          <Text size="xs" c="dimmed">
            {post.user?.username || post.owner?.username || ""}
            {post.taken_at ? " · " + new Date(post.taken_at * 1000).toLocaleDateString() : ""}
          </Text>
          <Group gap="xs">
            {[
              { label: "❤️", val: post.like_count ?? post.likes },
              { label: "💬", val: post.comment_count ?? post.comments },
              { label: "👁", val: post.play_count || post.video_view_count },
            ].filter(x => x.val != null).map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label} {fmtNum(val)}</Badge>
            ))}
          </Group>
          {onSave && (
            <Group justify="flex-end">
              <SaveButton label="Save Post" onSave={() => onSave("post", post)} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function IgReelCard({ reel, onSave, compact }) {
    if (!reel) return null;
    const caption = reel.caption?.text || reel.caption || "";
    return (
      <Card withBorder radius="md" shadow="sm" p="xs">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" lineClamp={2} fw={500}>{caption || <i>No caption</i>}</Text>
          <Text size="xs" c="dimmed">{reel.user?.username || ""}</Text>
          <Group gap="xs">
            {[
              { label: "▶", val: reel.play_count || reel.video_view_count },
              { label: "❤️", val: reel.like_count ?? reel.likes },
              { label: "💬", val: reel.comment_count ?? reel.comments },
            ].filter(x => x.val != null).map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label} {fmtNum(val)}</Badge>
            ))}
          </Group>
          {onSave && (
            <Group justify="flex-end">
              <SaveButton label="Save Reel" onSave={() => onSave("post", reel)} />
            </Group>
          )}
        </Stack>
      </Card>
    );
  }

  function InstagramResults({ data, onSave }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    // Normalize arrays — Scrape Creators response shapes:
    //   userPosts: { posts: [{ node: {...} }] }
    //   reelsSearch: { reels: [...] }
    //   userReels: { items: [{ media: {...} }] }
    //   postComments: { comments: [...] }
    //   highlightDetail: { highlights: [...] }
    const rawPosts = results.userPosts?.posts || results.userPosts?.data?.items || results.userPosts?.items || [];
    const postsArr = rawPosts.map(p => p.node || p);
    const reelsSearchArr = results.reelsSearch?.reels || results.reelsSearch?.data?.items || results.reelsSearch?.items || [];
    const rawUserReels = results.userReels?.items || results.userReels?.data?.items || [];
    const userReelsArr = rawUserReels.map(r => r.media || r);
    const highlightItems = results.highlightDetail?.highlights || results.highlightDetail?.data?.items || results.highlightDetail?.items || [];

    const count =
      (results.profile ? 1 : 0) +
      (Array.isArray(postsArr) ? postsArr.length : 0) +
      (results.singlePost ? 1 : 0) +
      (Array.isArray(reelsSearchArr) ? reelsSearchArr.length : 0) +
      (Array.isArray(userReelsArr) ? userReelsArr.length : 0) +
      (Array.isArray(highlightItems) ? highlightItems.length : 0);

    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600}>Instagram Results</Text>
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
            <Divider label="Post Detail" labelPosition="center" />
            <IgPostCard post={results.singlePost?.data?.xdt_shortcode_media || results.singlePost?.data || results.singlePost} onSave={onSave} />
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

  function TkVideoCard({ video, onSave, compact }) {
    if (!video) return null;
    const desc = video.desc || video.title || "";
    const stats = video.stats || video.statsV2 || video.statistics || {};
    const author = video.author || {};
    const created = video.createTime ? new Date(video.createTime * 1000).toLocaleDateString() : "";

    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size={compact ? "xs" : "sm"} lineClamp={compact ? 2 : 4}>{desc || <i>{t("competitorLookup.noDescription")}</i>}</Text>
          <Text size="xs" c="dimmed">
            {author.uniqueId || author.unique_id || author.nickname || ""}
            {created ? ` · ${created}` : ""}
          </Text>
          <Group gap="xs">
            {[
              { label: "▶", val: stats.playCount ?? stats.play_count },
              { label: "❤️", val: stats.diggCount ?? stats.digg_count ?? stats.likeCount ?? stats.like_count },
              { label: "💬", val: stats.commentCount ?? stats.comment_count },
              { label: "🔗", val: stats.shareCount ?? stats.share_count },
            ].filter(x => x.val != null).map(({ label, val }) => (
              <Badge key={label} variant="light" size="xs">{label} {fmtNum(val)}</Badge>
            ))}
          </Group>
          {onSave && (
            <Group justify="flex-end">
              <SaveButton label={t("competitorLookup.savePost")} onSave={() => onSave("post", video)} />
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

  function TiktokResults({ data, onSave }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    // Profile & stats
    const profileData = results.profile;
    // Profile videos from profile endpoint's itemList OR from profileVideos call
    const profileVideos = results.profileVideos?.itemList || results.profile?.itemList || [];
    const showProfileVideos = results.profileVideos || (results.profile?.itemList?.length > 0 && !results.profileVideos);
    // Following & Followers
    const followingList = results.following?.followings || results.following?.following_list || [];
    const followersList = results.followers?.followers || [];
    // Transcript
    const transcript = results.transcript?.transcript;
    // Search results
    const searchUsersList = results.searchUsers?.user_list || [];
    const searchHashtagList = results.searchHashtag?.challenge_aweme_list || results.searchHashtag?.aweme_list || [];
    const searchKeywordList = results.searchKeyword?.search_item_list || [];

    const count =
      (profileData ? 1 : 0) +
      profileVideos.length +
      followingList.length +
      followersList.length +
      (transcript ? 1 : 0) +
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
              <SaveAllButton items={searchKeywordList.map(item => item.aweme_info || item)} onSave={onSave} type="post" />
            </Group>
            <Stack gap="xs">
              {searchKeywordList.map((item, i) => {
                const v = item.aweme_info || item;
                return <TkVideoCard key={v.aweme_id || v.id || i} video={v} onSave={onSave} compact />;
              })}
            </Stack>
          </>
        )}
      </Stack>
    );
  }

  /* ─── Reddit Results Display ─────────────────────────────────────────── */

  function RedditSubredditCard({ details }) {
    if (!details) return null;
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

          {details.rules?.length > 0 && (
            <div>
              <Text size="xs" fw={600} mb={4}>{t("competitorLookup.rulesCount", { count: details.rules.length })}</Text>
              {details.rules.slice(0, 5).map((r, i) => (
                <Text key={i} size="xs" c="dimmed">• {r.short_name || r.title || r}</Text>
              ))}
            </div>
          )}
        </Stack>
      </Card>
    );
  }

  function RedditPostCard({ post, onSave, compact }) {
    if (!post) return null;
    const title = post.title || "";
    const body = post.selftext || post.body || "";
    const created = post.created_utc ? new Date(post.created_utc * 1000).toLocaleDateString() : "";

    return (
      <Card withBorder radius="md" shadow="sm" p={compact ? "xs" : "md"}>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size={compact ? "sm" : "md"} fw={600} lineClamp={2}>{title || <i>{t("competitorLookup.noTitle")}</i>}</Text>
          {body && <Text size="xs" lineClamp={compact ? 2 : 4} c="dimmed">{body}</Text>}
          <Text size="xs" c="dimmed">
            {post.author ? `u/${post.author}` : ""}
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
            {post.link_flair_text && <Badge variant="outline" size="xs">{post.link_flair_text}</Badge>}
          </Group>
          {onSave && (
            <Group justify="flex-end">
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

  function RedditResults({ data, onSave }) {
    if (!data) return null;
    const { results = {}, errors = [] } = data;

    const detailsData = results.subredditDetails;
    const subredditPostsArr = results.subredditPosts?.posts || [];
    const subredditSearchArr = results.subredditSearch?.posts || [];
    const commentsArr = results.postComments?.comments || [];
    const searchArr = results.search?.posts || [];
    const adsArr = results.searchAds?.ads || [];
    const adDetail = results.getAd?.data || results.getAd;

    const count =
      (detailsData ? 1 : 0) +
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

        {detailsData && (
          <>
            <Divider label={t("competitorLookup.subredditDetails")} labelPosition="center" />
            <RedditSubredditCard details={detailsData} />
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

  const posts = Array.isArray(result?.posts) ? result.posts : [];

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
          {creditsRemaining != null && (
            <Card withBorder radius="md" p="xs" px="md" shadow="xs" style={{ minWidth: 160, textAlign: "center" }}>
              <Text size="xs" c="dimmed" fw={500}>{t("competitorLookup.creditsRemaining")}</Text>
              <Text fw={700} size="lg" c={creditsRemaining < 10 ? "red" : creditsRemaining < 50 ? "orange" : "teal"}>
                {creditsRemaining.toLocaleString()}
              </Text>
            </Card>
          )}
        </Group>

        {!Object.values(connectedPlatforms).some(Boolean) && (
          <Alert variant="light" color="blue" title={t("competitorLookup.noPlatformsConnected")}>
            {t("competitorLookup.goToConnectedIntegrations")}
          </Alert>
        )}

        {Object.values(connectedPlatforms).some(Boolean) && (
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

            <Card withBorder radius="md" p="sm" mt="md">
              <Group gap="sm" align="flex-end">
                <NumberInput
                  label={t("competitorLookup.scrapePostAmount")}
                  description={t("competitorLookup.scrapePostAmountDesc")}
                  min={5}
                  max={100}
                  step={5}
                  value={scrapePostCount}
                  onChange={(val) => setScrapePostCount(val || 10)}
                  style={{ maxWidth: 200 }}
                />
              </Group>
            </Card>

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

                  {xResult && <XResults data={xResult} onSave={handleXSave} />}
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
                    <YoutubeResults data={youtubeResult} onSave={handleYoutubeSave} t={t} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.linkedin && (
              <Tabs.Panel value="linkedin" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.linkedinLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
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

                  {linkedinResult && <LinkedinResults data={linkedinResult} onSave={handleLinkedinSave} />}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.instagram && (
              <Tabs.Panel value="instagram" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.instagramLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
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
                    <InstagramResults data={instagramResult} onSave={handleInstagramSave} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}


            {connectedPlatforms.tiktok && (
              <Tabs.Panel value="tiktok" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.tiktokLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
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
                    <TiktokResults data={tiktokResult} onSave={handleTiktokSave} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.reddit && (
              <Tabs.Panel value="reddit" pt="md">
                <Stack gap="lg">

                  <Title order={4}>{t("competitorLookup.redditLookup")}</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
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
                    <RedditResults data={redditResult} onSave={handleRedditSave} />
                  )}
                </Stack>
              </Tabs.Panel>
            )}
          </Tabs>
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
          <Stack gap="lg">
            <Card withBorder radius="md">
              <Stack gap="xs">
                <Title order={4}>{t("competitorLookup.summary")}</Title>
                <Group gap="md" wrap="wrap">
                  <Group gap="xs">
                    <Text fw={500}>Username:</Text>
                    <Code>{result.username || "—"}</Code>
                  </Group>
                  <Copyable value={result.userId} label="User ID" />
                  <Group gap="xs">
                    <Text fw={500}>Backend:</Text>
                    <BackendBadge base={result._usedBackend} />
                  </Group>
                  <Group gap="xs">
                    <Text fw={500}>Posts:</Text>
                    <Badge variant="light" radius="sm">
                      {posts.length}
                    </Badge>
                  </Group>
                </Group>
              </Stack>
            </Card>

            {convertedData && convertedData.length > 0 && (
              <>
                <Divider label="Converted Data" />
                <Card withBorder radius="md">
                  <Stack gap="md">
                    <Title order={5}>{t("competitorLookup.universalDataFormat")}</Title>
                    {convertedData.map((item, idx) => (
                      <Card key={idx} withBorder radius="sm" p="sm">
                        <Group gap="md" wrap="wrap">
                          <Group gap="xs">
                            <Text fw={500}>Name/Source:</Text>
                            <Badge variant="light">{item["Name/Source"]}</Badge>
                          </Group>
                          <Group gap="xs">
                            <Text fw={500}>Engagement:</Text>
                            <Badge variant="light" color="green">{item.Engagement}</Badge>
                          </Group>
                        </Group>
                        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
                          <Text fw={500} span>Message:</Text> {item.Message.substring(0, 150)}
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
                  label="Save All Posts"
                />
              )}
            </Group>

            <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
              {t("competitorLookup.metricsMayBeUnavailable", {
                defaultValue: "Some metrics (e.g. views) may appear as 0 because they are private or unavailable from the platform's API.",
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