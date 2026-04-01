import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import { ChatView } from './ChatView.js';
import { StatusBar } from './StatusBar.js';
import { ConfirmPrompt } from './ConfirmPrompt.js';
import { streamResponse, type CoreMessage } from '../ai/backend.js';
import { buildSystemPrompt } from '../ai/system-prompt.js';
import { buildUserMessage } from '../context/builder.js';
import { runWithFailover } from '../agent/failover.js';
import { ContextTracker } from '../context/tracker.js';
import {
  loadSession,
  saveSession,
  newSession,
  appendMessages,
} from '../sessions/manager.js';
import type { Session } from '../sessions/types.js';
import type { DavConfig } from '../config/types.js';
import type { Provider } from '../config/types.js';
import { overrideProvider, overrideModel } from '../config/loader.js';
import type { MessageData } from './Message.js';
import type { ToolCallState } from './ToolCallView.js';
import type { ConfirmFn, ConfirmOptions, AgentEvent } from '../tools/types.js';
import type { AuditLogger } from '../audit/logger.js';

export interface AppProps {
  query: string;
  config: DavConfig;
  stdinContent: string | null;
  executeMode: boolean;
  interactiveMode: boolean;
  logMode: boolean;
  initialMessages: CoreMessage[];
  /** Named session ID from --session flag. */
  sessionId?: string;
  /** MCP tools merged from connected servers (provider-agnostic). */
  mcpTools?: Record<string, unknown>;
  /** Audit logger instance shared with the CLI layer. */
  audit?: AuditLogger;
}

/** Turn-level phase: what the UI is currently doing. */
type TurnPhase = 'thinking' | 'streaming' | 'idle';

/** App-level phase: overall lifecycle. */
type AppPhase = TurnPhase | 'input' | 'done' | 'error';

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/** In-memory representation of a completed turn for rendering. */
interface CompletedTurn {
  messages: MessageData[];
  toolCalls: ToolCallState[];
  totalTokens: number;
}

