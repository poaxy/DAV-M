import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPIN_MS  = 80;
const TICK_MS  = 1000;

interface SpinnerProps {
  text?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ text = 'Thinking' }) => {
  const [frame,   setFrame]   = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const spin = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), SPIN_MS);
    const tick = setInterval(() => setElapsed((e) => e + 1), TICK_MS);
    return () => { clearInterval(spin); clearInterval(tick); };
  }, []);

  return (
    <Box gap={1} marginTop={1}>
      <Text color={COLORS.spinner}>{FRAMES[frame]}</Text>
      <Text dimColor>{text}…</Text>
      {elapsed >= 3 && <Text dimColor>({elapsed}s)</Text>}
    </Box>
  );
};
