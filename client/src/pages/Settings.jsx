import { useState } from "react";
import {
  Title,
  Paper,
  Group,
  Text,
  Button,
  SegmentedControl,
  Stack,
  SimpleGrid,
  Container,
} from "@mantine/core";

export default function Settings() {
  const [language, setLanguage] = useState("english");

  console.log("Settings page – card layout loaded");

  return (
    <Container fluid px="xl" py="lg" style={{ width: "100%" }}>
      <Stack gap="xl">
        <Title order={1}>Settings</Title>

        <SimpleGrid
          cols={2}
          spacing="xl"
          breakpoints={[{ maxWidth: "md", cols: 1 }]}
        >
          {/* ACCOUNT */}
          <Paper radius="md" shadow="xs" p="lg">
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
              Account
            </Text>
            <Group justify="space-between" align="center">
              <div>
                <Text fw={500}>Profile</Text>
                <Text fz="sm" c="dimmed">
                  Manage personal details
                </Text>
              </div>
              <Button variant="light">Manage</Button>
            </Group>
          </Paper>

          {/* DATA SOURCES */}
          <Paper radius="md" shadow="xs" p="lg">
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
              Data sources
            </Text>
            <Group justify="space-between" align="center">
              <div>
                <Text fw={500}>Connected integrations</Text>
                <Text fz="sm" c="dimmed">
                  Control connected platforms
                </Text>
              </div>
              <Button variant="light">Manage</Button>
            </Group>
          </Paper>

          {/* LANGUAGE */}
          <Paper radius="md" shadow="xs" p="lg">
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
              Language
            </Text>
            <Stack gap="xs">
              <Text fw={500}>Language</Text>
              <SegmentedControl
                value={language}
                onChange={setLanguage}
                data={[
                  { label: "English", value: "english" },
                  { label: "Japanese", value: "japanese" },
                ]}
                radius="xl"
              />
            </Stack>
          </Paper>

          {/* TUTORIAL */}
          <Paper radius="md" shadow="xs" p="lg">
            <Text fz="xs" fw={700} tt="uppercase" c="dimmed" mb="xs">
              Tutorial
            </Text>
            <Group justify="space-between" align="center">
              <div>
                <Text fw={500}>Take the tour</Text>
                <Text fz="sm" c="dimmed">
                  Quick walkthrough of features
                </Text>
              </div>
              <Button variant="light">Start</Button>
            </Group>
          </Paper>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
