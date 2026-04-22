import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconDeviceFloppy,
  IconFolderOpen,
  IconTrash,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlus,
  IconRefresh,
  IconSend,
  IconFileText,
} from '@tabler/icons-react';
import { apiUrl } from '../utils/api';
import { supabase } from '../supabaseClient';
import { useTranslation } from "react-i18next";

const CHAT_STORAGE_KEY = "chibitek-chat-state";
const CHAT_SESSION_FLAG = "chibitek-chat-session-loaded";
const SUMMARY_PROMPT = [
  "Summarize the most recent posts provided in system context.",
  "Rules: use only the provided posts, do not invent details.",
  "Output: 1) one-sentence summary, 2) 3-5 top themes, 3) up to 3 notable posts with URLs if present, 4) gaps/uncertainties."
].join(" ");

const resolveBackendUrl = () => {
  const envUrl = import.meta.env.e_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, port, protocol } = window.location;
    if (hostname === "localhost" && port === "5173") {
      return `${protocol}//${hostname}:8080`;
    }
    return window.location.origin;
  }
  return "";
};

const backendUrl = resolveBackendUrl();

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;



const loadPersistedChat = () => {
  if (typeof window === "undefined") return null;
  try {
    // On a fresh session (new tab / fresh login), start with a clean chat
    const alreadyLoaded = window.sessionStorage?.getItem(CHAT_SESSION_FLAG);
    if (!alreadyLoaded) {
      // Clear any stale localStorage chat state from a previous session
      window.localStorage?.removeItem(CHAT_STORAGE_KEY);
      window.sessionStorage?.setItem(CHAT_SESSION_FLAG, "1");
      return null;
    }
    const raw = window.localStorage?.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Failed to load saved chat", err);
    return null;
  }
};

const fileToAttachment = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isTextLike = file.type.startsWith("text/") || file.type.includes("json");
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        content: content.slice(0, 12000),
      });
    };
    reader.onerror = () => reject(reader.error);
    if (isTextLike) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });

const buildConversationTitle = (entries, t) => {
  const firstUserMessage = entries.find((entry) => entry.role === "user" && entry.content);
  if (!firstUserMessage) return t("chat.newChat");
  const trimmed = firstUserMessage.content.trim();
  if (!trimmed) return t("chat.newChat");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
};

