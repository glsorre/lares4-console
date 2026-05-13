/* eslint-disable @typescript-eslint/no-explicit-any */
declare const __LICENSE_PUBKEYS__: readonly string[] | undefined;

function readBuildKeys(): readonly string[] {
  try {
    // Replaced at build time by vite `define`. Undefined in non-bundled
    // contexts (tests under tsx, Node CLI scripts) — we fall through to
    // the env-var path.
    if (typeof __LICENSE_PUBKEYS__ === 'undefined') return [];
    const v = __LICENSE_PUBKEYS__;
    if (!v) return [];
    return Array.isArray(v) ? v.filter((entry) => typeof entry === 'string' && entry.length > 0) : [];
  } catch {
    return [];
  }
}

function readEnvKeys(): readonly string[] {
  try {
    const env = (globalThis as any)?.process?.env;
    const raw = env?.LARES4_LICENSE_PUBKEY;
    if (typeof raw !== 'string' || raw.length === 0) return [];
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

/**
 * Ed25519 public keys (32 bytes each, hex-encoded) accepted by this build.
 * The verifier tries every entry; the first to match the signature wins.
 * Multiple entries support overlap windows during a key rotation.
 */
export const LICENSE_PUBKEYS_HEX: readonly string[] = (() => {
  const env = readEnvKeys();
  if (env.length > 0) return env;
  return readBuildKeys();
})();
