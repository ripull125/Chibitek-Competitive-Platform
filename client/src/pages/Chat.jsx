import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconMicrophone, IconMicrophoneOff, IconSend } from '@tabler/icons-react';

const resolveBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
};

const backendUrl = resolveBackendUrl();

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

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

export default function ChatInput() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState([
    {
      role: 'assistant',
      content: 'Hi! I am ChibitekAI. Ask me anything about your competitive research.',
    },
  ]);
  const [attachments, setAttachments] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

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

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

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
          content:
            error?.message?.includes('OPENAI_API_KEY')
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

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const processed = await Promise.all(files.map((file) => fileToAttachment(file)));
      setAttachments((prev) => [...prev, ...processed]);
    } catch (err) {
      console.error('Failed to read attachments', err);
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

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        padding: '32px 16px',
      }}
    >
      <Box style={{ width: '100%', maxWidth: 900 }}>
        <Box style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title order={1} style={{ fontWeight: 500, color: '#212529' }}>
            ChibitekAI
          </Title>
          <Text c="dimmed" mt={6}>
            Chat with the model, attach files for context, or speak your prompt.
          </Text>
        </Box>

        <Paper shadow="sm" radius="lg" p="md" withBorder>
          <ScrollArea style={{ height: '50vh' }} pr="md">
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
                      maxWidth: '80%',
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
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

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
                  '&:focus': {
                    outline: 'none',
                    border: 'none',
                  },
                  '&::placeholder': {
                    color: '#adb5bd',
                  },
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
    </Box>
  );
}
