import React, { useMemo, useState } from "react";

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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconBrandX,
  IconCheck,
  IconCopy,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { convertXInput } from "./DataConverter";

export default function CompetitorLookup() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [convertedData, setConvertedData] = useState(null);

  const configuredBackend = import.meta.env.VITE_BACKEND_URL || "";
  const localBackend = "http://localhost:8080";

  const backends = useMemo(() => {
    const arr = [localBackend];
    if (configuredBackend && configuredBackend !== localBackend) arr.push(configuredBackend);
    return arr;
  }, [configuredBackend]);

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
          const msg =
            json?.error ||
            `Request failed ${resp.status} ${resp.statusText || ""}`.trim();
          throw new Error(msg);
        }
        return { ...json, _usedBackend: base };
      } catch (e) {
        // Only record the why; continue to next backend.
        attempts.push({ base, error: e?.message || String(e) });
      }
    }

    const details = attempts.map((a) => `• ${a.base}: ${a.error}`).join("\n");
    const err = new Error(
      `All backends failed. Check that your server is running and CORS is allowed.\n${details}`
    );
    err.attempts = attempts;
    throw err;
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    setError(null);
    setResult(null);
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

  return (
    <Card withBorder radius="md" shadow="sm">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge radius="sm" variant="light">
            {post.id}
          </Badge>
        </Group>
        <Group gap="xs">
          <IconBrandX size={16} />
          <Text size="sm" c="dimmed">
            Tweet
          </Text>
        </Group>
      </Group>

      <ScrollArea.Autosize mah={160}>
        <Text style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {post.text}
        </Text>
      </ScrollArea.Autosize>

      <Group gap="md" mt="sm">
        <Badge variant="light">❤️ {metrics.like_count ?? 0}</Badge>
        <Badge variant="light">🔁 {metrics.retweet_count ?? 0}</Badge>
        <Badge variant="light">💬 {metrics.reply_count ?? 0}</Badge>
        <Badge variant="light">🔖 {metrics.quote_count ?? 0}</Badge>
      </Group>

      <Text size="xs" c="dimmed" mt="xs">
        {post.created_at
          ? new Date(post.created_at).toLocaleString()
          : "Unknown time"}
      </Text>
    </Card>
  );
}

  const posts = Array.isArray(result?.posts) ? result.posts : [];

  return (
    <Card withBorder radius="lg" shadow="sm" p="lg" style={{ position: "relative" }}>
      <LoadingOverlay visible={loading} zIndex={1000} />
      <Stack gap="lg">
        <Group justify="space-between" align="baseline">
          <Group>
            <Title order={2}>Competitor Lookup</Title>
            <Badge size="sm" variant="outline" radius="sm">
              X / Twitter
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Enter a username (with or without @)
          </Text>
        </Group>

        <form onSubmit={handleSubmit}>
          <Group align="end" wrap="wrap" gap="sm">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              placeholder="@jack"
              label="Username"
              maw={420}
              leftSection={<IconUser size={16} />}
              aria-label="Username to lookup"
              autoComplete="off"
            />
            <Button
              type="submit"
              leftSection={<IconSearch size={16} />}
              disabled={!username.trim() || loading}
            >
              Lookup
            </Button>
          </Group>
        </form>

        {error && (
          <Alert
            variant="light"
            color="red"
            title="Request failed"
            icon={<IconAlertCircle />}
            styles={{ label: { fontWeight: 600 } }}
          >
            <Text style={{ whiteSpace: "pre-wrap" }}>{error}</Text>
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
              <SimpleGrid
                cols={{ base: 1, sm: 2, lg: 3 }}
                spacing="md"
                verticalSpacing="md"
              >
                {posts.map((p) => (
                  <PostCard key={p?.id ?? Math.random()} post={p} />
                ))}
              </SimpleGrid>
            )}

            <Divider label="Raw response" />
            <Card withBorder radius="md">
              <Code block>{JSON.stringify(result, null, 2)}</Code>
            </Card>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}