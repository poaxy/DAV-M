import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffView } from './DiffView.js';
import type { ConfirmOptions } from '../tools/types.js';

interface ConfirmPromptProps extends ConfirmOptions {
  /** Whether input is active (only the topmost confirmation should be active). */
  isActive: boolean;
  /** Called when user confirms or denies. */
  onDecision: (confirmed: boolean) => void;
}

/**
 * Inline confirmation prompt for tool execution.
 *
 * Shows a colored diff when `patch` is present (write/edit operations),
 * then prompts the user for y/n.
 *
 * Uses `useInput` with `isActive` so only this component captures keys
 * while it's visible.
 *
 * Accepts:  y / Enter  → confirm
 * Declines: n / Escape → deny
 */
export const ConfirmPrompt: React.FC<ConfirmPromptProps> = ({
  toolName,
  description,
  isDangerous,
  patch,
  isActive,
  onDecision,
}) => {
  const [decided, setDecided] = useState(false);
  const [answer, setAnswer] = useState<boolean | null>(null);

  useInput(
    (input, key) => {
      if (decided) return;

      if (input.toLowerCase() === 'y' || key.return) {
        setDecided(true);
        setAnswer(true);
        onDecision(true);
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setDecided(true);
        setAnswer(false);
        onDecision(false);
      }
    },
    { isActive: isActive && !decided },
  );

  const toolLabel =
    toolName === 'exec_shell' ? 'Run command' :
    toolName === 'write_file' ? 'Write file' :
    toolName === 'edit_file'  ? 'Edit file' :
    'Proceed';

  const hasDiff = patch !== undefined && patch.hunks.length > 0;

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      marginBottom={1}
      borderStyle="round"
      borderColor={isDangerous ? 'red' : 'yellow'}
      paddingX={1}
    >
      {/* Warning header */}
      {isDangerous && (
        <Box marginBottom={1}>
          <Text color="red" bold>⚠  Dangerous command detected</Text>
        </Box>
      )}

      {/* Tool label */}
      <Text color="yellow" bold>
        {toolLabel}:
      </Text>

      {/* Description lines */}
      {description.split('\n').map((line, i) => (
        <Text key={i} color={line.startsWith('$') ? 'cyan' : 'white'}>
          {line.startsWith('$') ? '' : '  '}{line}
        </Text>
      ))}

      {/* Diff preview — shown before the y/n prompt for file ops */}
      {hasDiff && !decided && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Changes:</Text>
          <DiffView patch={patch!} />
        </Box>
      )}

      {/* Prompt or result */}
      <Box marginTop={1}>
        {!decided ? (
          <Text>
            <Text dimColor>[</Text>
            <Text color="green" bold>y</Text>
            <Text dimColor>]es  [</Text>
            <Text color="red" bold>n</Text>
            <Text dimColor>]o</Text>
          </Text>
        ) : answer ? (
          <Text color="green">✔ Confirmed</Text>
        ) : (
          <Text color="red">✖ Declined</Text>
        )}
      </Box>
    </Box>
  );
};
