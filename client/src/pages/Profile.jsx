import { Title, Text, Container, Paper, Stack } from "@mantine/core";

export default function Profile() {
  return (
    <Container size="lg" py="xl">
      <Paper withBorder radius="xl" p="xl">
        <Stack gap="xs">
          <Title order={2}>Profile</Title>
          <Text c="dimmed">
            Replace this with your profile settings form.
          </Text>
        </Stack>
      </Paper>
    </Container>
  );
}
