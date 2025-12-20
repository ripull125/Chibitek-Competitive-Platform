// client/src/pages/ConnectedIntegrations.jsx
import React, { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandReddit,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import "../utils/ui.css"; // shared title

function formatTime(d) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString();
}

const CATALOG = [
  {
    key: "twitter",
    name: "X (Twitter)",
    desc: "Public tweets, profiles, and engagement.",
    icon: IconBrandX,
    needsToken: false,
  },
  {
    key: "instagram",
    name: "Instagram",
    desc: "Public posts and profile metadata.",
    icon: IconBrandInstagram,
    needsToken: false,
  },
  {
    key: "tiktok",
    name: "TikTok",
    desc: "Creator posts and stats.",
    icon: IconBrandTiktok,
    needsToken: false,
  },
  {
    key: "reddit",
    name: "Reddit",
    desc: "Submissions and comments from subreddits/users.",
    icon: IconBrandReddit,
    needsToken: false,
  },
  {
    key: "youtube",
    name: "YouTube",
    desc: "Channel videos and metrics.",
    icon: IconBrandYoutube,
    needsToken: false,
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    desc: "Company and profile public data.",
    icon: IconBrandLinkedin,
    needsToken: false,
  },
  {
    key: "facebook",
    name: "Facebook",
    desc: "Public pages and posts.",
    icon: IconBrandFacebook,
    needsToken: false,
  },
];

