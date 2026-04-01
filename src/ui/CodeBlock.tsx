import React from 'react';
import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  let rendered: string;

  try {
    rendered = highlight(code.trimEnd(), {
      language: language ?? 'plaintext',
      ignoreIllegals: true,
    });
  } catch {
    rendered = code.trimEnd();
  }

  const langLabel = language ?? '';

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {langLabel && (
        <Text backgroundColor="gray" color="white"> {langLabel} </Text>
      )}
      <Box
        paddingLeft={2}
        paddingTop={0}
        paddingBottom={0}
        borderStyle="single"
        borderLeft
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderColor="gray"
      >
        <Text>{rendered}</Text>
      </Box>
    </Box>
  );
};
