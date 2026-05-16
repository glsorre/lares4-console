// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Circle,
  Copy,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock';
import { PaneEmpty } from '@/desktop/components/PaneEmpty.js';
import { useSessionController } from '@pro/tabs/context.js';
import { useConnectionStatus, useMacrosSlice } from '@/desktop/runtime/session-store.js';
import type { Macro, MacroStep } from '@pro/macros/types.js';
import { MacroEditorDialog } from '@pro/macros/ui/MacroEditorDialog.js';

interface MacrosPaneProps {
  isLicensed: boolean;
  onLicenseChanged?: () => void;
}

function previewSteps(steps: MacroStep[]): string {
  const trimmed = steps.map((s) => s.command.trim()).filter((c) => c.length > 0);
  const head = trimmed.slice(0, 3).join(' · ');
  return trimmed.length > 3 ? `${head} · …` : head;
}

function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (startedAt === undefined) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function MacrosPane({ isLicensed, onLicenseChanged }: MacrosPaneProps) {
  const { t } = useTranslation();
  const { controller } = useSessionController();
  const {
    macros,
    activeMacro,
    recordingMacro: recording,
    recordingMacroSteps: recordingSteps,
    recordingMacroStartedAt,
  } = useMacrosSlice();
  const { connected } = useConnectionStatus();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>(undefined);
  const [deleteMacroId, setDeleteMacroId] = useState<string | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [recordingNameOpen, setRecordingNameOpen] = useState(false);
  const elapsedSec = useElapsedSeconds(recordingMacroStartedAt);

  if (!isLicensed) {
    return (
      <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
        <CardContent className="flex flex-1 items-center justify-center px-4 py-6">
          <ProFeatureLock
            featureId="macros"
            label={t('pro.macros.label')}
            variant="row"
            onLicenseChanged={onLicenseChanged}
          />
        </CardContent>
      </Card>
    );
  }

  function openNew() {
    setEditingMacro(undefined);
    setEditorOpen(true);
  }

  function openEdit(m: Macro) {
    setEditingMacro(m);
    setEditorOpen(true);
  }

  const activePct = activeMacro && activeMacro.total > 0
    ? Math.round((activeMacro.position / activeMacro.total) * 100)
    : 0;
  const activeEnded = activeMacro
    ? activeMacro.status === 'paused' && activeMacro.position >= activeMacro.total
    : false;

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">{macros.length}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={openNew}
          >
            <Plus className="size-3.5" aria-hidden />
            {t('pro.macros.new')}
          </Button>
        </div>
        {activeMacro && (
          <div className="bg-muted/40 border-border/60 flex flex-col gap-1 rounded-md border px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{activeMacro.name}</span>
                <span className="text-muted-foreground font-mono tabular-nums">
                  {t('pro.macros.stepLabel', { position: activeMacro.position, total: activeMacro.total })}
                  {' · '}
                  {activeMacro.status}
                </span>
              </span>
              <span className="flex items-center gap-0.5">
                {activeMacro.status === 'playing' ? (
                  <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.pauseMacro()} aria-label={t('pro.macros.pauseMacro')}>
                    <Pause className="size-3.5" aria-hidden />
                  </Button>
                ) : activeEnded ? (
                  <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.runMacro(activeMacro.id)} aria-label={t('pro.macros.restart')} disabled={!connected}>
                    <RotateCcw className="size-3.5" aria-hidden />
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.resumeMacro()} aria-label={t('pro.macros.resumeMacro')} disabled={!connected}>
                      <Play className="size-3.5" aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.stepMacro()} aria-label={t('pro.macros.stepOne')} disabled={!connected}>
                      <SkipForward className="size-3.5" aria-hidden />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-6 p-0"
                  onClick={() => controller.stopMacro()}
                  aria-label={activeEnded ? t('pro.macros.dismiss') : t('pro.macros.stopMacro')}
                >
                  {activeEnded ? <X className="size-3.5" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
                </Button>
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={activeMacro.total}
              aria-valuenow={activeMacro.position}
              aria-label={t('pro.macros.progressAria', { position: activeMacro.position, total: activeMacro.total })}
              className="bg-border/50 h-0.5 w-full overflow-hidden rounded-full"
            >
              <div className="bg-primary/70 h-full rounded-full transition-[width] duration-200" style={{ width: `${activePct}%` }} />
            </div>
          </div>
        )}

        {recording && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <Circle className="size-2.5 fill-current animate-pulse" aria-hidden />
              {t('pro.macros.recordingMeta', { count: recordingSteps, elapsed: elapsedSec })}
            </span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/15 hover:text-destructive h-6 gap-1 px-2 text-[11px]"
                onClick={() => {
                  setRecordingName('');
                  setRecordingNameOpen(true);
                }}
                aria-label={t('pro.macros.stopRecording')}
                disabled={recordingSteps === 0}
              >
                <Check className="size-3" aria-hidden />
                {t('pro.macros.recStopSave')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/15 hover:text-destructive h-6 gap-1 px-2 text-[11px]"
                onClick={() => controller.cancelRecordingMacro()}
                aria-label={t('pro.macros.cancelRecording')}
              >
                <Trash2 className="size-3" aria-hidden />
                {t('pro.macros.recDiscard')}
              </Button>
            </span>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1 pr-2">
          {macros.length === 0 ? (
            <PaneEmpty
              icon={Zap}
              title={t('pro.macros.emptyTitle')}
              description={
                connected
                  ? t('pro.macros.emptyDescConnected')
                  : t('pro.macros.emptyDescDisconnected')
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {macros.map((m) => {
                const isActive = activeMacro?.id === m.id;
                const preview = previewSteps(m.steps);
                return (
                  <li key={m.id}>
                    <div className={cn(
                      'border-border/60 flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 shadow-sm',
                      isActive && 'border-primary/40 ring-1 ring-primary/20',
                    )}>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-medium leading-tight">{m.name}</p>
                        {m.description && (
                          <p className="text-muted-foreground truncate text-xs leading-tight">{m.description}</p>
                        )}
                        <p className="text-muted-foreground text-xs">{t('pro.macros.steps', { count: m.steps.length })}</p>
                        {preview && (
                          <p className="text-muted-foreground/70 truncate font-mono text-[11px] leading-tight">{preview}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => controller.runMacro(m.id)}
                        disabled={isActive || !connected}
                        aria-label={t('pro.macros.runAria', { name: m.name })}
                      >
                        <Play className="size-3.5" aria-hidden />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="size-7 p-0 opacity-50 hover:opacity-100" aria-label={t('pro.macros.optionsAria', { name: m.name })}>
                            <MoreHorizontal className="size-3.5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onSelect={() => openEdit(m)}>{t('pro.macros.edit')}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => { void controller.duplicateMacro(m.id); }}>
                            <Copy className="size-3" aria-hidden />
                            {t('pro.macros.duplicate')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteMacroId(m.id)}>
                            <Trash2 className="size-3" aria-hidden />
                            {t('pro.macros.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {!recording && (
          <div className="border-border/60 flex items-center justify-end border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => controller.startRecordingMacro()}
              disabled={activeMacro !== undefined || !connected}
            >
              <Circle className="text-destructive size-3 fill-current" aria-hidden />
              {t('pro.macros.record')}
            </Button>
          </div>
        )}
      </CardContent>

      <MacroEditorDialog
        open={editorOpen}
        initial={editingMacro}
        onOpenChange={setEditorOpen}
        onSave={async (input) => { await controller.saveMacro(input); }}
      />

      <Dialog open={recordingNameOpen} onOpenChange={(open) => { if (!open) setRecordingNameOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pro.macros.saveRecTitle')}</DialogTitle>
            <DialogDescription>
              {t('pro.macros.saveRecDesc', { count: recordingSteps })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="rec-name" className="text-xs text-muted-foreground">{t('pro.macros.name')}</Label>
            <Input
              id="rec-name"
              className="h-8 text-xs"
              autoFocus
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              placeholder={t('pro.macros.recNamePlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { controller.cancelRecordingMacro(); setRecordingNameOpen(false); }}>
              {t('pro.macros.discard')}
            </Button>
            <Button
              type="button"
              disabled={!recordingName.trim()}
              onClick={() => {
                void controller.stopRecordingMacro(recordingName.trim());
                setRecordingNameOpen(false);
              }}
            >
              {t('pro.macros.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteMacroId !== null} onOpenChange={(open) => { if (!open) setDeleteMacroId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pro.macros.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('pro.macros.deleteDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteMacroId(null)}>{t('pro.macros.cancel')}</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteMacroId) void controller.removeMacro(deleteMacroId);
                setDeleteMacroId(null);
              }}
            >
              {t('pro.macros.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