export default function ChatInput() {
  const { t, i18n } = useTranslation();
  const persisted = useMemo(() => loadPersistedChat(), []);

  const defaultConversation = useMemo(
    () => [
      {
        role: "assistant",
        content: t("chat.defaultGreeting"),
      },
    ],
    [t]
  );

  const [message, setMessage] = useState(persisted?.message ?? "");
  const [conversation, setConversation] = useState(
    persisted?.conversation ?? defaultConversation
  );
  const [attachments, setAttachments] = useState(persisted?.attachments ?? []);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [savedConversations, setSavedConversations] = useState([]);
  const [saveNotice, setSaveNotice] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      if (mounted) setCurrentUserId(data?.user?.id || null);
    };
    loadUser();
    window.dispatchEvent(
      new CustomEvent("chibitek:pageReady", { detail: { page: "chat" } })
    );
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    hasHydratedRef.current = true;
  }, []);

  // Pick up any post forwarded from the "Send to Chat" toast.
  // It arrives as a pre-built attachment object so the user can read it
  // in the chat panel and the model receives it as file context.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("chibitek-pending-chat-post");
      if (!raw) return;
      sessionStorage.removeItem("chibitek-pending-chat-post");
      const { attachment, platform } = JSON.parse(raw);
      if (attachment?.content) {
        setAttachments((prev) => [...prev, attachment]);
        const label = platform
          ? platform.charAt(0).toUpperCase() + platform.slice(1)
          : "this";
        setMessage(`Analyze ${label} post for me`);
      }
    } catch (_) {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    setConversation((prev) => {
      const hasUserMessages = prev.some((entry) => entry.role === "user");
      if (hasUserMessages) return prev;
      if (!prev.length) {
        return [{ role: "assistant", content: t("chat.defaultGreeting") }];
      }
      if (prev.length === 1 && prev[0].role === "assistant") {
        if (prev[0].content === t("chat.defaultGreeting")) return prev;
        return [{ ...prev[0], content: t("chat.defaultGreeting") }];
      }
      return prev;
    });
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    if (!hasHydratedRef.current || typeof window === "undefined") return;
    try {
      const toStore = JSON.stringify({ message, conversation, attachments });
      window.localStorage.setItem(CHAT_STORAGE_KEY, toStore);
    } catch (err) {
      console.warn("Failed to persist chat", err);
    }
  }, [message, conversation, attachments]);

  useEffect(() => {
    if (!SpeechRecognition) return undefined;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setMessage((prev) => `${prev ? `${prev} ` : ""}${transcript}`.trim());
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return;

    const userMessage = {
      role: "user",
      content: message.trim() || "See attached files for context.",
      attachments,
    };

    const updatedConversation = [...conversation, userMessage];
    setConversation(updatedConversation);
    setMessage("");
    setAttachments([]);
    setIsSending(true);

    try {
      const payloadMessages = updatedConversation.map(({ role, content }) => ({ role, content }));
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages, attachments }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Chat request failed${reason}`);
      }

      const data = await response.json();
      setConversation((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "No response." },
      ]);
    } catch (error) {
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message?.includes("GITHUB_TOKEN")
            ? "Server is missing the GitHub token. Please add it and try again."
            : "Sorry, I could not reach the language model right now.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSummarizeRecentPosts = async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: "user", content: SUMMARY_PROMPT }],
          user_id: currentUserId || undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Chat request failed${reason}`);
      }

      const data = await response.json();
      setConversation((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "No response." },
      ]);
    } catch (error) {
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message?.includes("GITHUB_TOKEN")
            ? "Server is missing the GitHub token. Please add it and try again."
            : "Sorry, I could not reach the language model right now.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileButtonClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const processed = await Promise.all(files.map((file) => fileToAttachment(file)));
      setAttachments((prev) => [...prev, ...processed]);
    } catch {
    } finally {
      event.target.value = "";
    }
  };

  const toggleListening = () => {
    if (!SpeechRecognition || !recognitionRef.current) return;
    if (isListening) recognitionRef.current.stop();
    else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const attachmentBadges = useMemo(
    () =>
      attachments.map((file) => (
        <Badge key={`${file.name}-${file.size}`} color="gray" variant="light">
          {file.name}
        </Badge>
      )),
    [attachments]
  );

  const handleSaveConversation = async (titleOverride) => {
    if (!conversation.length) return;
    if (!currentUserId) {
      setSaveNotice(t("chat.signInToSave"));
      return;
    }
    setIsSaving(true);
    setSaveNotice("");
    try {
      const response = await fetch(apiUrl('/api/chat/conversations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleOverride || buildConversationTitle(conversation, t, t),
          conversation,
          user_id: currentUserId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Failed to save${reason}`);
      }

      setSaveNotice(t("chat.conversationSaved"));
    } catch (error) {
      setSaveNotice(error.message || t("chat.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSaveModal = () => {
    setSaveTitle(buildConversationTitle(conversation, t));
    setSaveModalOpen(true);
  };

  const handleConfirmSave = async () => {
    await handleSaveConversation(saveTitle.trim() || buildConversationTitle(conversation, t));
    setSaveModalOpen(false);
  };

  const handleNewConversation = () => {
    setMessage("");
    setAttachments([]);
    setConversation(defaultConversation);
    setCurrentConversationId(null);
  };

  const handleOpenLoadModal = async () => {
    if (!currentUserId) {
      setSaveNotice(t("chat.signInToLoad"));
      return;
    }
    setLoadModalOpen(true);
    setIsLoadingList(true);
    try {
      const response = await fetch(apiUrl(`/api/chat/conversations?user_id=${encodeURIComponent(currentUserId)}`));
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Failed to load conversations${reason}`);
      }
      const data = await response.json();
      setSavedConversations(data.conversations || []);
    } catch (error) {
      setSavedConversations([]);
      setSaveNotice(error.message || t("chat.failedToLoad"));
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleLoadConversation = async (conversationId) => {
    if (!conversationId) return;
    if (!currentUserId) {
      setSaveNotice(t("chat.signInToLoad"));
      return;
    }
    setIsLoadingList(true);
    try {
      const response = await fetch(
        apiUrl(`/api/chat/conversations/${conversationId}?user_id=${encodeURIComponent(currentUserId)}`)
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Failed to load chat${reason}`);
      }
      const data = await response.json();
      const loadedConversation = data?.conversation?.conversation || data?.conversation;
      if (Array.isArray(loadedConversation)) {
        setConversation(loadedConversation);
        setMessage("");
        setAttachments([]);
        setCurrentConversationId(conversationId);
        setLoadModalOpen(false);
        setSaveNotice("");
      } else {
        throw new Error(t("chat.failedToLoad"));
      }
    } catch (error) {
      setSaveNotice(error.message || t("chat.failedToLoad"));
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId) return;
    if (!currentUserId) {
      setSaveNotice(t("chat.signInToDelete"));
      return;
    }

    const previousList = savedConversations;
    const previousConversation = conversation;
    const previousMessage = message;
    const previousAttachments = attachments;
    const previousCurrentId = currentConversationId;

    setSavedConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (currentConversationId === conversationId) {
      handleNewConversation();
    }

    setIsLoadingList(true);
    try {
      let response = await fetch(
        apiUrl(`/api/chat/conversations/${conversationId}?user_id=${encodeURIComponent(currentUserId)}`),
        {
          method: 'DELETE',
        }
      );

      if (response.status === 404 || response.status === 405) {
        response = await fetch(
          apiUrl(`/api/chat/conversations/${conversationId}/delete?user_id=${encodeURIComponent(currentUserId)}`),
          {
            method: 'POST',
          }
        );
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Failed to delete conversation${reason}`);
      }
      setSaveNotice(t("chat.conversationDeleted"));
    } catch (error) {
      setSaveNotice(error.message || t("chat.failedToDelete"));
      setSavedConversations(previousList);
      if (previousCurrentId === conversationId) {
        setConversation(previousConversation);
        setMessage(previousMessage);
        setAttachments(previousAttachments);
        setCurrentConversationId(previousCurrentId);
      }
    } finally {
      setIsLoadingList(false);
    }
  };


  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg-primary)",
        padding: "24px",
      }}
    >
      <Box
        style={{
          width: "100%",
          maxWidth: "clamp(720px, 80vw, 980px)",
          marginInline: "auto",
        }}
      >
        <Box style={{ textAlign: "center", marginBottom: 28 }}>
          <Title style={{ fontSize: 32, fontWeight: 400, margin: 0 }}>
            ChibitekAI
          </Title>
          <Text c="dimmed" mt={6}>
            {t("chat.description", "Chat with the model, attach files for context, or speak your prompt.")}
          </Text>

          {saveNotice ? (
            <Text size="sm" c="dimmed" mt={6}>
              {saveNotice}
            </Text>
          ) : null}

          <Group justify="center" mt="md">
            <Menu shadow="md" width={240}>
              <Menu.Target>
                <Button variant="light">{t("chat.options")}</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconDeviceFloppy size={16} />}
                  onClick={handleOpenSaveModal}
                  disabled={isSaving}
                >
                  {isSaving ? t("chat.saving") : t("chat.saveConversation")}
                </Menu.Item>
                <Menu.Item leftSection={<IconFolderOpen size={16} />} onClick={handleOpenLoadModal}>
                  {t("chat.loadSavedChat")}
                </Menu.Item>
                <Menu.Item leftSection={<IconRefresh size={16} />} onClick={handleNewConversation}>
                  {t("chat.startNewChat")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Box>

        <div data-tour="chat-root">
          <Paper shadow="sm" radius="lg" p="md" withBorder>
            <ScrollArea style={{ height: "56vh" }} pr="md">
              <Box style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {conversation.map((entry, index) => (
                  <Box
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent: entry.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <Paper
                      shadow="xs"
                      p="sm"
                      withBorder
                      style={{
                        maxWidth: "76%",
                        backgroundColor: entry.role === "user" ? "#e7f5ff" : "white",
                      }}
                    >
                      <Text size="xs" c="dimmed" mb={4}>
                        {entry.role === "user" ? t("chat.you") : t("chat.chibitekAI")}
                      </Text>
                      <Text style={{ whiteSpace: "pre-wrap" }}>{entry.content}</Text>
                      {entry.attachments?.length ? (
                        <Group gap="xs" mt={8} wrap="wrap">
                          {entry.attachments.map((file) => (
                            <Badge key={`${file.name}-${file.size}`} color="blue" variant="light">
                              {file.name}
                            </Badge>
                          ))}
                        </Group>
                      ) : null}
                    </Paper>
                  </Box>
                ))}

                {isSending ? (
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text c="dimmed">{t("chat.thinking")}</Text>
                  </Group>
                ) : null}
              </Box>
            </ScrollArea>

            {attachments.length > 0 ? (
              <Group gap="xs" mt="md" wrap="wrap">
                {attachmentBadges}
              </Group>
            ) : null}

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                leftSection={<IconFileText size={16} />}
                onClick={handleSummarizeRecentPosts}
                disabled={isSending}
              >
                {t("chat.summarizeRecentPosts")}
              </Button>
            </Group>

            <Box
              mt="md"
              px={12}
              py={8}
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 12,
                backgroundColor: "white",
                borderRadius: 24,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
                border: "1px solid #e9ecef",
              }}
            >
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={handleFileButtonClick}
                style={{ flexShrink: 0 }}
              >
                <IconPlus size={20} />
              </ActionIcon>

              <input
                type="file"
                multiple
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <Textarea
                placeholder={t("chat.askAnything")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                variant="unstyled"
                size="md"
                disabled={isSending}
                autosize
                minRows={1}
                maxRows={6}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    fontSize: 16,
                    padding: "8px 0",
                    border: "none",
                    outline: "none",
                    resize: "none",
                  },
                }}
              />

              <ActionIcon
                variant="subtle"
                color={isListening ? "red" : "gray"}
                size="lg"
                onClick={toggleListening}
                style={{ flexShrink: 0 }}
                title={SpeechRecognition ? t("chat.speakYourPrompt") : t("chat.speechUnavailable")}
              >
                {isListening ? <IconMicrophoneOff size={20} /> : <IconMicrophone size={20} />}
              </ActionIcon>

              <ActionIcon
                variant="filled"
                color="blue"
                size="lg"
                radius="xl"
                onClick={handleSend}
                loading={isSending}
                style={{ flexShrink: 0 }}
              >
                <IconSend size={18} />
              </ActionIcon>
            </Box>
          </Paper>
        </div>
      </Box>

      {/* NOTE: We keep modals OUTSIDE the tour root so the bubble can sit left of the main card without getting shoved. */}
      <Modal opened={loadModalOpen} onClose={() => setLoadModalOpen(false)} title={t("chat.savedConversations")} centered>
        {isLoadingList ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text c="dimmed">{t("chat.loading")}</Text>
          </Group>
        ) : savedConversations.length ? (
          <Box style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {savedConversations.map((item) => (
              <Paper
                key={item.id}
                withBorder
                p="sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Box>
                  <Text size="sm" fw={500}>
                    {item.title || t("chat.untitledChat")}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                  </Text>
                </Box>
                <Group spacing="xs">
                  <Button size="xs" variant="light" onClick={() => handleLoadConversation(item.id)}>
                    {t("chat.open")}
                  </Button>
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={() => handleDeleteConversation(item.id)}
                    title={t("chat.deleteSavedConversation")}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
          </Box>
        ) : (
          <Text c="dimmed" size="sm">
            {t("chat.noSavedConversationsYet")}
          </Text>
        )}
      </Modal>

      <Modal opened={saveModalOpen} onClose={() => setSaveModalOpen(false)} title={t("chat.nameThisChat")} centered>
        <TextInput
          label={t("chat.chatName")}
          placeholder={t("chat.chatNamePlaceholder")}
          value={saveTitle}
          onChange={(event) => setSaveTitle(event.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setSaveModalOpen(false)}>
            {t("chat.cancel")}
          </Button>
          <Button onClick={handleConfirmSave} loading={isSaving}>
            {t("chat.save")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}