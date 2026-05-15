import * as v from 'valibot';

export const LogTagSchema = v.picklist([
  'ACK',
  'RAW_RX',
  'RAW_TX',
  'BULK',
  'CHANGE',
  'ERROR',
  'LOG',
  'SYSTEM',
]);

export const HighlightColorSchema = v.picklist(['red', 'amber', 'emerald', 'blue', 'violet']);

const TriggerActionHighlightSchema = v.object({
  kind: v.literal('highlight'),
  color: v.optional(HighlightColorSchema),
});

const TriggerActionBeepSchema = v.object({
  kind: v.literal('beep'),
});

const TriggerActionNotifySchema = v.object({
  kind: v.literal('notify'),
  message: v.optional(v.string()),
});

const TriggerActionPauseSchema = v.object({
  kind: v.literal('pause'),
});

export const TriggerActionSchema = v.variant('kind', [
  TriggerActionHighlightSchema,
  TriggerActionBeepSchema,
  TriggerActionNotifySchema,
  TriggerActionPauseSchema,
]);

export const TriggerRuleSchema = v.object({
  id: v.string(),
  name: v.string(),
  enabled: v.optional(v.boolean(), true),
  match: v.string(),
  actions: v.pipe(v.array(TriggerActionSchema), v.minLength(1)),
});

export const MacroStepSchema = v.object({
  command: v.string(),
  delayMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const MacroSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  steps: v.array(MacroStepSchema),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export const ConnectionProfileSchema = v.object({
  name: v.string(),
  ip: v.string(),
  pin: v.string(),
  wss: v.boolean(),
  sender: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  logTagFilters: v.optional(v.array(LogTagSchema)),
  macros: v.optional(v.array(MacroSchema)),
  triggers: v.optional(v.array(TriggerRuleSchema)),
  readOnly: v.optional(v.boolean()),
});

export const ProfilesFileSchema = v.object({
  version: v.literal(1),
  defaultProfile: v.optional(v.string()),
  profiles: v.array(ConnectionProfileSchema),
});

export type ConnectionProfile = v.InferOutput<typeof ConnectionProfileSchema>;
export type ProfilesFile = v.InferOutput<typeof ProfilesFileSchema>;

export interface LoadError {
  reason: string;
  quarantinedTo?: string;
}

export function emptyProfilesFile(): ProfilesFile {
  return { version: 1, profiles: [] };
}

export function quarantineSuffix(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
