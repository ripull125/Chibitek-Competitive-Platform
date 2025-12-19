// client/src/pages/ConnectedIntegrations.jsx
import { Title, Text, Card, Stack, Container } from "@mantine/core";
import "../utils/ui.css"; // shared title

export default function ConnectedIntegrations() {
  return (
    <Container size="md" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs">
          <Title order={2} className="pageTitle">Connected integrations</Title>
          <Text c="dimmed">Control and manage connected platforms.</Text>
        </Stack>
      </Card>
    </Container>
  );
}
