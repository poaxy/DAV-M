import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { COLORS, TOOL_SYMBOLS, TOOL_LABELS } from './theme.js';

export interface ToolCallState {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'error' | 'denied';
  output?: string;
}

interface ToolCallViewProps {
  toolCall: ToolCallState;
}

/**
 * Displays a single tool invocation — status, label, primary arg, and output.
 */
export const ToolCallView: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const { toolName, input, status, output } = toolCall;

  const symbol    = TOOL_SYMBOLS[toolName] ?? '○';
  const label     = TOOL_LABELS[toolName]  ?? toolName;
  const primaryArg = getPrimaryArg(toolName, input);

  const statusMark =
    status === 'success' ? '✔' :
    status === 'denied'  ? '—' :
    status === 'error'   ? '✖' : '';

  const statusColor =
    status === 'running' ? COLORS.toolRunning :
    status === 'success' ? COLORS.toolSuccess :
    status === 'denied'  ? COLORS.toolDenied  :
    COLORS.toolError;

  return (
    <Box flexDirection="column" marginBottom={1}>

      {/* Header row ── symbol  LABEL  path/arg */}
      {status === 'running' ? (
        <Box gap={1}>
          <Spinner text="" />
          <Text bold color={COLORS.toolLabel}>{label}</Text>
          <Text dimColor>{primaryArg}</Text>
        </Box>
      ) : (
        <Box gap={1}>
          <Text color={statusColor}>{statusMark || symbol}</Text>
          <Text bold color={COLORS.toolLabel}>{label}</Text>
          <Text dimColor>{primaryArg}</Text>
        </Box>
      )}

      {/* Output — left-bordered, truncated */}
      {output && status !== 'running' && (
        <Box
          marginLeft={2}
          marginTop={0}
          borderStyle="single"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor="gray"
          paddingLeft={1}
          flexDirection="column"
        >
          {summarizeOutput(output).split('\n').map((line, i) => (
            <Text key={i} dimColor wrap="truncate-end">{line}</Text>
          ))}
        </Box>
      )}

    </Box>
  );
};

function getPrimaryArg(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'exec_shell':
      return `${input['command'] ?? ''}`;
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return `${input['path'] ?? ''}`;
    case 'glob_search':
      return `${input['pattern'] ?? ''}`;
    case 'grep_search':
      return `${input['pattern'] ?? ''} in ${input['search_path'] ?? '.'}`;
    default:
      return JSON.stringify(input).slice(0, 60);
  }
}

function summarizeOutput(output: string): string {
  const lines = output.split('\n');
  const MAX_LINES = 3;
  if (lines.length <= MAX_LINES) return output;
  return lines.slice(0, MAX_LINES).join('\n') + `\n  … (${lines.length - MAX_LINES} more lines)`;
}
