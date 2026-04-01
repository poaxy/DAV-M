import React from 'react';
import { Box, Text } from 'ink';
import { Message, type MessageData } from './Message.js';
import { Spinner } from './Spinner.js';
import { ToolCallView, type ToolCallState } from './ToolCallView.js';
import { InputBar } from './InputBar.js';

interface ChatViewProps {
  /** Completed conversation messages. */
  history: MessageData[];
  /** Phase of the current turn. */
  phase: 'thinking' | 'streaming' | 'idle';
  /** Tool invocations (execute mode only — undefined in stream mode). */
  toolCalls?: ToolCallState[];
  /**
   * Live streaming text for the current turn.
   * Used in both execute mode (between tool calls) and stream mode.
   */
  streamingText?: string;
  /** True when running as dav -i. Shows InputBar when idle. */
  isInteractive?: boolean;
  /** Whether the InputBar should capture keyboard input. */
  inputActive?: boolean;
  /** Called when the user submits a query from the InputBar. */
  onInputSubmit?: (query: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  history,
  phase,
  toolCalls,
  streamingText,
  isInteractive,
  inputActive,
  onInputSubmit,
}) => {
  const isExecuteMode = toolCalls !== undefined;

  // Live speech bubble — shown during streaming in both modes
  const streamingBubble = streamingText && phase === 'streaming' ? (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor bold>dav</Text>
      <Box
        borderStyle="single"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor="blue"
        paddingLeft={1}
      >
        <Text wrap="wrap">{streamingText}<Text color="cyan">▋</Text></Text>
      </Box>
    </Box>
  ) : null;

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>

      {/* Completed conversation history */}
      {history.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}

      {/* Execute mode: tool calls then streaming text */}
      {isExecuteMode && (
        <Box flexDirection="column">
          {toolCalls.map((tc) => (
            <ToolCallView key={tc.id} toolCall={tc} />
          ))}
          {streamingBubble}
        </Box>
      )}

      {/* Stream mode: spinner or live bubble */}
      {!isExecuteMode && (
        <>
          {phase === 'thinking' && <Spinner text="Thinking" />}
          {streamingBubble}
        </>
      )}

      {/* Execute mode thinking indicator (before first tool call) */}
      {isExecuteMode && phase === 'thinking' && <Spinner text="Thinking" />}

      {/* Interactive input bar */}
      {isInteractive && phase === 'idle' && onInputSubmit && (
        <InputBar
          isActive={inputActive ?? false}
          onSubmit={onInputSubmit}
        />
      )}

    </Box>
  );
};
