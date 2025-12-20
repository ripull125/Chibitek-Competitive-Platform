// client/src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Card,
  Container,
  FileButton,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCamera, IconCheck, IconUser } from "@tabler/icons-react";
import "../utils/ui.css"; // shared title styles

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

export default function Profile() {
  const [avatarFile, setAvatarFile] = useState(null);
  const avatarPreview = useObjectUrl(avatarFile);

  const [values, setValues] = useState({
    email: "",
    firstName: "",
    lastName: "",
    username: "",
  });
  const [errors, setErrors] = useState({
    email: null,
    firstName: null,
    lastName: null,
    username: null,
  });
  const [dirty, setDirty] = useState(false);

  function validateField(name, value) {
    const v = String(value ?? "").trim();
    switch (name) {
      case "email":
        return /^\S+@\S+\.\S+$/.test(v) ? null : "Invalid email";
      case "firstName":
        return v ? null : "First name is required";
      case "lastName":
        return v ? null : "Last name is required";
      case "username":
        return /^[a-zA-Z0-9_.]{2,30}$/.test(v)
          ? null
          : "2–30 chars; letters, numbers, _ and .";
      default:
        return null;
    }
  }

  function handleChange(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
  }

  function handleBlur(name) {
    setErrors((prev) => ({ ...prev, [name]: validateField(name, values[name]) }));
  }

  function validateAll() {
    const e = Object.keys(values).reduce((acc, k) => {
      acc[k] = validateField(k, values[k]);
      return acc;
    }, {});
    setErrors(e);
    return Object.values(e).every((x) => x == null);
  }

  const isValid = Object.values(errors).every((x) => x == null) && // no known errors
    ["email", "firstName", "lastName", "username"].every((k) => validateField(k, values[k]) == null); // current values valid

  async function fileToBase64(file) {
    if (!file) return null;
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateAll()) return;
    const avatar = await fileToBase64(avatarFile);
    const payload = { ...values, avatar };
    // Replace with your API call:
    // await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    // eslint-disable-next-line no-console
    console.log("Profile payload:", payload);
    setDirty(false);
  }

  return (
    <Container size="md" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs" mb="md">
          <Title order={2} className="pageTitle">Profile</Title>
          <Text c="dimmed">Manage your personal details here.</Text>
        </Stack>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="lg">
            <Group align="center" gap="lg">
              <Box pos="relative">
                <Avatar
                  src={avatarPreview || undefined}
                  alt="Profile picture"
                  size={108}
                  radius={108}
                />
                <FileButton onChange={setAvatarFile} accept="image/*">
                  {(props) => (
                    <ActionIcon
                      {...props}
                      variant="filled"
                      radius="xl"
                      size="lg"
                      pos="absolute"
                      bottom={-6}
                      right={-6}
                      aria-label="Upload new avatar"
                      title="Upload new avatar"
                    >
                      <IconCamera size={18} />
                    </ActionIcon>
                  )}
                </FileButton>
              </Box>
              <Text c="dimmed">Click the camera to upload a profile picture.</Text>
            </Group>

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Email address"
                  placeholder="you@company.com"
                  withAsterisk
                  value={values.email}
                  error={errors.email}
                  onChange={(e) => handleChange("email", e.currentTarget.value)}
                  onBlur={() => handleBlur("email")}
                />

                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="First name"
                      placeholder="John"
                      withAsterisk
                      value={values.firstName}
                      error={errors.firstName}
                      onChange={(e) => handleChange("firstName", e.currentTarget.value)}
                      onBlur={() => handleBlur("firstName")}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="Last name"
                      placeholder="Doe"
                      withAsterisk
                      value={values.lastName}
                      error={errors.lastName}
                      onChange={(e) => handleChange("lastName", e.currentTarget.value)}
                      onBlur={() => handleBlur("lastName")}
                    />
                  </Grid.Col>
                </Grid>

                <TextInput
                  label="Username"
                  description="Allowed: letters, numbers, underscore, dot"
                  leftSection={<IconUser size={16} />}
                  placeholder="johndoe"
                  withAsterisk
                  value={values.username}
                  error={errors.username}
                  onChange={(e) => handleChange("username", e.currentTarget.value)}
                  onBlur={() => handleBlur("username")}
                />

                <Group justify="flex-start" mt="sm">
                  <Button
                    type="submit"
                    leftSection={<IconCheck size={16} />}
                    disabled={!dirty || !isValid}
                  >
                    Save changes
                  </Button>
                </Group>
              </Stack>
            </form>
          </Stack>
        </Paper>
      </Card>
    </Container>
  );
}
