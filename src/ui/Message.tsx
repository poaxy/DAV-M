import React from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { COLORS } from './theme.js';

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
      <Box marginBottom={1} gap={1}>
        <Text color={COLORS.user} bold>❯</Text>
        <Text wrap="wrap">{message.content}</Text>
      </Box>
    );
  }

  // Assistant: dim "dav" label + left-border speech bubble
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor bold>dav</Text>
      <Box
        borderStyle="single"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor={COLORS.assistantBorder}
        paddingLeft={1}
        flexDirection="column"
      >
        <MarkdownRenderer text={message.content} />
      </Box>
    </Box>
  );
};
