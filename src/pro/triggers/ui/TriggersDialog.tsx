import { useEffect, useMemo, useState } from 'react';
import { Bell, Pause, Plus, Trash2, Volume2, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  validateTriggerMatch,
  type HighlightColor,
  type TriggerAction,
  type TriggerActionKind,
  type TriggerRule,
} from '../engine.js';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock';

interface TriggersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggers: TriggerRule[];
  onSave: (next: TriggerRule[]) => Promise<void>;
  disabledReason?: string;
  isLicensed: boolean;
}

const COLORS: Array<{ value: HighlightColor; label: string; swatch: string }> = [
  { value: 'red', label: 'Red', swatch: 'bg-red-500' },
  { value: 'amber', label: 'Amber', swatch: 'bg-amber-500' },
  { value: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
  { value: 'blue', label: 'Blue', swatch: 'bg-blue-500' },
  { value: 'violet', label: 'Violet', swatch: 'bg-violet-500' },
];

const ACTION_OPTIONS: Array<{ kind: TriggerActionKind; label: string; icon: typeof Zap }> = [
  { kind: 'highlight', label: 'Highlight', icon: Zap },
  { kind: 'beep', label: 'Beep', icon: Volume2 },
  { kind: 'notify', label: 'Notify', icon: Bell },
  { kind: 'pause', label: 'Pause stream', icon: Pause },
];

function generateId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `t-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TriggersDialog({ open, onOpenChange, triggers, onSave, disabledReason, isLicensed }: TriggersDialogProps) {
  const [draft, setDraft] = useState<TriggerRule[]>(triggers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setDraft(triggers);
      setError(undefined);
    }
  }, [open, triggers]);

  const validation = useMemo(() => {
    for (const rule of draft) {
      if (!rule.name.trim()) return `Rule needs a name.`;
      const v = validateTriggerMatch(rule.match);
      if (!v.ok) return `Rule "${rule.name}": ${v.error}`;
      if (rule.actions.length === 0) return `Rule "${rule.name}" needs at least one action.`;
    }
    return undefined;
  }, [draft]);

  function updateRule(id: string, patch: Partial<TriggerRule>) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleAction(id: string, kind: TriggerActionKind) {
    setDraft((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const has = r.actions.some((a) => a.kind === kind);
      if (has) return { ...r, actions: r.actions.filter((a) => a.kind !== kind) };
      const action: TriggerAction = kind === 'highlight' ? { kind, color: 'amber' } : { kind };
      return { ...r, actions: [...r.actions, action] };
    }));
  }

  function setHighlightColor(id: string, color: HighlightColor) {
    setDraft((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return {
        ...r,
        actions: r.actions.map((a) => (a.kind === 'highlight' ? { ...a, color } : a)),
      };
    }));
  }

  function removeRule(id: string) {
    setDraft((prev) => prev.filter((r) => r.id !== id));
  }

  function addRule() {
    setDraft((prev) => [
      ...prev,
      {
        id: generateId(),
        name: `Rule ${String(prev.length + 1)}`,
        enabled: true,
        match: 'tag:ERROR',
        actions: [{ kind: 'highlight', color: 'red' }],
      },
    ]);
  }

  async function handleSave() {
    if (validation || disabledReason) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !isLicensed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trigger rules</DialogTitle>
          <DialogDescription>
            Match log entries with the query DSL
            (<span className="font-mono text-xs">tag:ACK id:42 cmd:LIGHTS</span>)
            and fire actions on each match.
          </DialogDescription>
        </DialogHeader>
        {readOnly && (
          <Alert>
            <AlertDescription className="text-xs">
              Triggers are a commercial feature. Stored rules are shown below in read-only mode;
              live evaluation is paused. Unlock to edit and run them.
            </AlertDescription>
          </Alert>
        )}
        {!readOnly && disabledReason && (
          <Alert>
            <AlertDescription className="text-xs">{disabledReason}</AlertDescription>
          </Alert>
        )}
        <ScrollArea className="max-h-[55vh] pr-3">
          {draft.length === 0 ? (
            <div className="text-muted-foreground rounded-md border border-dashed py-8 text-center text-sm">
              No rules yet. {readOnly ? 'Unlock to add rules.' : 'Add one to react when a log entry matches.'}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {draft.map((rule) => (
                <li key={rule.id} className="border-border/60 rounded-lg border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateRule(rule.id, { enabled: v === true })}
                      aria-label="Enable rule"
                      disabled={readOnly}
                    />
                    <Input
                      value={rule.name}
                      onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                      placeholder="Rule name"
                      className="h-7 max-w-[14rem] text-sm"
                      readOnly={readOnly}
                    />
                    <div className="flex-1" />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                        onClick={() => removeRule(rule.id)}
                        aria-label="Remove rule"
                        title="Remove rule"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2">
                    <div>
                      <Label className="text-muted-foreground text-xs">Match</Label>
                      <Input
                        value={rule.match}
                        onChange={(event) => updateRule(rule.id, { match: event.target.value })}
                        placeholder="tag:ACK level:error"
                        className="h-7 font-mono text-xs"
                        spellCheck={false}
                        readOnly={readOnly}
                      />
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Actions</Label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {ACTION_OPTIONS.map((opt) => {
                          const active = rule.actions.some((a) => a.kind === opt.kind);
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.kind}
                              type="button"
                              onClick={() => !readOnly && toggleAction(rule.id, opt.kind)}
                              aria-pressed={active}
                              disabled={readOnly && !active}
                              className={cn(
                                'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
                                active
                                  ? 'border-primary/50 bg-primary/10 text-foreground'
                                  : 'border-border/60 text-muted-foreground hover:text-foreground',
                                readOnly && 'cursor-default opacity-80',
                              )}
                            >
                              <Icon className="size-3" aria-hidden />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      {rule.actions.some((a) => a.kind === 'highlight') && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-muted-foreground text-xs">Color</span>
                          {COLORS.map((c) => {
                            const current = rule.actions.find((a) => a.kind === 'highlight')?.color ?? 'amber';
                            const active = current === c.value;
                            return (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => !readOnly && setHighlightColor(rule.id, c.value)}
                                aria-label={`Highlight ${c.label}`}
                                aria-pressed={active}
                                title={c.label}
                                disabled={readOnly && !active}
                                className={cn(
                                  'size-5 rounded-full border-2 transition-transform',
                                  c.swatch,
                                  active ? 'border-foreground scale-110' : 'border-transparent opacity-70',
                                  readOnly && 'cursor-default',
                                )}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="flex items-center justify-between gap-2">
          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" onClick={addRule} className="gap-1.5">
              <Plus className="size-3.5" aria-hidden />
              Add rule
            </Button>
          ) : <span />}
          {validation && !readOnly && (
            <span className="text-destructive font-mono text-xs" role="alert">{validation}</span>
          )}
        </div>
        {error && <span className="text-destructive text-xs" role="alert">{error}</span>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {readOnly ? (
            <ProFeatureLock featureId="triggers" label="Unlock to edit" />
          ) : (
            <Button
              type="button"
              disabled={saving || !!validation || !!disabledReason}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save rules'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
