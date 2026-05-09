import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { ScrollView, type ScrollViewRef } from 'ink-scroll-view';
import { ScrollBar } from '@byteland/ink-scroll-bar';
import { CommandTextInput } from './CommandTextInput.js';
import type { LogStore } from '../core/log-store.js';
import type { UiState } from '../core/types.js';
import { applyCompletion, suggestCompletions } from '../core/autocomplete.js';
import { buildRenderRows, getLogPaneRowCount, getVisibleRenderRowsFromFlat } from '../core/log-view.js';
import { COMMAND_HELP_LINES } from '../core/command-spec.js';
import { consumeSgrWheelFromBuffer, sgrWheelDirectionFromRawChunk } from './sgr-wheel.js';
import { normalizeScrollBarState } from './scrollbar-state.js';
import { resolveArrowIntent, toggleFocusArea, type FocusArea } from './input-routing.js';

const COMPLETION_STRIP_CHROME_ROWS = 2;
const HELP_OVERLAY_CHROME_ROWS = Math.min(20, COMMAND_HELP_LINES.length + 3);
const SCROLL_STEP_LINES = 2;
const VIRTUAL_OVERSCAN_ROWS = 30;
/** Shown before the command input (shell-style). */
const COMMAND_PROMPT = '$ ';

interface CompletionSession {
  baseInput: string;
  suggestions: string[];
  index: number;
  appliedInput: string;
}

function looksLikePageUp(value: string, keyPageUp: boolean): boolean {
  return keyPageUp || value.includes('[5~') || value.includes('[[5~') || value.includes('[5;');
}

function looksLikePageDown(value: string, keyPageDown: boolean): boolean {
  return keyPageDown || value.includes('[6~') || value.includes('[[6~') || value.includes('[6;');
}

