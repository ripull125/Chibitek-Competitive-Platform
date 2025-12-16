import { Title, Text, Container, Paper, Stack } from "@mantine/core";

export default function ConnectedIntegrations() {
  return (
    <Container size="lg" py="xl">
      <Paper withBorder radius="xl" p="xl">
        <Stack gap="xs">
          <Title order={2}>Connected integrations</Title>
          <Text c="dimmed">
            Replace this with your integrations management UI.
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
