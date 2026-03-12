import React from "react";
import {
  Alert,
  Badge,
  Card,
  Divider,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBrandLinkedin,
  IconUser,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";

export function LinkedinProfileCard({ profile, onSave }) {
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

export function LinkedinCompanyCard({ company, onSave }) {
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

export function LinkedinPostCard({ post, onSave }) {
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

        {/* Content */}
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

export function LinkedinResults({ data, onSave }) {
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