function looksLikeHome(sequence: string, keyHome: boolean): boolean {
  if (keyHome) return true;
  const v = sequence.startsWith('\u001B') ? sequence.slice(1) : sequence;
  if (/\[(1|7)~/.test(v)) return true;
  return v === 'OH' || v === '[H';
}

function looksLikeEnd(sequence: string, keyEnd: boolean): boolean {
  if (keyEnd) return true;
  const v = sequence.startsWith('\u001B') ? sequence.slice(1) : sequence;
  if (/\[(4|8)~/.test(v)) return true;
  return v === 'OF' || v === '[F';
}

/** Truecolor cyan reads clearly where palette `cyan`/`cyanBright` blend into the theme foreground. */
function brandDisabledByNoColor(): boolean {
  const v = process.env.NO_COLOR;
  return v !== undefined && v !== '';
}
interface AppProps {
  logStore: LogStore;
  onSubmit: (line: string) => Promise<void>;
  onWrapToggle: () => void;
  onRawToggle: () => void;
  onPanLeft: () => void;
  onPanRight: () => void;
  onHistoryUp: (prefix: string) => string | undefined;
  onHistoryDown: (prefix: string) => string | undefined;
  onScrollUp: (lines?: number) => void;
  onScrollDown: (lines?: number) => void;
  onScrollPageUp: (lines?: number) => void;
  onScrollPageDown: (lines?: number) => void;
  onFollowTail: () => void;
  onScrollToOldest: () => void;
  onExport: () => Promise<void>;
  onCtrlC: () => void;
  state: UiState;
  eventsStatus: string;
  connectionStatus: 'connecting' | 'online' | 'error';
}

export function App({
  logStore,
  onSubmit,
  onWrapToggle,
  onRawToggle,
  onPanLeft,
  onPanRight,
  onHistoryUp,
  onHistoryDown,
  onScrollUp,
  onScrollDown,
  onScrollPageUp,
  onScrollPageDown,
  onFollowTail,
  onScrollToOldest,
  onExport,
  onCtrlC,
  state,
  eventsStatus,
  connectionStatus,
}: AppProps) {
  const [input, setInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [completionSession, setCompletionSession] = useState<CompletionSession | undefined>(undefined);
  const [focusArea, setFocusArea] = useState<FocusArea>('command');
  const [scrollBarState, setScrollBarState] = useState(() => normalizeScrollBarState({
    contentHeight: 0,
    viewportHeight: 10,
    scrollOffset: 0,
  }));
  const scrollRef = useRef<ScrollViewRef>(null);
  /** Set from a prepended stdin listener so we scroll logs even when Ink maps SGR wheel to arrow keys. */
  const pendingSgrWheelRef = useRef<'up' | 'down' | null>(null);
  /** Some terminals emit an extra arrow event right after wheel CSI; suppress history for a brief window. */
  const suppressArrowHistoryUntilRef = useRef(0);
  const lastWheelAtRef = useRef(0);
  const sgrBufferRef = useRef('');
  const focusAreaRef = useRef<FocusArea>('command');
  focusAreaRef.current = focusArea;
  const { stdin } = useStdin();
  const liveSuggestions = suggestCompletions(input);
  /** Session is only used for Tab cycling when it still matches the command line (avoid stale suggestions one frame after edits). */
  const completionSessionActive =
    completionSession !== undefined && input === completionSession.appliedInput;
  const completionItems = completionSessionActive ? completionSession.suggestions : liveSuggestions;
  const rawCompletionIndex = completionSessionActive ? completionSession.index : 0;
  const completionIndex = Math.min(
    rawCompletionIndex,
    Math.max(0, completionItems.length - 1),
  );
  const completionOpen = focusArea === 'command' && completionItems.length > 0 && input.trim().length > 0;
  const extraLogChromeRows =
    (completionOpen ? COMPLETION_STRIP_CHROME_ROWS : 0) + (showHelp ? HELP_OVERLAY_CHROME_ROWS : 0);
  const logPaneRows = getLogPaneRowCount({ extraChromeRows: extraLogChromeRows });
  const logStoreVersion = logStore.version();
  const rows = useMemo(() => buildRenderRows(Array.from(logStore.view())), [logStoreVersion]);
  // IMPORTANT: UiState.scrollOffset counts lines up from the log tail ("follow-tail" distance).
  // ScrollView/internal scrollbar use offset from content top — never mix those into slicing.
  const visibleRowsState = useMemo(
    () =>
      getVisibleRenderRowsFromFlat(
        rows,
        state.scrollOffset,
        Math.max(1, scrollBarState.viewportHeight || logPaneRows),
        VIRTUAL_OVERSCAN_ROWS,
      ),
    [rows, state.scrollOffset, scrollBarState.viewportHeight, logPaneRows],
  );
  const topVirtualPadRows = visibleRowsState.start;
  const bottomVirtualPadRows = Math.max(0, visibleRowsState.totalRows - visibleRowsState.end);
  const completionWindowSize = 12;
  const completionWindowStart = (() => {
    if (completionItems.length <= completionWindowSize) return 0;
    const half = Math.floor(completionWindowSize / 2);
    const idx = Math.min(completionIndex, completionItems.length - 1);
    return Math.max(0, Math.min(idx - half, completionItems.length - completionWindowSize));
  })();
  const completionDisplayItems = completionItems.slice(
    completionWindowStart,
    completionWindowStart + completionWindowSize,
  );
  const bottomSlack = 1;
  const isCommandEmpty = input.trim().length === 0;
  /** ink-scroll-view scrollBy clamps to contentHeight instead of contentHeight − viewportHeight, so callers can overshoot; fix sync. */
  function clampInkScrollToViewportBottom(): void {
    const ref = scrollRef.current;
    if (!ref) return;
    const bottom = ref.getBottomOffset();
    const cur = ref.getScrollOffset();
    const clamped = Math.max(0, Math.min(cur, bottom));
    if (clamped !== cur) {
      ref.scrollTo(clamped);
    }
  }

  function boundedScrollLogBy(delta: number): void {
    scrollRef.current?.scrollBy(delta);
    clampInkScrollToViewportBottom();
  }

  useEffect(() => {
    if (!process.stdout.isTTY) return undefined;
    const onResize = () => {
      scrollRef.current?.remeasure();
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!state.followTail) return;
    scrollRef.current?.remeasure();
    scrollRef.current?.scrollToBottom();
    onFollowTail();
    const timer = setTimeout(() => {
      scrollRef.current?.remeasure();
      scrollRef.current?.scrollToBottom();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [rows.length, state.followTail, onFollowTail]);

  useEffect(() => {
    scrollRef.current?.remeasure();
    if (state.followTail) {
      scrollRef.current?.scrollToBottom();
    }
  }, [logPaneRows, completionOpen, showHelp, state.followTail]);

  useEffect(() => {
    const contentHeight = scrollRef.current?.getContentHeight() ?? rows.length;
    const viewportHeight = scrollRef.current?.getViewportHeight() ?? logPaneRows;
    const scrollOffset = scrollRef.current?.getScrollOffset() ?? state.scrollOffset;
    setScrollBarState(normalizeScrollBarState({ contentHeight, viewportHeight, scrollOffset }));
  }, [rows.length, logPaneRows, state.scrollOffset, completionOpen, showHelp]);

  useEffect(() => {
    queueMicrotask(() => {
      clampInkScrollToViewportBottom();
    });
  }, [rows.length, logPaneRows, state.scrollOffset, completionOpen, showHelp]);

  useEffect(() => {
    if (!stdin?.prependListener) return undefined;
    const onData = (chunk: Buffer | string): void => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      sgrBufferRef.current += s;
      const parsed = consumeSgrWheelFromBuffer(sgrBufferRef.current);
      sgrBufferRef.current = parsed.rest;
      if (parsed.dir) {
        pendingSgrWheelRef.current = parsed.dir;
        lastWheelAtRef.current = Date.now();
      }
    };
    stdin.prependListener('data', onData);
    return () => {
      stdin.removeListener('data', onData);
    };
  }, [stdin]);

  function isNearBottom(): boolean {
    const bottom = scrollRef.current?.getBottomOffset() ?? 0;
    const offset = scrollRef.current?.getScrollOffset() ?? 0;
    return bottom - offset <= bottomSlack;
  }

  function shouldFollowTailAfterScrollDown(): boolean {
    return state.scrollOffset <= 1 || isNearBottom();
  }

  function clearCompletionSession(): void {
    setCompletionSession(undefined);
  }

  function applyCompletionFromSession(baseInput: string, suggestions: string[], nextIndex: number): void {
    const item = suggestions[nextIndex];
    if (!item) return;
    const appliedInput = applyCompletion(baseInput, item);
    setInput(appliedInput);
    setCompletionSession({
      baseInput,
      suggestions,
      index: nextIndex,
      appliedInput,
    });
  }

  function cycleCompletion(): void {
    if (focusArea !== 'command') return;
    const sessionOk = completionSession !== undefined && input === completionSession.appliedInput;
    const baseInput = sessionOk ? completionSession.baseInput : input;
    const suggestions = sessionOk ? completionSession.suggestions : suggestCompletions(baseInput);
    if (suggestions.length === 0) return;
    const currentIndex = sessionOk ? completionSession.index : -1;
    const nextIndex = (currentIndex + 1) % suggestions.length;
    applyCompletionFromSession(baseInput, suggestions, nextIndex);
  }

  function renderVirtualPadRows(count: number): string | null {
    if (count <= 0) return null;
    if (count === 1) return ' ';
    return `${' \n'.repeat(count - 1)} `;
  }

  useEffect(() => {
    if (!completionSession) return;
    // Any manual edit after a completion should restart suggestions from the current text.
    if (input !== completionSession.appliedInput) {
      setCompletionSession(undefined);
    }
  }, [input, completionSession]);

  useInput((value, key) => {
    if (key.escape) {
      setShowHelp(false);
      clearCompletionSession();
      return;
    }
    const pendingWheel = pendingSgrWheelRef.current;
    if (pendingWheel) {
      pendingSgrWheelRef.current = null;
      const now = Date.now();
      lastWheelAtRef.current = now;
      suppressArrowHistoryUntilRef.current = now + 220;
      setShowHelp(false);
      clearCompletionSession();
      if (pendingWheel === 'up') {
        boundedScrollLogBy(-SCROLL_STEP_LINES);
        onScrollUp(SCROLL_STEP_LINES);
      } else {
        boundedScrollLogBy(SCROLL_STEP_LINES);
        onScrollDown(SCROLL_STEP_LINES);
        if (shouldFollowTailAfterScrollDown()) onFollowTail();
      }
      setFocusArea('scroll');
      return;
    }
    if (value === '?' && isCommandEmpty) {
      setShowHelp((prev) => !prev);
      return;
    }
    const rawWheelDir = sgrWheelDirectionFromRawChunk(value);
    const wheelUp = rawWheelDir === 'up';
    const wheelDown = rawWheelDir === 'down';

    /** Log-pane keys: useRef avoids stale focusArea inside Ink's input dispatcher. */
    if (focusAreaRef.current === 'scroll') {
      if (looksLikeHome(value, key.home)) {
        clearCompletionSession();
        onScrollToOldest();
        queueMicrotask(() => {
          scrollRef.current?.scrollTo(0);
        });
        setShowHelp(false);
        return;
      }
      if (looksLikeEnd(value, key.end)) {
        clearCompletionSession();
        onFollowTail();
        queueMicrotask(() => {
          scrollRef.current?.scrollToBottom();
        });
        setShowHelp(false);
        return;
      }
      if (looksLikePageUp(value, key.pageUp)) {
        const page = Math.max(1, scrollRef.current?.getViewportHeight() ?? logPaneRows);
        boundedScrollLogBy(-page);
        onScrollPageUp(page);
        setShowHelp(false);
        return;
      }
      if (looksLikePageDown(value, key.pageDown)) {
        const page = Math.max(1, scrollRef.current?.getViewportHeight() ?? logPaneRows);
        boundedScrollLogBy(page);
        onScrollPageDown(page);
        if (shouldFollowTailAfterScrollDown()) onFollowTail();
        setShowHelp(false);
        return;
      }
    }
    if (wheelUp) {
      boundedScrollLogBy(-SCROLL_STEP_LINES);
      onScrollUp(SCROLL_STEP_LINES);
      setShowHelp(false);
      return;
    }
    if (wheelDown) {
      boundedScrollLogBy(SCROLL_STEP_LINES);
      onScrollDown(SCROLL_STEP_LINES);
      if (shouldFollowTailAfterScrollDown()) onFollowTail();
      setShowHelp(false);
      return;
    }
    if (key.ctrl && value === 's') {
      clearCompletionSession();
      void onExport();
      return;
    }
    if (key.ctrl && value === 'c') {
      clearCompletionSession();
      onCtrlC();
      return;
    }
    if (key.ctrl && value === 'p') {
      clearCompletionSession();
      const prev = onHistoryUp(input);
      if (prev !== undefined) {
        setInput(prev);
      }
      setFocusArea('command');
      return;
    }
    if (key.ctrl && value === 'n') {
      clearCompletionSession();
      const next = onHistoryDown(input);
      if (next !== undefined) {
        setInput(next);
      }
      setFocusArea('command');
      return;
    }
    if (value === 'w' && isCommandEmpty) {
      onWrapToggle();
      return;
    }
    if (value === 'r' && isCommandEmpty) {
      onRawToggle();
      return;
    }
    if (value === 'f' && isCommandEmpty) {
      onFollowTail();
      return;
    }
    if (key.leftArrow && key.ctrl) {
      clearCompletionSession();
      onPanLeft();
      scrollRef.current?.remeasure();
      return;
    }
    if (key.rightArrow && key.ctrl) {
      clearCompletionSession();
      onPanRight();
      scrollRef.current?.remeasure();
      return;
    }
    if (key.upArrow && key.ctrl) {
      clearCompletionSession();
      boundedScrollLogBy(-SCROLL_STEP_LINES);
      onScrollUp(SCROLL_STEP_LINES);
      setFocusArea('scroll');
      return;
    }
    if (key.downArrow && key.ctrl) {
      clearCompletionSession();
      boundedScrollLogBy(SCROLL_STEP_LINES);
      onScrollDown(SCROLL_STEP_LINES);
      if (isNearBottom()) onFollowTail();
      setFocusArea('scroll');
      return;
    }
    if (key.upArrow && key.meta) {
      if (Date.now() < suppressArrowHistoryUntilRef.current) {
        return;
      }
      clearCompletionSession();
      const prev = onHistoryUp(input);
      if (prev !== undefined) {
        setInput(prev);
      }
      setFocusArea('command');
      return;
    }
    if (key.downArrow && key.meta) {
      if (Date.now() < suppressArrowHistoryUntilRef.current) {
        return;
      }
      clearCompletionSession();
      const next = onHistoryDown(input);
      if (next !== undefined) {
        setInput(next);
      }
      setFocusArea('command');
      return;
    }
    if (key.upArrow) {
      const intent = resolveArrowIntent({
        focusArea,
        input,
        suppressUntilMs: suppressArrowHistoryUntilRef.current,
        lastWheelAtMs: lastWheelAtRef.current,
        nowMs: Date.now(),
      });
      if (intent === 'ignore') return;
      if (intent === 'scroll') {
        boundedScrollLogBy(-SCROLL_STEP_LINES);
        onScrollUp(SCROLL_STEP_LINES);
        setFocusArea('scroll');
        return;
      }
      clearCompletionSession();
      const prev = onHistoryUp(input);
      if (prev !== undefined) {
        setInput(prev);
      }
      setFocusArea('command');
      return;
    }
    if (key.downArrow) {
      const intent = resolveArrowIntent({
        focusArea,
        input,
        suppressUntilMs: suppressArrowHistoryUntilRef.current,
        lastWheelAtMs: lastWheelAtRef.current,
        nowMs: Date.now(),
      });
      if (intent === 'ignore') return;
      if (intent === 'scroll') {
        boundedScrollLogBy(SCROLL_STEP_LINES);
        onScrollDown(SCROLL_STEP_LINES);
        if (shouldFollowTailAfterScrollDown()) onFollowTail();
        setFocusArea('scroll');
        return;
      }
      clearCompletionSession();
      const next = onHistoryDown(input);
      if (next !== undefined) {
        setInput(next);
      }
      setFocusArea('command');
      return;
    }
    if (key.shift && key.tab) {
      clearCompletionSession();
      setFocusArea((prev) => toggleFocusArea(prev));
      return;
    }
    if (key.tab) {
      cycleCompletion();
      return;
    }
    if (key.ctrl && value === ' ') {
      cycleCompletion();
      return;
    }
    if (key.return) {
      if (focusArea !== 'command') return;
      clearCompletionSession();
      void onSubmit(input);
      setInput('');
    }
  });
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {brandDisabledByNoColor() ? (
          <Text>lares4 console</Text>
        ) : (
          <Text bold color="#00ddff">
            lares4 console
          </Text>
        )}
        <Text color="gray">
          {` | conn:${connectionStatus} | events:${eventsStatus} | follow:${state.followTail ? 'on' : 'off'} | wrap:${state.wrapEnabled ? 'on' : 'off'} | raw:${state.rawFullEnabled ? 'on' : 'off'} | pan:${state.horizontalOffset}`}
        </Text>
      </Box>
      <Box
        borderStyle={focusArea === 'scroll' ? 'bold' : 'single'}
        borderColor={focusArea === 'scroll' ? 'cyan' : 'gray'}
        flexDirection="row"
        height={logPaneRows}
      >
        <Box flexGrow={1} flexDirection="column">
          <ScrollView
            ref={scrollRef}
            onScroll={(scrollOffset) => {
              setScrollBarState((prev) => normalizeScrollBarState({
                ...prev,
                scrollOffset,
              }));
            }}
            onViewportSizeChange={(size) => {
              setScrollBarState((prev) => normalizeScrollBarState({
                ...prev,
                viewportHeight: size.height,
              }));
            }}
            onContentHeightChange={(height) => {
              setScrollBarState((prev) => normalizeScrollBarState({
                ...prev,
                contentHeight: height,
              }));
            }}
          >
          {topVirtualPadRows > 0 ? <Text dimColor>{renderVirtualPadRows(topVirtualPadRows)}</Text> : null}
          {visibleRowsState.rows.map((row, idx) => (
            <Text key={`${row.kind}:${row.id ?? String(idx)}`} dimColor={row.kind === 'separator' && !row.strong}>
              {row.text}
            </Text>
          ))}
          {bottomVirtualPadRows > 0 ? <Text dimColor>{renderVirtualPadRows(bottomVirtualPadRows)}</Text> : null}
          </ScrollView>
        </Box>
        <ScrollBar
          placement="inset"
          style="line"
          autoHide
          contentHeight={scrollBarState.contentHeight}
          viewportHeight={scrollBarState.viewportHeight}
          scrollOffset={scrollBarState.scrollOffset}
        />
      </Box>
      <Box
        borderStyle={focusArea === 'command' ? 'bold' : 'single'}
        borderColor={focusArea === 'command' ? 'cyan' : 'gray'}
      >
        <Text>{COMMAND_PROMPT}</Text>
        <CommandTextInput value={input} onChange={setInput} focus={focusArea === 'command'} />
      </Box>
      {completionOpen && (
        <Box borderStyle="single" paddingX={1}>
          <Text wrap="truncate-end">
            <Text>hints </Text>
            {completionWindowStart > 0 ? <Text color="gray">… </Text> : null}
            {completionDisplayItems.map((item, idx) => {
              const globalIdx = completionWindowStart + idx;
              return (
                <Text key={`${String(globalIdx)}-${item}`}>
                  {idx > 0 ? <Text color="gray"> · </Text> : null}
                  <Text inverse={globalIdx === completionIndex}>{item}</Text>
                </Text>
              );
            })}
            {completionWindowStart + completionDisplayItems.length < completionItems.length ? (
              <Text color="gray"> …</Text>
            ) : null}
            <Text color="gray">{' · '}</Text>
            <Text dimColor italic>
              Tab/Ctrl+Space
            </Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
