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
  Title,
} from "@mantine/core";
import { IconBrandReddit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";
import { fmtNum } from "./competitorLookupUtils";

export function RedditSubredditCard({ details }) {
  const { t } = useTranslation();
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

export function RedditPostCard({ post, onSave, compact }) {
  const { t } = useTranslation();
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

export function RedditCommentsList({ comments, onSaveComment }) {
  const { t } = useTranslation();
  const list = Array.isArray(comments) ? comments : [];
  if (!list.length) return <Text size="sm" c="dimmed">{t("competitorLookup.noCommentsFound")}</Text>;
  return (
    <Stack gap="xs">
      <Group justify="flex-end">
        <SaveAllButton items={list} onSave={(_type, c) => onSaveComment(c)} type="comment" />
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
              <SaveButton label={t("competitorLookup.save")} onSave={() => onSaveComment(c)} />
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export function RedditAdCard({ ad, onSaveAd }) {
  const { t } = useTranslation();
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
            {onSaveAd && <SaveButton label={t("competitorLookup.save")} onSave={() => onSaveAd(ad)} />}
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

export function RedditResults({ data, onSave, onSaveComment, onSaveAd }) {
  const { t } = useTranslation();
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
          <RedditCommentsList comments={commentsArr} onSaveComment={onSaveComment} />
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
            <SaveAllButton items={adsArr} onSave={(_type, a) => onSaveAd(a)} type="ad" />
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
            {adsArr.map((a, i) => <RedditAdCard key={a.id || i} ad={a} onSaveAd={onSaveAd} />)}
          </SimpleGrid>
        </>
      )}

      {adDetail && (
        <>
          <Divider label={t("competitorLookup.adDetail")} labelPosition="center" />
          <RedditAdCard ad={adDetail} onSaveAd={onSaveAd} />
        </>
      )}
    </Stack>
  );
}
