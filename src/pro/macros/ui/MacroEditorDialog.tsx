// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/macros.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Copy, Loader2, MoreVertical, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_STEP_DELAY_MS, type Macro, type MacroStep } from '../types.js';

interface MacroEditorDialogProps {
  open: boolean;
  initial?: Macro;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { id?: string; name: string; description?: string; steps: MacroStep[] }) => Promise<void>;
}

function coerceDelay(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export function MacroEditorDialog({ open, initial, onOpenChange, onSave }: MacroEditorDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<MacroStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setSteps(initial ? initial.steps.map((s) => ({ ...s })) : [{ command: '' }]);
      setSaving(false);
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (pendingFocusRef.current === null) return;
    const idx = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const el = commandRefs.current[idx];
    if (el) el.focus();
  }, [steps]);

  function updateStep(index: number, patch: Partial<MacroStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function addStep() {
    setSteps((prev) => {
      pendingFocusRef.current = prev.length;
      return [...prev, { command: '' }];
    });
  }

  function duplicateStep(index: number) {
    setSteps((prev) => {
      const src = prev[index];
      if (!src) return prev;
      const copy: MacroStep = src.delayMs !== undefined
        ? { command: src.command, delayMs: src.delayMs }
        : { command: src.command };
      pendingFocusRef.current = index + 1;
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  const trimmedName = name.trim();
  const nonEmptySteps = steps.filter((s) => s.command.trim().length > 0);
  const hasEmptyCommand = steps.some((s) => s.command.trim().length === 0);
  const canSave =
    trimmedName.length > 0 &&
    steps.length > 0 &&
    !hasEmptyCommand &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: initial?.id,
        name: trimmedName,
        description: description.trim() || undefined,
        steps: steps.map((s) => {
          const command = s.command.trim();
          return s.delayMs !== undefined ? { command, delayMs: s.delayMs } : { command };
        }),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  function onStepKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const step = steps[index];
      if (!step) return;
      if (step.command.trim().length === 0) return;
      if (index === steps.length - 1) {
        e.preventDefault();
        addStep();
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{initial ? t('pro.macros.editor.titleEdit') : t('pro.macros.editor.titleNew')}</DialogTitle>
          <DialogDescription>
            {t('pro.macros.editor.desc')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="macro-name" className="text-xs text-muted-foreground">{t('pro.macros.editor.nameLabel')}</Label>
            <Input
              id="macro-name"
              className="h-8 text-xs"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder={t('pro.macros.editor.namePlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="macro-desc" className="text-xs text-muted-foreground">{t('pro.macros.editor.descLabel')}</Label>
            <Textarea
              id="macro-desc"
              className="min-h-14 text-xs"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              placeholder={t('pro.macros.editor.descPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('pro.macros.editor.commandsLabel')}</Label>
            <div className="space-y-2">
              {steps.map((step, index) => {
                const cmdId = `macro-step-cmd-${index}`;
                const delayId = `macro-step-delay-${index}`;
                const isFirst = index === 0;
                const isLast = index === steps.length - 1;
                return (
                  <div key={index} className="border-border/60 bg-background/40 rounded-md border p-2">
                    <div className="text-muted-foreground mb-1 text-[0.65rem]">
                      {t('pro.macros.editor.stepNumber', { n: index + 1 })}
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Label htmlFor={cmdId} className="sr-only">
                          {t('pro.macros.editor.stepCommandLabel', { n: index + 1 })}
                        </Label>
                        <Input
                          id={cmdId}
                          ref={(el) => { commandRefs.current[index] = el; }}
                          value={step.command}
                          onChange={(e) => updateStep(index, { command: e.target.value })}
                          onKeyDown={(e) => onStepKeyDown(index, e)}
                          placeholder={t('pro.macros.editor.stepCommandPlaceholder')}
                          className="h-8 font-mono text-xs"
                          spellCheck={false}
                        />
                      </div>
                      <div className="w-28">
                        <Label htmlFor={delayId} className="sr-only">
                          {t('pro.macros.editor.stepDelayLabel', { n: index + 1 })}
                        </Label>
                        <Input
                          id={delayId}
                          type="number"
                          min={0}
                          step={50}
                          value={step.delayMs ?? ''}
                          onChange={(e) => updateStep(index, { delayMs: coerceDelay(e.target.value) })}
                          placeholder={String(DEFAULT_STEP_DELAY_MS)}
                          className="h-8 text-xs"
                          aria-label={t('pro.macros.editor.stepDelayLabel', { n: index + 1 })}
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground h-8 w-8 shrink-0 p-0"
                            aria-label={t('pro.macros.editor.stepActions', { n: index + 1 })}
                          >
                            <MoreVertical className="size-3.5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem
                            disabled={isFirst}
                            onSelect={() => moveStep(index, -1)}
                            aria-label={t('pro.macros.editor.stepMoveUp', { n: index + 1 })}
                          >
                            <ChevronUp className="size-3" aria-hidden />
                            {t('pro.macros.editor.stepMoveUp', { n: index + 1 })}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={isLast}
                            onSelect={() => moveStep(index, 1)}
                            aria-label={t('pro.macros.editor.stepMoveDown', { n: index + 1 })}
                          >
                            <ChevronDown className="size-3" aria-hidden />
                            {t('pro.macros.editor.stepMoveDown', { n: index + 1 })}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => duplicateStep(index)}
                            aria-label={t('pro.macros.editor.stepDuplicate', { n: index + 1 })}
                          >
                            <Copy className="size-3" aria-hidden />
                            {t('pro.macros.editor.stepDuplicate', { n: index + 1 })}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => removeStep(index)}
                            aria-label={t('pro.macros.editor.stepRemove', { n: index + 1 })}
                          >
                            <Trash2 className="size-3" aria-hidden />
                            {t('pro.macros.editor.stepRemove', { n: index + 1 })}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={addStep}
              disabled={saving}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('pro.macros.editor.addStep')}
            </Button>
            <p className="text-muted-foreground text-[0.65rem]">
              {t('pro.macros.steps', { count: nonEmptySteps.length })}
              {' · '}
              {t('pro.macros.editor.delayHint', { default: DEFAULT_STEP_DELAY_MS })}
            </p>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t('pro.macros.editor.cancel')}
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t('pro.macros.editor.saving')}</> : t('pro.macros.editor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
