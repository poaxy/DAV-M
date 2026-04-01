import React from 'react';
import { Box, Text } from 'ink';
import { marked, Lexer, type Token } from 'marked';
import { CodeBlock } from './CodeBlock.js';

interface MarkdownRendererProps {
  /** Raw markdown string to render. */
  text: string;
}

/**
 * Renders markdown to Ink components.
 *
 * Handles: headings, paragraphs, code blocks (syntax-highlighted),
 * inline code, bold, italic, lists, blockquotes, horizontal rules.
 *
 * Walks the marked token tree so we get per-block control and can
 * delegate code blocks to CodeBlock (cli-highlight).
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
      const depth = (token as { depth: number }).depth;
      const rawText = (token as { text: string }).text;
      const color = depth === 1 ? 'cyan' : depth === 2 ? 'green' : 'white';
      const prefix = '#'.repeat(depth) + ' ';
      return (
        <Box marginTop={1}>
          <Text color={color} bold>
            {prefix}{rawText}
          </Text>
        </Box>
      );
    }

    case 'paragraph': {
      const rawText = (token as { text: string }).text;
      return (
        <Box marginBottom={1}>
          <Text wrap="wrap">{renderInlineMarkdown(rawText)}</Text>
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
            <Box key={i}>
              <Text color="cyan">{t.ordered ? `${i + 1}. ` : '• '}</Text>
              <Text wrap="wrap">{renderInlineMarkdown(item.text)}</Text>
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
          <Text dimColor>{'─'.repeat(60)}</Text>
        </Box>
      );
    }

    case 'space': {
      return <Box marginBottom={1} />;
    }

    default: {
      // Fallback: render raw text if we don't recognise the token
      const rawText = (token as { raw?: string }).raw ?? '';
      if (!rawText.trim()) return null;
      return <Text wrap="wrap">{rawText}</Text>;
    }
  }
};

/**
 * Convert inline markdown (bold, italic, inline code) to a plain ANSI string
 * for rendering inside <Text>. We do simple regex substitution — this is
 * intentionally lightweight since Ink's <Text> doesn't support nested JSX
 * inside a single Text node conveniently.
 */
function renderInlineMarkdown(text: string): string {
  return (
    text
      // Strip markdown control characters we can't render inline in Ink <Text>
      // and replace with approximate equivalents
      .replace(/\*\*(.+?)\*\*/g, '$1')   // bold → plain (Ink bold handled at component level)
      .replace(/\*(.+?)\*/g, '$1')       // italic → plain
      .replace(/__(.+?)__/g, '$1')       // bold alt
      .replace(/_(.+?)_/g, '$1')         // italic alt
      .replace(/`(.+?)`/g, '$1')         // inline code → plain
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links → label only
  );
}
