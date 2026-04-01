import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { MarkdownRenderer } from './MarkdownRenderer.js';

interface StreamingTextProps {
  /** The async generator that yields text delta strings. */
  stream: AsyncGenerator<string>;
  /** Called when streaming is complete with the full text. */
  onComplete: (fullText: string) => void;
  /** Called on error. */
  onError: (err: Error) => void;
}

type Phase = 'streaming' | 'done';

/**
 * Consumes a text stream and renders it progressively.
 *
 * While streaming: renders raw text (avoids partial markdown artefacts).
 * When done: switches to full MarkdownRenderer for final, formatted output.
 */
export const StreamingText: React.FC<StreamingTextProps> = ({ stream, onComplete, onError }) => {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('streaming');
  const accumulated = useRef('');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        for await (const delta of stream) {
          if (!active) break;
          accumulated.current += delta;
          setText(accumulated.current);
        }
        if (active) {
          setPhase('done');
          onComplete(accumulated.current);
        }
      } catch (err) {
        if (active) {
          onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') {
    // Wrap completed response in the same speech-bubble style as Message
    return (
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
          flexDirection="column"
        >
          <MarkdownRenderer text={text} />
        </Box>
      </Box>
    );
  }

  // While streaming: same speech-bubble, raw text + blinking cursor
  return (
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
        <Text wrap="wrap">{text}<Text color="cyan">▋</Text></Text>
      </Box>
    </Box>
  );
};