export const App: React.FC<AppProps> = ({
  query,
  config: initialConfig,
  stdinContent,
  executeMode,
  interactiveMode,
  logMode,
  initialMessages,
  sessionId,
  mcpTools = {},
  audit,
}) => {
  const { exit } = useApp();

  // ── Config (can change mid-session via /backend, /model) ─────────────────
  const [config, setConfig] = useState<DavConfig>(initialConfig);

  // ── Session state ─────────────────────────────────────────────────────────
  const sessionRef = useRef<Session | null>(null);
  // Full AI message history across all turns — sent to the model each time
  const [allMessages, setAllMessages] = useState<CoreMessage[]>(initialMessages);

  // ── Display state ─────────────────────────────────────────────────────────
  // Completed turns (shown above the current active turn)
  const [completedTurns, setCompletedTurns] = useState<CompletedTurn[]>([]);
  // Display history for the current active turn
  const [history, setHistory] = useState<MessageData[]>([{ role: 'user', content: query }]);
  // Tool calls for the current active turn (execute mode)
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([]);
  // Streaming text accumulator for the current turn
  const [streamingText, setStreamingText] = useState('');
  // Non-execute streaming generator
  const [stream, setStream] = useState<AsyncGenerator<string> | null>(null);

  const [phase, setPhase] = useState<AppPhase>(
    interactiveMode ? 'thinking' : 'thinking',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);

  // ── Confirmation ──────────────────────────────────────────────────────────
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const pendingConfirmRef = useRef<PendingConfirm | null>(null);

  // ── Context tracker ───────────────────────────────────────────────────────
  const contextTracker = useRef(new ContextTracker());

  const systemPrompt = buildSystemPrompt({ executeMode, interactiveMode, logMode });

  // ── Confirmation function ─────────────────────────────────────────────────
  const confirmFn: ConfirmFn = useCallback(
    async (options: ConfirmOptions) => {
      if (config.autoConfirm) return true;
      return new Promise<boolean>((resolve) => {
        const pending: PendingConfirm = { ...options, resolve };
        pendingConfirmRef.current = pending;
        setPendingConfirm(pending);
      });
    },
    [config.autoConfirm],
  );

  const handleConfirmDecision = useCallback((confirmed: boolean) => {
    const pending = pendingConfirmRef.current;
    if (!pending) return;
    pendingConfirmRef.current = null;
    setPendingConfirm(null);
    pending.resolve(confirmed);
  }, []);

  // ── Session helpers ───────────────────────────────────────────────────────
  const persistSession = useCallback(
    (msgs: CoreMessage[], tokens: number) => {
      if (!sessionId) return;
      let session = sessionRef.current;
      if (!session) {
        // First turn: check for existing session on disk, or create new
        const loaded = loadSession(sessionId, config.sessionDir);
        session = loaded ?? newSession(sessionId, config);
      }
      session = appendMessages(session, msgs, tokens);
      sessionRef.current = session;
      saveSession(session, config.sessionDir);
    },
    [sessionId, config],
  );

  // ── Flush current turn into completedTurns ────────────────────────────────
  const archiveCurrentTurn = useCallback(
    (currentToolCalls: ToolCallState[], currentHistory: MessageData[], tokens: number) => {
      setCompletedTurns((prev) => [
        ...prev,
        { messages: currentHistory, toolCalls: currentToolCalls, totalTokens: tokens },
      ]);
    },
    [],
  );

  // ── Slash command handler ─────────────────────────────────────────────────
  const handleSlashCommand = useCallback(
    (cmd: string): boolean => {
      const parts = cmd.slice(1).trim().split(/\s+/);
      const name = parts[0].toLowerCase();

      switch (name) {
        case 'clear': {
          setCompletedTurns([]);
          setHistory([]);
          setAllMessages([]);
          setTotalTokens(0);
          contextTracker.current.update(0);
          sessionRef.current = null;
          setPhase('input');
          return true;
        }
        case 'model': {
          const modelName = parts.slice(1).join(' ').trim();
          if (!modelName) {
            setHistory((h) => [
              ...h,
              { role: 'assistant', content: 'Usage: /model <model-name>' },
            ]);
          } else {
            setConfig((c) => overrideModel(c, modelName));
            setHistory((h) => [
              ...h,
              { role: 'assistant', content: `Model switched to: ${modelName}` },
            ]);
          }
          setPhase('input');
          return true;
        }
        case 'backend':
        case 'provider': {
          const providerName = parts[1]?.toLowerCase() ?? '';
          if (!providerName || !['anthropic', 'openai', 'google'].includes(providerName)) {
            setHistory((h) => [
              ...h,
              { role: 'assistant', content: 'Usage: /backend anthropic|openai|google' },
            ]);
          } else {
            try {
              setConfig((c) => overrideProvider(c, providerName));
              setHistory((h) => [
                ...h,
                { role: 'assistant', content: `Provider switched to: ${providerName}` },
              ]);
            } catch (e) {
              setHistory((h) => [
                ...h,
                { role: 'assistant', content: `Error: ${(e as Error).message}` },
              ]);
            }
          }
          setPhase('input');
          return true;
        }
        case 'help': {
          setHistory((h) => [
            ...h,
            {
              role: 'assistant',
              content: [
                'Available commands:',
                '  /clear            — clear conversation history',
                '  /model <name>     — switch model (e.g. claude-opus-4-6, gpt-4o)',
                '  /backend <name>   — switch provider (anthropic | openai | google)',
                '  /help             — show this help',
                '  /exit             — quit',
                '',
                'Press Ctrl+C to exit at any time.',
              ].join('\n'),
            },
          ]);
          setPhase('input');
          return true;
        }
        case 'exit':
        case 'quit': {
          exit();
          return true;
        }
        default: {
          setHistory((h) => [
            ...h,
            {
              role: 'assistant',
              content: `Unknown command: /${name}. Type /help for available commands.`,
            },
          ]);
          setPhase('input');
          return true;
        }
      }
    },
    [exit],
  );

  // ── Core turn runner (execute mode) ───────────────────────────────────────
  const runExecuteTurn = useCallback(
    async (messages: CoreMessage[], currentConfig: DavConfig) => {
      const policyCtx = {
        executeEnabled: executeMode,
        autoConfirm: currentConfig.autoConfirm,
      };

      let currentText = '';
      const turnToolCalls: ToolCallState[] = [];
      let turnTokens = 0;

      // Collect tool calls for display (mirrors setToolCalls but imperative)
      const onEvent = (event: AgentEvent) => {
        switch (event.type) {
          case 'text-delta': {
            currentText += event.delta;
            setStreamingText(currentText);
            setPhase('streaming');
            break;
          }
          case 'tool-start': {
            if (currentText.trim()) {
              setHistory((h) => [...h, { role: 'assistant', content: currentText }]);
              currentText = '';
              setStreamingText('');
            }
            setPhase('streaming');
            const tc: ToolCallState = {
              id: event.id,
              toolName: event.toolName,
              input: event.input,
              status: 'running',
            };
            turnToolCalls.push(tc);
            setToolCalls((prev) => [...prev, tc]);
            audit?.toolCall(event.toolName, event.input);
            break;
          }
          case 'tool-result': {
            const idx = turnToolCalls.findIndex((t) => t.id === event.id);
            if (idx !== -1) {
              turnToolCalls[idx] = {
                ...turnToolCalls[idx],
                status: event.result.success ? 'success' : 'error',
                output: event.result.output,
              };
            }
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.id === event.id
                  ? { ...tc, status: event.result.success ? 'success' : 'error', output: event.result.output }
                  : tc,
              ),
            );
            audit?.toolResult(event.toolName, event.result.success, event.result.output);
            break;
          }
          case 'provider-switch': {
            setHistory((h) => [
              ...h,
              {
                role: 'assistant',
                content: `⚡ Switching provider: ${event.from} → ${event.to} (${event.reason})`,
              },
            ]);
            audit?.providerSwitch(event.from, event.to);
            break;
          }
          case 'step-done': {
            // Transparent to the UI
            break;
          }
          case 'done': {
            turnTokens = event.totalTokens;
            contextTracker.current.update(event.totalTokens);
            break;
          }
          case 'error': {
            // Handled in the catch below
            break;
          }
        }
      };

      // Trim messages to context limit before sending
      const trimmed = contextTracker.current.trimMessages(messages, currentConfig.provider);

      await runWithFailover({
        messages: trimmed,
        config: currentConfig,
        systemPrompt,
        policyCtx,
        confirmFn,
        onEvent,
        extraTools: Object.keys(mcpTools).length > 0 ? mcpTools : undefined,
      });

      return { currentText, turnToolCalls, turnTokens };
    },
    [executeMode, systemPrompt, confirmFn, mcpTools],
  );

  // ── Core turn runner (stream mode) ────────────────────────────────────────
  const runStreamTurn = useCallback(
    async (messages: CoreMessage[], currentConfig: DavConfig): Promise<string> => {
      const trimmed = contextTracker.current.trimMessages(messages, currentConfig.provider);

      // Try primary provider; on failover-eligible error, try the next
      const providers: Provider[] = ['anthropic', 'openai', 'google'];
      const tried = new Set<Provider>();
      let cfg = currentConfig;

      while (true) {
        tried.add(cfg.provider);
        try {
          const gen = streamResponse(trimmed, cfg, systemPrompt);
          setStream(gen);
          setPhase('streaming');

          // Drain the generator and return accumulated text
          const chunks: string[] = [];
          for await (const delta of gen) {
            chunks.push(delta);
          }
          return chunks.join('');
        } catch (err) {
          const { isFailoverError } = await import('../utils/errors.js');
          if (!isFailoverError(err)) throw err;

          const next = providers.find(
            (p) => !tried.has(p) && hasApiKeyForProvider(p, cfg),
          );
          if (!next) throw err;

          setHistory((h) => [
            ...h,
            {
              role: 'assistant',
              content: `⚡ Switching provider: ${cfg.provider} → ${next}`,
            },
          ]);
          cfg = { ...cfg, provider: next, model: undefined };
        }
      }
    },
    [systemPrompt],
  );

  // ── Single-turn entrypoint (called on mount + each interactive submit) ────
  const runTurn = useCallback(
    async (messages: CoreMessage[], turnQuery: string) => {
      setPhase('thinking');
      setStreamingText('');
      setToolCalls([]);
      setStream(null);

      // Add user message to the display history for this turn
      setHistory((h) => {
        const alreadyHas = h.some((m) => m.role === 'user' && m.content === turnQuery);
        return alreadyHas ? h : [...h, { role: 'user', content: turnQuery }];
      });

      try {
        if (executeMode) {
          const { currentText, turnToolCalls, turnTokens } = await runExecuteTurn(
            messages,
            config,
          );

          // Flush remaining streamed text
          if (currentText.trim()) {
            setHistory((h) => [...h, { role: 'assistant', content: currentText }]);
          }
          setStreamingText('');
          setTotalTokens((t) => t + turnTokens);

          // Build AI message history update: user msg + assistant reply
          const assistantContent = [
            ...turnToolCalls.map((tc) => ({
              type: 'tool-result' as const,
              toolCallId: tc.id,
              toolName: tc.toolName,
              result: tc.output ?? '',
            })),
            ...(currentText.trim() ? [currentText] : []),
          ];
          const aiAssistantMsg: CoreMessage = {
            role: 'assistant',
            content: currentText.trim() || '(tool results above)',
          };

          const newMessages = [...messages, aiAssistantMsg];
          setAllMessages(newMessages);
          persistSession([messages[messages.length - 1], aiAssistantMsg], turnTokens);

          if (interactiveMode) {
            archiveCurrentTurn(
              turnToolCalls,
              [{ role: 'user', content: turnQuery }],
              turnTokens,
            );
            setHistory([]);
            setToolCalls([]);
            setPhase('input');
          } else {
            setPhase('done');
            setTimeout(() => exit(), 50);
          }
        } else {
          // Stream mode
          const fullText = await runStreamTurn(messages, config);

          setHistory((h) => [...h, { role: 'assistant', content: fullText }]);
          setStream(null);

          const aiMsg: CoreMessage = { role: 'assistant', content: fullText };
          const newMessages = [...messages, aiMsg];
          setAllMessages(newMessages);
          persistSession([messages[messages.length - 1], aiMsg], 0);

          if (interactiveMode) {
            archiveCurrentTurn(
              [],
              [{ role: 'user', content: turnQuery }, { role: 'assistant', content: fullText }],
              0,
            );
            setHistory([]);
            setPhase('input');
          } else {
            setPhase('done');
            setTimeout(() => exit(), 50);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
        setPhase('error');
        if (!interactiveMode) {
          setTimeout(() => exit(err instanceof Error ? err : new Error(message)), 50);
        }
      }
    },
    [
      config,
      executeMode,
      interactiveMode,
      runExecuteTurn,
      runStreamTurn,
      persistSession,
      archiveCurrentTurn,
      exit,
    ],
  );

  // ── Interactive mode: handle user submit from InputBar ────────────────────
  const handleInteractiveSubmit = useCallback(
    async (rawQuery: string) => {
      // Slash commands are handled synchronously
      if (rawQuery.startsWith('/')) {
        handleSlashCommand(rawQuery);
        return;
      }

      // Build the new user message (with workspace context injected)
      const { userMessage } = buildUserMessage(rawQuery, null);
      const newUserMsg: CoreMessage = { role: 'user', content: userMessage };

      // Trim accumulated history before adding new message
      const trimmedPrev = contextTracker.current.trimMessages(allMessages, config.provider);
      const updatedMessages = [...trimmedPrev, newUserMsg];

      setAllMessages(updatedMessages);

      // Kick off the turn
      await runTurn(updatedMessages, rawQuery);
    },
    [allMessages, config.provider, handleSlashCommand, runTurn],
  );

  // ── Mount: load session (if any) then run first turn ─────────────────────
  useEffect(() => {
    let startMessages = initialMessages;

    if (sessionId) {
      const existing = loadSession(sessionId, config.sessionDir);
      if (existing && existing.messages.length > 0) {
        // Append the new user turn to existing history
        startMessages = [...existing.messages, ...initialMessages];
        setAllMessages(startMessages);
        sessionRef.current = existing;
        contextTracker.current.update(existing.totalTokens);
        // Show loaded history as completed turns
        if (existing.messages.length > 0) {
          const pairs: MessageData[] = existing.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
          if (pairs.length > 0) {
            setCompletedTurns([{ messages: pairs, toolCalls: [], totalTokens: existing.totalTokens }]);
          }
        }
      }
    }

    runTurn(startMessages, query);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  const chatPhase: 'thinking' | 'streaming' | 'idle' =
    phase === 'thinking' ? 'thinking' :
    phase === 'streaming' ? 'streaming' :
    'idle';

  // Build a flat display history for the ChatView:
  // completed turns + current turn history
  const flatHistory: MessageData[] = [
    ...completedTurns.flatMap((t) => t.messages),
    ...history,
  ];

  return (
    <Box flexDirection="column">
      {phase === 'error' ? (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">✖ {errorMessage}</Text>
          {interactiveMode && (
            <Text dimColor> (type /clear to reset, or Ctrl+C to exit)</Text>
          )}
        </Box>
      ) : (
        <>
          <ChatView
            history={flatHistory}
            phase={chatPhase}
            stream={!executeMode ? (stream ?? undefined) : undefined}
            onStreamComplete={(text) => {
              setHistory((h) => [...h, { role: 'assistant', content: text }]);
              if (!interactiveMode) {
                setPhase('done');
                setTimeout(() => exit(), 50);
              }
            }}
            onStreamError={(err) => {
              setErrorMessage(err.message);
              setPhase('error');
              if (!interactiveMode) setTimeout(() => exit(err), 50);
            }}
            toolCalls={executeMode ? toolCalls : undefined}
            streamingText={executeMode ? streamingText : undefined}
            isInteractive={interactiveMode}
            inputActive={phase === 'input'}
            onInputSubmit={handleInteractiveSubmit}
          />

          {pendingConfirm && (
            <Box paddingX={1}>
              <ConfirmPrompt
                {...pendingConfirm}
                isActive={true}
                onDecision={handleConfirmDecision}
              />
            </Box>
          )}
        </>
      )}

      {(phase === 'done' || phase === 'error') && !interactiveMode && (
        <StatusBar config={config} tokenCount={totalTokens} />
      )}
    </Box>
  );
};

// ── Utility ────────────────────────────────────────────────────────────────

function hasApiKeyForProvider(provider: Provider, config: DavConfig): boolean {
  switch (provider) {
    case 'anthropic': return !!config.anthropicApiKey;
    case 'openai':    return !!config.openaiApiKey;
    case 'google':    return !!config.googleApiKey;
  }
}
