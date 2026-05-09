export const ROOT_COMMANDS = [
  'help',
  'exit',
  'quit',
  'format',
  'events',
  'state',
  'lights',
  'covers',
  'scenario',
  'raw',
  'export',
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

export const EVENT_FILTERS = ['acks', 'errors', 'multitypes', 'raw', 'changes'] as const;

export const SECONDARY_COMMANDS: Record<string, string[]> = {
  format: ['pretty', 'json'],
  events: ['none', 'all', ...EVENT_FILTERS],
  state: [...STATE_SCOPES],
  lights: ['on', 'off', 'dim'],
  covers: ['up', 'down', 'stop', 'to'],
  scenario: ['trigger'],
  raw: ['send', 'sendcmd', 'full'],
};

export const COMMAND_HELP_LINES = [
  'Commands:',
  '  help',
  '  exit | quit',
  '  format pretty|json',
  `  events none|all|${EVENT_FILTERS.join(',')}`,
  `  state ${STATE_SCOPES.join('|')}`,
  '  lights on|off|dim <id> [level]',
  '  covers up|down|stop|to <id> [position]',
  '  scenario trigger <id>',
  '  raw send <CMD> <PAYLOAD_TYPE> <JSON_PAYLOAD>',
  '  raw sendcmd <JSON_COMMAND>',
  '  raw full on|off',
  '  export [path]',
] as const;

