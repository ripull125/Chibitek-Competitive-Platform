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
import { IconBrandInstagram } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";
import { fmtNum } from "./competitorLookupUtils";

export function IgProfileCard({ profile }) {
  const { t } = useTranslation();
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

export function IgPostCard({ post, onSave, compact }) {
  const { t } = useTranslation();
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

export function IgReelCard({ reel, onSave, compact }) {
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

export function InstagramResults({ data, onSave }) {
  const { t } = useTranslation();
  if (!data) return null;
  const { results = {}, errors = [] } = data;

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
