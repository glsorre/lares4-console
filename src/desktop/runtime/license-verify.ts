import { getLicenseTransport } from './license-transport.js';

export const TOKEN_PREFIX = 'LARES4-';
export const PAYLOAD_VERSION = 1;

export type LicenseFeatureClaim = 'macros' | 'tabs' | 'triggers' | 'annotations' | 'multiwindow' | '*';

export interface LicensePayload {
  readonly v: number;
  readonly f: LicenseFeatureClaim;
  readonly sub: string;
  readonly iat: number;
  readonly exp?: number;
}

export type VerifyFailureReason =
  | 'malformed-prefix'
  | 'malformed-structure'
  | 'malformed-base64'
  | 'malformed-payload'
  | 'unsupported-version'
  | 'feature-mismatch'
  | 'expired'
  | 'bad-signature'
  | 'pubkey-unconfigured'
  | 'storage-failed';

export type LicenseVerifyResult =
  | { readonly ok: true; readonly payload: LicensePayload }
  | { readonly ok: false; readonly reason: VerifyFailureReason };

const verifyCache = new Map<string, LicensePayload>();

function applyClaimChecks(payload: LicensePayload, featureId: string): LicenseVerifyResult {
  if (payload.exp !== undefined && payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.f !== '*' && payload.f !== featureId) {
    return { ok: false, reason: 'feature-mismatch' };
  }
  return { ok: true, payload };
}

/** Synchronously read a previously verified payload (cache lookup only). */
export function peekVerifyResult(raw: string | null | undefined): LicenseVerifyResult | undefined {
  if (!raw) return undefined;
  const payload = verifyCache.get(raw);
  if (!payload) return undefined;
  return { ok: true, payload };
}

/** Drop the cached payload for a raw token (e.g., when the user clears it). */
export function dropVerifyCache(raw: string | null | undefined): void {
  if (!raw) return;
  verifyCache.delete(raw);
}

/** Test-only: wipe every cached payload. */
export function __clearVerifyCacheForTests(): void {
  verifyCache.clear();
}

/**
 * Verify a `LARES4-...` token via the active transport (Rust in production,
 * an in-memory fake in tests). Successful results are memoized by raw token;
 * `exp` and feature claim are re-checked against the current clock and the
 * requested feature on every call.
 */
export async function verifyLicense(
  raw: string | null | undefined,
  featureId: Exclude<LicenseFeatureClaim, '*'>,
): Promise<LicenseVerifyResult> {
  if (!raw) return { ok: false, reason: 'malformed-structure' };

  const cached = verifyCache.get(raw);
  if (cached) return applyClaimChecks(cached, featureId);

  const result = await getLicenseTransport().verify(raw, featureId);
  if (result.ok) {
    verifyCache.set(raw, result.payload);
    return applyClaimChecks(result.payload, featureId);
  }
  return result;
}

/** Translation key + params for a verify failure reason. Render with i18next `t(key, params)`. */
export function verifyFailureMessage(reason: VerifyFailureReason): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (reason) {
    case 'malformed-prefix':
      return { key: 'license.verify.malformedPrefix', params: { prefix: TOKEN_PREFIX } };
    case 'malformed-structure':
      return { key: 'license.verify.malformedStructure' };
    case 'malformed-base64':
      return { key: 'license.verify.malformedBase64' };
    case 'malformed-payload':
      return { key: 'license.verify.malformedPayload' };
    case 'unsupported-version':
      return { key: 'license.verify.unsupportedVersion', params: { version: PAYLOAD_VERSION } };
    case 'feature-mismatch':
      return { key: 'license.verify.featureMismatch' };
    case 'expired':
      return { key: 'license.verify.expired' };
    case 'bad-signature':
      return { key: 'license.verify.badSignature' };
    case 'pubkey-unconfigured':
      return { key: 'license.verify.pubkeyUnconfigured' };
    case 'storage-failed':
      return { key: 'license.verify.storageFailed' };
  }
}
