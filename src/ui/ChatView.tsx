import React from 'react';
import { Box, Text } from 'ink';
import { Message, type MessageData } from './Message.js';
import { Spinner } from './Spinner.js';
import { StreamingText } from './StreamingText.js';
import { ToolCallView, type ToolCallState } from './ToolCallView.js';
import { InputBar } from './InputBar.js';

interface ChatViewProps {
  /** Completed conversation messages. */
  history: MessageData[];
  /** Phase of the current turn. */
  phase: 'thinking' | 'streaming' | 'idle';
  // ── Non-execute mode ──────────────────────────────────────────────────────
  /** Live stream of text deltas from simple streamResponse() */
  stream?: AsyncGenerator<string>;
  onStreamComplete?: (text: string) => void;
  onStreamError?: (err: Error) => void;
  // ── Execute mode ──────────────────────────────────────────────────────────
  /** All tool invocations for the current agent run. */
  toolCalls?: ToolCallState[];
  /** Streaming text between or after tool calls. */
  streamingText?: string;
  // ── Interactive mode ──────────────────────────────────────────────────────
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
  stream,
  onStreamComplete,
  onStreamError,
  toolCalls,
  streamingText,
  isInteractive,
  inputActive,
  onInputSubmit,
}) => {
  const isExecuteMode = toolCalls !== undefined;

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>
      {/* Completed conversation history */}
      {history.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}

      {/* Execute mode: tool calls + inline streaming text */}
      {isExecuteMode && (
        <Box flexDirection="column">
          {toolCalls!.map((tc) => (
            <ToolCallView key={tc.id} toolCall={tc} />
          ))}
          {streamingText && phase === 'streaming' && (
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
          )}
        </Box>
      )}

      {/* Non-execute mode: spinner or stream */}
      {!isExecuteMode && (
        <>
          {phase === 'thinking' && <Spinner text="Thinking" />}
          {phase === 'streaming' && stream && onStreamComplete && onStreamError && (
            <StreamingText
              stream={stream}
              onComplete={onStreamComplete}
              onError={onStreamError}
            />
          )}
        </>
      )}

      {/* Execute mode thinking indicator (before first event) */}
      {isExecuteMode && phase === 'thinking' && <Spinner text="Thinking" />}

      {/* Interactive mode input bar — shown when idle/waiting for input */}
      {isInteractive && phase === 'idle' && onInputSubmit && (
        <InputBar
          isActive={inputActive ?? false}
          onSubmit={onInputSubmit}
        />
      )}
    </Box>
  );
};
