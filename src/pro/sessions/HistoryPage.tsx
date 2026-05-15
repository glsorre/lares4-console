// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock.js';
import { useLicensed } from '@/desktop/runtime/session-store.js';
import { loadAdapter, type PersistedSession, type SessionsAdapter } from './db.js';

interface HistoryPageProps {
  loadAdapterFn?: () => Promise<SessionsAdapter>;
}

export function HistoryPage({ loadAdapterFn = loadAdapter }: HistoryPageProps = {}) {
  const { t, i18n } = useTranslation();
  const licensed = useLicensed().sessions;
  const [sessions, setSessions] = useState<PersistedSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PersistedSession | null>(null);

  const refresh = useCallback(async () => {
    if (!licensed) {
      setSessions(null);
      return;
    }
    try {
      const adapter = await loadAdapterFn();
      const rows = await adapter.listSessions(100);
      setSessions(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSessions([]);
    }
  }, [licensed, loadAdapterFn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      const adapter = await loadAdapterFn();
      await adapter.deleteSession(pendingDelete.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDelete(null);
      void refresh();
    }
  }

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

  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h1 className="font-heading text-foreground text-lg font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        <span className="text-muted-foreground text-xs">
          {sessions === null ? null : t('history.count', { count: sessions.length })}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="bg-pane/70 border-border/60 min-h-0 flex-1 overflow-hidden py-0 shadow-sm">
        <CardContent className="flex h-full min-h-0 flex-col px-0 pb-0">
          {sessions === null ? (
            <div className="text-muted-foreground p-4 text-sm">{t('history.loading')}</div>
          ) : sessions.length === 0 ? (
            <div className="text-muted-foreground p-4 text-sm">{t('history.empty')}</div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="divide-border/60 divide-y">
                {sessions.map((session) => {
                  const started = dateFmt.format(new Date(session.startedAt));
                  const ended = session.endedAt ? dateFmt.format(new Date(session.endedAt)) : t('history.openSuffix');
                  return (
                    <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                      <Link
                        to={`/history/${String(session.id)}`}
                        className="hover:bg-muted/40 -mx-2 flex min-w-0 flex-1 flex-col rounded-md px-2 py-1.5"
                      >
                        <span className="text-foreground truncate text-sm font-medium">
                          {session.profileName ?? t('history.noProfile')}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {started} → {ended} · {t('history.logCount', { count: session.logCount })}
                        </span>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0 p-0"
                        onClick={() => setPendingDelete(session)}
                        aria-label={t('history.deleteAria')}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('history.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('history.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => { void confirmDelete(); }}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
