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
  IconCopy,
  IconInfoCircle,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";
import { apiBase, apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { getConnectedPlatforms } from "../utils/connectedPlatforms";
import { Checkbox, Transition } from "@mantine/core";

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
        } catch {
          setStatus("error");
        }
      }}
    >
      {status === "saved" ? "Saved ✓" : status === "error" ? "Retry" : label || "Save"}
    </Button>
  );
}

function LinkedinProfileCard({ profile, onSave }) {
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
            {profile.image && (
              <img
                src={profile.image}
                alt={profile.name}
                style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid #e0e0e0" }}
              />
            )}
            <div>
              <Text fw={700} size="xl">{profile.name}</Text>
              {profile.location && <Text size="sm" c="dimmed">{profile.location}</Text>}
            </div>
          </Group>
          <Group gap="xs">
            <Badge color="blue" variant="light" size="lg">
              <IconBrandLinkedin size={14} style={{ marginRight: 4 }} /> Profile
            </Badge>
            <SaveButton label="Save Profile" onSave={() => onSave("profile", profile)} />
          </Group>
        </Group>

        {/* Key Metrics */}
        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            {profile.followers != null && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{Number(profile.followers).toLocaleString()}</Text>
                <Text size="xs" c="dimmed">Followers</Text>
              </div>
            )}
            {profile.connections && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{profile.connections}</Text>
                <Text size="xs" c="dimmed">Connections</Text>
              </div>
            )}
            {posts.length > 0 && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{posts.length}</Text>
                <Text size="xs" c="dimmed">Recent Posts</Text>
              </div>
            )}
            {articles.length > 0 && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="xl" c="blue">{articles.length}</Text>
                <Text size="xs" c="dimmed">Articles</Text>
              </div>
            )}
          </Group>
        </Card>

        {/* About */}
        {profile.about && (
          <div>
            <Text fw={600} size="sm" mb={4}>About</Text>
            <ScrollArea h={profile.about.length > 300 ? 150 : undefined}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{profile.about}</Text>
            </ScrollArea>
          </div>
        )}

        {/* Experience */}
        {profile.experience?.length > 0 && (
          <div>
            <Divider label="Experience" my="xs" />
            <Stack gap="sm">
              {profile.experience.slice(0, 5).map((exp, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="xs" wrap="nowrap" align="start">
                    <div style={{ flex: 1 }}>
                      <Text size="sm" fw={600}>{exp.name}</Text>
                      {exp.location && <Text size="xs" c="dimmed">{exp.location}</Text>}
                      {exp.member?.description && (
                        <Text size="xs" c="dimmed" mt={4} lineClamp={2}>{exp.member.description}</Text>
                      )}
                    </div>
                    {exp.url && (
                      <Text size="xs" c="blue" component="a" href={exp.url} target="_blank">View</Text>
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          </div>
        )}

        {/* Education */}
        {profile.education?.length > 0 && (
          <div>
            <Divider label="Education" my="xs" />
            <Stack gap="sm">
              {profile.education.map((ed, i) => (
                <Group key={i} gap="xs" justify="space-between">
                  <Group gap="xs">
                    <Text size="sm" fw={500}>{ed.name}</Text>
                    {ed.url && (
                      <Text size="xs" c="blue" component="a" href={ed.url} target="_blank">View</Text>
                    )}
                  </Group>
                  {ed.member?.startDate && (
                    <Badge size="sm" variant="light" color="gray">
                      {ed.member.startDate}–{ed.member.endDate || "Present"}
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
            <Divider label="Articles" my="xs" />
            <Stack gap="sm">
              {articles.slice(0, 5).map((a, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" wrap="nowrap" align="start">
                    {a.image && (
                      <img src={a.image} alt="" style={{ width: 60, height: 40, borderRadius: 4, objectFit: "cover" }} />
                    )}
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
            <Divider label="Publications" my="xs" />
            <Stack gap="xs">
              {publications.slice(0, 5).map((pub, i) => (
                <Group key={i} gap="xs">
                  <Text size="sm">{pub.name}</Text>
                  {pub.url && (
                    <Text size="xs" c="blue" component="a" href={pub.url} target="_blank">Link</Text>
                  )}
                </Group>
              ))}
            </Stack>
          </div>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <Divider label="Projects" my="xs" />
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
                          {c.image ? (
                            <img src={c.image} alt={c.name} style={{ width: 24, height: 24, borderRadius: "50%" }} />
                          ) : (
                            <Badge size="xs" variant="light">{c.name?.charAt(0)}</Badge>
                          )}
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
            <Divider label="Recommendations" my="xs" />
            <Stack gap="sm">
              {recommendations.slice(0, 3).map((rec, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" mb={4}>
                    {rec.image && (
                      <img src={rec.image} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
                    )}
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
            <Divider label="Recent Activity" my="xs" />
            <Stack gap="sm">
              {posts.slice(0, 5).map((p, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Group gap="sm" wrap="nowrap" align="start">
                    {p.image && (
                      <img src={p.image} alt="" style={{ width: 60, height: 40, borderRadius: 4, objectFit: "cover" }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <Text size="sm" lineClamp={2}>{p.title || p.text || "—"}</Text>
                      <Group gap="xs" mt={4}>
                        {p.activityType && <Badge size="xs" variant="light" color="gray">{p.activityType}</Badge>}
                        {p.link && (
                          <Text size="xs" c="blue" component="a" href={p.link} target="_blank">View →</Text>
                        )}
                      </Group>
                    </div>
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
  if (!company) return null;
  const posts = company.posts || [];

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="start">
          <Group align="center" gap="md">
            {company.logo && (
              <img
                src={company.logo}
                alt={company.name}
                style={{ width: 56, height: 56, borderRadius: 8, objectFit: "contain", background: "#f5f5f5" }}
              />
            )}
            <div>
              <Text fw={700} size="lg">{company.name}</Text>
              {company.slogan && <Text size="sm" c="dimmed">{company.slogan}</Text>}
            </div>
          </Group>
          <Group gap="xs">
            <Badge color="blue" variant="light">
              <IconBrandLinkedin size={12} style={{ marginRight: 4 }} /> Company
            </Badge>
            <SaveButton label="Save Company" onSave={() => onSave("company", company)} />
          </Group>
        </Group>

        <Group gap="lg" wrap="wrap">
          {company.employeeCount != null && (
            <div>
              <Text fw={600} size="lg">{Number(company.employeeCount).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Employees</Text>
            </div>
          )}
          {company.size && (
            <div>
              <Text fw={600} size="lg">{company.size}</Text>
              <Text size="xs" c="dimmed">Company Size</Text>
            </div>
          )}
          {company.founded && (
            <div>
              <Text fw={600} size="lg">{company.founded}</Text>
              <Text size="xs" c="dimmed">Founded</Text>
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
            <Text fw={500} size="sm" mb={4}>About</Text>
            <Text size="sm" lineClamp={6} style={{ whiteSpace: "pre-wrap" }}>{company.description}</Text>
          </div>
        )}

        {company.website && (
          <Text size="sm">
            <Text fw={500} span>Website: </Text>
            <Text c="blue" component="a" href={company.website} target="_blank" span>
              {company.website}
            </Text>
          </Text>
        )}

        {company.specialties?.length > 0 && (
          <div>
            <Text fw={500} size="sm" mb={4}>Specialties</Text>
            <Group gap={6} wrap="wrap">
              {company.specialties.map((s, i) => (
                <Badge key={i} size="sm" variant="outline" color="gray">{s}</Badge>
              ))}
            </Group>
          </div>
        )}

        {company.funding && (
          <div>
            <Text fw={500} size="sm" mb={4}>Funding</Text>
            <Group gap="xs">
              <Text size="sm">Rounds: {company.funding.numberOfRounds}</Text>
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
            <Divider label="Recent Posts" my="xs" />
            <Stack gap="sm">
              {posts.slice(0, 5).map((p, i) => (
                <Card key={i} withBorder radius="sm" p="sm">
                  <Text size="sm" lineClamp={4} style={{ whiteSpace: "pre-wrap" }}>{p.text || "—"}</Text>
                  <Group gap="xs" mt={4}>
                    {p.datePublished && (
                      <Text size="xs" c="dimmed">{new Date(p.datePublished).toLocaleDateString()}</Text>
                    )}
                    {p.url && (
                      <Text size="xs" c="blue" component="a" href={p.url} target="_blank">
                        View →
                      </Text>
                    )}
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
  if (!post) return null;

  // Decode HTML entities that Scrape Creators sometimes returns (e.g. &#39; &amp;)
  const decode = (str) => {
    if (!str) return str;
    const el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  };

  const title = decode(post.name) || "Untitled Post";
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
              <IconBrandLinkedin size={14} style={{ marginRight: 4 }} /> Post
            </Badge>
            <SaveButton label="Save Post" onSave={() => onSave("post", post)} />
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
                {Number(authorFollowers).toLocaleString()} followers
              </Badge>
            )}
          </Group>
        )}

        {/* Metrics */}
        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{likes.toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Likes</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{comments.toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Comments</Text>
            </div>
            {post.datePublished && (
              <div style={{ textAlign: "center" }}>
                <Text fw={700} size="md" c="blue">
                  {new Date(post.datePublished).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </Text>
                <Text size="xs" c="dimmed">Published</Text>
              </div>
            )}
          </Group>
        </Card>

        {/* Thumbnail + Content */}
        {(thumb || content) && (
          <Group gap="md" align="start" wrap="nowrap">
            {thumb && (
              <img
                src={thumb}
                alt=""
                style={{ width: 120, height: 80, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
              />
            )}
            {content && (
              <div style={{ flex: 1 }}>
                <Text fw={600} size="sm" mb={4}>Content</Text>
                <ScrollArea h={content.length > 400 ? 180 : undefined}>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{content}</Text>
                </ScrollArea>
              </div>
            )}
          </Group>
        )}

        {/* Comments */}
        {commentsArr.length > 0 && (
          <div>
            <Divider label={`Comments (${commentsArr.length})`} my="xs" />
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {commentsArr.slice(0, 6).map((c, i) => (
                <Card key={i} withBorder radius="sm" p="xs" style={{ minHeight: 0 }}>
                  <Group gap={6} wrap="nowrap" mb={2}>
                    {c.image && (
                      <img src={c.image} alt="" style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0 }} />
                    )}
                    <Text size="xs" fw={600} lineClamp={1} style={{ flex: 1 }}>{decode(c.author || c.name) || "Unknown"}</Text>
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
                </Card>
              ))}
            </SimpleGrid>
          </div>
        )}

        {/* More Articles */}
        {moreArticles.length > 0 && (
          <div>
            <Divider label="Related Articles" my="xs" />
            <Stack gap="xs">
              {moreArticles.slice(0, 5).map((a, i) => (
                <Group key={i} gap="sm" wrap="nowrap">
                  {a.image && (
                    <img src={a.image} alt="" style={{ width: 48, height: 32, borderRadius: 4, objectFit: "cover" }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <Text size="sm" lineClamp={1} fw={500}>{decode(a.headline || a.name)}</Text>
                    {a.author && <Text size="xs" c="dimmed">{a.author}</Text>}
                  </div>
                  {a.url && (
                    <Text size="xs" c="blue" component="a" href={a.url} target="_blank">View</Text>
                  )}
                </Group>
              ))}
            </Stack>
          </div>
        )}

        {/* Link */}
        {post.url && (
          <Group justify="flex-end">
            <Text size="sm" c="blue" component="a" href={post.url} target="_blank" fw={500}>
              View on LinkedIn →
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

/* ─── X / Twitter Result Components ──────────────────────────────────────── */

function XUserCard({ user, onSave }) {
  if (!user) return null;
  const m = user.public_metrics || {};

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="start">
          <Group align="center" gap="md">
            {user.profile_image_url && (
              <img
                src={user.profile_image_url.replace("_normal", "_200x200")}
                alt={user.name}
                style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid #e0e0e0" }}
              />
            )}
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
            <IconBrandX size={14} style={{ marginRight: 4 }} /> Profile
          </Badge>
        </Group>

        <Card withBorder radius="sm" p="sm" bg="gray.0">
          <Group gap="xl" justify="center" wrap="wrap">
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.followers_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Followers</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.following_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Following</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.tweet_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Tweets</Text>
            </div>
            <div style={{ textAlign: "center" }}>
              <Text fw={700} size="xl" c="blue">{(m.listed_count || 0).toLocaleString()}</Text>
              <Text size="xs" c="dimmed">Listed</Text>
            </div>
          </Group>
        </Card>

        {user.description && (
          <div>
            <Text fw={600} size="sm" mb={4}>Bio</Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{user.description}</Text>
          </div>
        )}

        {user.created_at && (
          <Text size="xs" c="dimmed">
            Joined {new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
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
  if (!tweet) return null;
  const m = tweet.public_metrics || {};
  const engagement = (m.like_count || 0) + (m.retweet_count || 0) + (m.reply_count || 0) + (m.quote_count || 0);

  return (
    <Card withBorder radius="sm" p="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="start">
          <div style={{ flex: 1 }}>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }} lineClamp={4}>{tweet.text}</Text>
          </div>
          {onSave && (
            <SaveButton label="Save" onSave={() => onSave("tweet", { ...tweet, _authorUsername: authorUsername })} />
          )}
        </Group>

        <Group gap="md" wrap="wrap">
          <Badge variant="light" size="sm">❤️ {(m.like_count || 0).toLocaleString()}</Badge>
          <Badge variant="light" size="sm">🔁 {(m.retweet_count || 0).toLocaleString()}</Badge>
          <Badge variant="light" size="sm">💬 {(m.reply_count || 0).toLocaleString()}</Badge>
          {m.quote_count > 0 && <Badge variant="light" size="sm">💭 {m.quote_count.toLocaleString()}</Badge>}
          <Badge variant="light" color="green" size="sm">📊 {engagement.toLocaleString()} total</Badge>
        </Group>

        <Group gap="xs">
          {tweet.created_at && (
            <Text size="xs" c="dimmed">
              {new Date(tweet.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
          {tweet.lang && tweet.lang !== "und" && (
            <Badge size="xs" variant="light" color="gray">{tweet.lang}</Badge>
          )}
          {tweet.source && (
            <Badge size="xs" variant="light" color="gray">{tweet.source}</Badge>
          )}
          <Text size="xs" c="blue" component="a" href={`https://x.com/i/web/status/${tweet.id}`} target="_blank">
            View →
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}

function XUserListCard({ users, title }) {
  if (!users?.length) return null;

  return (
    <div>
      <Divider label={`${title} (${users.length})`} my="xs" />
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
        {users.slice(0, 12).map((u, i) => (
          <Card key={u.id || i} withBorder radius="sm" p="xs">
            <Group gap={8} wrap="nowrap" align="start">
              {u.profile_image_url && (
                <img src={u.profile_image_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, overflow: "hidden" }}>
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" fw={600} lineClamp={1}>{u.name}</Text>
                  {u.verified && <Badge size="xs" color="blue" variant="filled" p={2}>✓</Badge>}
                </Group>
                <Text size="xs" c="dimmed">@{u.username}</Text>
                {u.public_metrics && (
                  <Text size="xs" c="dimmed">
                    {(u.public_metrics.followers_count || 0).toLocaleString()} followers
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
      <Divider label={`X Results (${resultCount} returned)`} />

      {errors?.length > 0 && (
        <Alert variant="light" color="orange" title="Some requests failed" icon={<IconAlertCircle />}>
          {errors.map((e, i) => (
            <Text key={i} size="sm"><b>{e.endpoint}:</b> {e.error}</Text>
          ))}
        </Alert>
      )}

      {resultCount === 0 && !errors?.length && (
        <Alert variant="light" color="gray" title="No results">
          No data was returned. Please check the inputs and try again.
        </Alert>
      )}

      {/* User Lookup */}
      {results.userLookup && <XUserCard user={results.userLookup} />}

      {/* Followers */}
      {results.followers && <XUserListCard users={results.followers} title="Followers" />}

      {/* Following */}
      {results.following && <XUserListCard users={results.following} title="Following" />}

      {/* User Tweets */}
      {results.userTweets?.length > 0 && (
        <div>
          <Divider label={`Tweets (${results.userTweets.length})`} my="xs" />
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
          <Divider label={`Mentions (${results.userMentions.tweets.length})`} my="xs" />
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
          <Divider label="Tweet Lookup" my="xs" />
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
          <Divider label={`Search Results (${results.searchTweets.tweets.length})`} my="xs" />
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
  if (!data?.results) return null;
  const { results, errors } = data;
  const resultCount = Object.keys(results).length;

  return (
    <Stack gap="md">
      <Divider label={`LinkedIn Results (${resultCount} returned)`} />

      {errors?.length > 0 && (
        <Alert variant="light" color="orange" title="Some requests failed" icon={<IconAlertCircle />}>
          {errors.map((e, i) => (
            <Text key={i} size="sm"><b>{e.endpoint}:</b> {e.error}</Text>
          ))}
        </Alert>
      )}

      {resultCount === 0 && !errors?.length && (
        <Alert variant="light" color="gray" title="No results">
          No data was returned. Please check the URLs and try again.
        </Alert>
      )}

      {results.profile && <LinkedinProfileCard profile={results.profile} onSave={onSave} />}
      {results.company && <LinkedinCompanyCard company={results.company} onSave={onSave} />}
      {results.post && <LinkedinPostCard post={results.post} onSave={onSave} />}
    </Stack>
  );
}

/* ─── End LinkedIn Results ───────────────────────────────────────────────── */

export default function CompetitorLookup() {
  const [connectedPlatforms, setConnectedPlatforms] = useState(getConnectedPlatforms);

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

  const [username, setUsername] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [youtubeResult, setYoutubeResult] = useState(null);
  const [convertedData, setConvertedData] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [linkedinOptions, setLinkedinOptions] = useState({
    profile: false,
    company: false,
    post: false,
  });
  const [linkedinInputs, setLinkedinInputs] = useState({
    profile: "",
    company: "",
    post: "",
  });
  const [instagramOptions, setInstagramOptions] = useState({});
  const [instagramInputs, setInstagramInputs] = useState({});
  const [tiktokOptions, setTiktokOptions] = useState({});
  const [tiktokInputs, setTiktokInputs] = useState({});
  const [xOptions, setXOptions] = useState({});
  const [xInputs, setXInputs] = useState({});
  const [youtubeOptions, setYoutubeOptions] = useState({});
  const [youtubeInputs, setYoutubeInputs] = useState({});
  const [redditOptions, setRedditOptions] = useState({});
  const [redditInputs, setRedditInputs] = useState({});
  const [linkedinResult, setLinkedinResult] = useState(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);
  const [xResult, setXResult] = useState(null);
  const [xLoading, setXLoading] = useState(false);
  const [xError, setXError] = useState(null);



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

  async function tryFetchYouTube(youtubeUrlToFetch) {
    const trimmed = String(youtubeUrlToFetch || "").trim();
    if (!trimmed) throw new Error("Please enter a YouTube URL.");

    const attempts = [];

    for (const base of backends) {
      const url = `${base.replace(/\/+$/, "")}/api/youtube/transcript?video=${encodeURIComponent(trimmed)}`;
      try {
        const resp = await fetch(url, { method: "GET" });
        const ct = resp.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          const text = await resp.text();
          throw new Error(`Expected JSON from ${base}, got: ${text.slice(0, 300)}`);
        }
        const json = await resp.json();
        if (!resp.ok) {
          const msg =
            json?.error ||
            `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
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

  async function handleSubmitYouTube(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
    setYoutubeResult(null);
    setConvertedData(null);
    const u = youtubeUrl.trim();
    if (!u) {
      setError("Please enter a YouTube URL.");
      return;
    }
    setLoading(true);
    try {
      const data = await tryFetchYouTube(u);
      setYoutubeResult(data);
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
          platform_id: 1,
          platform_user_id: data.author_id || "",
          username: data._authorUsername || "",
          platform_post_id: data.id,
          content: data.text,
          published_at: data.created_at,
          likes: metrics.like_count ?? 0,
          shares: metrics.retweet_count ?? 0,
          comments: metrics.reply_count ?? 0,
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

    const metrics = post.public_metrics || [];
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error'

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
            platform_id: 1,
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
      <Card withBorder radius="md" shadow="sm">
        <Group justify="space-between" mt="sm">
          <Group gap="md">
            <Badge variant="light">❤️ {metrics.like_count ?? 0}</Badge>
            <Badge variant="light">🔁 {metrics.retweet_count ?? 0}</Badge>
            <Badge variant="light">💬 {metrics.reply_count ?? 0}</Badge>
          </Group>

          <Button
            size="xs"
            variant="light"
            loading={saving}
            color={saveStatus === 'saved' ? 'green' : saveStatus === 'error' ? 'red' : undefined}
            onClick={handleSave}
            disabled={saveStatus === 'saved'}
          >
            {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Error – Retry' : 'Save'}
          </Button>
        </Group>
      </Card>
    );
  }

  function YouTubeCard({ data }) {
    if (!data) return null;

    const [saving, setSaving] = useState(false);

    async function handleSave() {
      try {
        setSaving(true);
        const resp = await fetch(apiUrl("/api/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform_id: 8,
            platform_user_id: data.video.channelId,
            username: data.video.channelTitle,
            platform_post_id: data.videoId,
            content: data.transcript || data.video.description,
            published_at: data.video.publishedAt,
            likes: data.video.stats.likes || 0,
            shares: 0,
            comments: data.video.stats.comments || 0,
            title: data.video.title,
            description: data.video.description,
            channelTitle: data.video.channelTitle,
            videoId: data.videoId,
            views: data.video.stats.views,
          }),
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Failed to save video: ${resp.status} ${errorText}`);
        }

        await resp.json();
        // Optionally show success message
      } catch (e) {
        console.error("Error saving video:", e);
        // Optionally show error
      } finally {
        setSaving(false);
      }
    }

    return (
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Group justify="space-between" align="start">
            <Title order={4} lineClamp={2}>{data.video?.title || "Untitled Video"}</Title>
            <Badge variant="light" color="red">
              <IconBrandYoutube size={14} style={{ marginRight: 4 }} />
              YouTube
            </Badge>
          </Group>

          <Group gap="md" wrap="wrap">
            <Group gap="xs">
              <Text fw={500}>Channel:</Text>
              <Text>{data.video?.channelTitle || "Unknown"}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Views:</Text>
              <Text>{(data.video?.stats?.views || 0).toLocaleString()}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Likes:</Text>
              <Text>{(data.video?.stats?.likes || 0).toLocaleString()}</Text>
            </Group>
            <Group gap="xs">
              <Text fw={500}>Published:</Text>
              <Text>{data.video?.publishedAt ? new Date(data.video.publishedAt).toLocaleDateString() : "Unknown"}</Text>
            </Group>
          </Group>

          {data.video?.description && (
            <div>
              <Text fw={500} mb="xs">Description:</Text>
              <Text size="sm" lineClamp={3}>{data.video.description}</Text>
            </div>
          )}

          <Divider />

          <div>
            <Text fw={500} mb="xs">Transcript:</Text>
            {data.transcriptAvailable ? (
              <ScrollArea h={200}>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {data.transcript}
                </Text>
              </ScrollArea>
            ) : (
              <Alert color="yellow" title="Transcript unavailable">
                YouTube does not allow downloading captions for this video.
                Showing description instead.
              </Alert>
            )}
          </div>

          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              loading={saving}
              onClick={handleSave}
            >
              Save Video
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  }

  const posts = Array.isArray(result?.posts) ? result.posts : [];

  return (
    <Card withBorder radius="lg" shadow="sm" p="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} zIndex={1000} />
      <Stack gap="lg">
        <Group justify="space-between" align="baseline">
          <Title order={2}>Competitor Lookup</Title>
          <Text size="sm" c="dimmed">
            Search competitors across social platforms
          </Text>
        </Group>

        {!Object.values(connectedPlatforms).some(Boolean) && (
          <Alert variant="light" color="blue" title="No platforms connected">
            Go to Connected Integrations to enable platforms.
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

            {connectedPlatforms.x && (
              <Tabs.Panel value="x" pt="md">
                <Stack gap="lg">

                  <Title order={4}>X / Twitter Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Uses the official X API v2. Select the data you want to fetch.
                  </Text>

                  {/* PROFILE & ACCOUNT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 Profile & Account</Text>

                      <Checkbox
                        label={<LabelWithInfo label="User Lookup" info="Fetches user profile details including name, bio, followers, following, verified status, and account creation date." />}
                        checked={xOptions.userLookup || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userLookup: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Followers" info="Fetches the list of accounts following this user." />}
                        checked={xOptions.followers || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, followers: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Following" info="Fetches the list of accounts this user follows." />}
                        checked={xOptions.following || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, following: e.target.checked }))}
                      />

                      {(xOptions.userLookup || xOptions.followers || xOptions.following) && (
                        <TextInput label="Username" placeholder="@jack" value={xInputs.username || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* TWEETS & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 Tweets & Content</Text>

                      <Checkbox
                        label={<LabelWithInfo label="User Tweets" info="Fetches recent tweets posted by the user including text, engagement metrics, and timestamps." />}
                        checked={xOptions.userTweets || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userTweets: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="User Mentions" info="Fetches recent tweets that mention this user." />}
                        checked={xOptions.userMentions || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, userMentions: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Tweet Lookup" info="Fetches detailed information about a specific tweet including text, metrics, media, and context." />}
                        checked={xOptions.tweetLookup || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, tweetLookup: e.target.checked }))}
                      />

                      {(xOptions.userTweets || xOptions.userMentions) && (
                        <TextInput label="Username" placeholder="@jack" value={xInputs.tweetsUsername || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, tweetsUsername: e.target.value }))} />
                      )}

                      {xOptions.tweetLookup && (
                        <TextInput label="Tweet URL or ID" placeholder="https://x.com/user/status/123..." value={xInputs.tweetUrl || ""}
                          onChange={(e) => setXInputs(prev => ({ ...prev, tweetUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 Search</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Search Tweets" info="Searches recent tweets matching a query, keyword, or hashtag using the official search endpoint." />}
                        checked={xOptions.searchTweets || false}
                        onChange={(e) => setXOptions(prev => ({ ...prev, searchTweets: e.target.checked }))}
                      />

                      {xOptions.searchTweets && (
                        <TextInput label="Search Query" placeholder="from:elonmusk OR #tech" value={xInputs.searchQuery || ""}
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
                    Search X
                  </Button>

                  {xError && (
                    <Alert variant="light" color="red" title="Error" icon={<IconAlertCircle />}>
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

                  <Title order={4}>YouTube Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Uses the official YouTube Data API v3. Select the data you want to fetch.
                  </Text>

                  {/* CHANNEL */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📺 Channel</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Channel Details" info="Fetches channel info including name, description, subscriber count, total videos, and banner art." />}
                        checked={youtubeOptions.channelDetails || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelDetails: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Channel Videos" info="Lists videos uploaded to a channel with titles, publish dates, view counts, and thumbnails." />}
                        checked={youtubeOptions.channelVideos || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, channelVideos: e.target.checked }))}
                      />

                      {(youtubeOptions.channelDetails || youtubeOptions.channelVideos) && (
                        <TextInput label="Channel URL or ID" placeholder="https://youtube.com/@MrBeast or UCX6OQ3..." value={youtubeInputs.channelUrl || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, channelUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* VIDEO & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎬 Video & Content</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Video Details" info="Fetches detailed info about a specific video including title, description, stats, tags, and category." />}
                        checked={youtubeOptions.videoDetails || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, videoDetails: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Transcript" info="Extracts captions/transcript from a YouTube video when available." />}
                        checked={youtubeOptions.transcript || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, transcript: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Video Comments" info="Fetches comments on a specific video including replies, like counts, and timestamps." />}
                        checked={youtubeOptions.videoComments || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, videoComments: e.target.checked }))}
                      />

                      {(youtubeOptions.videoDetails || youtubeOptions.transcript || youtubeOptions.videoComments) && (
                        <TextInput label="Video URL" placeholder="https://youtube.com/watch?v=..." value={youtubeInputs.videoUrl || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 Search</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Search" info="Searches YouTube for videos, channels, or playlists matching a query." />}
                        checked={youtubeOptions.search || false}
                        onChange={(e) => setYoutubeOptions(prev => ({ ...prev, search: e.target.checked }))}
                      />

                      {youtubeOptions.search && (
                        <TextInput label="Search Query" placeholder="react tutorial, #coding" value={youtubeInputs.searchQuery || ""}
                          onChange={(e) => setYoutubeInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(youtubeOptions).some(Boolean)}
                  >
                    Search YouTube
                  </Button>
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.linkedin && (
              <Tabs.Panel value="linkedin" pt="md">
                <Stack gap="lg">

                  <Title order={4}>LinkedIn Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE & COMPANY */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👔 Profile & Company</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Person Profile" info="Fetches a person's LinkedIn profile including headline, summary, experience, education, and connection count." />}
                        checked={linkedinOptions.profile || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Company Page" info="Fetches company page details including description, industry, employee count, and follower count." />}
                        checked={linkedinOptions.company || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, company: e.target.checked }))}
                      />

                      {linkedinOptions.profile && (
                        <TextInput label="Profile URL or username" placeholder="https://linkedin.com/in/..."
                          value={linkedinInputs.profile}
                          onChange={(e) => setLinkedinInputs(prev => ({ ...prev, profile: e.target.value }))} />
                      )}

                      {linkedinOptions.company && (
                        <TextInput label="Company URL or name" placeholder="https://linkedin.com/company/..."
                          value={linkedinInputs.company}
                          onChange={(e) => setLinkedinInputs(prev => ({ ...prev, company: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 Posts</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Post" info="Fetches a specific LinkedIn post including content, reactions, comments count, and engagement metrics." />}
                        checked={linkedinOptions.post || false}
                        onChange={(e) => setLinkedinOptions(prev => ({ ...prev, post: e.target.checked }))}
                      />

                      {linkedinOptions.post && (
                        <TextInput label="Post URL" placeholder="https://linkedin.com/posts/..."
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
                    Search LinkedIn
                  </Button>

                  {linkedinError && (
                    <Alert variant="light" color="red" title="Error" icon={<IconAlertCircle />}>
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

                  <Title order={4}>Instagram Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 Profile & Account</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Profile" info="Scrapes detailed profile info including bio, followers, following, and account stats." />}
                        checked={instagramOptions.profile || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Basic Profile" info="Scrapes basic profile info including username, display name, and profile picture." />}
                        checked={instagramOptions.basicProfile || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, basicProfile: e.target.checked }))}
                      />

                      {(instagramOptions.profile || instagramOptions.basicProfile) && (
                        <TextInput label="Username" placeholder="@username" value={instagramInputs.username || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📝 Posts & Content</Text>

                      <Checkbox
                        label={<LabelWithInfo label="User Posts" info="Scrapes the user's recent posts including images, videos, captions, and engagement metrics." />}
                        checked={instagramOptions.userPosts || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, userPosts: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Post / Reel Info" info="Scrapes detailed info about a specific post or reel including media, caption, likes, and metadata." />}
                        checked={instagramOptions.singlePost || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, singlePost: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Post Comments" info="Scrapes all comments on a specific post including user details, timestamps, and nested replies." />}
                        checked={instagramOptions.postComments || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, postComments: e.target.checked }))}
                      />

                      {instagramOptions.userPosts && (
                        <TextInput label="Username" placeholder="@username" value={instagramInputs.userPostsUsername || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, userPostsUsername: e.target.value }))} />
                      )}

                      {(instagramOptions.singlePost || instagramOptions.postComments) && (
                        <TextInput label="Post URL" placeholder="https://instagram.com/p/..." value={instagramInputs.postUrl || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* REELS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎥 Reels</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Search Reels" info="Searches for reels by keyword or hashtag and returns matching video content with metadata." />}
                        checked={instagramOptions.reelsSearch || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, reelsSearch: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="User Reels" info="Scrapes all reels from a specific user's profile including video URLs, captions, and engagement data." />}
                        checked={instagramOptions.userReels || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, userReels: e.target.checked }))}
                      />

                      {instagramOptions.reelsSearch && (
                        <TextInput label="Search Term" placeholder="fitness, #workout" value={instagramInputs.reelsSearchTerm || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, reelsSearchTerm: e.target.value }))} />
                      )}

                      {instagramOptions.userReels && (
                        <TextInput label="Username" placeholder="@username" value={instagramInputs.userReelsUsername || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, userReelsUsername: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* HIGHLIGHTS SECTION */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>⭐ Highlights</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Highlight Detail" info="Scrapes detailed info about a specific story highlight including all stories, media URLs, and metadata." />}
                        checked={instagramOptions.highlightDetail || false}
                        onChange={(e) => setInstagramOptions(prev => ({ ...prev, highlightDetail: e.target.checked }))}
                      />

                      {instagramOptions.highlightDetail && (
                        <TextInput label="Highlight URL" placeholder="https://instagram.com/stories/highlights/..." value={instagramInputs.highlightUrl || ""}
                          onChange={(e) => setInstagramInputs(prev => ({ ...prev, highlightUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(instagramOptions).some(Boolean)}
                  >
                    Search Instagram
                  </Button>
                </Stack>
              </Tabs.Panel>
            )}


            {connectedPlatforms.tiktok && (
              <Tabs.Panel value="tiktok" pt="md">
                <Stack gap="lg">

                  <Title order={4}>TikTok Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* PROFILE & ACCOUNT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>👤 Profile & Account</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Profile" info="Scrapes TikTok profile details including bio, follower/following counts, likes, and verified status." />}
                        checked={tiktokOptions.profile || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, profile: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Following" info="Scrapes the list of accounts a user is following." />}
                        checked={tiktokOptions.following || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, following: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Followers" info="Scrapes the list of followers for a specific user." />}
                        checked={tiktokOptions.followers || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, followers: e.target.checked }))}
                      />

                      {(tiktokOptions.profile || tiktokOptions.following || tiktokOptions.followers) && (
                        <TextInput label="Username" placeholder="@username" value={tiktokInputs.username || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, username: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* VIDEOS & CONTENT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🎬 Videos & Content</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Profile Videos" info="Scrapes all videos from a user's profile including captions, view counts, and engagement." />}
                        checked={tiktokOptions.profileVideos || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, profileVideos: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Video Info" info="Scrapes detailed info about a specific video including stats, audio, effects, and metadata." />}
                        checked={tiktokOptions.videoInfo || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, videoInfo: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Transcript" info="Extracts the spoken transcript from a TikTok video." />}
                        checked={tiktokOptions.transcript || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, transcript: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Comments" info="Scrapes all comments on a specific video including user details and timestamps." />}
                        checked={tiktokOptions.comments || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, comments: e.target.checked }))}
                      />

                      {tiktokOptions.profileVideos && (
                        <TextInput label="Username" placeholder="@username" value={tiktokInputs.videosUsername || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, videosUsername: e.target.value }))} />
                      )}

                      {(tiktokOptions.videoInfo || tiktokOptions.transcript || tiktokOptions.comments) && (
                        <TextInput label="Video URL" placeholder="https://tiktok.com/@user/video/..." value={tiktokInputs.videoUrl || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, videoUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* SEARCH & DISCOVERY */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>🔍 Search & Discovery</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Search Users" info="Search for TikTok users by name or keyword and return matching profiles." />}
                        checked={tiktokOptions.searchUsers || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchUsers: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Search by Hashtag" info="Search for videos associated with a specific hashtag." />}
                        checked={tiktokOptions.searchHashtag || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchHashtag: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Search by Keyword" info="Search for videos matching a keyword query across TikTok." />}
                        checked={tiktokOptions.searchKeyword || false}
                        onChange={(e) => setTiktokOptions(prev => ({ ...prev, searchKeyword: e.target.checked }))}
                      />

                      {tiktokOptions.searchUsers && (
                        <TextInput label="User Search Query" placeholder="fitness creator" value={tiktokInputs.userSearchQuery || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, userSearchQuery: e.target.value }))} />
                      )}

                      {tiktokOptions.searchHashtag && (
                        <TextInput label="Hashtag" placeholder="#fitness" value={tiktokInputs.hashtag || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, hashtag: e.target.value }))} />
                      )}

                      {tiktokOptions.searchKeyword && (
                        <TextInput label="Keyword" placeholder="workout routine" value={tiktokInputs.keyword || ""}
                          onChange={(e) => setTiktokInputs(prev => ({ ...prev, keyword: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(tiktokOptions).some(Boolean)}
                  >
                    Search TikTok
                  </Button>
                </Stack>
              </Tabs.Panel>
            )}

            {connectedPlatforms.reddit && (
              <Tabs.Panel value="reddit" pt="md">
                <Stack gap="lg">

                  <Title order={4}>Reddit Lookup</Title>

                  <Text size="sm" c="dimmed">
                    Select the data you want to fetch. Each endpoint costs <b>1 credit</b>.
                  </Text>

                  {/* SUBREDDIT */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📋 Subreddit</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Subreddit Details" info="Scrapes subreddit info including description, subscriber count, active users, creation date, and rules." />}
                        checked={redditOptions.subredditDetails || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditDetails: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Subreddit Posts" info="Scrapes posts from a subreddit including titles, scores, comment counts, and post content." />}
                        checked={redditOptions.subredditPosts || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditPosts: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Subreddit Search" info="Searches within a specific subreddit for posts matching a query." />}
                        checked={redditOptions.subredditSearch || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, subredditSearch: e.target.checked }))}
                      />

                      {(redditOptions.subredditDetails || redditOptions.subredditPosts || redditOptions.subredditSearch) && (
                        <TextInput label="Subreddit" placeholder="r/reactjs" value={redditInputs.subreddit || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, subreddit: e.target.value }))} />
                      )}

                      {redditOptions.subredditSearch && (
                        <TextInput label="Search Query" placeholder="state management" value={redditInputs.subredditQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, subredditQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* POSTS & SEARCH */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>💬 Posts & Search</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Post Comments" info="Scrapes all comments on a specific Reddit post including nested replies, scores, and user details." />}
                        checked={redditOptions.postComments || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, postComments: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Search" info="Searches across all of Reddit for posts matching a query." />}
                        checked={redditOptions.search || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, search: e.target.checked }))}
                      />

                      {redditOptions.postComments && (
                        <TextInput label="Post URL" placeholder="https://reddit.com/r/reactjs/comments/..." value={redditInputs.postUrl || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, postUrl: e.target.value }))} />
                      )}

                      {redditOptions.search && (
                        <TextInput label="Search Query" placeholder="best javascript framework" value={redditInputs.searchQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, searchQuery: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  {/* ADS */}
                  <Card withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Text fw={600}>📢 Ads</Text>

                      <Checkbox
                        label={<LabelWithInfo label="Search Ads" info="Searches for Reddit ads matching a query." />}
                        checked={redditOptions.searchAds || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, searchAds: e.target.checked }))}
                      />

                      <Checkbox
                        label={<LabelWithInfo label="Get Ad" info="Fetches details about a specific Reddit ad including creative, targeting, and spend info." />}
                        checked={redditOptions.getAd || false}
                        onChange={(e) => setRedditOptions(prev => ({ ...prev, getAd: e.target.checked }))}
                      />

                      {redditOptions.searchAds && (
                        <TextInput label="Ad Search Query" placeholder="software, SaaS" value={redditInputs.adSearchQuery || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, adSearchQuery: e.target.value }))} />
                      )}

                      {redditOptions.getAd && (
                        <TextInput label="Ad URL or ID" placeholder="https://reddit.com/..." value={redditInputs.adUrl || ""}
                          onChange={(e) => setRedditInputs(prev => ({ ...prev, adUrl: e.target.value }))} />
                      )}
                    </Stack>
                  </Card>

                  <Button
                    leftSection={<IconSearch size={16} />}
                    disabled={!Object.values(redditOptions).some(Boolean)}
                  >
                    Search Reddit
                  </Button>
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
                <Title order={4}>Summary</Title>
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
                    <Title order={5}>Universal Data Format</Title>
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

            <Divider label="Posts" />

            {posts.length === 0 ? (
              <Alert variant="light" color="gray" title="No posts returned">
                The API did not return any tweets for this user.
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

        {youtubeResult && (
          <Stack gap="lg">
            <YouTubeCard data={youtubeResult} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}