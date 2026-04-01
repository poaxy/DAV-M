import React from 'react';
import { Box, Text } from 'ink';
import { Lexer, type Token } from 'marked';
import { CodeBlock } from './CodeBlock.js';
import { COLORS } from './theme.js';

interface MarkdownRendererProps {
  /** Raw markdown string to render. */
  text: string;
}

/**
 * Renders markdown to Ink components.
 *
 * Handles: headings, paragraphs, code blocks (syntax-highlighted),
 * inline code, bold, italic, lists, blockquotes, horizontal rules.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ text }) => {
  if (!text) return null;

  const tokens = Lexer.lex(text);
  return (
    <Box flexDirection="column">
      {tokens.map((token, i) => (
        <BlockToken key={i} token={token} />
      ))}
    </Box>
  );
};

const BlockToken: React.FC<{ token: Token }> = ({ token }) => {
  switch (token.type) {

    case 'heading': {
      const depth    = (token as { depth: number }).depth;
      const rawText  = (token as { text: string }).text;
      const color    = depth === 1 ? COLORS.heading1 : depth === 2 ? COLORS.heading2 : COLORS.heading3;
      const marginTop = depth === 1 ? 1 : 0;
      return (
        <Box marginTop={marginTop} marginBottom={0}>
          <Text color={color} bold>{rawText}</Text>
        </Box>
      );
    }

    case 'paragraph': {
      const rawText = (token as { text: string }).text;
      return (
        <Box marginBottom={1}>
          <InlineText text={rawText} />
        </Box>
      );
    }

    case 'code': {
      const t = token as { text: string; lang?: string };
      return <CodeBlock code={t.text} language={t.lang || undefined} />;
    }

    case 'list': {
      const t = token as { items: Array<{ text: string; tokens: Token[] }>; ordered: boolean };
      return (
        <Box flexDirection="column" marginBottom={1}>
          {t.items.map((item, i) => (
            <Box key={i} gap={1} marginBottom={0}>
              <Text color={COLORS.listBullet}>{t.ordered ? `${i + 1}.` : '•'}</Text>
              <Box flexShrink={1}>
                <InlineText text={item.text} />
              </Box>
            </Box>
          ))}
        </Box>
      );
    }

    case 'blockquote': {
      const t = token as { text: string };
      return (
        <Box
          borderStyle="single"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor="gray"
          paddingLeft={1}
          marginBottom={1}
        >
          <Text dimColor wrap="wrap">{t.text}</Text>
        </Box>
      );
    }

    case 'hr': {
      return (
        <Box marginTop={1} marginBottom={1}>
          <Text dimColor>{'─'.repeat(40)}</Text>
        </Box>
      );
    }

    case 'space': {
      return <Box marginBottom={1} />;
    }

    default: {
      const rawText = (token as { raw?: string }).raw ?? '';
      if (!rawText.trim()) return null;
      return (
        <Box marginBottom={1}>
          <InlineText text={rawText} />
        </Box>
      );
    }
  }
};

// ── Inline markdown renderer ──────────────────────────────────────────────────
// Splits text on **bold**, *italic*, and `code` patterns and renders each
// segment as a properly styled <Text> node.

type Segment =
  | { kind: 'text';   content: string }
  | { kind: 'bold';   content: string }
  | { kind: 'italic'; content: string }
  | { kind: 'code';   content: string }
  | { kind: 'link';   content: string };

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  // Combined pattern — order matters: bold before italic
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_|`(.+?)`|\[(.+?)\]\(.+?\))/gs;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ kind: 'text', content: text.slice(last, match.index) });
    }
    const full = match[1];
    if (full.startsWith('**') || full.startsWith('__')) {
      segments.push({ kind: 'bold',   content: match[2] ?? match[4] ?? '' });
    } else if (full.startsWith('*') || full.startsWith('_')) {
      segments.push({ kind: 'italic', content: match[3] ?? match[5] ?? '' });
    } else if (full.startsWith('`')) {
      segments.push({ kind: 'code',   content: match[6] ?? '' });
    } else {
      segments.push({ kind: 'link',   content: match[7] ?? '' });
    }
    last = match.index + full.length;
  }

  if (last < text.length) {
    segments.push({ kind: 'text', content: text.slice(last) });
  }
  return segments;
}

const InlineText: React.FC<{ text: string }> = ({ text }) => {
  const segments = parseInline(text);
  return (
    <Text wrap="wrap">
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case 'bold':   return <Text key={i} bold>{seg.content}</Text>;
          case 'italic': return <Text key={i} italic>{seg.content}</Text>;
          case 'code':   return <Text key={i} color={COLORS.inlineCode}>{seg.content}</Text>;
          default:       return seg.content;
        }
      })}
    </Text>
  );
};
