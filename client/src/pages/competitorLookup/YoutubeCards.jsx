import React, { useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBrandYoutube,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconEye,
  IconHeart,
  IconMessage,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { SaveButton, SaveAllButton } from "./SharedCards";
import { fmtNum, parseDuration } from "./competitorLookupUtils";
import { apiUrl } from "../../utils/api";

export function BackendBadge({ base }) {
  const label = base?.replace(/^https?:\/\//, "");
  return (
    <Badge variant="light" radius="sm" title={base}>
      {label || "unknown"}
    </Badge>
  );
}

export function Copyable({ value, label }) {
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

export function YouTubeCard({ data, currentUserId, platformIds }) {
  const { t } = useTranslation();
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

export function YTChannelCard({ data }) {
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

export function YTVideoCard({ video, onSave, compact }) {
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

export function YTTranscript({ data, onSaveTranscript }) {
  const { t } = useTranslation();
  if (!data) return null;
  if (!data.available) {
    return (
      <Alert color="yellow" title={t("competitorLookup.transcriptUnavailable")}>
        {data.reason || t("competitorLookup.noTranscriptAvailable")}
        {data.videoTitle && <Text size="sm" mt={4}>Video: {data.videoTitle}</Text>}
      </Alert>
    );
  }
  return (
    <Card withBorder radius="md" shadow="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600}>Transcript</Text>
          <Group gap="xs">
            <Badge size="xs" variant="light">{data.language || "en"}</Badge>
            <SaveButton label="Save Transcript" onSave={() => onSaveTranscript(data)} />
          </Group>
        </Group>
        <ScrollArea h={250}>
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{data.text}</Text>
        </ScrollArea>
      </Stack>
    </Card>
  );
}

export function YoutubeResults({ data, onSave, currentUserId, platformIds }) {
  const { t } = useTranslation();
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
          }} currentUserId={currentUserId} platformIds={platformIds} />
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
