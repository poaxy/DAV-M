import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from './MarkdownRenderer.js';

export interface MessageData {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageProps {
  message: MessageData;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  if (message.role === 'user') {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color="green" bold>{'> '}<Text color="white" bold={false}>{message.content}</Text></Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1} flexDirection="column">
      <MarkdownRenderer text={message.content} />
    </Box>
  );
};
