// client/src/pages/ConnectedIntegrations.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Card,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  ThemeIcon,
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
  IconSearch,
} from "@tabler/icons-react";
import { getConnectedPlatforms, setConnectedPlatforms } from "../utils/connectedPlatforms";
import "../utils/ui.css";
import { useTranslation } from "react-i18next";

const CATALOG = [
  { key: "x", icon: IconBrandX, color: "#000000" },
  { key: "linkedin", icon: IconBrandLinkedin, color: "#0A66C2" },
  { key: "instagram", icon: IconBrandInstagram, color: "#E1306C" },
  { key: "tiktok", icon: IconBrandTiktok, color: "#000000" },
  { key: "reddit", icon: IconBrandReddit, color: "#FF4500" },
  { key: "youtube", icon: IconBrandYoutube, color: "#FF0000" },
];

export default function ConnectedIntegrations() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const connected = getConnectedPlatforms();

  useEffect(() => {
    setConnectedPlatforms();
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "connected-integrations" } }));
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

  return (
    <Container size="lg" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Group justify="space-between" align="flex-start" mb="lg">
          <Stack gap={4}>
            <Title order={2} className="pageTitle">
              {t("connectedIntegrations.title")}
            </Title>
            <Text c="dimmed">
              {t("connectedIntegrations.alwaysConnectedSubtitle", {
                defaultValue: "All supported platforms are available in the app.",
              })}
            </Text>
          </Stack>
          <Badge size="lg" variant="light" color="green">
            {t("connectedIntegrations.allConnected", {
              count: CATALOG.length,
              defaultValue: "{{count}} connected",
            })}
          </Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" mb="lg">
          <Card withBorder radius="md" p="md" bg="var(--surface-2, #f8fafc)">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon radius="xl" variant="light" color="blue">
                <IconPlugConnected size={18} />
              </ThemeIcon>
              <div>
                <Text fw={800}>{CATALOG.length}</Text>
                <Text size="xs" c="dimmed">
                  {t("connectedIntegrations.connectedPlatforms", { defaultValue: "Connected platforms" })}
                </Text>
              </div>
            </Group>
          </Card>
          <Card withBorder radius="md" p="md" bg="var(--surface-2, #f8fafc)">
            <Text fw={800}>{t("connectedIntegrations.readyToSearch", { defaultValue: "Ready to search" })}</Text>
            <Text size="xs" c="dimmed">
              {t("connectedIntegrations.readyToSearchDesc", {
                defaultValue: "Use Competitor Lookup or Auto-Scraper without connecting anything here.",
              })}
            </Text>
          </Card>
          <Card withBorder radius="md" p="md" bg="var(--surface-2, #f8fafc)">
            <Text fw={800}>{t("connectedIntegrations.noSetupNeeded", { defaultValue: "No setup needed" })}</Text>
            <Text size="xs" c="dimmed">
              {t("connectedIntegrations.noSetupNeededDesc", {
                defaultValue: "This screen is just a quick view of available data sources.",
              })}
            </Text>
          </Card>
        </SimpleGrid>

        <Stack gap="md" data-tour="integrations-search">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder={t("connectedIntegrations.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260, maxWidth: 360 }}
          />

          <Divider />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" data-tour="integrations-grid">
            {filtered.map((prov) => {
              const Icon = prov.icon;
              const platName = t(`connectedIntegrations.platforms.${prov.key}.name`);
              const platDesc = t(`connectedIntegrations.platforms.${prov.key}.desc`);
              const isOn = !!connected[prov.key];

              return (
                <Card key={prov.key} withBorder radius="lg" p="lg" shadow="xs">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group align="center" gap="md" style={{ flex: 1, minWidth: 0 }}>
                      <ThemeIcon radius="xl" size="lg" variant="light" color="blue">
                        <Icon size={24} color={prov.color} />
                      </ThemeIcon>
                      <Box style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={700}>{platName}</Text>
                          <Badge color="green" variant="light">
                            {isOn
                              ? t("connectedIntegrations.badgeConnected")
                              : t("connectedIntegrations.badgeConnected", { defaultValue: "Connected" })}
                          </Badge>
                        </Group>
                        <Text c="dimmed" size="sm" mt={4} lineClamp={2}>
                          {platDesc}
                        </Text>
                      </Box>
                    </Group>
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
