// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ../LICENSE.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { compileLogQuery } from '@/core/log-query.js';
import {
  validateTriggerMatch,
  type HighlightColor,
  type TriggerAction,
  type TriggerActionKind,
  type TriggerRule,
} from '../engine.js';
import {
  buildMatch,
  makeCondition,
  parseMatch,
  type Condition,
} from '../match-dsl.js';
import { ConditionRow } from './ConditionRow.js';
import { ACTION_OPTIONS, COLORS } from './constants.js';

interface TriggerEditorDialogProps {
  open: boolean;
  initial?: TriggerRule;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: TriggerRule) => void;
}

function generateRuleId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TriggerEditorDialog({ open, initial, onOpenChange, onSave }: TriggerEditorDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [advanced, setAdvanced] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [rawValue, setRawValue] = useState('');
  const [actions, setActions] = useState<TriggerAction[]>([]);

  useEffect(() => {
    if (!open) return;
    const parsed = parseMatch(initial?.match ?? '');
    setName(initial?.name ?? '');
    setEnabled(initial?.enabled ?? true);
    setConditions(parsed.conditions.length > 0 ? parsed.conditions : [makeCondition('tag')]);
    setAdvanced(parsed.advanced);
    setRawMode(false);
    setRawValue(initial?.match ?? '');
    setActions(initial ? initial.actions.map((a) => ({ ...a })) : [{ kind: 'highlight', color: 'amber' }]);
  }, [open, initial]);

  const structuredMatch = useMemo(() => buildMatch({ conditions, advanced }), [conditions, advanced]);
  const effectiveMatch = rawMode ? rawValue.trim() : structuredMatch;
  const matchValidation = validateTriggerMatch(effectiveMatch);
  const rawCompile = useMemo(() => (rawMode ? compileLogQuery(rawValue) : undefined), [rawMode, rawValue]);
  const cannotLeaveRawMode = rawMode && rawCompile?.error !== undefined;

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && actions.length > 0 && matchValidation.ok;

  function updateCondition(id: string, next: Condition) {
    setConditions((prev) => prev.map((c) => (c.id === id ? next : c)));
  }

  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  function addCondition() {
    setConditions((prev) => [...prev, makeCondition('tag')]);
  }

  function toggleRawMode() {
    if (rawMode) {
      if (cannotLeaveRawMode) return;
      const parsed = parseMatch(rawValue);
      setConditions(parsed.conditions.length > 0 ? parsed.conditions : [makeCondition('tag')]);
      setAdvanced(parsed.advanced);
      setRawMode(false);
    } else {
      setRawValue(structuredMatch);
      setRawMode(true);
    }
  }

  function toggleAction(kind: TriggerActionKind) {
    setActions((prev) => {
      const has = prev.some((a) => a.kind === kind);
      if (has) return prev.filter((a) => a.kind !== kind);
      const action: TriggerAction = kind === 'highlight' ? { kind, color: 'amber' } : { kind };
      return [...prev, action];
    });
  }

  function setHighlightColor(color: HighlightColor) {
    setActions((prev) => prev.map((a) => (a.kind === 'highlight' ? { ...a, color } : a)));
  }

  function handleSave() {
    if (!canSave) return;
    const rule: TriggerRule = {
      id: initial?.id ?? generateRuleId(),
      name: trimmedName,
      enabled,
      match: effectiveMatch,
      actions: actions.map((a) => ({ ...a })),
    };
    onSave(rule);
    onOpenChange(false);
  }

  const highlightActive = actions.some((a) => a.kind === 'highlight');
  const currentColor: HighlightColor = actions.find((a) => a.kind === 'highlight')?.color ?? 'amber';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? t('pro.triggers.editor.titleEdit') : t('pro.triggers.editor.titleNew')}</DialogTitle>
          <DialogDescription>{t('pro.triggers.editor.desc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="trigger-name" className="text-muted-foreground text-xs">{t('pro.triggers.editor.nameLabel')}</Label>
            <Input
              id="trigger-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('pro.triggers.ruleNamePlaceholder')}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-muted-foreground text-xs">{t('pro.triggers.editor.matchSectionLabel')}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[0.7rem]"
                onClick={toggleRawMode}
                disabled={cannotLeaveRawMode}
                title={cannotLeaveRawMode ? t('pro.triggers.editor.rawModeHelp') : undefined}
              >
                {rawMode ? t('pro.triggers.editor.exitRawMode') : t('pro.triggers.editor.rawModeToggle')}
              </Button>
            </div>
            {rawMode ? (
              <div className="space-y-1">
                <Textarea
                  value={rawValue}
                  onChange={(e) => setRawValue(e.target.value)}
                  className="min-h-20 font-mono text-xs"
                  placeholder={t('pro.triggers.matchPlaceholder')}
                  spellCheck={false}
                />
                {rawCompile?.error && (
                  <span className="text-destructive font-mono text-xs">{rawCompile.error}</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond) => (
                  <ConditionRow
                    key={cond.id}
                    condition={cond}
                    onChange={(next) => updateCondition(cond.id, next)}
                    onRemove={() => removeCondition(cond.id)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={addCondition}
                >
                  <Plus className="size-3" aria-hidden />
                  {t('pro.triggers.editor.addCondition')}
                </Button>
                <div className="space-y-1">
                  <Label htmlFor="trigger-advanced" className="text-muted-foreground text-[0.65rem]">
                    {t('pro.triggers.editor.advancedLabel')}
                  </Label>
                  <Input
                    id="trigger-advanced"
                    value={advanced}
                    onChange={(e) => setAdvanced(e.target.value)}
                    placeholder={t('pro.triggers.editor.advancedPlaceholder')}
                    className="h-8 font-mono text-xs"
                    spellCheck={false}
                  />
                </div>
                <div className="text-muted-foreground flex items-center gap-1 text-[0.65rem]">
                  <span>{t('pro.triggers.editor.previewLabel')}</span>
                  <code className="bg-muted/40 rounded px-1 py-0.5 font-mono text-[0.7rem]">
                    {structuredMatch || t('pro.triggers.emptyMatch')}
                  </code>
                </div>
              </div>
            )}
            {!matchValidation.ok && (
              <span className="text-destructive font-mono text-xs" role="alert">{matchValidation.error}</span>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">{t('pro.triggers.editor.actionsSectionLabel')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {ACTION_OPTIONS.map((opt) => {
                const active = actions.some((a) => a.kind === opt.kind);
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => toggleAction(opt.kind)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3" aria-hidden />
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
            {highlightActive && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">{t('pro.triggers.colorLabel')}</span>
                {COLORS.map((c) => {
                  const active = currentColor === c.value;
                  const colorLabel = t(c.labelKey);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setHighlightColor(c.value)}
                      aria-label={t('pro.triggers.highlightAria', { color: colorLabel })}
                      aria-pressed={active}
                      title={colorLabel}
                      className={cn(
                        'size-5 rounded-full border-2 transition-transform',
                        c.swatch,
                        active ? 'border-foreground scale-110' : 'border-transparent opacity-70',
                      )}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('pro.triggers.editor.cancel')}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {t('pro.triggers.editor.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
