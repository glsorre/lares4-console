// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Copy, MoreVertical, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { type TriggerRule } from '../engine.js';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock';
import { PaneEmpty } from '@/desktop/components/PaneEmpty.js';
import { useConnectionStatus } from '@/desktop/runtime/session-store.js';
import { TriggerEditorDialog } from './TriggerEditorDialog.js';
import { ACTION_OPTIONS, COLORS } from './constants.js';

interface TriggersPaneProps {
  triggers: TriggerRule[];
  onSave: (next: TriggerRule[]) => Promise<void>;
  disabledReason?: string;
  isLicensed: boolean;
}

function generateId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

function fireBeep(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => { void ctx.close(); }, 250);
  } catch { /* ignore */ }
}

function fireNotify(title: string, body: string): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: body.slice(0, 240) });
    } else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title, { body: body.slice(0, 240) });
      });
    }
  } catch { /* ignore */ }
}

export function TriggersPane({ triggers, onSave, disabledReason, isLicensed }: TriggersPaneProps) {
  const { t } = useTranslation();
  const { connected } = useConnectionStatus();
  const [draft, setDraft] = useState<TriggerRule[]>(triggers);
  const [error, setError] = useState<string | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const deleteRule = useMemo(
    () => (deleteRuleId ? draft.find((r) => r.id === deleteRuleId) : undefined),
    [draft, deleteRuleId],
  );

  useEffect(() => {
    setDraft(triggers);
    setError(undefined);
  }, [triggers]);

  const editingRule = useMemo(
    () => (editingId ? draft.find((r) => r.id === editingId) : undefined),
    [draft, editingId],
  );

  function commit(next: TriggerRule[]): void {
    setDraft(next);
    setError(undefined);
    void onSave(next).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }

  function setEnabled(id: string, enabled: boolean) {
    commit(draft.map((r) => (r.id === id ? { ...r, enabled } : r)));
  }

  function duplicateRule(id: string) {
    const idx = draft.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const src = draft[idx]!;
    const clone: TriggerRule = {
      ...src,
      id: generateId(),
      name: `${src.name}${t('pro.triggers.duplicateSuffix')}`,
      actions: src.actions.map((a) => ({ ...a })),
    };
    const next = draft.slice();
    next.splice(idx + 1, 0, clone);
    commit(next);
  }

  function removeRule(id: string) {
    commit(draft.filter((r) => r.id !== id));
  }

  function testRule(rule: TriggerRule) {
    for (const action of rule.actions) {
      if (action.kind === 'beep') fireBeep();
      else if (action.kind === 'notify') fireNotify(rule.name || t('pro.triggers.testRule'), action.message ?? rule.name);
    }
  }

  function openEditor(id: string) {
    setEditingId(id);
    setEditorMode('edit');
    setEditorOpen(true);
  }

  function openNewEditor() {
    setEditingId(null);
    setEditorMode('create');
    setEditorOpen(true);
  }

  function handleEditorSave(rule: TriggerRule) {
    if (editorMode === 'create') {
      commit([...draft, rule]);
      return;
    }
    const idx = draft.findIndex((r) => r.id === rule.id);
    if (idx < 0) return;
    const next = draft.slice();
    next[idx] = rule;
    commit(next);
  }

  const readOnly = !isLicensed;

  return (
    <Card className="bg-pane/70 text-card-foreground border-border/60 flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-sm ring-1 ring-border/40">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3">
        {!readOnly && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{draft.length}</span>
            <Button type="button" variant="ghost" size="sm" onClick={openNewEditor} className="h-7 gap-1.5 text-xs">
              <Plus className="size-3.5" aria-hidden />
              {t('pro.triggers.addRule')}
            </Button>
          </div>
        )}
        {readOnly && (
          <Alert>
            <AlertDescription className="flex items-center justify-between gap-2 text-xs">
              <span>{t('pro.triggers.proNotice')}</span>
              <ProFeatureLock featureId="triggers" label={t('pro.triggers.unlockToEdit')} />
            </AlertDescription>
          </Alert>
        )}
        {!readOnly && disabledReason && (
          <Alert>
            <AlertDescription className="text-xs">{disabledReason}</AlertDescription>
          </Alert>
        )}
        {!readOnly && error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs" role="alert">{error}</AlertDescription>
          </Alert>
        )}
        <ScrollArea className="min-h-0 flex-1 pr-2">
          {draft.length === 0 ? (
            <PaneEmpty
              icon={Bell}
              title={t('pro.triggers.emptyTitle')}
              description={
                readOnly
                  ? t('pro.triggers.emptyDescReadOnly')
                  : connected
                    ? t('pro.triggers.emptyDescConnected')
                    : t('pro.triggers.emptyDescDisconnected')
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {draft.map((rule) => (
                <RuleSummaryRow
                  key={rule.id}
                  rule={rule}
                  readOnly={readOnly}
                  onToggleEnabled={(v) => setEnabled(rule.id, v)}
                  onEdit={() => openEditor(rule.id)}
                  onDuplicate={() => duplicateRule(rule.id)}
                  onRequestDelete={() => setDeleteRuleId(rule.id)}
                  onTest={() => testRule(rule)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
      {!readOnly && (
        <TriggerEditorDialog
          open={editorOpen}
          initial={editingRule}
          onOpenChange={(open) => {
            setEditorOpen(open);
            if (!open) setEditingId(null);
          }}
          onSave={handleEditorSave}
        />
      )}
      {!readOnly && (
        <Dialog
          open={deleteRuleId !== null}
          onOpenChange={(open) => { if (!open) setDeleteRuleId(null); }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('pro.triggers.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('pro.triggers.deleteDesc', { name: deleteRule?.name ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteRuleId(null)}>
                {t('pro.triggers.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (deleteRuleId) removeRule(deleteRuleId);
                  setDeleteRuleId(null);
                }}
              >
                {t('pro.triggers.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

interface RuleSummaryRowProps {
  rule: TriggerRule;
  readOnly: boolean;
  onToggleEnabled: (v: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRequestDelete: () => void;
  onTest: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function RuleSummaryRow({
  rule,
  readOnly,
  onToggleEnabled,
  onEdit,
  onDuplicate,
  onRequestDelete,
  onTest,
  t,
}: RuleSummaryRowProps) {
  const highlightAction = rule.actions.find((a) => a.kind === 'highlight');
  const highlightColor = highlightAction?.color;
  const colorBarVar = highlightColor
    ? COLORS.find((c) => c.value === highlightColor)?.cssVar
    : undefined;
  const hasAudible = rule.actions.some((a) => a.kind === 'beep' || a.kind === 'notify');

  return (
    <li
      className={cn(
        'border-border/60 group relative flex items-center gap-2 rounded-lg border bg-background/40 py-1.5 pl-3 pr-1.5 transition-colors',
        !rule.enabled && 'opacity-60',
      )}
    >
      {colorBarVar && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-1 rounded-l-lg"
          style={{ backgroundColor: colorBarVar }}
        />
      )}
      <Checkbox
        checked={rule.enabled}
        onCheckedChange={(v) => onToggleEnabled(v === true)}
        aria-label={t('pro.triggers.enableRule')}
        disabled={readOnly}
      />
      <span className="max-w-[14rem] truncate text-sm font-medium" title={rule.name}>{rule.name}</span>
      <code
        className={cn(
          'flex-1 truncate font-mono text-xs',
          rule.match.trim().length === 0 ? 'text-muted-foreground italic' : 'text-foreground/80',
        )}
        title={rule.match || t('pro.triggers.emptyMatch')}
        aria-label={t('pro.triggers.rowMatchPreviewAria')}
      >
        {rule.match.trim().length === 0 ? t('pro.triggers.emptyMatch') : rule.match}
      </code>
      <span className="flex items-center gap-1" aria-hidden>
        {ACTION_OPTIONS.map((opt) => {
          if (!rule.actions.some((a) => a.kind === opt.kind)) return null;
          const Icon = opt.icon;
          return (
            <span
              key={opt.kind}
              className="text-muted-foreground/80 inline-flex items-center"
              title={t(opt.labelKey)}
            >
              <Icon className="size-3.5" />
            </span>
          );
        })}
      </span>
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 w-7 shrink-0 p-0"
              aria-label={t('pro.triggers.rowActionsAria')}
            >
              <MoreVertical className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-3" aria-hidden />
              {t('pro.triggers.rowEdit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!hasAudible}
              onSelect={() => { if (hasAudible) onTest(); }}
              title={t('pro.triggers.testRuleTooltip')}
            >
              <Play className="size-3" aria-hidden />
              {t('pro.triggers.testRule')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="size-3" aria-hidden />
              {t('pro.triggers.duplicateRule')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onRequestDelete}
            >
              <Trash2 className="size-3" aria-hidden />
              {t('pro.triggers.removeRule')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
