/**
 * Design tokens for DAV-M's terminal UI.
 * All color/spacing decisions live here — components import from this file.
 */

export const COLORS = {
  // Role-semantic — one color per meaning, used consistently
  user:            'green',
  assistant:       'blueBright',
  assistantBorder: 'blue',

  // Tool states
  toolLabel:   'magentaBright',
  toolRunning: 'cyan',
  toolSuccess: 'green',
  toolError:   'red',
  toolDenied:  'yellow',

  // Typography
  heading1: 'cyanBright',
  heading2: 'cyan',
  heading3: 'white',
  inlineCode: 'cyan',
  listBullet: 'cyan',

  // Chrome
  border:  'gray',
  spinner: 'cyan',
  brand:   'cyan',
} as const;

export const TOOL_SYMBOLS: Record<string, string> = {
  exec_shell:  '$',
  read_file:   '○',
  write_file:  '●',
  edit_file:   '◎',
  glob_search: '◆',
  grep_search: '◇',
};

export const TOOL_LABELS: Record<string, string> = {
  exec_shell:  'Shell',
  read_file:   'Read',
  write_file:  'Write',
  edit_file:   'Edit',
  glob_search: 'Glob',
  grep_search: 'Grep',
};
