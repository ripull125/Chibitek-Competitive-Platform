// client/src/pages/Profile.jsx
import { Title, Text, Card, Stack, Container } from "@mantine/core";
import "../utils/ui.css"; // shared title

export default function Profile() {
  return (
    <Container size="md" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs">
          <Title order={2} className="pageTitle">Profile</Title>
          <Text c="dimmed">Manage your personal details here.</Text>
        </Stack>
      </Card>
    </Container>
  );
}
