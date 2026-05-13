// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in src/pro/macros.

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import type { Macro, MacroStep } from '../types.js';

interface MacroEditorDialogProps {
  open: boolean;
  initial?: Macro;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { id?: string; name: string; description?: string; steps: MacroStep[] }) => Promise<void>;
}

function stepsToText(steps: MacroStep[]): string {
  return steps.map((s) => s.command).join('\n');
}

function textToSteps(text: string, originalSteps?: MacroStep[]): MacroStep[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.map((command) => {
    const prev = originalSteps?.find((s) => s.command === command);
    return prev?.delayMs !== undefined ? { command, delayMs: prev.delayMs } : { command };
  });
}

export function MacroEditorDialog({ open, initial, onOpenChange, onSave }: MacroEditorDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setText(initial ? stepsToText(initial.steps) : '');
      setSaving(false);
      setError(null);
    }
  }, [open, initial]);

  const trimmedName = name.trim();
  const steps = textToSteps(text, initial?.steps);
  const canSave = trimmedName.length > 0 && steps.length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: initial?.id,
        name: trimmedName,
        description: description.trim() || undefined,
        steps,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit macro' : 'New macro'}</DialogTitle>
          <DialogDescription>
            One command per line. Empty lines are ignored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="macro-name" className="text-xs text-muted-foreground">Name</Label>
            <Input
              id="macro-name"
              className="h-8 text-xs"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="morning"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="macro-desc" className="text-xs text-muted-foreground">Description (optional)</Label>
            <Input
              id="macro-desc"
              className="h-8 text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="turn on lights, open covers"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="macro-steps" className="text-xs text-muted-foreground">Commands</Label>
            <textarea
              id="macro-steps"
              className="border-border/70 bg-background min-h-[140px] w-full rounded-md border px-2 py-1.5 font-mono text-xs shadow-inner focus:outline-none focus:ring-2 focus:ring-ring"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'lights on 1\nlights on 2\ncovers up 1'}
              spellCheck={false}
            />
            <p className="text-muted-foreground text-[0.65rem]">{steps.length} step{steps.length === 1 ? '' : 's'}</p>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {saving ? <><Loader2 className="size-4 animate-spin" aria-hidden />Saving</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
