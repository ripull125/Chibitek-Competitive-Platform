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
  SegmentedControl,
  Center,
  useMantineColorScheme,
} from "@mantine/core";
import { IconTrash, IconWorld, IconSun, IconMoon, IconDeviceDesktop, IconSearch, IconPalette } from "@tabler/icons-react";
import { useAppTour } from "../tour/AppTourProvider.jsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { apiUrl } from "../utils/api";
import {
  AI_MODEL_OPTIONS,
  getAiSettingsEventName,
  getModelMeta,
  loadAiSettings,
  saveAiSettings,
} from "../utils/aiModelSettings";

import classes from "./Settings.module.css";
import "../utils/ui.css";

const NATIVE_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];


const ACCENT_THEME_STORAGE_KEY = "chibitek-accent-theme";

const COLOR_THEME_OPTIONS = [
  { value: "blue", label: "Blue", swatch: "#228be6" },
  { value: "purple", label: "Purple", swatch: "#7950f2" },
  { value: "green", label: "Green", swatch: "#2f9e44" },
  { value: "orange", label: "Orange", swatch: "#f08c00" },
  { value: "rose", label: "Rose", swatch: "#e64980" },
];

function readAccentTheme() {
  if (typeof window === "undefined") return "blue";
  return window.localStorage?.getItem(ACCENT_THEME_STORAGE_KEY) || "blue";
}

function applyAccentTheme(value) {
  if (typeof window === "undefined") return;
  const safeValue = COLOR_THEME_OPTIONS.some((item) => item.value === value) ? value : "blue";
  window.localStorage?.setItem(ACCENT_THEME_STORAGE_KEY, safeValue);
  document.documentElement.setAttribute("data-chibitek-theme", safeValue);
  window.dispatchEvent(new CustomEvent("chibitek:accentTheme", { detail: { theme: safeValue } }));
}

