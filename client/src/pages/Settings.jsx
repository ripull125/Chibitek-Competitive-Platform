import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
import {
  Title,
  Paper,
  Text,
  Button,
  Stack,
  Container,
  Box,
  Select,
  Group,
} from "@mantine/core";
import { IconWorld } from "@tabler/icons-react";
import { useAppTour } from "../tour/AppTourProvider.jsx";
import { useNavigate } from "react-router-dom";

import classes from "./Settings.module.css";
import "../utils/ui.css";

function SettingsCard({ label, title, description, children }) {
  return (
    <Paper withBorder radius="lg" p="md" className={classes.card}>
      <Stack gap={12} className={classes.cardInner}>
        <Text className={classes.sectionLabel}>{label}</Text>
        <Text className={classes.rowTitle}>{title}</Text>
        {description ? (
          <Text className={classes.subText}>{description}</Text>
        ) : null}
        {children}
      </Stack>
    </Paper>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppLanguage();
  const navigate = useNavigate();
  const tour = useAppTour();

  const languageLabel = useMemo(
    () => t(`languages.${language}`),
    [language, t]
  );

  return (
    <Box className={classes.page}>
      <Container size="lg" className={classes.shell}>
        <Box className={classes.header}>
          <Title order={2} className={`pageTitle ${classes.titleBold}`}>
            {t("settings.title")}
          </Title>
        </Box>

        <Box className={classes.grid}>
          <SettingsCard
            label={t("settings.accountLabel")}
            title={t("settings.profileTitle")}
            description={t("settings.profileDesc")}
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/profile")}
            >
              {t("common.manage")}
            </Button>
          </SettingsCard>

          <SettingsCard
            label={t("settings.dataSourcesLabel")}
            title={t("settings.integrationsTitle")}
            description={t("settings.integrationsDesc")}
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/connected-integrations")}
            >
              {t("common.manage")}
            </Button>
          </SettingsCard>

          <SettingsCard
            label={t("settings.languageLabel")}
            title={t("settings.languageTitle")}
          >
            <Select
              value={language}
              onChange={(v) => v && setLanguage(v)}
              data={[
                { value: "en", label: t("languages.en") },
                { value: "ja", label: t("languages.ja") },
                { value: "fr", label: t("languages.fr") },
                { value: "de", label: t("languages.de") },
                { value: "es", label: t("languages.es") },
              ]}
              placeholder={t("common.chooseLanguage")}
              radius="md"
              size="md"
              leftSection={<IconWorld size={18} />}
              classNames={{
                root: classes.selectRoot,
                input: classes.selectInput,
                dropdown: classes.selectDropdown,
                option: classes.selectOption,
                section: classes.selectSection,
              }}
              comboboxProps={{
                transitionProps: { transition: "pop", duration: 140 },
                shadow: "md",
                radius: "md",
              }}
              aria-label={t("settings.languageTitle")}
            />
            <Group gap={8}>
              <Text size="sm" c="dimmed">
                {t("common.current")}
              </Text>
              <Text size="sm" fw={700}>
                {languageLabel}
              </Text>
            </Group>
          </SettingsCard>

          <SettingsCard
            label={t("settings.tutorialLabel")}
            title={t("settings.tutorialTitle")}
            description={t("settings.tutorialDesc")}
          >
            <Box data-tour="settings-tutorial-card">
              <Button
                variant="light"
                radius="md"
                size="md"
                className={classes.actionBtn}
                onClick={() => tour.start()}
              >
                {t("common.start")}
              </Button>
            </Box>
          </SettingsCard>
        </Box>
      </Container>
    </Box>
  );
}
