// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Circle, MoreHorizontal, Pause, Play, Plus, Square, Trash2, Zap } from 'lucide-react';
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
import type { Macro } from '@pro/macros/types.js';
import { MacroEditorDialog } from '@pro/macros/ui/MacroEditorDialog.js';

interface MacrosPaneProps {
  isLicensed: boolean;
  onLicenseChanged?: () => void;
}

export function MacrosPane({ isLicensed, onLicenseChanged }: MacrosPaneProps) {
  const { t } = useTranslation();
  const { controller, snapshot } = useSessionController();
  const macros = snapshot.macros;
  const activeMacro = snapshot.activeMacro;
  const recording = snapshot.recordingMacro;
  const recordingSteps = snapshot.recordingMacroSteps;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>(undefined);
  const [deleteMacroId, setDeleteMacroId] = useState<string | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [recordingNameOpen, setRecordingNameOpen] = useState(false);

  const connected = snapshot.connected;

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
          <div className="bg-muted/40 border-border/60 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
            <span className="truncate font-mono">
              {activeMacro.name} · {activeMacro.position}/{activeMacro.total} · {activeMacro.status}
            </span>
            <span className="flex items-center gap-0.5">
              {activeMacro.status === 'playing' ? (
                <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.pauseMacro()} aria-label={t('pro.macros.pauseMacro')}>
                  <Pause className="size-3.5" aria-hidden />
                </Button>
              ) : activeMacro.position < activeMacro.total ? (
                <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.resumeMacro()} aria-label={t('pro.macros.resumeMacro')}>
                  <Play className="size-3.5" aria-hidden />
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="size-6 p-0" onClick={() => controller.stopMacro()} aria-label={t('pro.macros.stopMacro')}>
                <Square className="size-3.5" aria-hidden />
              </Button>
            </span>
          </div>
        )}

        {recording && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <Circle className="size-2.5 fill-current" aria-hidden />
              {t('pro.macros.recordingSteps', { count: recordingSteps })}
            </span>
            <span className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => {
                  setRecordingName('');
                  setRecordingNameOpen(true);
                }}
                aria-label={t('pro.macros.stopRecording')}
              >
                <Check className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => controller.cancelRecordingMacro()}
                aria-label={t('pro.macros.cancelRecording')}
              >
                <Trash2 className="size-3.5" aria-hidden />
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
                const isActive = activeMacro?.name === m.name;
                return (
                  <li key={m.id}>
                    <div className={cn(
                      'border-border/60 flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 shadow-sm',
                      isActive && 'border-primary/40 ring-1 ring-primary/20',
                    )}>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-medium leading-tight">{m.name}</p>
                        <p className="text-muted-foreground text-xs">{t('pro.macros.steps', { count: m.steps.length })}</p>
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
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => controller.startRecordingMacro()}
              disabled={activeMacro !== undefined || !connected}
            >
              <Circle className="size-3" aria-hidden />
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
