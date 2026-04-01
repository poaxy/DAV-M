import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBarProps {
  /** Whether this input is currently focused and accepting keyboard input. */
  isActive: boolean;
  /** Called when the user submits a non-empty query. */
  onSubmit: (query: string) => void;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
}

/**
 * Full-width text input bar rendered at the bottom of the interactive UI.
 *
 * Uses `ink-text-input` for cursor management and history. The `focus` prop
 * mirrors `isActive` so that only one input captures keystrokes at a time.
 */
export const InputBar: React.FC<InputBarProps> = ({
  isActive,
  onSubmit,
  placeholder = 'Ask anything… (/ for commands)',
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (val: string) => {
    const trimmed = val.trim();
    if (trimmed) {
      setValue('');
      onSubmit(trimmed);
    }
  };

  return (
    <Box
      borderStyle="round"
      borderColor={isActive ? 'cyan' : 'gray'}
      paddingX={1}
      marginTop={1}
    >
      <Text color="cyan" bold>
        {'❯ '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        focus={isActive}
      />
    </Box>
  );
};
