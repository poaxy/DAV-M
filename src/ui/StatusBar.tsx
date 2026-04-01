import React from 'react';
import { Box, Spacer, Text } from 'ink';
import type { DavConfig } from '../config/types.js';
import { getEffectiveModel } from '../config/loader.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { COLORS } from './theme.js';

interface StatusBarProps {
  config: DavConfig;
  tokenCount?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ config, tokenCount }) => {
  const { columns } = useTerminalSize();
  const model = getEffectiveModel(config);

  const providerLabel =
    config.provider === 'anthropic' ? 'Anthropic' :
    config.provider === 'openai'    ? 'OpenAI'    :
    'Google';

  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor="gray"
      marginTop={1}
      paddingX={1}
    >
      {/* Left: brand */}
      <Box gap={1}>
        <Text bold color={COLORS.brand}>dav</Text>
        <Text dimColor>·</Text>
        <Text dimColor>{providerLabel}</Text>
      </Box>

      <Spacer />

      {/* Right: model + tokens */}
      <Box gap={1}>
        {tokenCount !== undefined && tokenCount > 0 && (
          <>
            <Text dimColor>{tokenCount.toLocaleString()} tokens</Text>
            <Text dimColor>·</Text>
          </>
        )}
        {columns >= 60 && <Text dimColor>{model}</Text>}
      </Box>
    </Box>
  );
};
