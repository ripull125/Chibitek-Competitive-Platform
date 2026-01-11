// client/src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Container,
  FileButton,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCamera, IconCheck, IconUser } from "@tabler/icons-react";
import { supabase } from "../supabaseClient";
import "../utils/ui.css"; // shared title styles

function useObjectUrl(file) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}

function sanitizeUsername(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9_.]/g, "_").replace(/_+/g, "_");
  const sliced = cleaned.slice(0, 30);
  if (sliced.length >= 2) return sliced;
  return (sliced + "__").slice(0, 2);
}

function getIdentityAvatarUrl(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  for (const id of identities) {
    const data = id?.identity_data ?? {};
    const url = data.avatar_url ?? data.picture ?? data.avatar ?? "";
    if (url) return String(url);
  }
  return "";
}

function deriveProfileFromSupabaseUser(user) {
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const email = user.email ?? "";

  const firstName = meta.given_name ?? meta.first_name ?? "";
  const lastName = meta.family_name ?? meta.last_name ?? "";

  const fullName = String(meta.full_name ?? meta.name ?? "").trim();
  let parsedFirst = firstName;
  let parsedLast = lastName;

  if ((!parsedFirst || !parsedLast) && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (!parsedFirst && parts.length >= 1) parsedFirst = parts[0];
    if (!parsedLast && parts.length >= 2) parsedLast = parts.slice(1).join(" ");
  }

  const usernameCandidate =
    meta.user_name ??
    meta.preferred_username ??
    meta.username ??
    (email.includes("@") ? email.split("@")[0] : "");

  const avatarUrl =
    meta.avatar_url ??
    meta.picture ??
    meta.avatar ??
    getIdentityAvatarUrl(user) ??
    "";

  return {
    email,
    firstName: parsedFirst,
    lastName: parsedLast,
    username: sanitizeUsername(usernameCandidate),
    avatarUrl: String(avatarUrl ?? ""),
  };
}

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

