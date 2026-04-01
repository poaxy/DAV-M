import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';

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

const TOOL_ICONS: Record<string, string> = {
  exec_shell: '$',
  read_file: '📄',
  write_file: '✎',
  edit_file: '✎',
  glob_search: '🔍',
  grep_search: '🔍',
};

const TOOL_LABELS: Record<string, string> = {
  exec_shell: 'Shell',
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  glob_search: 'Glob',
  grep_search: 'Grep',
};

/**
 * Displays a single tool invocation — its status, primary argument,
 * and abbreviated output on completion.
 */
export const ToolCallView: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const { toolName, input, status, output } = toolCall;

  const icon = TOOL_ICONS[toolName] ?? '⚙';
  const label = TOOL_LABELS[toolName] ?? toolName;

  // Pick the most meaningful argument to show inline
  const primaryArg = getPrimaryArg(toolName, input);

  const statusIcon =
    status === 'running' ? null :
    status === 'success' ? '✔' :
    status === 'denied' ? '—' :
    '✖';

  const statusColor =
    status === 'running' ? 'cyan' :
    status === 'success' ? 'green' :
    status === 'denied' ? 'yellow' :
    'red';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Tool call header */}
      <Box>
        {status === 'running' ? (
          <Spinner text={`${label}  ${primaryArg}`} />
        ) : (
          <Text color={statusColor}>
            {statusIcon} <Text color="white" bold>{label}</Text>
            <Text dimColor>  {primaryArg}</Text>
          </Text>
        )}
      </Box>

      {/* Output summary on completion (truncated) */}
      {output && status !== 'running' && (
        <Box marginLeft={2} flexDirection="column">
          {summarizeOutput(output).split('\n').map((line, i) => (
            <Text key={i} dimColor wrap="truncate-end">
              {line}
            </Text>
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
