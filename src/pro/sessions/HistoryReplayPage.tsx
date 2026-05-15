// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { LogsListPane } from '@/desktop/components/LogsListPane.js';
import { LogDetailPane } from '@/desktop/components/LogDetailPane.js';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock.js';
import { useLicensed } from '@/desktop/runtime/session-store.js';
import { showSaveDialog, writeUtf8File } from '@/desktop/runtime/tauri-fs.js';
import { redactSecrets } from '@/core/utils.js';
import type { LogEntry } from '@/core/types.js';
import { loadAdapter, type PersistedSession, type SessionsAdapter } from './db.js';

interface HistoryReplayPageProps {
  loadAdapterFn?: () => Promise<SessionsAdapter>;
}

export function HistoryReplayPage({ loadAdapterFn = loadAdapter }: HistoryReplayPageProps = {}) {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const licensed = useLicensed().sessions;
  const sessionId = params.id !== undefined ? Number.parseInt(params.id, 10) : NaN;
  const [meta, setMeta] = useState<PersistedSession | null>(null);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!licensed) return;
    if (Number.isNaN(sessionId)) {
      setError(t('history.invalidId'));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const adapter = await loadAdapterFn();
        const [s, rows] = await Promise.all([
          adapter.loadSession(sessionId),
          adapter.loadSessionEntries(sessionId),
        ]);
        if (cancelled) return;
        if (s === null) {
          setError(t('history.notFound'));
          return;
        }
        setMeta(s);
        setEntries(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [licensed, sessionId, loadAdapterFn, t]);

  const emptyBookmarks = useMemo(() => new Set<string>(), []);

  if (!licensed) {
    return (
      <ProFeatureLock
        featureId="sessions"
        label={t('pro.sessions.lockLabel')}
        variant="pane"
        paneDescription={t('pro.sessions.lockDescription')}
      />
    );
  }

  async function handleExport() {
    if (meta === null || entries === null) return;
    const defaultPath = `session-${String(meta.id)}.log`;
    const target = await showSaveDialog({
      defaultPath,
      title: t('history.exportDialogTitle'),
      filters: [{ name: 'Log file', extensions: ['log', 'txt'] }],
    });
    if (!target) return;
    const lines = [
      '# lares4-debug-console session',
      `started_at=${meta.startedAt}`,
      `ended_at=${meta.endedAt ?? ''}`,
      `profile=${meta.profileName ?? ''}`,
      `format=${meta.format ?? ''}`,
      `events=${meta.events ?? ''}`,
      '',
      ...entries.map((log) => `[${log.ts}] [${log.tag}] [${log.level}] ${log.message}`),
    ];
    await writeUtf8File(target, redactSecrets(`${lines.join('\n')}\n`));
  }

  const detailContent = (
    <LogDetailPane
      entries={entries ?? []}
      selectedId={selectedId}
      outputFormat={(meta?.format ?? 'pretty') as 'pretty' | 'json'}
      onFormatChange={() => undefined}
      forceConnected
    />
  );

  const listContent = (
    <LogsListPane
      entries={entries ?? []}
      selectedId={selectedId}
      onSelect={setSelectedId}
      searchInput=""
      bookmarkedIds={emptyBookmarks}
      onToggleBookmark={() => undefined}
      pinnedId={undefined}
      onPinnedIdChange={() => undefined}
      annotationsLicensed={false}
    />
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
            <Link to="/history">
              <ArrowLeft className="size-4" aria-hidden />
              {t('history.backLabel')}
            </Link>
          </Button>
          <h1 className="font-heading text-foreground text-base font-semibold tracking-tight">
            {meta?.profileName ?? t('history.noProfile')}
          </h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => { void handleExport(); }}
          disabled={meta === null || entries === null}
        >
          <Download className="size-4" aria-hidden />
          {t('history.exportLabel')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="bg-pane/70 border-border/60 flex min-h-0 flex-1 overflow-hidden py-0 shadow-sm">
        <CardContent className="flex h-full min-h-0 flex-1 px-0 pb-0">
          <Group orientation="horizontal" id="history-replay" className="flex min-h-0 min-w-0 flex-1" defaultLayout={{ logs: 42, detail: 58 }}>
            <Panel id="logs" minSize="22%" defaultSize="42%" className="min-w-0">
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                {listContent}
              </div>
            </Panel>
            <Separator className="bg-border/80 hover:bg-border focus-visible:ring-ring mx-1 w-1 shrink-0 cursor-col-resize rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none" />
            <Panel id="detail" minSize="22%" defaultSize="58%" className="min-w-0">
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                {detailContent}
              </div>
            </Panel>
          </Group>
        </CardContent>
      </Card>
    </div>
  );
}
