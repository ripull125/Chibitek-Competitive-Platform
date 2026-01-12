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
} from "@mantine/core";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandX,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import "../utils/ui.css"; // shared title

function formatTime(d) {
  if (!d) return "Never";
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
    key: "facebook",
    name: "Facebook",
    desc: "Public pages and posts.",
    icon: IconBrandFacebook,
    needsToken: false,
  },
];

export default function ConnectedIntegrations() {
  const [platforms, setPlatforms] = useState(
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

  const [confirmDisconnect, setConfirmDisconnect] = useState({
    open: false,
    providerKey: null,
  });

  const [banner, setBanner] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return platforms;
    return platforms.filter((p) => {
      const hay = `${p.name} ${p.desc} ${p.key}`.toLowerCase();
      return hay.includes(q);
    });
  }, [platforms, search]);

  function setPlatformPatch(key, patch) {
    setPlatforms((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p))
    );
  }

  async function handleSync(key) {
    setBanner(null);
    setPlatformPatch(key, { lastSync: new Date() });
    setBanner({ color: "green", message: "Synced successfully." });
  }

  async function handleConnectOpen(key) {
    setBanner(null);
    setConnectModal({ open: true, providerKey: key, account: "", token: "" });
  }

  function closeConnect() {
    setConnectModal({ open: false, providerKey: null, account: "", token: "" });
  }

  async function handleConnectConfirm() {
    const key = connectModal.providerKey;
    if (!key) return;

    const prov = platforms.find((p) => p.key === key);
    if (!prov) return;

    if (!connectModal.account.trim()) {
      setBanner({ color: "red", message: "Please enter an account / handle." });
      return;
    }

    setPlatformPatch(key, {
      connected: true,
      account: connectModal.account.trim(),
      token: connectModal.token.trim(),
      lastSync: new Date(),
    });

    closeConnect();
    setBanner({ color: "green", message: "Connected successfully." });
  }

  function handleDisconnectOpen(key) {
    setBanner(null);
    setConfirmDisconnect({ open: true, providerKey: key });
  }

  function closeDisconnect() {
    setConfirmDisconnect({ open: false, providerKey: null });
  }

  async function handleDisconnectConfirm() {
    const key = confirmDisconnect.providerKey;
    if (!key) return;

    setPlatformPatch(key, {
      connected: false,
      account: "",
      token: "",
      lastSync: null,
    });

    closeDisconnect();
    setBanner({ color: "green", message: "Disconnected." });
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
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={() => setBanner({ color: "blue", message: "Refreshed." })}
            >
              Refresh
            </Button>
          </Group>

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {filtered.map((prov) => {
              const Icon = prov.icon;
              return (
                <Card key={prov.key} withBorder radius="md" p="lg">
                  <Group justify="space-between" align="flex-start">
                    <Group align="flex-start">
                      <Box mt={2}>
                        <Icon size={28} />
                      </Box>
                      <Box>
                        <Group gap="xs">
                          <Text fw={600}>{prov.name}</Text>
                          {prov.connected ? (
                            <Badge color="green" variant="light">
                              Connected
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              Not connected
                            </Badge>
                          )}
                        </Group>
                        <Text c="dimmed" size="sm" mt={4}>
                          {prov.desc}
                        </Text>
                        {prov.connected && (
                          <Stack gap={4} mt="sm">
                            <Text size="sm">
                              <b>Account:</b> {prov.account || "—"}
                            </Text>
                            <Text size="sm">
                              <b>Last sync:</b> {formatTime(prov.lastSync)}
                            </Text>
                          </Stack>
                        )}
                      </Box>
                    </Group>

                    <Group gap="xs">
                      {prov.connected ? (
                        <>
                          <ActionIcon
                            variant="light"
                            onClick={() => handleSync(prov.key)}
                            title="Sync"
                          >
                            <IconRefresh size={18} />
                          </ActionIcon>
                          <Button
                            color="red"
                            variant="light"
                            leftSection={<IconPlugConnectedX size={16} />}
                            onClick={() => handleDisconnectOpen(prov.key)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="light"
                          leftSection={<IconPlugConnected size={16} />}
                          onClick={() => handleConnectOpen(prov.key)}
                        >
                          Connect
                        </Button>
                      )}
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      </Card>

      <Modal
        opened={connectModal.open}
        onClose={closeConnect}
        title="Connect integration"
        centered
      >
        {(() => {
          const prov = platforms.find((p) => p.key === connectModal.providerKey);
          if (!prov) return null;

          return (
            <Stack>
              <Text c="dimmed" size="sm">
                Connect your <b>{prov.name}</b> account.
              </Text>

              <TextInput
                label="Account / handle / URL"
                placeholder={prov.key === "twitter" ? "@acme_corp" : "your account"}
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

              <Group justify="flex-end">
                <Button variant="default" onClick={closeConnect}>
                  Cancel
                </Button>
                <Button onClick={handleConnectConfirm}>Connect</Button>
              </Group>
            </Stack>
          );
        })()}
      </Modal>

      <Modal
        opened={confirmDisconnect.open}
        onClose={closeDisconnect}
        title="Disconnect integration"
        centered
      >
        {(() => {
          const prov = platforms.find((p) => p.key === confirmDisconnect.providerKey);
          if (!prov) return null;

          return (
            <Stack>
              <Text>
                Disconnect <b>{prov.name}</b>?
              </Text>
              <Text c="dimmed" size="sm">
                You can reconnect later.
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
