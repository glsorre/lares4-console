// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadSnippetsAdapter } from '../snippets-db.js';
import type { Snippet } from '../types.js';

interface SnippetsListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (snippet: Snippet) => void;
  /** When the user opens this dialog from the Save button, the current REPL input is offered
   *  as the body for a new (or replacing) snippet. */
  pendingSaveBody?: string;
  onSaved?: () => void;
}

export function SnippetsList(props: SnippetsListProps) {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    (async () => {
      try {
        const adapter = await loadSnippetsAdapter();
        const rows = await adapter.list();
        if (!cancelled) setSnippets(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [props.open]);

  async function refresh(): Promise<void> {
    try {
      const adapter = await loadSnippetsAdapter();
      setSnippets(await adapter.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveCurrent(): Promise<void> {
    if (saveName.trim().length === 0 || props.pendingSaveBody === undefined) return;
    try {
      const adapter = await loadSnippetsAdapter();
      await adapter.upsertByName(saveName.trim(), props.pendingSaveBody);
      setSaveName('');
      await refresh();
      props.onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      const adapter = await loadSnippetsAdapter();
      await adapter.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pro.repl.snippetsTitle')}</DialogTitle>
          <DialogDescription>{t('pro.repl.snippetsDescription')}</DialogDescription>
        </DialogHeader>

        {props.pendingSaveBody !== undefined && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
            <Label htmlFor="snippet-name" className="text-xs">
              {t('pro.repl.snippetsSaveLabel')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="snippet-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={t('pro.repl.snippetsNamePlaceholder')}
                className="h-8 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => { void saveCurrent(); }}
                disabled={saveName.trim().length === 0}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-72">
          {snippets.length === 0 ? (
            <div className="text-muted-foreground py-6 text-center text-xs">
              {t('pro.repl.snippetsEmpty')}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {snippets.map((snippet) => (
                <li key={snippet.id} className="flex items-center gap-2 py-1.5">
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start text-left"
                    onClick={() => {
                      props.onLoad(snippet);
                      props.onOpenChange(false);
                    }}
                  >
                    <span className="font-mono text-xs">{snippet.name}</span>
                    <span className="text-muted-foreground line-clamp-1 font-mono text-[0.65rem]">
                      {snippet.body.slice(0, 80)}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    aria-label={t('pro.repl.snippetsDelete')}
                    onClick={() => { void remove(snippet.id); }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {error !== undefined && (
          <p className="text-destructive text-xs">{error}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => props.onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
