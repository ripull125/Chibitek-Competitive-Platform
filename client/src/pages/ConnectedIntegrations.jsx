// client/src/pages/ConnectedIntegrations.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandX,
  IconBrandLinkedin,
  IconBrandReddit,
  IconBrandYoutube,
  IconPlugConnected,
  IconPlugConnectedX,
  IconSearch,
} from "@tabler/icons-react";
import {
  getConnectedPlatforms,
  togglePlatform,
} from "../utils/connectedPlatforms";
import "../utils/ui.css";

const CATALOG = [
  {
    key: "x",
    name: "X / Twitter",
    desc: "Public tweets, profiles, and engagement.",
    icon: IconBrandX,
    color: "#000000",
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    desc: "Professional posts and company updates.",
    icon: IconBrandLinkedin,
    color: "#0A66C2",
  },
  {
    key: "instagram",
    name: "Instagram",
    desc: "Public posts and profile metadata.",
    icon: IconBrandInstagram,
    color: "#E1306C",
  },
  {
    key: "tiktok",
    name: "TikTok",
    desc: "Creator posts and stats.",
    icon: IconBrandTiktok,
    color: "#000000",
  },
  {
    key: "reddit",
    name: "Reddit",
    desc: "Subreddit posts, comments, and media.",
    icon: IconBrandReddit,
    color: "#FF4500",
  },
  {
    key: "youtube",
    name: "YouTube",
    desc: "Channels, videos, and comments.",
    icon: IconBrandYoutube,
    color: "#FF0000",
  },
];

export default function ConnectedIntegrations() {
  const [connected, setConnected] = useState(getConnectedPlatforms);
  const [search, setSearch] = useState("");

  // Listen for changes from other components on the same page
  useEffect(() => {
    const handler = () => setConnected(getConnectedPlatforms());
    window.addEventListener("connectedPlatformsChanged", handler);
    return () => window.removeEventListener("connectedPlatformsChanged", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((p) =>
      `${p.name} ${p.desc} ${p.key}`.toLowerCase().includes(q)
    );
  }, [search]);

  function handleToggle(key) {
    const next = togglePlatform(key);
    setConnected({ ...next });
  }

  return (
    <Container size="lg" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs">
          <Title order={2} className="pageTitle">
            Connected integrations
          </Title>
          <Text c="dimmed">
            Toggle platforms on or off. Connected platforms appear as tabs in Competitor Lookup.
          </Text>
        </Stack>

        <Stack gap="md" mt="lg">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Search platforms…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260, maxWidth: 340 }}
          />

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {filtered.map((prov) => {
              const Icon = prov.icon;
              const isOn = !!connected[prov.key];

              return (
                <Card key={prov.key} withBorder radius="md" p="lg">
                  <Group justify="space-between" align="center">
                    <Group align="center">
                      <Box>
                        <Icon size={28} color={prov.color} />
                      </Box>
                      <Box>
                        <Group gap="xs">
                          <Text fw={600}>{prov.name}</Text>
                          {isOn ? (
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
                      </Box>
                    </Group>

                    {isOn ? (
                      <Button
                        color="red"
                        variant="light"
                        leftSection={<IconPlugConnectedX size={16} />}
                        onClick={() => handleToggle(prov.key)}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        color="blue"
                        variant="light"
                        leftSection={<IconPlugConnected size={16} />}
                        onClick={() => handleToggle(prov.key)}
                      >
                        Connect
                      </Button>
                    )}
                  </Group>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      </Card>
    </Container>
  );
}
