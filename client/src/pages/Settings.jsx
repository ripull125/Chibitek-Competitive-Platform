// client/src/pages/Settings.jsx
// — Bold title + slightly larger sizing —
import { useState, useMemo } from "react";
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
import { useNavigate } from "react-router-dom";
import classes from "./Settings.module.css";
import "../utils/ui.css"; // provides .pageTitle (regular)

function SettingsCard({ label, title, description, children }) {
  return (
    <Paper withBorder radius="lg" p="md" className={classes.card}>
      <Stack gap={12} className={classes.cardInner}>
        <Text className={classes.sectionLabel}>{label}</Text>
        <Text className={classes.rowTitle}>{title}</Text>
        {description ? <Text className={classes.subText}>{description}</Text> : null}
        {children}
      </Stack>
    </Paper>
  );
}

export default function Settings() {
  const [language, setLanguage] = useState("en");
  const navigate = useNavigate();

  const languageLabel = useMemo(() => {
    const map = { en: "English", ja: "Japanese", fr: "French", de: "German", es: "Spanish" };
    return map[language] || "English";
  }, [language]);

  return (
    <Box className={classes.page}>
      <Container size="lg" className={classes.shell}>
        <Box className={classes.header}>
          {/* Bold only here; other pages keep regular .pageTitle */}
          <Title order={2} className={`pageTitle ${classes.titleBold}`}>Settings</Title>
        </Box>

        <Box className={classes.grid}>
          <SettingsCard
            label="ACCOUNT"
            title="Profile"
            description="Manage personal details"
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/profile")}
            >
              Manage
            </Button>
          </SettingsCard>

          <SettingsCard
            label="DATA SOURCES"
            title="Connected integrations"
            description="Control connected platforms"
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/connected-integrations")}
            >
              Manage
            </Button>
          </SettingsCard>

          <SettingsCard label="LANGUAGE" title="Language">
            <Select
              value={language}
              onChange={(v) => v && setLanguage(v)}
              data={[
                { value: "en", label: "English" },
                { value: "ja", label: "Japanese" },
                { value: "fr", label: "French" },
                { value: "de", label: "German" },
                { value: "es", label: "Spanish" },
              ]}
              placeholder="Choose language"
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
              comboboxProps={{ transitionProps: { transition: "pop", duration: 140 }, shadow: "md", radius: "md" }}
              aria-label="Interface language"
            />
            <Group gap={8}>
              <Text size="sm" c="dimmed">Current:</Text>
              <Text size="sm" fw={700}>{languageLabel}</Text>
            </Group>
          </SettingsCard>

          <SettingsCard
            label="TUTORIAL"
            title="Take the tour"
            description="Quick walkthrough of features"
          >
            <Button variant="light" radius="md" size="md" className={classes.actionBtn}>
              Start
            </Button>
          </SettingsCard>
        </Box>
      </Container>
    </Box>
  );
}
