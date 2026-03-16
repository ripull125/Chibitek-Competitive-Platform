import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
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
  TextInput,
  Alert,
  Loader,
  Divider,
  Badge,
} from "@mantine/core";
import { IconTrash, IconWorld } from "@tabler/icons-react";
import { useAppTour } from "../tour/AppTourProvider.jsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";

import classes from "./Settings.module.css";
import "../utils/ui.css";

function SettingsCard({ label, title, description, children, className = "" }) {
  return (
    <Paper withBorder radius="lg" p="md" className={`${classes.card} ${className}`.trim()}>
      <Stack gap={12} className={classes.cardInner}>
        <Text className={classes.sectionLabel}>{label}</Text>
        <Text className={classes.rowTitle}>{title}</Text>
        {description ? (
          <Text className={classes.subText}>{description}</Text>
        ) : null}
        {children}
      </Stack>
    </Paper>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppLanguage();
  const navigate = useNavigate();
  const tour = useAppTour();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState("");
  const [adminBanner, setAdminBanner] = useState(null);

  const languageLabel = useMemo(
    () => t(`languages.${language}`),
    [language, t]
  );

  async function getAuthHeader() {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("No active session found.");
    return { Authorization: `Bearer ${token}` };
  }

  async function readResponsePayload(response) {
    const raw = await response.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}).`);
      }
      return {};
    }
  }

  async function loadAdminLists() {
    setLoadingLists(true);
    try {
      const headers = await getAuthHeader();
      const [usersResponse, adminsResponse] = await Promise.all([
        fetch(apiUrl("/api/admin/users"), { headers }),
        fetch(apiUrl("/api/admin/admins"), { headers }),
      ]);
      const usersPayload = await readResponsePayload(usersResponse);
      const adminsPayload = await readResponsePayload(adminsResponse);

      if (!usersResponse.ok) {
        throw new Error(usersPayload?.error || "Failed to load users.");
      }
      if (!adminsResponse.ok) {
        throw new Error(adminsPayload?.error || "Failed to load admins.");
      }

      setUsers(Array.isArray(usersPayload?.users) ? usersPayload.users : []);
      setAdmins(Array.isArray(adminsPayload?.admins) ? adminsPayload.admins : []);
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to load admin data." });
    } finally {
      setLoadingLists(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }
        const headers = await getAuthHeader();
        const response = await fetch(apiUrl("/api/auth/access"), { headers });
        const payload = await readResponsePayload(response);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to check access.");
        }
        if (!mounted) return;
        const admin = Boolean(payload?.isAdmin);
        setIsAdmin(admin);
        if (admin) {
          await loadAdminLists();
        }
      } catch (err) {
        if (!mounted) return;
        setAdminBanner({ color: "red", message: err?.message || "Failed to load admin tools." });
      } finally {
        if (mounted) setLoadingAdmin(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateUser(e) {
    e.preventDefault();
    const email = String(newUserEmail || "").trim().toLowerCase();
    const name = String(newUserName || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAdminBanner({ color: "red", message: "Please enter a valid email address." });
      return;
    }

    setSavingUser(true);
    setAdminBanner(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(apiUrl("/api/admin/users"), {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, name }),
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create user.");
      }

      setNewUserEmail("");
      setNewUserName("");
      const existed = Boolean(payload?.existed);
      setAdminBanner({
        color: "green",
        message: existed
          ? `${payload?.user?.email || email} already exists in users.`
          : `User ${payload?.user?.email || email} added successfully.`,
      });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to create user." });
    } finally {
      setSavingUser(false);
    }
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    const email = String(newAdminEmail || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAdminBanner({ color: "red", message: "Please enter a valid admin email address." });
      return;
    }

    setSavingAdmin(true);
    setAdminBanner(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(apiUrl("/api/admin/admins"), {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create admin.");
      }

      setNewAdminEmail("");
      setAdminBanner({ color: "green", message: `Admin ${payload?.admin?.email || email} added successfully.` });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to create admin." });
    } finally {
      setSavingAdmin(false);
    }
  }

  async function handleDeleteUser(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;

    const confirmed = window.confirm(`Delete user ${normalized}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingEmail(normalized);
    setAdminBanner(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(apiUrl("/api/admin/users"), {
        method: "DELETE",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalized }),
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to delete user.");
      }

      setAdminBanner({ color: "green", message: `Deleted user ${normalized}.` });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to delete user." });
    } finally {
      setDeletingEmail("");
    }
  }

  return (
    <Box className={classes.page}>
      <Container size="lg" className={classes.shell}>
        <Box className={classes.header}>
          <Title order={2} className={`pageTitle ${classes.titleBold}`}>
            {t("settings.title")}
          </Title>
        </Box>

        <Box className={classes.grid}>
          <SettingsCard
            label={t("settings.accountLabel")}
            title={t("settings.profileTitle")}
            description={t("settings.profileDesc")}
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/profile")}
            >
              {t("common.manage")}
            </Button>
          </SettingsCard>

          <SettingsCard
            label={t("settings.dataSourcesLabel")}
            title={t("settings.integrationsTitle")}
            description={t("settings.integrationsDesc")}
          >
            <Button
              variant="light"
              radius="md"
              size="md"
              className={classes.actionBtn}
              onClick={() => navigate("/connected-integrations")}
            >
              {t("common.manage")}
            </Button>
          </SettingsCard>

          <SettingsCard
            label={t("settings.languageLabel")}
            title={t("settings.languageTitle")}
          >
            <Select
              value={language}
              onChange={(v) => v && setLanguage(v)}
              data={[
                { value: "en", label: t("languages.en") },
                { value: "ja", label: t("languages.ja") },
                { value: "fr", label: t("languages.fr") },
                { value: "de", label: t("languages.de") },
                { value: "es", label: t("languages.es") },
              ]}
              placeholder={t("common.chooseLanguage")}
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
              comboboxProps={{
                transitionProps: { transition: "pop", duration: 140 },
                shadow: "md",
                radius: "md",
              }}
              aria-label={t("settings.languageTitle")}
            />
            <Group gap={8}>
              <Text size="sm" c="dimmed">
                {t("common.current")}
              </Text>
              <Text size="sm" fw={700}>
                {languageLabel}
              </Text>
            </Group>
          </SettingsCard>

          <SettingsCard
            label={t("settings.tutorialLabel")}
            title={t("settings.tutorialTitle")}
            description={t("settings.tutorialDesc")}
          >
            <Box data-tour="settings-tutorial-card">
              <Button
                variant="light"
                radius="md"
                size="md"
                className={classes.actionBtn}
                onClick={() => tour.start()}
              >
                {t("common.start")}
              </Button>
            </Box>
          </SettingsCard>

          {loadingAdmin ? (
            <SettingsCard
              label="ADMIN"
              title="Admin Console"
              description="Loading admin controls..."
            >
              <Loader size="sm" />
            </SettingsCard>
          ) : null}

          {!loadingAdmin && isAdmin ? (
            <SettingsCard
              className={classes.adminCard}
              label="ADMIN"
              title="Users & Admins"
              description="Manage who can access the app and who can administer it."
            >
              <Stack w="100%" gap="md" className={classes.adminPanel}>
                {adminBanner ? (
                  <Alert color={adminBanner.color} variant="light">
                    {adminBanner.message}
                  </Alert>
                ) : null}

                <Group align="start" grow className={classes.adminForms}>
                  <form onSubmit={handleCreateUser} className={classes.inlineForm}>
                    <Stack gap="xs">
                      <Text fw={700}>Add User</Text>
                      <TextInput
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.currentTarget.value)}
                        placeholder="new.user@example.com"
                        label="User email"
                      />
                      <TextInput
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.currentTarget.value)}
                        placeholder="Full name (optional)"
                        label="Name"
                      />
                      <Button type="submit" loading={savingUser}>Add User</Button>
                    </Stack>
                  </form>

                  <form onSubmit={handleCreateAdmin} className={classes.inlineForm}>
                    <Stack gap="xs">
                      <Text fw={700}>Add Admin</Text>
                      <TextInput
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.currentTarget.value)}
                        placeholder="new.admin@example.com"
                        label="Admin email"
                      />
                      <Button type="submit" loading={savingAdmin}>Add Admin</Button>
                    </Stack>
                  </form>
                </Group>

                <Divider />

                {loadingLists ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  <Stack gap="md" w="100%">
                    <Box>
                      <Group justify="space-between" mb={6}>
                        <Text fw={700}>Users</Text>
                        <Badge variant="light">{users.length}</Badge>
                      </Group>
                      <Box className={classes.listWrap}>
                        <Box className={classes.userListHead}>
                          <Text className={classes.colEmail}>Email</Text>
                          <Text className={classes.colName}>Name</Text>
                          <Text className={classes.colMeta}>Provider</Text>
                          <Text className={classes.colAction}>Action</Text>
                        </Box>
                        {users.length ? users.map((user) => (
                          <Box key={user.email} className={classes.userListRow}>
                            <Text className={classes.colEmail}>{user.email || "-"}</Text>
                            <Text className={classes.colName}>{user.name || "-"}</Text>
                            <Text className={classes.colMeta}>{user.provider || "-"}</Text>
                            <Box className={classes.colAction}>
                              {admins.some((a) => String(a.email || "").toLowerCase() === String(user.email || "").toLowerCase()) ? (
                                <Badge size="sm" color="gray" variant="light">Admin</Badge>
                              ) : (
                                <Button
                                  color="red"
                                  variant="light"
                                  size="xs"
                                  leftSection={<IconTrash size={14} />}
                                  loading={deletingEmail === String(user.email || "").toLowerCase()}
                                  onClick={() => handleDeleteUser(user.email)}
                                >
                                  Delete
                                </Button>
                              )}
                            </Box>
                          </Box>
                        )) : (
                          <Text size="sm" c="dimmed" p="sm">No users found.</Text>
                        )}
                      </Box>
                    </Box>

                    <Box>
                      <Group justify="space-between" mb={6}>
                        <Text fw={700}>Admins</Text>
                        <Badge variant="light">{admins.length}</Badge>
                      </Group>
                      <Box className={classes.listWrap}>
                        <Box className={classes.listHead}>
                          <Text className={classes.colEmail}>Email</Text>
                          <Text className={classes.colName}>Created By</Text>
                          <Text className={classes.colMeta}>Status</Text>
                        </Box>
                        {admins.length ? admins.map((admin) => (
                          <Box key={admin.email} className={classes.listRow}>
                            <Text className={classes.colEmail}>{admin.email}</Text>
                            <Text className={classes.colName}>{admin.created_by_email || "-"}</Text>
                            <Text className={classes.colMeta}>{admin.created_by_email === "seed" ? "Seed" : "Active"}</Text>
                          </Box>
                        )) : (
                          <Text size="sm" c="dimmed" p="sm">No admins found.</Text>
                        )}
                      </Box>
                    </Box>
                  </Stack>
                )}
              </Stack>
            </SettingsCard>
          ) : null}
        </Box>
      </Container>
    </Box>
  );
}
