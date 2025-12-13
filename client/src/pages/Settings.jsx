// Settings.jsx
import { useState } from "react";
import {
  Title,
  Paper,
  Text,
  Button,
  SegmentedControl,
  Stack,
  Container,
  Box,
} from "@mantine/core";
import classes from "./Settings.module.css";
import { useNavigate } from "react-router-dom";

function SettingsCard({ label, title, description, children }) {
  return (
    <Paper withBorder radius="xl" p="lg" className={classes.card}>
      <Stack gap={10} className={classes.cardInner}>
        <Text className={classes.sectionLabel}>{label}</Text>
        <Text className={classes.rowTitle}>{title}</Text>
        {description ? <Text className={classes.subText}>{description}</Text> : null}
        {children}
      </Stack>
    </Paper>
  );
}

export default function Settings() {
  const [language, setLanguage] = useState("english");
  const navigate = useNavigate();

  return (
    <Box className={classes.page}>
      <Container size="lg" className={classes.shell}>
        <Box className={classes.header}>
          <Title order={2} className={classes.title}>
            SETTINGS
          </Title>
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
              className={classes.actionBtn}
              onClick={() => navigate("/settings/profile")}
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
              className={classes.actionBtn}
              onClick={() => navigate("/settings/integrations")}
            >
              Manage
            </Button>

          </SettingsCard>

          <SettingsCard label="LANGUAGE" title="Language">
            <SegmentedControl
              value={language}
              onChange={setLanguage}
              data={[
                { label: "English", value: "english" },
                { label: "Japanese", value: "japanese" },
              ]}
              radius="xl"
              classNames={{
                root: classes.segmentRoot,
                control: classes.segmentControl,
                label: classes.segmentLabel,
                indicator: classes.segmentIndicator,
              }}
            />
          </SettingsCard>

          <SettingsCard
            label="TUTORIAL"
            title="Take the tour"
            description="Quick walkthrough of features"
          >
            <Button variant="light" radius="md" className={classes.actionBtn}>
              Start
            </Button>
          </SettingsCard>
        </Box>
      </Container>
    </Box>
  );
}
