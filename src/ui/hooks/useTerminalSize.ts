import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

interface TerminalSize {
  columns: number;
  rows: number;
}

const DEFAULTS: TerminalSize = { columns: 80, rows: 24 };

/**
 * Vendored terminal-size hook (based on ink-use-stdout-dimensions).
 *
 * Returns the current terminal dimensions and re-renders the component
 * whenever the terminal is resized (SIGWINCH / stdout 'resize' event).
 *
 * Falls back to 80×24 in non-TTY environments (CI, pipes) where
 * stdout.columns / stdout.rows are undefined.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const [size, setSize] = useState<TerminalSize>({
    columns: stdout?.columns ?? DEFAULTS.columns,
    rows: stdout?.rows ?? DEFAULTS.rows,
  });

  useEffect(() => {
    if (!stdout) return;

    const handler = () => {
      setSize({
        columns: stdout.columns ?? DEFAULTS.columns,
        rows: stdout.rows ?? DEFAULTS.rows,
      });
    };

    stdout.on('resize', handler);
    return () => { stdout.off('resize', handler); };
  }, [stdout]);

  return size;
}
