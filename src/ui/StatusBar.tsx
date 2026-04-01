import React from 'react';
import { Box, Text } from 'ink';
import type { DavConfig } from '../config/types.js';
import { getEffectiveModel } from '../config/loader.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';

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

  const tokenStr =
    tokenCount !== undefined && tokenCount > 0
      ? ` · ${tokenCount.toLocaleString()} tokens`
      : '';

  // On narrow terminals (< 60 cols) omit the model name to avoid wrapping
  const label =
    columns >= 60
      ? `${providerLabel} · ${model}${tokenStr}`
      : `${providerLabel}${tokenStr}`;

  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      marginTop={1}
    >
      <Text dimColor>{label}</Text>
    </Box>
  );
};
