// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, FileText, Play, ShieldAlert, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSessionController } from '@pro/tabs/context.js';
import { useConnectionStatus } from '@/desktop/runtime/session-store.js';
import { ReplEvalHost } from '../eval-host.js';
import { loadScratchpad, saveScratchpad, getScratchpadPath } from '../scratchpad.js';
import type { ReplEntry } from '../types.js';
import { SnippetsList } from './SnippetsList.js';

const HISTORY_KEY = 'lares4.repl.history';
const HISTORY_LIMIT = 200;

function loadHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(-HISTORY_LIMIT);
  } catch { return []; }
}

function saveHistory(history: string[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)));
  } catch { /* quota / privacy mode — silent */ }
}

export function ReplPane() {
  const { t } = useTranslation();
  const { controller } = useSessionController();
  const { connected } = useConnectionStatus();
  const [entries, setEntries] = useState<ReplEntry[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [snippetsSaveBody, setSnippetsSaveBody] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const appendEntry = useCallback((entry: ReplEntry) => {
    setEntries((prev) => prev.concat(entry));
  }, []);

  const host = useMemo(() => {
    return new ReplEvalHost({
      getLares: () => controller.getActiveLares(),
      getLogStore: () => controller.getLogStore(),
      appendEntry,
    });
  }, [controller, appendEntry]);

  useEffect(() => {
    const unsubscribe = host.subscribeBusy(() => setBusy(host.isBusy()));
    return () => {
      unsubscribe();
      host.dispose();
    };
  }, [host]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  async function runInput(): Promise<void> {
    const body = input;
    if (body.trim().length === 0) return;
    setInput('');
    const nextHistory = history.concat(body).slice(-HISTORY_LIMIT);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    setHistoryIndex(-1);
    await host.run(body);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void runInput();
      return;
    }
    if (event.key === 'ArrowUp' && (event.target as HTMLTextAreaElement).selectionStart === 0 && history.length > 0) {
      event.preventDefault();
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(history[nextIdx] ?? '');
      return;
    }
    if (event.key === 'ArrowDown' && historyIndex !== -1) {
      event.preventDefault();
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx] ?? '');
      }
    }
  }

  function clearScrollback(): void {
    setEntries([]);
  }

  async function handleLoadScratchpad(): Promise<void> {
    try {
      const content = await loadScratchpad();
      setInput(content);
      setStatusMessage(t('pro.repl.scratchpadLoaded', { path: await getScratchpadPath() }));
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveScratchpad(): Promise<void> {
    try {
      const path = await saveScratchpad(input);
      setStatusMessage(t('pro.repl.scratchpadSaved', { path }));
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-destructive bg-destructive/10 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[0.65rem] uppercase">
                <ShieldAlert className="size-3" aria-hidden />
                {t('pro.repl.expertBadge')}
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('pro.repl.expertBadgeTooltip')}</TooltipContent>
          </Tooltip>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => { setSnippetsSaveBody(undefined); setSnippetsOpen(true); }}
            >
              <BookOpen className="size-3.5" aria-hidden />
              {t('pro.repl.snippets')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => { void handleLoadScratchpad(); }}
            >
              <FileText className="size-3.5" aria-hidden />
              {t('pro.repl.scratchpadLoad')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => { void handleSaveScratchpad(); }}
              disabled={input.length === 0}
            >
              {t('pro.repl.scratchpadSave')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={clearScrollback}
              disabled={entries.length === 0}
            >
              {t('pro.repl.clear')}
            </Button>
          </span>
        </div>

        <ScrollArea className="border-border/40 bg-background/60 min-h-0 flex-1 rounded-md border">
          <div
            ref={scrollRef}
            className="h-full overflow-auto px-2 py-1.5 font-mono text-xs"
          >
            {entries.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center">
                {connected ? t('pro.repl.scrollbackEmpty') : t('pro.repl.disconnected')}
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {entries.map((entry) => (
                  <li key={entry.id} className="leading-snug">
                    <EntryRow entry={entry} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); setHistoryIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder={t('pro.repl.inputPlaceholder')}
            rows={3}
            spellCheck={false}
            disabled={!connected}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-mono text-[0.65rem]">
              {statusMessage ?? t('pro.repl.inputHint')}
            </span>
            <span className="flex gap-1">
              {busy && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => host.stop()}
                >
                  <Square className="size-3.5" aria-hidden />
                  {t('pro.repl.stop')}
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => { void runInput(); }}
                disabled={!connected || input.trim().length === 0 || busy}
              >
                <Play className="size-3.5" aria-hidden />
                {t('pro.repl.run')}
              </Button>
            </span>
          </div>
        </div>
      </CardContent>

      <SnippetsList
        open={snippetsOpen}
        onOpenChange={setSnippetsOpen}
        onLoad={(snippet) => { setInput(snippet.body); setStatusMessage(t('pro.repl.snippetsLoaded', { name: snippet.name })); }}
        pendingSaveBody={snippetsSaveBody}
        onSaved={() => setSnippetsSaveBody(undefined)}
      />
    </Card>
  );
}

function EntryRow({ entry }: { entry: ReplEntry }) {
  if (entry.kind === 'input') {
    return (
      <pre className="text-primary whitespace-pre-wrap">{`> ${entry.text}`}</pre>
    );
  }
  if (entry.kind === 'error') {
    return (
      <pre className="text-destructive whitespace-pre-wrap">{entry.text}</pre>
    );
  }
  if (entry.kind === 'print') {
    return (
      <pre className="text-muted-foreground whitespace-pre-wrap">{entry.text}</pre>
    );
  }
  return (
    <pre className="text-foreground whitespace-pre-wrap">{entry.text}</pre>
  );
}
