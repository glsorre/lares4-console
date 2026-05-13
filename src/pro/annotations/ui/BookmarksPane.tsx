import { useMemo, useState } from 'react';
import { Bookmark as BookmarkIcon, Download, Pencil, Trash2 } from 'lucide-react';
import type { Bookmark } from '../types.js';
import { buildMessageListItems, formatLogClock } from '../../../core/log-view.js';
import type { LogEntry } from '../../../core/types.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getTagClasses } from '@/desktop/runtime/log-tag-classes.js';
import { PaneEmpty } from '@/desktop/components/PaneEmpty.js';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock';
import { useSessionController } from '@pro/tabs/context.js';

interface BookmarksPaneProps {
  bookmarks: Bookmark[];
  entries: LogEntry[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRemove: (groupId: string) => void;
  onUpdateNote: (groupId: string, note: string | undefined) => void;
  onExport: () => Promise<string | undefined>;
  isLicensed: boolean;
}

export function BookmarksPane({
  bookmarks, entries, selectedId, onSelect, onRemove, onUpdateNote, onExport, isLicensed,
}: BookmarksPaneProps) {
  const { snapshot } = useSessionController();
  const connected = snapshot.connected;
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [exportStatus, setExportStatus] = useState<string | undefined>(undefined);

  const itemsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildMessageListItems>[number]>();
    for (const item of buildMessageListItems(entries)) map.set(item.id, item);
    return map;
  }, [entries]);

  async function handleExport() {
    try {
      const path = await onExport();
      setExportStatus(path ? `Saved: ${path}` : undefined);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {isLicensed && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{bookmarks.length}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void handleExport()}
              disabled={bookmarks.length === 0}
              aria-label="Export bookmarks"
            >
              <Download className="size-3.5" aria-hidden />
              Export
            </Button>
          </div>
        )}
        {exportStatus && (
          <div className="text-muted-foreground text-xs">{exportStatus}</div>
        )}
        {bookmarks.length === 0 ? (
          !isLicensed ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="bg-muted/50 text-muted-foreground/60 ring-border/40 flex size-10 items-center justify-center rounded-full ring-1">
                <BookmarkIcon className="size-4" aria-hidden />
              </div>
              <div className="space-y-1.5">
                <p className="text-foreground text-sm font-semibold tracking-tight">No bookmarks</p>
                <p className="text-muted-foreground mx-auto max-w-[18rem] text-xs leading-relaxed">
                  Bookmarks are a commercial feature. Unlock to start pinning and annotating log entries.
                </p>
              </div>
              <ProFeatureLock featureId="annotations" label="Unlock bookmarks" />
            </div>
          ) : (
            <PaneEmpty
              icon={BookmarkIcon}
              title="No bookmarks"
              description={
                connected
                  ? 'Click the star on any log row to bookmark it. Bookmarks persist until you clear the log buffer.'
                  : 'Connect a panel from the sidebar to capture log rows you can bookmark.'
              }
            />
          )
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="flex flex-col gap-1 px-2 py-2" role="list">
              {bookmarks.map((bookmark) => {
                const item = itemsById.get(bookmark.groupId);
                const selected = bookmark.groupId === selectedId;
                const isEditing = editingId === bookmark.groupId && isLicensed;
                return (
                  <li key={bookmark.groupId}>
                    <div
                      className={cn(
                        'border-border/40 hover:bg-muted/70 rounded-lg border bg-background/40 px-2.5 py-2',
                        selected && 'border-primary/40 bg-accent/40 ring-1 ring-primary/25',
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 text-left"
                        onClick={() => onSelect(bookmark.groupId)}
                      >
                        {item && (
                          <span className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold uppercase',
                            getTagClasses(item.tag),
                          )}>
                            {item.tag}
                          </span>
                        )}
                        <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums shrink-0">
                          {item ? formatLogClock(item.ts) : '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {item?.preview ?? <span className="text-muted-foreground italic">entry no longer in buffer</span>}
                        </span>
                      </button>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  onUpdateNote(bookmark.groupId, draft.trim());
                                  setEditingId(undefined);
                                }
                                if (event.key === 'Escape') setEditingId(undefined);
                              }}
                              placeholder="Note"
                              className="h-7 flex-1 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                onUpdateNote(bookmark.groupId, draft.trim());
                                setEditingId(undefined);
                              }}
                            >
                              Save
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs italic">
                              {bookmark.note ?? 'no note'}
                            </span>
                            {isLicensed && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
                                  onClick={() => {
                                    setEditingId(bookmark.groupId);
                                    setDraft(bookmark.note ?? '');
                                  }}
                                  aria-label="Edit note"
                                  title="Edit note"
                                >
                                  <Pencil className="size-3" aria-hidden />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-destructive h-6 w-6 p-0"
                                  onClick={() => onRemove(bookmark.groupId)}
                                  aria-label="Remove bookmark"
                                  title="Remove bookmark"
                                >
                                  <Trash2 className="size-3" aria-hidden />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
        {!isLicensed && bookmarks.length > 0 && (
          <div className="border-border/60 border-t px-3 py-2">
            <ProFeatureLock featureId="annotations" label="Unlock bookmark editing & export" variant="row" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
