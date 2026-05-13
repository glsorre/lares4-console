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

const RESULT_DETAIL_DOC: Record<string, string> = {
  OK: 'Command accepted',
  TIMEOUT: 'No response in time window',
  UNAUTHORIZED: 'PIN/permission denied',
  INVALID_PARAMETER: 'Bad argument',
  INVALID_PAYLOAD_TYPE: 'Unknown PAYLOAD_TYPE',
  INVALID_CMD: 'Unknown CMD',
  INTERNAL_ERROR: 'Panel-side fault',
  NOT_ALLOWED: 'Operation refused by policy',
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
  return RESULT_DETAIL_DOC[detail.toUpperCase()];
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function decodePayload(payload: unknown): DecodedPayload | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  const cmd = asString(obj.CMD);
  const payloadType = asString(obj.PAYLOAD_TYPE);
  const topFields: DecodedField[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'PAYLOAD') continue;
    if (k === 'PIN') {
      topFields.push({ key: k, value: '***', description: 'Authentication PIN (redacted)' });
      continue;
    }
    topFields.push({ key: k, value: v });
  }
  const inner = obj.PAYLOAD;
  let resultDetail: string | undefined;
  const innerFields: DecodedField[] = [];
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
      if (k === 'RESULT_DETAIL') resultDetail = asString(v);
      innerFields.push({ key: k, value: v });
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
