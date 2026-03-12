import React from "react";
import {
  Alert,
  Badge,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBrandX,
  IconHeart,
  IconMessage,
  IconQuote,
  IconRepeat,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";

export function XUserCard({ user, onSave }) {
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

export function XTweetCard({ tweet, authorUsername, onSave }) {
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

export function XUserListCard({ users, title, onSaveUser }) {
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

export function XResults({ data, onSave }) {
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
