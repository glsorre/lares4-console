// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in ../LICENSE.

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEVEL_VALUES, SOURCE_VALUES, TAG_VALUES } from '@/core/log-query.js';
import {
  CONDITION_FIELDS,
  opsForField,
  type Condition,
  type ConditionField,
  type ConditionOp,
} from '../match-dsl.js';

interface ConditionRowProps {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  disabled?: boolean;
}

function enumValuesFor(field: ConditionField): readonly string[] | undefined {
  if (field === 'tag') return TAG_VALUES;
  if (field === 'level') return LEVEL_VALUES;
  if (field === 'source') return SOURCE_VALUES;
  return undefined;
}

export function ConditionRow({ condition, onChange, onRemove, disabled }: ConditionRowProps) {
  const { t } = useTranslation();
  const ops = opsForField(condition.field);
  const enumValues = enumValuesFor(condition.field);
  const opDisabled = ops.length <= 1;

  function changeField(field: ConditionField) {
    const nextOps = opsForField(field);
    const nextValue = enumValuesFor(field) ? '' : condition.value;
    onChange({ ...condition, field, op: nextOps[0]!, value: nextValue });
  }

  function changeOp(op: ConditionOp) {
    onChange({ ...condition, op });
  }

  function changeValue(value: string) {
    onChange({ ...condition, value });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={condition.field} onValueChange={(v) => changeField(v as ConditionField)} disabled={disabled}>
        <SelectTrigger size="sm" className="h-8 w-[7.5rem] text-xs" aria-label={t('pro.triggers.condition.fieldLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_FIELDS.map((f) => (
            <SelectItem key={f} value={f} className="text-xs">
              {t(`pro.triggers.condition.field.${f}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={condition.op} onValueChange={(v) => changeOp(v as ConditionOp)} disabled={disabled || opDisabled}>
        <SelectTrigger size="sm" className="h-8 w-[6rem] text-xs" aria-label={t('pro.triggers.condition.opLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op} className="text-xs">
              {t(`pro.triggers.condition.op.${op}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {enumValues ? (
        <Select value={condition.value} onValueChange={changeValue} disabled={disabled}>
          <SelectTrigger size="sm" className="h-8 min-w-[8rem] flex-1 text-xs" aria-label={t('pro.triggers.condition.valueLabel')}>
            <SelectValue placeholder={t('pro.triggers.condition.valueLabel')} />
          </SelectTrigger>
          <SelectContent>
            {enumValues.map((v) => (
              <SelectItem key={v} value={v} className="font-mono text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={condition.value}
          onChange={(e) => changeValue(e.target.value)}
          className="h-8 min-w-[8rem] flex-1 font-mono text-xs"
          spellCheck={false}
          aria-label={t('pro.triggers.condition.valueLabel')}
          disabled={disabled}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0 p-0"
        onClick={onRemove}
        aria-label={t('pro.triggers.editor.removeCondition')}
        title={t('pro.triggers.editor.removeCondition')}
        disabled={disabled}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}
