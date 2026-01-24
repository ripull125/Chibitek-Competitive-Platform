// client/src/pages/Chat.jsx (or ChatInput.jsx if that's the file name you use)
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconFolderOpen,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlus,
  IconRefresh,
  IconSend,
} from '@tabler/icons-react';
import { IconTrash } from '@tabler/icons-react';

import { apiBase } from '../utils/api';

const CHAT_STORAGE_KEY = 'chibitek-chat-state';

const backendUrl = apiBase;

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const defaultConversation = [
  {
    role: 'assistant',
    content: 'Hi! I am ChibitekAI. Ask me anything about your competitive research.',
  },
];

const loadPersistedChat = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage?.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to load saved chat', err);
    return null;
  }
};

const fileToAttachment = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isTextLike = file.type.startsWith('text/') || file.type.includes('json');
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        content: content.slice(0, 12000),
      });
    };
    reader.onerror = () => reject(reader.error);
    if (isTextLike) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });

const buildConversationTitle = (entries) => {
  const firstUserMessage = entries.find((entry) => entry.role === 'user' && entry.content);
  if (!firstUserMessage) return 'New chat';
  const trimmed = firstUserMessage.content.trim();
  if (!trimmed) return 'New chat';
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
};

export default function ChatInput() {
  const persisted = useMemo(() => loadPersistedChat(), []);
  const [message, setMessage] = useState(persisted?.message ?? '');
  const [conversation, setConversation] = useState(persisted?.conversation ?? defaultConversation);
  const [attachments, setAttachments] = useState(persisted?.attachments ?? []);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [savedConversations, setSavedConversations] = useState([]);
  const [saveNotice, setSaveNotice] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const hasHydratedRef = useRef(false);
  const [currentConversationId, setCurrentConversationId] = useState(persisted?.currentConversationId ?? null);


  useEffect(() => {
    hasHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current || typeof window === 'undefined') return;
    try {
      const toStore = JSON.stringify({ message, conversation, attachments, currentConversationId });
      window.localStorage.setItem(CHAT_STORAGE_KEY, toStore);
    } catch (err) {
      console.warn('Failed to persist chat', err);
    }
  }, [message, conversation, attachments, currentConversationId]);

  useEffect(() => {
    if (!SpeechRecognition) return undefined;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(' ');
      setMessage((prev) => `${prev ? `${prev} ` : ''}${transcript}`.trim());
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, []);

  const handleSend = async () => {
    if (!message.trim() && attachments.length === 0) return;
    const userMessage = {
      role: 'user',
      content: message.trim() || 'See attached files for context.',
      attachments,
    };
    const updatedConversation = [...conversation, userMessage];
    setConversation(updatedConversation);
    setMessage('');
    setAttachments([]);
    setIsSending(true);

    try {
      const payloadMessages = updatedConversation.map(({ role, content }) => ({ role, content }));
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payloadMessages, attachments }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Chat request failed${reason}`);
      }

      const data = await response.json();
      setConversation((prev) => [...prev, { role: 'assistant', content: data.reply || 'No response.' }]);
    } catch (error) {
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error?.message?.includes('OPENAI_API_KEY')
            ? 'Server is missing the OpenAI API key. Please add it and try again.'
            : 'Sorry, I could not reach the language model right now.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
      // ignore
    } finally {
      event.target.value = '';
    }
  };

  const toggleListening = () => {
    if (!SpeechRecognition || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
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
    setIsSaving(true);
    setSaveNotice('');
    try {
      const response = await fetch(`${backendUrl}/api/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleOverride || buildConversationTitle(conversation),
          conversation,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Failed to save${reason}`);
      }
      setSaveNotice('Conversation saved.');
    } catch (error) {
      setSaveNotice(error.message || 'Failed to save conversation.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSaveModal = () => {
    setSaveTitle(buildConversationTitle(conversation));
    setSaveModalOpen(true);
  };

  const handleConfirmSave = async () => {
    await handleSaveConversation(saveTitle.trim() || buildConversationTitle(conversation));
    setSaveModalOpen(false);
  };

  const handleNewConversation = () => {
    setMessage('');
    setAttachments([]);
    setConversation(defaultConversation);
    setCurrentConversationId(null);
  };

  const handleOpenLoadModal = async () => {
    setLoadModalOpen(true);
    setIsLoadingList(true);
    try {
      const response = await fetch(`${backendUrl}/api/chat/conversations`);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Failed to load conversations${reason}`);
      }
      const data = await response.json();
      setSavedConversations(data.conversations || []);
    } catch (error) {
      setSavedConversations([]);
      setSaveNotice(error.message || 'Failed to load conversations.');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleLoadConversation = async (conversationId) => {
    if (!conversationId) return;
    setIsLoadingList(true);
    try {
      const response = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}`);
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Failed to load chat${reason}`);
      }
      const data = await response.json();
      const loadedConversation = data?.conversation?.conversation || data?.conversation;
      if (Array.isArray(loadedConversation)) {
        setConversation(loadedConversation);
        setMessage('');
        setAttachments([]);
        setLoadModalOpen(false);
        setSaveNotice('');
        setCurrentConversationId(conversationId);
      } else {
        throw new Error('Saved conversation is invalid.');
      }
    } catch (error) {
      setSaveNotice(error.message || 'Failed to load conversation.');
    } finally {
      setIsLoadingList(false);
    } 
  };

  const handleDeleteConversation = async (conversationId) => {
    if (!conversationId) return;

    setIsLoadingList(true);
    setSaveNotice('');

    const remainingConversations = savedConversations.filter((c) => c.id !== conversationId);

    try {
      const response = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: {
          // Only needed if you set SCRAPER_AUTH on the server
          ...(import.meta.env.VITE_SCRAPER_AUTH
            ? { 'x-scraper-auth': import.meta.env.VITE_SCRAPER_AUTH }
            : {}),
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody?.error ? `: ${errorBody.error}` : '';
        throw new Error(`Failed to delete${reason}`);
      }

      // Update UI immediately without refetch
      setSavedConversations(remainingConversations);

      if (conversationId === currentConversationId) {
        setConversation(defaultConversation);
        setMessage('');
        setAttachments([]);
        setCurrentConversationId(null);
        setLoadModalOpen(false);
      }

      
      setSaveNotice('Conversation deleted.');
    } catch (error) {
      setSaveNotice(error.message || 'Failed to delete conversation.');
    } finally {
      setIsLoadingList(false);
    }
  };


  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        padding: '24px',
        transition: 'background-color 0.3s ease',
      }}
    >
      {/* Centered, constrained width container */}
      <Box
        style={{
          width: '100%',
          maxWidth: 'clamp(720px, 80vw, 980px)',
          marginInline: 'auto',
        }}
      >
        <Box style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title
            style={{
              fontSize: 32,
              fontWeight: 400,
              color: 'var(--text-primary)',
              margin: 0,
              transition: 'color 0.3s ease',
            }}
          >
            ChibitekAI
          </Title>
          <Text c="dimmed" mt={6}>
            Chat with the model, attach files for context, or speak your prompt.
          </Text>
          {saveNotice ? (
            <Text size="sm" c="dimmed" mt={6}>
              {saveNotice}
            </Text>
          ) : null}
          <Group justify="center" mt="md">
            <Menu shadow="md" width={240}>
              <Menu.Target>
                <Button variant="light">Chat options</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconDeviceFloppy size={16} />}
                  onClick={handleOpenSaveModal}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save conversation'}
                </Menu.Item>
                <Menu.Item leftSection={<IconFolderOpen size={16} />} onClick={handleOpenLoadModal}>
                  Load saved chat
                </Menu.Item>
                <Menu.Item leftSection={<IconRefresh size={16} />} onClick={handleNewConversation}>
                  Start a new chat
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Box>

        <Paper shadow="sm" radius="lg" p="md" withBorder>
          <ScrollArea style={{ height: '56vh' }} pr="md">
            <Box style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {conversation.map((entry, index) => (
                <Box
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Paper
                    shadow="xs"
                    p="sm"
                    withBorder
                    style={{
                      maxWidth: '76%', // message bubble width cap
                      backgroundColor: entry.role === 'user' ? '#e7f5ff' : 'white',
                    }}
                  >
                    <Text size="xs" c="dimmed" mb={4}>
                      {entry.role === 'user' ? 'You' : 'ChibitekAI'}
                    </Text>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{entry.content}</Text>
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
                  <Text c="dimmed">Thinking...</Text>
                </Group>
              ) : null}
            </Box>
          </ScrollArea>

          {attachments.length > 0 ? (
            <Group gap="xs" mt="md" wrap="wrap">
              {attachmentBadges}
            </Group>
          ) : null}

          <Box
            mt="md"
            px={12}
            py={8}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              backgroundColor: 'white',
              borderRadius: 50,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
              border: '1px solid #e9ecef',
            }}
          >
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleFileButtonClick} style={{ flexShrink: 0 }}>
              <IconPlus size={20} />
            </ActionIcon>
            <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

            <TextInput
              placeholder="Ask anything"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              variant="unstyled"
              size="md"
              disabled={isSending}
              style={{ flex: 1 }}
              styles={{
                input: {
                  fontSize: 16,
                  padding: '8px 0',
                  border: 'none',
                  outline: 'none',
                  '&:focus': { outline: 'none', border: 'none' },
                  '&::placeholder': { color: '#adb5bd' },
                },
              }}
            />

            <ActionIcon
              variant="subtle"
              color={isListening ? 'red' : 'gray'}
              size="lg"
              onClick={toggleListening}
              style={{ flexShrink: 0 }}
              title={SpeechRecognition ? 'Speak your prompt' : 'Speech recognition unavailable'}
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
      </Box>
      <Modal
        opened={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        title="Saved conversations"
        centered
      >
        {isLoadingList ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text c="dimmed">Loading...</Text>
          </Group>
        ) : savedConversations.length ? (
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {savedConversations.map((item) => (
              <Paper
                key={item.id}
                withBorder
                p="sm"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
              >
                <Box>
                  <Text size="sm" fw={500}>
                    {item.title || 'Untitled chat'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                  </Text>
                </Box>
                <Group gap="xs">
                  <Button size="xs" variant="light" onClick={() => handleLoadConversation(item.id)}>
                    Open
                  </Button>

                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => {
                      const ok = window.confirm(
                        `Delete "${item.title || 'Untitled chat'}"? This can’t be undone.`
                      );
                      if (ok) handleDeleteConversation(item.id);
                    }}
                  >
                    Delete
                  </Button>
                </Group>

              </Paper>
            ))}
          </Box>
        ) : (
          <Text c="dimmed" size="sm">
            No saved conversations yet.
          </Text>
        )}
      </Modal>
      <Modal opened={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="Name this chat" centered>
        <TextInput
          label="Chat name"
          placeholder="e.g. Acme competitor research"
          value={saveTitle}
          onChange={(event) => setSaveTitle(event.currentTarget.value)}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setSaveModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirmSave} loading={isSaving}>
            Save
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}
