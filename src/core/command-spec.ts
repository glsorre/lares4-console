export const ROOT_COMMANDS = [
  'help',
  'state',
  'lights',
  'covers',
  'zones',
  'outputs',
  'switches',
  'gates',
  'thermostats',
  'scenario',
  'raw',
] as const;

export const STATE_SCOPES = [
  'all',
  'lights',
  'covers',
  'switches',
  'gates',
  'thermostats',
  'zones',
  'scenarios',
  'system',
  'outputs',
] as const;

export const EVENT_FILTERS = ['acks', 'errors', 'multitypes', 'raw', 'changes', 'sent'] as const;

export const SECONDARY_COMMANDS: Record<string, string[]> = {
  state: [...STATE_SCOPES],
  lights: ['on', 'off', 'dim'],
  covers: ['up', 'down', 'stop', 'to'],
  zones: ['arm', 'disarm', 'bypass', 'status'],
  outputs: ['on', 'off', 'toggle', 'status'],
  switches: ['on', 'off', 'status'],
  gates: ['open', 'close', 'stop', 'status'],
  thermostats: ['mode', 'setpoint', 'fan', 'status'],
  scenario: ['trigger'],
  raw: ['send', 'sendcmd'],
};

export const COMMAND_HELP_LINES = [
  'Commands:',
  '  help',
  `  state ${STATE_SCOPES.join('|')}`,
  '  lights on|off|dim <id> [level]',
  '  covers up|down|stop|to <id> [position]',
  '  zones arm|disarm|bypass|status <id>',
  '  outputs on|off|toggle|status <id>',
  '  switches on|off|status <id>',
  '  gates open|close|stop|status <id>',
  '  thermostats mode|setpoint|fan|status <id> [value]',
  '  scenario trigger <id>',
  '  raw send <CMD> <PAYLOAD_TYPE> <JSON_PAYLOAD>',
  '  raw sendcmd <JSON_COMMAND>',
] as const;
