import { Card, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import "../utils/ui.css";

export default function CompetitorTracking() {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Title order={2}>{t("competitorTracking.title")}</Title>
      <Text c="dimmed">{t("competitorTracking.subtitle")}</Text>

      <Card withBorder radius="md" p="md">
        <Text>{t("competitorTracking.comingSoon")}</Text>
      </Card>
    </Stack>
  );
}
