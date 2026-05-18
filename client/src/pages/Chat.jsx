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
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconChartDots,
  IconCopy,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconFileText,
  IconFolderOpen,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStop,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { apiUrl } from "../utils/api";
import { supabase } from "../supabaseClient";
import { useTranslation } from "react-i18next";
import {
  AI_MODEL_OPTIONS,
  getAiSettingsEventName,
  getModelMeta,
  loadAiSettings,
  saveAiSettings,
} from "../utils/aiModelSettings";

const CHAT_STORAGE_KEY = "chibitek-chat-state";
const SUMMARY_PROMPT = [
  "Summarize the most recent posts provided in system context.",
  "Rules: use only the provided posts, do not invent details.",
  "Output: 1) one-sentence summary, 2) 3-5 top themes, 3) up to 3 notable posts with URLs if present, 4) gaps/uncertainties.",
].join(" ");

const SpeechRecognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const loadPersistedChat = () => {
  if (typeof window === "undefined") return null;
  try {
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

const CHAT_QUICK_PROMPTS = [
  {
    labelKey: "chat.quickSummarizeSavedPosts",
    promptKey: "chat.quickSummarizeSavedPostsPrompt",
    icon: IconFileText,
  },
  {
    labelKey: "chat.quickFindThemes",
    promptKey: "chat.quickFindThemesPrompt",
    icon: IconChartDots,
  },
  {
    labelKey: "chat.quickDraftRecommendations",
    promptKey: "chat.quickDraftRecommendationsPrompt",
    icon: IconSparkles,
  },
];

function MessageContent({ content }) {
  const lines = String(content || "").split(/\n/);
  const groups = [];
  let buffer = [];

  const flush = () => {
    if (buffer.length) {
      groups.push({ type: "paragraph", lines: buffer });
      buffer = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(trimmed)) {
      flush();
      groups.push({ type: "bullet", text: trimmed.replace(/^([-*•]|\d+[.)])\s+/, "") });
    } else {
      buffer.push(trimmed);
    }
  });
  flush();

  if (!groups.length) return null;

  return (
    <Stack gap={6}>
      {groups.map((group, index) => {
        if (group.type === "bullet") {
          return (
            <Group key={index} gap={8} align="flex-start" wrap="nowrap">
              <Box
                mt={7}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--accent-primary)",
                  flexShrink: 0,
                }}
              />
              <Text size="sm" lh={1.55} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {group.text}
              </Text>
            </Group>
          );
        }
        return (
          <Text key={index} size="sm" lh={1.55} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {group.lines.join("\n")}
          </Text>
        );
      })}
    </Stack>
  );
}

const DEFAULT_CHAT_TITLE_VALUES = new Set([
  "New chat",
  "Untitled chat",
  "新規チャット",
  "無題のチャット",
  "Nouveau chat",
  "Chat sans titre",
  "Neuer Chat",
  "Unbenannter Chat",
  "Nuevo chat",
  "Chat sin título",
]);

const buildConversationTitle = (entries, t) => {
  const firstUserMessage = entries.find((entry) => entry.role === "user" && entry.content);
  if (!firstUserMessage) return t("chat.newChat");
  const trimmed = firstUserMessage.content.trim().replace(/\s+/g, " ");
  if (!trimmed) return t("chat.newChat");
  return trimmed.length > 52 ? `${trimmed.slice(0, 49)}...` : trimmed;
};

const getDisplayChatTitle = (title, t, fallbackKey = "chat.untitledChat") => {
  const value = String(title || "").trim();
  if (!value || DEFAULT_CHAT_TITLE_VALUES.has(value)) return t(fallbackKey);
  return value;
};

const formatChatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
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
  const [conversation, setConversation] = useState(persisted?.conversation ?? defaultConversation);
  const [attachments, setAttachments] = useState(persisted?.attachments ?? []);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [savedConversations, setSavedConversations] = useState([]);
  const [saveNotice, setSaveNotice] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [currentConversationId, setCurrentConversationId] = useState(persisted?.currentConversationId ?? null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [chatSearch, setChatSearch] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(Boolean(persisted?.isSidebarCollapsed));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [currentConversationTitle, setCurrentConversationTitle] = useState(persisted?.currentConversationTitle ?? null);
  const [lastUsedProvider, setLastUsedProvider] = useState(null);
  const [lastUsedModel, setLastUsedModel] = useState(null);
  const initialAiSettings = useMemo(() => loadAiSettings(), []);
  const [aiModelChoice, setAiModelChoice] = useState(initialAiSettings.modelChoice);

  const fileInputRef = useRef(null);
  const chatViewportRef = useRef(null);
  const recognitionRef = useRef(null);
  const requestAbortRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const pendingCreateRef = useRef(null);
  const lastSavedJsonRef = useRef("");
  const conversationRef = useRef(conversation);
  const currentConversationIdRef = useRef(currentConversationId);
  const currentConversationTitleRef = useRef(currentConversationTitle);
  const currentUserIdRef = useRef(currentUserId);
  const hasHydratedRef = useRef(false);

  const hasUserMessages = useMemo(() => conversation.some((entry) => entry.role === "user"), [conversation]);
  const activeTitle = useMemo(() => currentConversationTitle || buildConversationTitle(conversation, t), [conversation, currentConversationTitle, t]);

  const getActiveUserId = async () => {
    if (currentUserIdRef.current) return currentUserIdRef.current;
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id || null;
    if (uid) {
      currentUserIdRef.current = uid;
      setCurrentUserId(uid);
    }
    return uid;
  };

  const loadSavedConversations = async (options = {}) => {
    const activeUserId = options.userId || (await getActiveUserId());
    if (!activeUserId) return;
    setIsLoadingList(true);
    try {
      const response = await fetch(apiUrl(`/api/chat/conversations?user_id=${encodeURIComponent(activeUserId)}`), {
        headers: { "x-user-id": activeUserId },
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Failed to load conversations${reason}`);
      }
      const data = await response.json();
      setSavedConversations(data.conversations || []);
    } catch (error) {
      if (!options.silent) setSaveNotice(error.message || t("chat.failedToLoad"));
    } finally {
      setIsLoadingList(false);
    }
  };

  const updateSidebarConversation = (conversationId, title) => {
    const safeTitle = title || t("chat.untitledChat");
    setSavedConversations((prev) => {
      const existing = prev.find((item) => item.id === conversationId);
      const updated = {
        ...(existing || {}),
        id: conversationId,
        title: safeTitle,
        created_at: existing?.created_at || new Date().toISOString(),
      };
      const without = prev.filter((item) => item.id !== conversationId);
      return [updated, ...without];
    });
  };

  const autoSaveConversation = async (snapshot) => {
    const hasMessagesToSave = snapshot.some((entry) => entry.role === "user");
    if (!hasMessagesToSave) return;

    const activeUserId = await getActiveUserId();
    const snapshotJson = JSON.stringify(snapshot);
    if (snapshotJson === lastSavedJsonRef.current && currentConversationIdRef.current) {
      setAutoSaveStatus("saved");
      return;
    }

    if (!activeUserId) {
      setAutoSaveStatus("local");
      return;
    }

    const title = currentConversationIdRef.current && currentConversationTitleRef.current
      ? currentConversationTitleRef.current
      : buildConversationTitle(snapshot, t);
    setAutoSaveStatus("saving");

    try {
      if (pendingCreateRef.current) {
        await pendingCreateRef.current.catch(() => null);
      }

      let conversationId = currentConversationIdRef.current;
      if (conversationId) {
        const response = await fetch(apiUrl(`/api/chat/conversations/${conversationId}`), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": activeUserId,
          },
          body: JSON.stringify({
            title,
            conversation: snapshot,
            user_id: activeUserId,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const reason = errorBody?.error ? `: ${errorBody.error}` : "";
          throw new Error(`Autosave failed${reason}`);
        }
        updateSidebarConversation(conversationId, title);
      } else {
        const createPromise = fetch(apiUrl("/api/chat/conversations"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": activeUserId,
          },
          body: JSON.stringify({
            title,
            conversation: snapshot,
            user_id: activeUserId,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errorBody = await response.json().catch(() => ({}));
              const reason = errorBody?.error ? `: ${errorBody.error}` : "";
              throw new Error(`Autosave failed${reason}`);
            }
            return response.json();
          })
          .then((data) => data?.conversation);

        pendingCreateRef.current = createPromise;
        const created = await createPromise;
        pendingCreateRef.current = null;
        if (!created?.id) throw new Error("Autosave failed: missing conversation id");
        conversationId = created.id;
        const createdTitle = created.title || title;
        currentConversationIdRef.current = conversationId;
        currentConversationTitleRef.current = createdTitle;
        setCurrentConversationId(conversationId);
        setCurrentConversationTitle(createdTitle);
        updateSidebarConversation(conversationId, createdTitle);
      }

      lastSavedJsonRef.current = snapshotJson;
      setAutoSaveStatus("saved");

      const latestJson = JSON.stringify(conversationRef.current);
      if (latestJson !== snapshotJson) {
        await autoSaveConversation(conversationRef.current);
      }
    } catch (error) {
      pendingCreateRef.current = null;
      setAutoSaveStatus("error");
      setSaveNotice(error.message || "Autosave failed.");
    }
  };

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    currentConversationTitleRef.current = currentConversationTitle;
  }, [currentConversationTitle]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    let mounted = true;
    const loadUser = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getUser();
      if (error) return;
      const uid = data?.user?.id || null;
      if (mounted) {
        currentUserIdRef.current = uid;
        setCurrentUserId(uid);
        if (uid) loadSavedConversations({ userId: uid, silent: true });
      }
    };
    loadUser();
    window.dispatchEvent(new CustomEvent("chibitek:pageReady", { detail: { page: "chat" } }));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    hasHydratedRef.current = true;
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
    setConversation((prev) => {
      const hasMessages = prev.some((entry) => entry.role === "user");
      if (hasMessages) return prev;
      if (!prev.length) return [{ role: "assistant", content: t("chat.defaultGreeting") }];
      if (prev.length === 1 && prev[0].role === "assistant") {
        if (prev[0].content === t("chat.defaultGreeting")) return prev;
        return [{ ...prev[0], content: t("chat.defaultGreeting") }];
      }
      return prev;
    });
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return undefined;
    const timer = window.setTimeout(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [conversation, isSending, attachments.length]);

  useEffect(() => {
    if (!hasHydratedRef.current || typeof window === "undefined") return;
    try {
      const toStore = JSON.stringify({
        message,
        conversation,
        attachments,
        currentConversationId,
        currentConversationTitle,
        isSidebarCollapsed,
      });
      window.localStorage.setItem(CHAT_STORAGE_KEY, toStore);
    } catch (err) {
      console.warn("Failed to persist chat", err);
    }
  }, [message, conversation, attachments, currentConversationId, currentConversationTitle, isSidebarCollapsed]);

  useEffect(() => {
    if (!hasHydratedRef.current || !hasUserMessages) return undefined;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveConversation(conversationRef.current);
    }, 900);
    return () => {
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [conversation, currentUserId, hasUserMessages]);

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
    if (isSending) return;
    if (!message.trim() && attachments.length === 0) return;

    const outgoingAttachments = attachments;
    const userMessage = {
      role: "user",
      content: message.trim() || t("chat.attachedFilesPrompt"),
      attachments: outgoingAttachments,
    };

    const updatedConversation = [...conversation, userMessage];
    setConversation(updatedConversation);
    setMessage("");
    setAttachments([]);
    setIsSending(true);
    setSaveNotice("");

    try {
      const activeUserId = await getActiveUserId();
      const modelMeta = getModelMeta(aiModelChoice);
      const controller = new AbortController();
      requestAbortRef.current = controller;
      const payloadMessages = updatedConversation.map(({ role, content }) => ({ role, content }));
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeUserId ? { "x-user-id": activeUserId } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: payloadMessages,
          attachments: outgoingAttachments,
          user_id: activeUserId || undefined,
          llmProvider: modelMeta?.provider,
          chatModel: aiModelChoice,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Chat request failed${reason}`);
      }

      const data = await response.json();
      setLastUsedProvider(data.provider || null);
      setLastUsedModel(data.model || null);
      setConversation((prev) => [...prev, { role: "assistant", content: data.reply || t("chat.noResponse") }]);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message?.includes("GITHUB_TOKEN")
            ? t("chat.missingToken")
            : t("chat.modelUnavailable"),
        },
      ]);
    } finally {
      requestAbortRef.current = null;
      setIsSending(false);
    }
  };

  const handleSummarizeRecentPosts = async () => {
    if (isSending) return;
    const visiblePrompt = { role: "user", content: t("chat.quickSummarizeSavedPosts") };
    setConversation((prev) => [...prev, visiblePrompt]);
    setIsSending(true);
    setSaveNotice("");

    try {
      const activeUserId = await getActiveUserId();
      const modelMeta = getModelMeta(aiModelChoice);
      const controller = new AbortController();
      requestAbortRef.current = controller;
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeUserId ? { "x-user-id": activeUserId } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [{ role: "user", content: SUMMARY_PROMPT }],
          user_id: activeUserId || undefined,
          llmProvider: modelMeta?.provider,
          chatModel: aiModelChoice,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`Chat request failed${reason}`);
      }

      const data = await response.json();
      setLastUsedProvider(data.provider || null);
      setLastUsedModel(data.model || null);
      setConversation((prev) => [...prev, { role: "assistant", content: data.reply || t("chat.noResponse") }]);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error?.message?.includes("GITHUB_TOKEN")
            ? t("chat.missingToken")
            : t("chat.modelUnavailable"),
        },
      ]);
    } finally {
      requestAbortRef.current = null;
      setIsSending(false);
    }
  };

  const handleStopGenerating = () => {
    if (!requestAbortRef.current) return;
    requestAbortRef.current.abort();
    requestAbortRef.current = null;
    setIsSending(false);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (isSending) return;
      handleSend();
    }
  };

  const handleFileButtonClick = () => fileInputRef.current?.click();

  const handleQuickPrompt = (prompt) => {
    if (isSending) return;
    setMessage(prompt);
  };

  const handleCopyMessage = async (content) => {
    if (!navigator?.clipboard || !content) return;
    try {
      await navigator.clipboard.writeText(content);
      setSaveNotice(t("chat.copiedMessage"));
    } catch {
      setSaveNotice(t("chat.copyFailed"));
    }
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const processed = await Promise.all(files.map((file) => fileToAttachment(file)));
      setAttachments((prev) => [...prev, ...processed]);
    } catch {
      setSaveNotice(t("chat.attachFailed"));
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

  const handleNewConversation = () => {
    setMessage("");
    setAttachments([]);
    setConversation(defaultConversation);
    setCurrentConversationId(null);
    setCurrentConversationTitle(null);
    currentConversationIdRef.current = null;
    currentConversationTitleRef.current = null;
    lastSavedJsonRef.current = "";
    setAutoSaveStatus("idle");
    setSaveNotice("");
  };

  const handleLoadConversation = async (conversationId) => {
    if (!conversationId) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) {
      setSaveNotice(t("chat.signInToLoad"));
      return;
    }
    setIsLoadingList(true);
    try {
      const response = await fetch(
        apiUrl(`/api/chat/conversations/${conversationId}?user_id=${encodeURIComponent(activeUserId)}`),
        { headers: { "x-user-id": activeUserId } }
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
        conversationRef.current = loadedConversation;
        setMessage("");
        setAttachments([]);
        const loadedTitle = data?.conversation?.title || buildConversationTitle(loadedConversation, t);
        setCurrentConversationId(conversationId);
        setCurrentConversationTitle(loadedTitle);
        currentConversationIdRef.current = conversationId;
        currentConversationTitleRef.current = loadedTitle;
        lastSavedJsonRef.current = JSON.stringify(loadedConversation);
        setAutoSaveStatus("saved");
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

  const handleDeleteConversation = async () => {
    const conversationId = deleteTarget?.id;
    if (!conversationId) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) {
      setSaveNotice(t("chat.signInToDelete"));
      return;
    }

    const previousList = savedConversations;
    const previousConversation = conversation;
    const previousMessage = message;
    const previousAttachments = attachments;
    const previousCurrentId = currentConversationId;
    const previousCurrentTitle = currentConversationTitle;

    setDeleteTarget(null);
    setSavedConversations((prev) => prev.filter((item) => item.id !== conversationId));
    if (currentConversationId === conversationId) handleNewConversation();

    setIsLoadingList(true);
    try {
      let response = await fetch(
        apiUrl(`/api/chat/conversations/${conversationId}?user_id=${encodeURIComponent(activeUserId)}`),
        {
          method: "DELETE",
          headers: { "x-user-id": activeUserId },
        }
      );

      if (response.status === 404 || response.status === 405) {
        response = await fetch(
          apiUrl(`/api/chat/conversations/${conversationId}/delete?user_id=${encodeURIComponent(activeUserId)}`),
          {
            method: "POST",
            headers: { "x-user-id": activeUserId },
          }
        );
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
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
        setCurrentConversationTitle(previousCurrentTitle);
        currentConversationIdRef.current = previousCurrentId;
        currentConversationTitleRef.current = previousCurrentTitle;
      }
    } finally {
      setIsLoadingList(false);
    }
  };


  const openRenameConversation = (item) => {
    if (!item?.id) return;
    setRenameTarget(item);
    setRenameValue(item.title || t("chat.untitledChat"));
  };

  const handleRenameConversation = async () => {
    const conversationId = renameTarget?.id;
    const nextTitle = renameValue.trim();
    if (!conversationId || !nextTitle) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) {
      setSaveNotice(t("chat.signInToRename"));
      return;
    }

    const previousList = savedConversations;
    const previousTitle = currentConversationTitle;
    setSavedConversations((prev) =>
      prev.map((item) => (item.id === conversationId ? { ...item, title: nextTitle } : item))
    );
    if (currentConversationId === conversationId) {
      setCurrentConversationTitle(nextTitle);
      currentConversationTitleRef.current = nextTitle;
    }
    setRenameTarget(null);

    try {
      const response = await fetch(apiUrl(`/api/chat/conversations/${conversationId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": activeUserId,
        },
        body: JSON.stringify({ title: nextTitle, user_id: activeUserId }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : "";
        throw new Error(`${t("chat.failedToRename")}${reason}`);
      }
      setSaveNotice(t("chat.chatRenamed"));
    } catch (error) {
      setSaveNotice(error.message || t("chat.failedToRename"));
      setSavedConversations(previousList);
      if (currentConversationId === conversationId) {
        setCurrentConversationTitle(previousTitle);
        currentConversationTitleRef.current = previousTitle;
      }
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

  const filteredConversations = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return savedConversations;
    return savedConversations.filter((item) => String(item.title || "").toLowerCase().includes(query));
  }, [savedConversations, chatSearch]);

  const autoSaveLabel = useMemo(() => {
    if (!hasUserMessages) return t("chat.newChatStatus");
    if (autoSaveStatus === "saving") return t("chat.saving");
    if (autoSaveStatus === "saved") return t("chat.savedStatus");
    if (autoSaveStatus === "local") return t("chat.savedLocally");
    if (autoSaveStatus === "error") return t("chat.autosaveIssue");
    return t("chat.autosaveOn");
  }, [autoSaveStatus, hasUserMessages]);

  return (
    <Box
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        padding: 10,
      }}
    >
      <Box
        data-tour="chat-root"
        style={{
          width: "100%",
          maxWidth: "min(1180px, calc(100vw - 20px))",
          height: "calc(100dvh - 20px)",
          marginInline: "auto",
          display: "grid",
          gridTemplateColumns: isSidebarCollapsed ? "58px minmax(0, 1fr)" : "clamp(238px, 23vw, 292px) minmax(0, 1fr)",
          gap: 10,
        }}
      >
        <Paper
          withBorder
          radius="lg"
          p={isSidebarCollapsed ? 6 : "xs"}
          style={{
            minWidth: 0,
            overflow: "hidden",
            background: "var(--surface-1)",
            borderColor: "var(--border-color)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {isSidebarCollapsed ? (
            <Stack align="center" gap={8} style={{ height: "100%" }}>
              <ActionIcon variant="subtle" color="gray" radius="xl" onClick={() => setIsSidebarCollapsed(false)} title={t("chat.openSidebar")}>
                <IconChevronRight size={18} />
              </ActionIcon>
              <ActionIcon variant="filled" color="blue" radius="xl" onClick={handleNewConversation} title={t("chat.newChat")}>
                <IconPlus size={18} />
              </ActionIcon>
              <ActionIcon variant="light" color="blue" radius="xl" onClick={() => setIsSidebarCollapsed(false)} title={t("chat.savedChats")}>
                <IconFolderOpen size={18} />
              </ActionIcon>
            </Stack>
          ) : (
            <>
              <Group justify="space-between" align="center" mb={8} wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Box
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--accent-soft)",
                      color: "var(--accent-primary)",
                      flexShrink: 0,
                    }}
                  >
                    <IconSparkles size={16} />
                  </Box>
                  <Box style={{ minWidth: 0 }}>
                    <Text fw={800} size="sm" truncate>
                      ChibitekAI
                    </Text>
                    <Text size="xs" c="dimmed">
                      {autoSaveLabel}
                    </Text>
                  </Box>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" color="gray" radius="xl" onClick={() => setIsSidebarCollapsed(true)} title={t("chat.collapseSidebar")}>
                    <IconChevronLeft size={17} />
                  </ActionIcon>
                  <ActionIcon variant="filled" color="blue" radius="xl" onClick={handleNewConversation} title={t("chat.newChat")}>
                    <IconPlus size={17} />
                  </ActionIcon>
                </Group>
              </Group>

              <TextInput
                placeholder={t("chat.searchChats")}
                value={chatSearch}
                onChange={(event) => setChatSearch(event.currentTarget.value)}
                size="xs"
                mb={8}
                styles={{ input: { background: "var(--surface-2)", color: "var(--text-primary)", minHeight: 30 } }}
              />

              <Group justify="space-between" mb={5} px={4}>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                  {t("chat.chatsHeading")}
                </Text>
                {isLoadingList ? <Loader size="xs" /> : null}
              </Group>

              <ScrollArea style={{ flex: 1 }} type="auto">
                <Stack gap={5} pr={5} data-tour="chat-history">
                  {filteredConversations.length ? (
                    filteredConversations.map((item) => {
                      const isActive = item.id === currentConversationId;
                      return (
                        <Paper
                          key={item.id}
                          withBorder
                          radius="md"
                          px="xs"
                          py={7}
                          onClick={() => handleLoadConversation(item.id)}
                          style={{
                            cursor: "pointer",
                            background: isActive ? "var(--accent-soft)" : "var(--surface-1)",
                            borderColor: isActive ? "var(--accent-primary)" : "var(--border-color)",
                            transition: "background 120ms ease, border-color 120ms ease",
                          }}
                        >
                          <Group justify="space-between" gap={6} wrap="nowrap" align="center">
                            <Box style={{ minWidth: 0, flex: 1 }}>
                              <Text size="sm" fw={isActive ? 800 : 600} truncate>
                                {getDisplayChatTitle(item.title, t)}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {formatChatDate(item.created_at)}
                              </Text>
                            </Box>
                            <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                              <Menu.Target>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="gray"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                  }}
                                  title={t("chat.options")}
                                  style={{ flexShrink: 0 }}
                                >
                                  <span style={{ fontSize: 19, lineHeight: 1 }}>⋯</span>
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                                <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={() => handleLoadConversation(item.id)}>
                                  {t("chat.open")}
                                </Menu.Item>
                                <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => openRenameConversation(item)}>
                                  {t("chat.rename")}
                                </Menu.Item>
                                <Menu.Item
                                  color="red"
                                  leftSection={<IconTrash size={14} />}
                                  onClick={() => setDeleteTarget(item)}
                                >
                                  {t("common.delete")}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>
                        </Paper>
                      );
                    })
                  ) : (
                    <Paper withBorder radius="md" p="sm" style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
                      <Text size="sm" c="dimmed" ta="center">
                        {chatSearch ? t("chat.noMatchingChats") : t("chat.autoSaveHint")}
                      </Text>
                    </Paper>
                  )}
                </Stack>
              </ScrollArea>
            </>
          )}
        </Paper>

        <Paper
          shadow="sm"
          radius="lg"
          p={0}
          withBorder
          style={{
            minWidth: 0,
            overflow: "hidden",
            background: "var(--surface-1)",
            borderColor: "var(--border-color)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            px="sm"
            py={8}
            style={{
              borderBottom: "1px solid var(--border-color)",
              background: "var(--surface-1)",
            }}
          >
            <Group justify="space-between" align="center" gap="sm" wrap="nowrap">
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Title order={1} style={{ fontSize: 17, margin: 0, lineHeight: 1.2 }} truncate="end">
                  {hasUserMessages ? getDisplayChatTitle(activeTitle, t, "chat.newChat") : t("chat.newChat")}
                </Title>
                <Group gap={6} mt={4} wrap="wrap">
                  <Badge size="xs" variant="light" color={autoSaveStatus === "error" ? "red" : "blue"}>
                    {autoSaveLabel}
                  </Badge>
                  {saveNotice ? (
                    <Badge size="xs" variant="light" color={saveNotice.toLowerCase().includes("fail") ? "red" : "gray"}>
                      {saveNotice}
                    </Badge>
                  ) : null}
                  {(lastUsedProvider || lastUsedModel) ? (
                    <Badge size="xs" variant="light" color="gray">
                      {lastUsedProvider || t("chat.model")} / {lastUsedModel || t("chat.unknown")}
                    </Badge>
                  ) : null}
                </Group>
              </Box>

              <Group gap="xs" wrap="nowrap">
                <Select
                  value={aiModelChoice}
                  onChange={(value) => value && setAiModelChoice(value)}
                  data={AI_MODEL_OPTIONS}
                  searchable
                  w={220}
                  size="xs"
                  placeholder={t("chat.chooseAiModel")}
                  disabled={isSending}
                />
                <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={handleNewConversation}>
                  {t("common.new")}
                </Button>
              </Group>
            </Group>
          </Box>

          <ScrollArea viewportRef={chatViewportRef} style={{ flex: 1 }} p="sm" type="auto" data-tour="chat-messages">
            <Box
              style={{
                width: "100%",
                maxWidth: 760,
                marginInline: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingRight: 10,
              }}
            >
              {conversation.map((entry, index) => {
                const isUser = entry.role === "user";
                return (
                  <Box
                    key={`${entry.role}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                    }}
                  >
                    <Paper
                      shadow="xs"
                      p={8}
                      withBorder={!isUser}
                      radius="lg"
                      style={{
                        width: isUser ? "fit-content" : "min(700px, 100%)",
                        maxWidth: isUser ? "72%" : "100%",
                        background: isUser ? "var(--chat-user-bg)" : "var(--chat-assistant-bg)",
                        borderColor: isUser ? "var(--chat-user-border)" : "var(--border-color)",
                      }}
                    >
                      <Group justify="space-between" align="center" mb={6} gap="xs" wrap="nowrap">
                        <Group gap={6} wrap="nowrap">
                          <Badge size="xs" variant="light" color={isUser ? "blue" : "gray"}>
                            {isUser ? t("chat.you") : t("chat.chibitekAI")}
                          </Badge>
                          {entry.attachments?.length ? (
                            <Badge size="xs" variant="light" color="gray">
                              {t("chat.filesAttached", { count: entry.attachments.length })}
                            </Badge>
                          ) : null}
                        </Group>
                        {!isUser ? (
                          <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => handleCopyMessage(entry.content)} title={t("chat.copyMessage")}>
                            <IconCopy size={14} />
                          </ActionIcon>
                        ) : null}
                      </Group>

                      <MessageContent content={entry.content} />

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
                );
              })}

              {!hasUserMessages ? (
                <Paper withBorder radius="lg" p="sm" style={{ background: "var(--surface-2)", borderColor: "var(--border-color)" }}>
                  <Text fw={800} mb={8}>
                    {t("chat.whatWorkOn")}
                  </Text>
                  <Group gap="xs" wrap="wrap" data-tour="chat-quick-actions">
                    {CHAT_QUICK_PROMPTS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Button
                          key={item.labelKey}
                          size="xs"
                          variant="light"
                          radius="xl"
                          leftSection={<Icon size={14} />}
                          onClick={() => handleQuickPrompt(t(item.promptKey))}
                          disabled={isSending}
                        >
                          {t(item.labelKey)}
                        </Button>
                      );
                    })}
                    <Button
                      size="xs"
                      variant="subtle"
                      radius="xl"
                      leftSection={<IconFileText size={14} />}
                      onClick={handleSummarizeRecentPosts}
                      disabled={isSending}
                    >
                      {t("chat.recentPostSummary")}
                    </Button>
                  </Group>
                </Paper>
              ) : null}

              {isSending ? (
                <Paper
                  withBorder
                  radius="lg"
                  p="sm"
                  style={{ alignSelf: "flex-start", background: "var(--chat-assistant-bg)", borderColor: "var(--border-color)" }}
                >
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text c="dimmed" size="sm">
                      {t("chat.thinking")}
                    </Text>
                  </Group>
                </Paper>
              ) : null}
            </Box>
          </ScrollArea>

          {attachments.length > 0 ? (
            <Group gap="xs" px="md" pt="sm" wrap="wrap">
              {attachmentBadges}
            </Group>
          ) : null}

          <Box
            p="sm"
            style={{
              borderTop: "1px solid var(--border-color)",
              background: "var(--surface-2)",
            }}
            data-tour="chat-composer"
          >
            <Box
              px={12}
              py={8}
              style={{
                width: "100%",
                maxWidth: 760,
                marginInline: "auto",
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                background: "var(--surface-1)",
                borderRadius: 18,
                boxShadow: "0 1px 6px var(--shadow)",
                border: "1px solid var(--border-color)",
              }}
            >
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleFileButtonClick} style={{ flexShrink: 0 }} title={t("chat.attachFiles")}>
                <IconPlus size={20} />
              </ActionIcon>

              <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />

              <Textarea
                placeholder={t("chat.askAnything")}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={handleKeyPress}
                variant="unstyled"
                size="sm"
                disabled={isSending}
                autosize
                minRows={1}
                maxRows={5}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    fontSize: 14,
                    padding: "6px 0",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    color: "var(--text-primary)",
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
                color={isSending ? "red" : "blue"}
                size="lg"
                radius="xl"
                onClick={isSending ? handleStopGenerating : handleSend}
                style={{ flexShrink: 0 }}
                title={isSending ? t("chat.stopGenerating") : t("chat.send")}
              >
                {isSending ? <IconPlayerStop size={18} /> : <IconSend size={18} />}
              </ActionIcon>
            </Box>
          </Box>
        </Paper>
      </Box>

      <Modal opened={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title={t("chat.renameChat")} centered>
        <TextInput
          label={t("chat.chatName")}
          value={renameValue}
          onChange={(event) => setRenameValue(event.currentTarget.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") handleRenameConversation();
          }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setRenameTarget(null)}>
            {t("chat.cancel")}
          </Button>
          <Button onClick={handleRenameConversation} disabled={!renameValue.trim()}>
            {t("chat.rename")}
          </Button>
        </Group>
      </Modal>

      <Modal opened={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={t("chat.deleteChatQuestion")} centered>
        <Text size="sm" c="dimmed" mb="md">
          {t("chat.deleteChatConfirm", { title: getDisplayChatTitle(deleteTarget?.title, t) })}
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setDeleteTarget(null)}>
            {t("chat.cancel")}
          </Button>
          <Button color="red" leftSection={<IconTrash size={16} />} onClick={handleDeleteConversation} loading={isLoadingList}>
            {t("chat.deleteChat")}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