async function fileToDataUrl(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function uploadAvatarIfPossible(userId, file) {
  if (!supabase?.storage || !userId || !file) return { url: "", usedStorage: false };

  const safeName = String(file.name || "avatar").replace(/[^\w.\-]+/g, "_");
  const objectPath = `${userId}/${Date.now()}_${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(objectPath, file, { upsert: true });

  if (uploadErr) return { url: "", usedStorage: false };

  const { data } = supabase.storage.from("avatars").getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl ? String(data.publicUrl) : "";
  return { url: publicUrl, usedStorage: true };
}

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [banner, setBanner] = useState(null);

  const [userId, setUserId] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const avatarPreview = useObjectUrl(avatarFile);
  const [remoteAvatarUrl, setRemoteAvatarUrl] = useState("");

  const [initialValues, setInitialValues] = useState({
    email: "",
    firstName: "",
    lastName: "",
    username: "",
  });

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

  const dirty =
    avatarFile != null ||
    values.email !== initialValues.email ||
    values.firstName !== initialValues.firstName ||
    values.lastName !== initialValues.lastName ||
    values.username !== initialValues.username;

  const isValidNow =
    validateField("email", values.email) == null &&
    validateField("firstName", values.firstName) == null &&
    validateField("lastName", values.lastName) == null &&
    validateField("username", values.username) == null;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!supabase) {
          if (!mounted) return;
          setBanner({
            color: "red",
            message: "Supabase is not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
          });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (!mounted) return;

        if (error || !data?.user) {
          setBanner({ color: "red", message: "You are not signed in." });
          setLoading(false);
          return;
        }

        setUserId(String(data.user.id || ""));

        const derived = deriveProfileFromSupabaseUser(data.user);
        if (!derived) {
          setLoading(false);
          return;
        }

        setRemoteAvatarUrl(derived.avatarUrl || "");

        const next = {
          email: derived.email || "",
          firstName: derived.firstName || "",
          lastName: derived.lastName || "",
          username: derived.username || "",
        };

        setInitialValues(next);
        setValues(next);
      } catch (e) {
        setBanner({ color: "red", message: e?.message || "Failed to load profile." });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function handleChange(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setBanner(null);
  }

  function handleBlur(name) {
    setErrors((prev) => ({ ...prev, [name]: validateField(name, values[name]) }));
  }

  function validateAll() {
    const next = Object.keys(values).reduce((acc, k) => {
      acc[k] = validateField(k, values[k]);
      return acc;
    }, {});
    setErrors(next);
    return Object.values(next).every((x) => x == null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBanner(null);

    if (!supabase) {
      setBanner({
        color: "red",
        message: "Supabase is not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
      });
      return;
    }

    if (!validateAll()) return;

    setSaving(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        setBanner({ color: "red", message: "You are not signed in." });
        return;
      }

      const currentUser = userRes.user;
      const uid = String(currentUser.id || userId || "");
      const emailChanged =
        String(values.email || "").trim().toLowerCase() !==
        String(currentUser.email || "").trim().toLowerCase();

      let nextAvatarUrl = remoteAvatarUrl;

      if (avatarFile) {
        const uploaded = await uploadAvatarIfPossible(uid, avatarFile);
        if (uploaded.url) {
          nextAvatarUrl = uploaded.url;
        } else {
          // Fallback: store as data URL (works even without Storage bucket/policies).
          nextAvatarUrl = await fileToDataUrl(avatarFile);
        }
      }

      const givenName = String(values.firstName || "").trim();
      const familyName = String(values.lastName || "").trim();
      const fullName = `${givenName} ${familyName}`.trim();

      const metaUpdate = {
        given_name: givenName,
        family_name: familyName,
        full_name: fullName,
        username: sanitizeUsername(values.username),
        avatar_url: nextAvatarUrl || undefined,
      };

      const { error: metaErr } = await supabase.auth.updateUser({ data: metaUpdate });
      if (metaErr) {
        setBanner({ color: "red", message: metaErr.message || "Failed to save profile." });
        return;
      }

      if (emailChanged) {
        const { error: emailErr } = await supabase.auth.updateUser({
          email: String(values.email || "").trim(),
        });

        if (emailErr) {
          setBanner({
            color: "yellow",
            message:
              "Profile saved, but email update needs confirmation or failed: " +
              (emailErr.message || "Unknown error"),
          });
        }
      }

      setRemoteAvatarUrl(nextAvatarUrl || remoteAvatarUrl);
      setAvatarFile(null);

      const committed = {
        email: String(values.email || "").trim(),
        firstName: givenName,
        lastName: familyName,
        username: sanitizeUsername(values.username),
      };
      setValues(committed);
      setInitialValues(committed);

      setBanner({ color: "green", message: "Saved successfully." });
    } catch (err) {
      setBanner({ color: "red", message: err?.message || "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container size="md" py="md">
      <Card withBorder shadow="xs" radius="lg" p="xl">
        <Stack gap="xs" mb="md">
          <Title order={2} className="pageTitle">
            Profile
          </Title>
          <Text c="dimmed">Manage your personal details.</Text>
        </Stack>

        {banner && (
          <Alert
            variant="light"
            color={banner.color}
            withCloseButton
            onClose={() => setBanner(null)}
            mb="md"
          >
            {banner.message}
          </Alert>
        )}

        <Paper withBorder radius="md" p="lg">
          {loading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="lg">
              <Group align="center" gap="lg">
                <Box pos="relative">
                  <Avatar
                    src={avatarPreview || remoteAvatarUrl || undefined}
                    alt="Profile picture"
                    size={108}
                    radius={108}
                  />
                  <FileButton
                    onChange={(f) => {
                      setBanner(null);
                      setAvatarFile(f);
                    }}
                    accept="image/*"
                  >
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

                <Stack gap={2}>
                  <Group gap={8}>
                    <IconUser size={18} />
                    <Text fw={600}>
                      {values.firstName || values.lastName
                        ? `${values.firstName} ${values.lastName}`.trim()
                        : "Your profile"}
                    </Text>
                  </Group>
                  <Text c="dimmed" size="sm">
                    Update your details and save changes.
                  </Text>
                </Stack>
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
                    placeholder="john.doe"
                    withAsterisk
                    value={values.username}
                    error={errors.username}
                    onChange={(e) => handleChange("username", e.currentTarget.value)}
                    onBlur={() => handleBlur("username")}
                  />

                  <Group justify="flex-end" mt="xs">
                    <Button
                      type="submit"
                      leftSection={<IconCheck size={16} />}
                      disabled={!dirty || !isValidNow || saving}
                      loading={saving}
                    >
                      Save changes
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Stack>
          )}
        </Paper>
      </Card>
    </Container>
  );
}
