export interface FieldDoc {
  name: string;
  description: string;
}

export interface DecodedField {
  key: string;
  value: unknown;
  description?: string;
}

export interface DecodedPayload {
  /** Direction (RX/TX) inferred from caller; not parsed here. */
  cmd?: string;
  cmdDescription?: string;
  payloadType?: string;
  payloadTypeDescription?: string;
  resultDetail?: string;
  resultDetailDescription?: string;
  topFields: DecodedField[];
  innerFields: DecodedField[];
  unknown: boolean;
}

const CMD_DOC: Record<string, string> = {
  LIGHTS: 'Lighting devices control / state',
  COVERS: 'Roller shutters / blinds',
  ZONES: 'Alarm zones',
  OUTPUTS: 'Generic outputs',
  SCENARIOS: 'Scenario triggers',
  SWITCHES: 'Switch devices',
  GATES: 'Gates / doors',
  THERMOSTATS: 'Climate / HVAC',
  SYSTEM: 'System status / housekeeping',
  REALTIME: 'Realtime event channel',
  CMD_USR: 'User-issued command',
  CMD_PWD: 'PIN authentication',
  CMD_SET: 'Set / write state',
  CMD_GET: 'Get / read state',
  CMD_USR_RES: 'User command result',
  CMD_LOGIN: 'Login',
  CMD_LOGOUT: 'Logout',
};

const PAYLOAD_TYPE_DOC: Record<string, string> = {
  STATUS: 'Snapshot or partial state',
  LIGHTS: 'Lights subtree',
  COVERS: 'Covers subtree',
  ZONES: 'Zones subtree',
  OUTPUTS: 'Outputs subtree',
  SCENARIOS: 'Scenarios subtree',
  SWITCHES: 'Switches subtree',
  GATES: 'Gates subtree',
  THERMOSTATS: 'Thermostats subtree',
  SYSTEM: 'System subtree',
};

export type ResultSeverity = 'success' | 'pending' | 'error';

interface ResultDetailEntry {
  description: string;
  severity: ResultSeverity;
}

const RESULT_DETAIL_DOC: Record<string, ResultDetailEntry> = {
  OK: { description: 'Command accepted', severity: 'success' },
  CMD_PROCESSED: { description: 'Command fully executed', severity: 'success' },
  CMD_NOT_AVAILABLE: { description: 'Command not supported', severity: 'error' },
  TIMEOUT: { description: 'No response in time window', severity: 'pending' },
  PENDING: { description: 'Awaiting panel response', severity: 'pending' },
  UNAUTHORIZED: { description: 'PIN/permission denied', severity: 'error' },
  INVALID_PARAMETER: { description: 'Bad argument', severity: 'error' },
  INVALID_PAYLOAD_TYPE: { description: 'Unknown PAYLOAD_TYPE', severity: 'error' },
  INVALID_CMD: { description: 'Unknown CMD', severity: 'error' },
  INTERNAL_ERROR: { description: 'Panel-side fault', severity: 'error' },
  NOT_ALLOWED: { description: 'Operation refused by policy', severity: 'error' },
};

const KNOWN_TOP_KEYS: ReadonlySet<string> = new Set(['CMD', 'PAYLOAD_TYPE', 'PAYLOAD', 'ID', 'SENDER', 'TIMESTAMP', 'PIN']);

export function describeCmd(cmd: string | undefined): string | undefined {
  if (!cmd) return undefined;
  return CMD_DOC[cmd.toUpperCase()];
}

export function describePayloadType(type: string | undefined): string | undefined {
  if (!type) return undefined;
  return PAYLOAD_TYPE_DOC[type.toUpperCase()];
}

export function describeResultDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  return RESULT_DETAIL_DOC[detail.toUpperCase()]?.description;
}

export function resultDetailSeverity(detail: string | undefined): ResultSeverity | undefined {
  if (!detail) return undefined;
  const upper = detail.toUpperCase();
  const entry = RESULT_DETAIL_DOC[upper];
  if (entry) return entry.severity;
  if (upper === '0X00' || upper === '0' || upper.endsWith('_OK')) return 'success';
  if (upper.includes('TIMEOUT') || upper.includes('PENDING')) return 'pending';
  return 'error';
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Recursively replace any value keyed `PIN` (case-insensitive) with `'***'`.
 *  Preserves structure for non-sensitive keys; safe on cycles via WeakSet guard. */
function redactPayloadValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactPayloadValue(item, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = k.toUpperCase() === 'PIN' ? '***' : redactPayloadValue(v, seen);
  }
  return out;
}

export function decodePayload(payload: unknown): DecodedPayload | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const cmd = asString(obj.CMD);
  const payloadType = asString(obj.PAYLOAD_TYPE);
  const topFields: DecodedField[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'PAYLOAD') continue;
    if (k.toUpperCase() === 'PIN') {
      topFields.push({ key: k, value: '***', description: 'Authentication PIN (redacted)' });
      continue;
    }
    topFields.push({ key: k, value: redactPayloadValue(v) });
  }
  const inner = obj.PAYLOAD;
  let resultDetail: string | undefined;
  const innerFields: DecodedField[] = [];
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
      if (k === 'RESULT_DETAIL') resultDetail = asString(v);
      if (k.toUpperCase() === 'PIN') {
        innerFields.push({ key: k, value: '***', description: 'Authentication PIN (redacted)' });
        continue;
      }
      innerFields.push({ key: k, value: redactPayloadValue(v) });
    }
  }
  const unknown = !cmd && !payloadType && topFields.every((f) => !KNOWN_TOP_KEYS.has(f.key));
  return {
    cmd,
    cmdDescription: describeCmd(cmd),
    payloadType,
    payloadTypeDescription: describePayloadType(payloadType),
    resultDetail,
    resultDetailDescription: describeResultDetail(resultDetail),
    topFields,
    innerFields,
    unknown,
  };
}