const getNativeLanguageName = (code) =>
  NATIVE_LANGUAGE_OPTIONS.find((item) => item.value === code)?.label || "English";

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
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();
  const tour = useAppTour();
  const [accessRole, setAccessRole] = useState("user");
  const [canManageRegularUsers, setCanManageRegularUsers] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [selectedAdminEmail, setSelectedAdminEmail] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deletingAdminEmail, setDeletingAdminEmail] = useState("");
  const [deletingEmail, setDeletingEmail] = useState("");
  const [currentAdminEmail, setCurrentAdminEmail] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedOwnerEmail, setSelectedOwnerEmail] = useState("");
  const [ownerTransferConfirm, setOwnerTransferConfirm] = useState("");
  const [transferringOwnership, setTransferringOwnership] = useState(false);
  const [adminBanner, setAdminBanner] = useState(null);
  const initialAiSettings = useMemo(() => loadAiSettings(), []);
  const [aiModelChoice, setAiModelChoice] = useState(initialAiSettings.modelChoice);
  const [accentTheme, setAccentTheme] = useState(readAccentTheme);

  const languageLabel = useMemo(
    () => getNativeLanguageName(language),
    [language]
  );

  const roleLabel = (role) => {
    const normalized = String(role || "user").trim().toLowerCase();
    if (normalized === "owner") return t("settings.ownerLabel");
    if (normalized === "admin") return t("settings.adminLabel");
    return t("settings.usersTitle");
  };

  const roleBadgeColor = (role) => {
    const normalized = String(role || "user").trim().toLowerCase();
    if (normalized === "owner") return "violet";
    if (normalized === "admin") return "blue";
    return "gray";
  };

  const userRoleCounts = useMemo(() => {
    return (users || []).reduce(
      (counts, user) => {
        const role = String(user?.role || "user").trim().toLowerCase();
        if (role === "owner") counts.owner += 1;
        else if (role === "admin") counts.admin += 1;
        else counts.user += 1;
        counts.all += 1;
        return counts;
      },
      { all: 0, owner: 0, admin: 0, user: 0 }
    );
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = String(userSearch || "").trim().toLowerCase();

    return (users || []).filter((user) => {
      const role = String(user?.role || "user").trim().toLowerCase();
      const normalizedRole = role === "regular" ? "user" : role;
      if (roleFilter !== "all" && normalizedRole !== roleFilter) return false;

      if (!query) return true;

      return [user?.email, user?.name, user?.provider, normalizedRole]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [users, userSearch, roleFilter]);

  const ownershipTransferOptions = useMemo(() => {
    const currentEmail = String(currentAdminEmail || "").trim().toLowerCase();
    const seen = new Set();

    return (users || [])
      .filter((user) => {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email || email === currentEmail || seen.has(email)) return false;
        seen.add(email);

        return String(user?.role || "user").trim().toLowerCase() !== "owner";
      })
      .map((user) => {
        const email = String(user?.email || "").trim().toLowerCase();
        const name = String(user?.name || "").trim();
        const role = roleLabel(user?.role);
        return {
          value: email,
          label: [name || null, email, `(${role})`].filter(Boolean).join(" "),
        };
      });
  }, [users, currentAdminEmail]);

  const ownershipConfirmPhrase = selectedOwnerEmail ? `TRANSFER ${selectedOwnerEmail}` : "";
  const ownershipConfirmMatches =
    Boolean(selectedOwnerEmail) && ownerTransferConfirm.trim() === ownershipConfirmPhrase;

  const adminCandidateOptions = useMemo(() => {
    const seen = new Set();
    return (users || [])
      .filter((user) => {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email || seen.has(email)) return false;
        seen.add(email);

        const role = String(user?.role || "").trim().toLowerCase();
        return role !== "owner" && role !== "admin";
      })
      .map((user) => {
        const email = String(user?.email || "").trim().toLowerCase();
        const name = String(user?.name || "").trim();
        const provider = String(user?.provider || "").trim();
        const labelParts = [name || null, email, provider ? `(${provider})` : null].filter(Boolean);
        return {
          value: email,
          label: labelParts.join(" "),
        };
      });
  }, [users]);

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
        const rawRole = String(payload?.role || "user").toLowerCase();
        const role = rawRole === "regular" ? "user" : rawRole;
        const manageUsers =
          typeof payload?.canManageRegularUsers === "boolean"
            ? payload.canManageRegularUsers
            : role === "admin" || role === "owner";
        const manageAdmins =
          typeof payload?.canManageAdmins === "boolean"
            ? payload.canManageAdmins
            : role === "owner";
        setCurrentAdminEmail(String(payload?.email || "").trim().toLowerCase());
        setAccessRole(role);
        setCanManageRegularUsers(manageUsers);
        setCanManageAdmins(manageAdmins);
        if (manageUsers) {
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

  useEffect(() => {
    saveAiSettings({ modelChoice: aiModelChoice });
  }, [aiModelChoice]);

  useEffect(() => {
    const eventName = getAiSettingsEventName();
    const syncSettings = (event) => {
      const nextChoice = event?.detail?.modelChoice || loadAiSettings().modelChoice;
      setAiModelChoice(nextChoice);
    };

    window.addEventListener(eventName, syncSettings);
    return () => window.removeEventListener(eventName, syncSettings);
  }, []);

  useEffect(() => {
    applyAccentTheme(accentTheme);
  }, [accentTheme]);

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
    const email = String(selectedAdminEmail || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAdminBanner({ color: "red", message: "Please choose a user to promote to admin." });
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

      setSelectedAdminEmail("");
      setAdminBanner({ color: "green", message: `Admin ${payload?.admin?.email || email} added successfully.` });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to create admin." });
    } finally {
      setSavingAdmin(false);
    }
  }

  async function handleDeleteAdmin(email) {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;

    const confirmed = window.confirm(`Remove admin permissions from ${normalized}?`);
    if (!confirmed) return;

    setDeletingAdminEmail(normalized);
    setAdminBanner(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(apiUrl("/api/admin/admins"), {
        method: "DELETE",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalized }),
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to remove admin.");
      }

      setAdminBanner({ color: "green", message: `Removed admin permissions from ${normalized}.` });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || "Failed to remove admin." });
    } finally {
      setDeletingAdminEmail("");
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
      setAdminBanner({ color: "red", message: err?.message || t("settings.deleteUserFailed") });
    } finally {
      setDeletingEmail("");
    }
  }

  async function handleTransferOwnership(e) {
    e.preventDefault();
    const targetEmail = String(selectedOwnerEmail || "").trim().toLowerCase();

    if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail)) {
      setAdminBanner({ color: "red", message: t("settings.chooseNewOwner") });
      return;
    }

    if (ownerTransferConfirm.trim() !== ownershipConfirmPhrase) {
      setAdminBanner({
        color: "red",
        message: t("settings.transferConfirmType", { phrase: ownershipConfirmPhrase }),
      });
      return;
    }

    const confirmed = window.confirm(
      t("settings.transferConfirmPrompt", { email: targetEmail })
    );
    if (!confirmed) return;

    setTransferringOwnership(true);
    setAdminBanner(null);
    try {
      const headers = await getAuthHeader();
      const response = await fetch(apiUrl("/api/admin/transfer-ownership"), {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetEmail,
          confirmation: ownershipConfirmPhrase,
        }),
      });

      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(payload?.error || t("settings.transferOwnershipFailed"));
      }

      setSelectedOwnerEmail("");
      setOwnerTransferConfirm("");
      setAccessRole("admin");
      setCanManageAdmins(false);
      setCanManageRegularUsers(true);
      setAdminBanner({
        color: "green",
        message: t("settings.ownershipTransferred", { email: payload?.owner?.email || targetEmail }),
      });
      await loadAdminLists();
    } catch (err) {
      setAdminBanner({ color: "red", message: err?.message || t("settings.transferOwnershipFailed") });
    } finally {
      setTransferringOwnership(false);
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
              data={NATIVE_LANGUAGE_OPTIONS}
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
            label={t("settings.appearanceLabel")}
            title={t("settings.themeTitle")}
            description={t("settings.themeDesc")}
          >
            <SegmentedControl
              value={colorScheme}
              onChange={setColorScheme}
              radius="xl"
              size="sm"
              data={[
                {
                  value: "light",
                  label: (
                    <Center gap={6}>
                      <IconSun size={14} />
                      <span>{t("settings.light")}</span>
                    </Center>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <Center gap={6}>
                      <IconMoon size={14} />
                      <span>{t("settings.dark")}</span>
                    </Center>
                  ),
                },
                {
                  value: "auto",
                  label: (
                    <Center gap={6}>
                      <IconDeviceDesktop size={14} />
                      <span>{t("settings.system")}</span>
                    </Center>
                  ),
                },
              ]}
            />

            <Stack gap={8} mt={4} w="100%" align="center">
              <Group gap={6} justify="center">
                <IconPalette size={15} />
                <Text size="sm" fw={700}>
                  {t("settings.colorThemeTitle", { defaultValue: "Color theme" })}
                </Text>
              </Group>
              <Group gap={8} justify="center" wrap="wrap">
                {COLOR_THEME_OPTIONS.map((item) => {
                  const selected = accentTheme === item.value;
                  return (
                    <Button
                      key={item.value}
                      size="xs"
                      variant={selected ? "filled" : "light"}
                      color="blue"
                      radius="xl"
                      className={classes.colorThemeBtn}
                      onClick={() => setAccentTheme(item.value)}
                      leftSection={
                        <Box
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: item.swatch,
                            boxShadow: "0 0 0 1px rgba(255,255,255,.7)",
                          }}
                        />
                      }
                    >
                      {t(`settings.colorTheme.${item.value}`, { defaultValue: item.label })}
                    </Button>
                  );
                })}
              </Group>
            </Stack>
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

          <SettingsCard
            label={t("settings.aiLabel")}
            title={t("settings.chatModelTitle")}
            description={t("settings.chatModelDesc")}
          >
            <Select
              value={aiModelChoice}
              onChange={(value) => value && setAiModelChoice(value)}
              data={AI_MODEL_OPTIONS}
              placeholder={t("settings.chooseAiModel")}
              radius="md"
              size="md"
              searchable
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
              aria-label={t("settings.chatModelTitle")}
            />

            <Group gap={8}>
              <Text size="sm" c="dimmed">
                {t("common.current")}
              </Text>
              <Text size="sm" fw={700}>
                {getModelMeta(aiModelChoice)?.label || aiModelChoice}
              </Text>
            </Group>
          </SettingsCard>

          {loadingAdmin ? (
            <SettingsCard
              label={t("settings.adminLabel")}
              title={t("settings.adminConsoleTitle")}
              description={t("settings.loadingAdminControls")}
            >
              <Loader size="sm" />
            </SettingsCard>
          ) : null}

          {!loadingAdmin && canManageRegularUsers ? (
            <SettingsCard
              className={classes.adminCard}
              label={accessRole === "owner" ? t("settings.ownerLabel") : t("settings.adminLabel")}
              title={accessRole === "owner" ? t("settings.usersAdminsOwners") : t("settings.usersTitle")}
              description={
                canManageAdmins
                  ? t("settings.ownerAdminDesc")
                  : t("settings.adminUserDesc")
              }
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
                      <Text fw={700}>{t("settings.addUser")}</Text>
                      <TextInput
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.currentTarget.value)}
                        placeholder="new.user@example.com"
                        label={t("settings.userEmail")}
                      />
                      <TextInput
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.currentTarget.value)}
                        placeholder={t("settings.fullNameOptional")}
                        label={t("settings.name")}
                      />
                      <Button type="submit" loading={savingUser}>{t("settings.addUser")}</Button>
                    </Stack>
                  </form>

                  {canManageAdmins ? (
                    <form onSubmit={handleCreateAdmin} className={classes.inlineForm}>
                      <Stack gap="xs">
                        <Text fw={700}>{t("settings.addAdmin")}</Text>
                        <Select
                          value={selectedAdminEmail}
                          onChange={(value) => setSelectedAdminEmail(value || "")}
                          data={adminCandidateOptions}
                          label={t("settings.selectUser")}
                          placeholder={adminCandidateOptions.length ? t("settings.chooseUser") : t("settings.noEligibleUsers")}
                          searchable
                          clearable
                          nothingFoundMessage={t("settings.noMatchingUsers")}
                        />
                        <Button type="submit" loading={savingAdmin} disabled={!selectedAdminEmail}>{t("settings.addAdmin")}</Button>
                      </Stack>
                    </form>
                  ) : null}

                  {canManageAdmins ? (
                    <form onSubmit={handleTransferOwnership} className={`${classes.inlineForm} ${classes.ownerTransferForm}`}>
                      <Stack gap="xs">
                        <Group justify="space-between" gap="xs">
                          <Text fw={700}>{t("settings.transferOwnership")}</Text>
                          <Badge color="violet" variant="light">{t("settings.ownerOnly")}</Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {t("settings.transferOwnershipDesc")}
                        </Text>
                        <Select
                          value={selectedOwnerEmail}
                          onChange={(value) => {
                            setSelectedOwnerEmail(value || "");
                            setOwnerTransferConfirm("");
                          }}
                          data={ownershipTransferOptions}
                          label={t("settings.newOwner")}
                          placeholder={ownershipTransferOptions.length ? t("settings.chooseUser") : t("settings.noEligibleUsers")}
                          searchable
                          clearable
                          nothingFoundMessage={t("settings.noMatchingUsers")}
                        />
                        <TextInput
                          value={ownerTransferConfirm}
                          onChange={(e) => setOwnerTransferConfirm(e.currentTarget.value)}
                          label={t("settings.confirmation")}
                          placeholder={ownershipConfirmPhrase || t("settings.selectUserFirst")}
                          disabled={!selectedOwnerEmail}
                          description={
                            selectedOwnerEmail
                              ? t("settings.typeToConfirm", { phrase: ownershipConfirmPhrase })
                              : t("settings.selectOwnerToConfirm")
                          }
                        />
                        <Button
                          type="submit"
                          color="red"
                          loading={transferringOwnership}
                          disabled={!ownershipConfirmMatches}
                        >
                          {t("settings.transferOwnership")}
                        </Button>
                      </Stack>
                    </form>
                  ) : null}
                </Group>

                <Divider />

                {loadingLists ? (
                  <Group justify="center" py="md">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  <Stack gap="md" w="100%">
                    <Box>
                      <Group justify="space-between" mb={8} align="end" className={classes.listToolbar}>
                        <Box>
                          <Text fw={700}>{t("settings.usersTitle")}</Text>
                          <Text size="sm" c="dimmed">{t("settings.usersListDesc")}</Text>
                        </Box>
                        <Badge variant="light">{filteredUsers.length} of {users.length}</Badge>
                      </Group>

                      <Group gap="sm" mb="sm" align="end" className={classes.listFilters}>
                        <TextInput
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.currentTarget.value)}
                          placeholder={t("settings.searchUsersPlaceholder")}
                          leftSection={<IconSearch size={16} />}
                          className={classes.userSearch}
                        />
                        <SegmentedControl
                          value={roleFilter}
                          onChange={setRoleFilter}
                          data={[
                            { value: "all", label: t("settings.allCount", { count: userRoleCounts.all }) },
                            { value: "owner", label: t("settings.ownersCount", { count: userRoleCounts.owner }) },
                            { value: "admin", label: t("settings.adminsCount", { count: userRoleCounts.admin }) },
                            { value: "user", label: t("settings.usersCount", { count: userRoleCounts.user }) },
                          ]}
                        />
                      </Group>

                      <Box className={`${classes.listWrap} ${classes.scrollList}`}>
                        <Box className={classes.userListHead}>
                          <Text className={classes.colEmail}>{t("settings.email")}</Text>
                          <Text className={classes.colName}>{t("settings.name")}</Text>
                          <Text className={classes.colMeta}>{t("settings.role")}</Text>
                          <Text className={classes.colAction}>{t("settings.action")}</Text>
                        </Box>
                        {filteredUsers.length ? filteredUsers.map((user) => {
                          const normalizedRole = String(user.role || "user").toLowerCase();
                          const normalizedEmail = String(user.email || "").toLowerCase();
                          return (
                            <Box key={`${normalizedEmail}-${normalizedRole}`} className={classes.userListRow}>
                              <Text className={classes.colEmail}>{user.email || "-"}</Text>
                              <Text className={classes.colName}>{user.name || user.provider || "-"}</Text>
                              <Box className={classes.colMeta}>
                                <Badge size="sm" color={roleBadgeColor(normalizedRole)} variant="light">
                                  {roleLabel(normalizedRole)}
                                </Badge>
                              </Box>
                              <Box className={classes.colAction}>
                                {normalizedRole === "owner" || normalizedRole === "admin" ? (
                                  <Text size="sm" c="dimmed">{t("settings.protected")}</Text>
                                ) : (
                                  <Button
                                    color="red"
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconTrash size={14} />}
                                    loading={deletingEmail === normalizedEmail}
                                    onClick={() => handleDeleteUser(user.email)}
                                  >
                                    {t("common.delete")}
                                  </Button>
                                )}
                              </Box>
                            </Box>
                          );
                        }) : (
                          <Text size="sm" c="dimmed" p="sm">{t("settings.noUsersMatch")}</Text>
                        )}
                      </Box>
                    </Box>

                    <Box>
                      <Group justify="space-between" mb={6}>
                        <Text fw={700}>{t("settings.adminsOwners")}</Text>
                        <Badge variant="light">{admins.length}</Badge>
                      </Group>
                      <Box className={`${classes.listWrap} ${classes.compactList}`}>
                        <Box className={classes.listHead}>
                          <Text className={classes.colEmail}>{t("settings.email")}</Text>
                          <Text className={classes.colMeta}>{t("settings.status")}</Text>
                          <Text className={classes.colAction}>{t("settings.action")}</Text>
                        </Box>
                        {admins.length ? admins.map((admin) => {
                          const adminRole = String(admin.role || "").toLowerCase();
                          const adminEmail = String(admin.email || "").toLowerCase();
                          return (
                            <Box key={`${adminEmail}-${adminRole}`} className={classes.listRow}>
                              <Text className={classes.colEmail}>{admin.email}</Text>
                              <Box className={classes.colMeta}>
                                <Badge size="sm" color={roleBadgeColor(adminRole)} variant="light">
                                  {roleLabel(adminRole)}
                                </Badge>
                              </Box>
                              {canManageAdmins && adminRole === "admin" ? (
                                <Box className={classes.colAction}>
                                  <Button
                                    color="red"
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconTrash size={14} />}
                                    loading={deletingAdminEmail === adminEmail}
                                    onClick={() => handleDeleteAdmin(admin.email)}
                                  >
                                    {t("settings.removeAdmin")}
                                  </Button>
                                </Box>
                              ) : (
                                <Box className={classes.colAction}>-</Box>
                              )}
                            </Box>
                          );
                        }) : (
                          <Text size="sm" c="dimmed" p="sm">{t("settings.noAdminsFound")}</Text>
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
