import { Title, Text, Container, Paper, Stack, Button } from "@mantine/core";

export default function Tutorial() {
  return (
    <Container size="lg" py="xl">
      <Paper withBorder radius="xl" p="xl">
        <Stack gap="md">
          <Title order={2}>Tutorial</Title>
          <Text c="dimmed">
            Replace this with your onboarding tour content.
          </Text>
          <Button variant="light" radius="md">
            Start tutorial
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
