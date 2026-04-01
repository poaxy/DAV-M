import React from 'react';
import { Box, Text } from 'ink';
import { structuredPatch } from 'diff';

type Patch = ReturnType<typeof structuredPatch>;

interface DiffViewProps {
  patch: Patch;
}

/**
 * Renders a structured diff patch as a colored terminal diff.
 * Green for additions (+), red for deletions (-), dim for context.
 * Uses `structuredPatch` from the `diff` package — no raw ANSI strings.
 */
export const DiffView: React.FC<DiffViewProps> = ({ patch }) => {
  const hasChanges = patch.hunks.length > 0;

  if (!hasChanges) {
    return <Text dimColor>(no changes)</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {/* File header */}
      <Text dimColor>
        --- {patch.oldFileName}
      </Text>
      <Text dimColor>
        +++ {patch.newFileName}
      </Text>

      {patch.hunks.map((hunk, hi) => (
        <Box key={hi} flexDirection="column">
          {/* Hunk header */}
          <Text color="cyan" dimColor>
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </Text>

          {hunk.lines.map((line, li) => {
            const prefix = line[0];
            const content = line.slice(1);

            if (prefix === '+') {
              return (
                <Text key={li} color="green">
                  +{content}
                </Text>
              );
            }
            if (prefix === '-') {
              return (
                <Text key={li} color="red">
                  -{content}
                </Text>
              );
            }
            return (
              <Text key={li} dimColor>
                {' '}{content}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};
