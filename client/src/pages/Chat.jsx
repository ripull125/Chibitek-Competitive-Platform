import React, { useState } from 'react';
import { TextInput, ActionIcon, Container, Box } from '@mantine/core';
import { IconPlus, IconMicrophone, IconSend } from '@tabler/icons-react';

export default function ChatInput() {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      console.log('Sending message:', message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <Box style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: '#f8f9fa',
      padding: '0 40px'
    }}>
      <Box style={{ width: '100%' }}>
        <Box style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ 
            fontSize: 32, 
            fontWeight: 400, 
            color: '#212529',
            margin: 0 
          }}>
            ChibitekAI
          </h1>
        </Box>
        
        <Box style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          backgroundColor: 'white',
          padding: '8px 12px',
          borderRadius: 50,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          border: '1px solid #e9ecef'
        }}>
          <ActionIcon 
            variant="subtle" 
            color="gray"
            size="lg"
            style={{ flexShrink: 0 }}
          >
            <IconPlus size={20} />
          </ActionIcon>

          <TextInput
            placeholder="Ask anything"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            variant="unstyled"
            size="md"
            style={{ flex: 1 }}
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

          <ActionIcon 
            variant="subtle" 
            color="gray"
            size="lg"
            style={{ flexShrink: 0 }}
          >
            <IconMicrophone size={20} />
          </ActionIcon>

          <ActionIcon 
            variant="filled"
            color="blue"
            size="lg"
            radius="xl"
            onClick={handleSend}
            style={{ flexShrink: 0 }}
          >
            <IconSend size={18} />
          </ActionIcon>
        </Box>
      </Box>
    </Box>
  );
}