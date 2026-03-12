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
  Title,
} from "@mantine/core";
import { IconBrandTiktok } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";
import { fmtNum } from "./competitorLookupUtils";

export function TkProfileCard({ profile }) {
  const { t } = useTranslation();
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

export function TkVideoCard({ video, onSave, compact }) {
  const { t } = useTranslation();
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

export function TkUserListCard({ users, title }) {
  const { t } = useTranslation();
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

export function TiktokResults({ data, onSave, onSaveTranscript }) {
  const { t } = useTranslation();
  if (!data) return null;
  const { results = {}, errors = [] } = data;

  // Profile & stats
  const profileData = results.profile;
  const profileVideos = results.profileVideos?.itemList || results.profile?.itemList || [];
  const showProfileVideos = results.profileVideos || (results.profile?.itemList?.length > 0 && !results.profileVideos);
  const followingList = results.following?.followings || results.following?.following_list || [];
  const followersList = results.followers?.followers || [];
  const transcript = results.transcript?.transcript;
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
                  <SaveButton label={t("competitorLookup.saveTranscript")} onSave={() => onSaveTranscript(transcript)} />
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
