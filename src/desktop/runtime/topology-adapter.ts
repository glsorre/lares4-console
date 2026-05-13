import type { BuildTopologyInput } from '../../core/topology.js';

/**
 * Pluck just the read-only surface we need from a Lares4 instance so this
 * module stays decoupled from the runtime client class (and easy to test).
 */
export interface Lares4SnapshotLike {
  lights?: ReadonlyArray<Lares4LightLike> | Record<string | number, Lares4LightLike>;
  covers?: ReadonlyArray<Lares4CoverLike> | Record<string | number, Lares4CoverLike>;
  gates?: ReadonlyArray<Lares4GateLike> | Record<string | number, Lares4GateLike>;
  switches?: ReadonlyArray<Lares4SwitchLike> | Record<string | number, Lares4SwitchLike>;
  zones?: ReadonlyArray<Lares4ZoneLike> | Record<string | number, Lares4ZoneLike>;
  scenarios?: ReadonlyArray<Lares4ScenarioLike> | Record<string | number, Lares4ScenarioLike>;
  thermostats?: ReadonlyArray<Lares4ThermostatLike> | Record<string | number, Lares4ThermostatLike>;
  outputs?: ReadonlyArray<Lares4DeviceLike> | Record<string | number, Lares4DeviceLike>;
  systemStatus?: unknown;
}

export interface Lares4DeviceLike {
  id: number | string;
  name?: string;
  description?: string;
}

export interface Lares4LightLike extends Lares4DeviceLike {
  on?: boolean;
  brightness?: number;
}

export interface Lares4CoverLike extends Lares4DeviceLike {
  state?: string;
  position?: number;
  targetPosition?: number;
}

export interface Lares4GateLike extends Lares4DeviceLike {
  on?: boolean;
}

export interface Lares4SwitchLike extends Lares4DeviceLike {
  on?: boolean;
}

export interface Lares4ZoneLike extends Lares4DeviceLike {
  armed?: boolean;
  bypassed?: boolean;
  fault?: boolean;
  open?: boolean;
}

export interface Lares4ScenarioLike extends Lares4DeviceLike {
  category?: string;
}

export interface Lares4ThermostatLike extends Lares4DeviceLike {
  mode?: string;
  season?: string;
  enabled?: boolean;
  currentTemperature?: number;
  targetTemperature?: number;
}

interface RawNode {
  ID: number | string;
  DES?: string;
  STA?: string;
  [key: string]: unknown;
}

function asArray<T>(source: ReadonlyArray<T> | Record<string | number, T> | undefined): T[] {
  if (source === undefined || source === null) return [];
  if (Array.isArray(source)) return source as T[];
  return Object.values(source as Record<string | number, T>);
}

function commonFields(device: Lares4DeviceLike): RawNode {
  return {
    ID: device.id,
    DES: device.description ?? device.name,
  };
}

function adaptLight(light: Lares4LightLike): RawNode {
  return {
    ...commonFields(light),
    STA: light.on ? 'ON' : 'OFF',
    BRIGHTNESS: light.brightness,
  };
}

function adaptCover(cover: Lares4CoverLike): RawNode {
  const position = typeof cover.position === 'number' ? cover.position : undefined;
  const positionLabel = position !== undefined ? ` ${String(position)}%` : '';
  let label: string;
  if (cover.state === 'opening') label = `OPEN ↑${positionLabel}`;
  else if (cover.state === 'closing') label = `CLOSED ↓${positionLabel}`;
  else if (position !== undefined) label = position > 0 ? `OPEN${positionLabel}` : 'CLOSED';
  else label = 'STOPPED';
  return {
    ...commonFields(cover),
    STA: label,
    POSITION: position,
  };
}

function adaptGate(gate: Lares4GateLike): RawNode {
  return {
    ...commonFields(gate),
    STA: gate.on ? 'OPEN' : 'CLOSED',
  };
}

function adaptSwitch(sw: Lares4SwitchLike): RawNode {
  return {
    ...commonFields(sw),
    STA: sw.on ? 'ON' : 'OFF',
  };
}

function adaptZone(zone: Lares4ZoneLike): RawNode {
  let sta: string;
  if (zone.fault) sta = 'FAULT';
  else if (zone.bypassed) sta = 'BYPASS';
  else if (zone.armed) sta = zone.open ? 'ARMED · OPEN' : 'ARMED';
  else sta = zone.open ? 'DISARMED · OPEN' : 'DISARMED';
  return {
    ...commonFields(zone),
    STA: sta,
  };
}

function adaptScenario(scenario: Lares4ScenarioLike): RawNode {
  return {
    ...commonFields(scenario),
    STA: scenario.category,
  };
}

function adaptThermostat(therm: Lares4ThermostatLike): RawNode {
  const sta = therm.enabled === false ? 'OFF' : therm.mode;
  return {
    ...commonFields(therm),
    STA: sta,
    CURRENT: therm.currentTemperature,
    TARGET: therm.targetTemperature,
  };
}

function adaptOutput(device: Lares4DeviceLike): RawNode {
  // lares4-ts exposes outputs as generic devices with no status field.
  // Keep the entry visible (id + label) but leave STA undefined → status 'unknown'.
  return commonFields(device);
}

export function adaptLares4Topology(snapshot: Lares4SnapshotLike | undefined | null): BuildTopologyInput {
  if (!snapshot) return {};
  return {
    lights: asArray(snapshot.lights).map(adaptLight),
    covers: asArray(snapshot.covers).map(adaptCover),
    gates: asArray(snapshot.gates).map(adaptGate),
    switches: asArray(snapshot.switches).map(adaptSwitch),
    zones: asArray(snapshot.zones).map(adaptZone),
    scenarios: asArray(snapshot.scenarios).map(adaptScenario),
    thermostats: asArray(snapshot.thermostats).map(adaptThermostat),
    outputs: asArray(snapshot.outputs).map(adaptOutput),
    system: snapshot.systemStatus,
  };
}
