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
import { useTranslation } from "react-i18next";

const CATALOG = [
  {
    key: "x",
    icon: IconBrandX,
    color: "#000000",
  },
  {
    key: "linkedin",
    icon: IconBrandLinkedin,
    color: "#0A66C2",
  },
  {
    key: "instagram",
    icon: IconBrandInstagram,
    color: "#E1306C",
  },
  {
    key: "tiktok",
    icon: IconBrandTiktok,
    color: "#000000",
  },
  {
    key: "reddit",
    icon: IconBrandReddit,
    color: "#FF4500",
  },
  {
    key: "youtube",
    icon: IconBrandYoutube,
    color: "#FF0000",
  },
];

export default function ConnectedIntegrations() {
  const { t } = useTranslation();
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
    return CATALOG.filter((p) => {
      const name = t(`connectedIntegrations.platforms.${p.key}.name`);
      const desc = t(`connectedIntegrations.platforms.${p.key}.desc`);
      return `${name} ${desc} ${p.key}`.toLowerCase().includes(q);
    });
  }, [search, t]);

  function handleToggle(key) {
    const next = togglePlatform(key);
    setConnected({ ...next });
  }

  return (
    <Container size="lg" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs">
          <Title order={2} className="pageTitle">
            {t("connectedIntegrations.title")}
          </Title>
          <Text c="dimmed">
            {t("connectedIntegrations.subtitle")}
          </Text>
        </Stack>

        <Stack gap="md" mt="lg">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t("connectedIntegrations.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260, maxWidth: 340 }}
          />

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {filtered.map((prov) => {
              const Icon = prov.icon;
              const isOn = !!connected[prov.key];
              const platName = t(`connectedIntegrations.platforms.${prov.key}.name`);
              const platDesc = t(`connectedIntegrations.platforms.${prov.key}.desc`);

              return (
                <Card key={prov.key} withBorder radius="md" p="lg">
                  <Group justify="space-between" align="center">
                    <Group align="center">
                      <Box>
                        <Icon size={28} color={prov.color} />
                      </Box>
                      <Box>
                        <Group gap="xs">
                          <Text fw={600}>{platName}</Text>
                          {isOn ? (
                            <Badge color="green" variant="light">
                              {t("connectedIntegrations.badgeConnected")}
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              {t("connectedIntegrations.badgeNotConnected")}
                            </Badge>
                          )}
                        </Group>
                        <Text c="dimmed" size="sm" mt={4}>
                          {platDesc}
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
                        {t("connectedIntegrations.buttonDisconnect")}
                      </Button>
                    ) : (
                      <Button
                        color="blue"
                        variant="light"
                        leftSection={<IconPlugConnected size={16} />}
                        onClick={() => handleToggle(prov.key)}
                      >
                        {t("connectedIntegrations.buttonConnect")}
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