export default function ConnectedIntegrations() {
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState(null); // { color, message }
  const [providers, setProviders] = useState(
    CATALOG.map((p) => ({
      ...p,
      connected: false,
      account: "",
      lastSync: null,
      token: "",
    }))
  );

  const [connectModal, setConnectModal] = useState({
    open: false,
    providerKey: null,
    account: "",
    token: "",
  });

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    providerKey: null,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
    );
  }, [search, providers]);

  function openConnect(p) {
    setConnectModal({
      open: true,
      providerKey: p.key,
      account: p.account || "",
      token: p.token || "",
    });
  }

  function closeConnect() {
    setConnectModal({ open: false, providerKey: null, account: "", token: "" });
  }

  function openDisconnect(p) {
    setConfirmModal({ open: true, providerKey: p.key });
  }

  function closeDisconnect() {
    setConfirmModal({ open: false, providerKey: null });
  }

  function updateProvider(key, patch) {
    setProviders((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p))
    );
  }

  async function handleConnectSubmit(e) {
    e.preventDefault();
    const key = connectModal.providerKey;
    const prov = providers.find((p) => p.key === key);
    if (!prov) return;

    const account = connectModal.account.trim();
    if (!account) {
      setBanner({ color: "red", message: "Account/handle is required." });
      return;
    }
    // Why: simulate successful connection; replace with real API call if available.
    updateProvider(key, {
      connected: true,
      account,
      token: connectModal.token || "",
      lastSync: new Date().toISOString(),
    });
    setBanner({
      color: "green",
      message: `${prov.name} connected as ${account}.`,
    });
    closeConnect();
  }

  function handleDisconnectConfirm() {
    const key = confirmModal.providerKey;
    const prov = providers.find((p) => p.key === key);
    if (!prov) return;
    updateProvider(key, {
      connected: false,
      account: "",
      token: "",
      lastSync: null,
    });
    setBanner({ color: "orange", message: `${prov.name} disconnected.` });
    closeDisconnect();
  }

  function handleManualSync(p) {
    if (!p.connected) return;
    updateProvider(p.key, { lastSync: new Date().toISOString() });
    setBanner({ color: "blue", message: `Synced ${p.name}.` });
  }

  function ProviderCard({ p }) {
    const Icon = p.icon;
    return (
      <Card withBorder radius="md" shadow="sm" p="md">
        <Group justify="space-between" align="flex-start" mb="xs">
          <Group>
            <Box
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
              }}
              aria-hidden
            >
              <Icon size={28} />
            </Box>
            <Stack gap={0}>
              <Text fw={600}>{p.name}</Text>
              <Text size="sm" c="dimmed">
                {p.desc}
              </Text>
            </Stack>
          </Group>
          <Badge
            variant={p.connected ? "light" : "outline"}
            color={p.connected ? "green" : "gray"}
            radius="sm"
          >
            {p.connected ? "Connected" : "Disconnected"}
          </Badge>
        </Group>

        <Divider my="sm" />

        <Stack gap={6} mb="md">
          <Text size="sm">
            <Text span c="dimmed">
              Account:
            </Text>{" "}
            {p.account || "—"}
          </Text>
          <Text size="sm">
            <Text span c="dimmed">
              Last sync:
            </Text>{" "}
            {formatTime(p.lastSync)}
          </Text>
        </Stack>

        <Group justify="space-between">
          <Group gap="xs">
            <Tooltip label="Sync now" withArrow>
              <ActionIcon
                variant="subtle"
                onClick={() => handleManualSync(p)}
                disabled={!p.connected}
                aria-label="Sync now"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Group gap="xs">
            {p.connected ? (
              <Button
                variant="light"
                color="red"
                leftSection={<IconPlugConnectedX size={16} />}
                onClick={() => openDisconnect(p)}
              >
                Disconnect
              </Button>
            ) : (
              <Button
                leftSection={<IconPlugConnected size={16} />}
                onClick={() => openConnect(p)}
              >
                Connect
              </Button>
            )}
          </Group>
        </Group>
      </Card>
    );
  }

  return (
    <Container size="lg" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs">
          <Title order={2} className="pageTitle">
            Connected integrations
          </Title>
          <Text c="dimmed">Control and manage connected platforms.</Text>
        </Stack>

        <Stack gap="md" mt="lg">
          {banner && (
            <Alert
              variant="light"
              color={banner.color}
              withCloseButton
              onClose={() => setBanner(null)}
            >
              {banner.message}
            </Alert>
          )}

          <Group justify="space-between" wrap="wrap">
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder="Search platforms…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              style={{ minWidth: 260 }}
            />
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {filtered.map((p) => (
              <ProviderCard key={p.key} p={p} />
            ))}
          </SimpleGrid>
        </Stack>
      </Card>

      {/* Connect modal */}
      <Modal
        opened={connectModal.open}
        onClose={closeConnect}
        title="Connect platform"
        centered
        radius="md"
      >
        {(() => {
          const prov = providers.find((p) => p.key === connectModal.providerKey);
          if (!prov) return null;
          return (
            <form onSubmit={handleConnectSubmit}>
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  {prov.name}
                </Text>
                <TextInput
                  label="Account / handle / URL"
                  placeholder={
                    prov.key === "twitter"
                      ? "@acme_corp"
                      : prov.key === "youtube"
                      ? "https://youtube.com/@acme"
                      : "your account"
                  }
                  value={connectModal.account}
                  onChange={(e) =>
                    setConnectModal((m) => ({ ...m, account: e.currentTarget.value }))
                  }
                  withAsterisk
                />
                {prov.needsToken && (
                  <TextInput
                    label="Access token / API key"
                    placeholder="paste your token"
                    value={connectModal.token}
                    onChange={(e) =>
                      setConnectModal((m) => ({ ...m, token: e.currentTarget.value }))
                    }
                    withAsterisk
                  />
                )}
                <Group justify="flex-end" mt="sm">
                  <Button variant="default" onClick={closeConnect}>
                    Cancel
                  </Button>
                  <Button type="submit">Connect</Button>
                </Group>
              </Stack>
            </form>
          );
        })()}
      </Modal>

      {/* Disconnect confirm */}
      <Modal
        opened={confirmModal.open}
        onClose={closeDisconnect}
        title="Disconnect integration"
        centered
        radius="md"
      >
        {(() => {
          const prov = providers.find((p) => p.key === confirmModal.providerKey);
          if (!prov) return null;
          return (
            <Stack gap="md">
              <Text>
                Are you sure you want to disconnect{" "}
                <Text span fw={600}>
                  {prov.name}
                </Text>
                ? This will stop future syncs.
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={closeDisconnect}>
                  Cancel
                </Button>
                <Button color="red" onClick={handleDisconnectConfirm}>
                  Disconnect
                </Button>
              </Group>
            </Stack>
          );
        })()}
      </Modal>
    </Container>
  );
}
