import React, { useState } from 'react';
import {
  TextInput,
  ActionIcon,
  Box,
  Paper,
  ScrollArea,
  Text,
  Group,
  Badge,
  Button
} from '@mantine/core';
import { IconPlus, IconMicrophone, IconSend } from '@tabler/icons-react';

const formatAssistantReply = (prompt) => {
  if (!prompt) return "I'm here whenever you're ready.";
  if (prompt.length < 12) return "Can you share a few more details so I can help?";
  if (/\?$/.test(prompt.trim())) return "Here's what I think: " + prompt.trim();
  return `I captured your note: "${prompt.trim()}". What would you like to do with this?`;
};

const quickPrompts = [
  'Summarize competitor announcements from today',
  'Give me three SEO keywords for our latest blog',
  'Draft a short email for a product update'
];

const MessageBubble = ({ role, content, timestamp }) => {
  const isUser = role === 'user';
  return (
    <Group
      align="flex-start"
      justify={isUser ? 'flex-end' : 'flex-start'}
      style={{ width: '100%' }}
      spacing={8}
    >
      {!isUser && (
        <Badge color="gray" variant="light" radius="sm">
          AI
        </Badge>
      )}
      <Paper
        radius="lg"
        p="sm"
        shadow="xs"
        style={{
          maxWidth: '80%',
          backgroundColor: isUser ? '#1c7ed6' : '#f1f3f5',
          color: isUser ? 'white' : '#212529'
        }}
      >
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {content}
        </Text>
        <Text size="xs" c={isUser ? 'blue.1' : 'dimmed'} mt={6}>
          {timestamp}
        </Text>
      </Paper>
      {isUser && (
        <Badge color="blue" variant="light" radius="sm">
          You
        </Badge>
      )}
    </Group>
  );
};

export default function ChatInput() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi, I am ChibitekAI. Ask me anything about your competitive research.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isResponding, setIsResponding] = useState(false);

  const handleSend = (text = message) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMessage = { id: Date.now().toString(), role: 'user', content: trimmed, timestamp: now };

    setMessages((prev) => [...prev, newMessage]);
    setMessage('');
    setIsResponding(true);

    setTimeout(() => {
      const reply = formatAssistantReply(trimmed);
      const response = {
        id: `${Date.now()}-ai`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, response]);
      setIsResponding(false);
    }, 500);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        padding: '40px'
      }}
    >
      <Box style={{ width: '100%', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Box style={{ textAlign: 'center' }}>
          <Text fw={500} size={32} c="#212529" style={{ margin: 0 }}>
            ChibitekAI
          </Text>
          <Text c="dimmed" mt={6}>
            Start chatting to explore insights, track competitors, and manage your research notes.
          </Text>
        </Box>

        <ScrollArea style={{ height: '60vh' }} type="always" scrollbarSize={10} offsetScrollbars>
          <Box style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} {...msg} />
            ))}
            {isResponding && (
              <Text size="sm" c="dimmed" pl={4}>
                ChibitekAI is typing…
              </Text>
            )}
          </Box>
        </ScrollArea>

        <Group gap={12} wrap="wrap">
          {quickPrompts.map((prompt) => (
            <Button
              key={prompt}
              variant="subtle"
              color="gray"
              radius="xl"
              onClick={() => handleSend(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </Group>

        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: 'white',
            padding: '8px 12px',
            borderRadius: 50,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e9ecef'
          }}
        >
          <ActionIcon variant="subtle" color="gray" size="lg" style={{ flexShrink: 0 }} aria-label="New chat">
            <IconPlus size={20} />
          </ActionIcon>

          <TextInput
            placeholder="Ask anything"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            variant="unstyled"
            size="md"
            style={{ flex: 1 }}
            aria-label="Message input"
            styles={{
              input: {
                fontSize: 16,
                padding: '8px 0',
                border: 'none',
                outline: 'none',
                '&:focus': {
                  outline: 'none',
                  border: 'none'
                },
                '&::placeholder': {
                  color: '#adb5bd'
                }
              }
            }}
          />

          <ActionIcon variant="subtle" color="gray" size="lg" style={{ flexShrink: 0 }} aria-label="Voice input">
            <IconMicrophone size={20} />
          </ActionIcon>

          <ActionIcon
            variant="filled"
            color="blue"
            size="lg"
            radius="xl"
            onClick={() => handleSend()}
            style={{ flexShrink: 0 }}
            disabled={!message.trim()}
            aria-label="Send message"
          >
            <IconSend size={18} />
          </ActionIcon>
        </Box>
      </Box>
    </Box>
  );
}
