declare const __APP_NAME__: string;
declare const __APP_VERSION__: string;
declare const __APP_REPO__: string;
declare const __APP_AUTHOR__: string;

function normalizeRepo(url: string): string {
  if (!url) return '';
  return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

export const APP_NAME = __APP_NAME__;
export const APP_VERSION = __APP_VERSION__;
export const APP_REPO = normalizeRepo(__APP_REPO__);
export const APP_AUTHOR = __APP_AUTHOR__;

export interface LicenseSummaryEntry {
  readonly path: string;
  readonly license: string;
}

export const LICENSE_SUMMARY: readonly LicenseSummaryEntry[] = [
  { path: 'src/core/**', license: 'ISC' },
  { path: 'src/desktop/**', license: 'ISC' },
  { path: 'src/infra/**', license: 'ISC' },
  { path: 'src/components/**', license: 'ISC' },
  { path: 'src/lib/**', license: 'ISC' },
  { path: 'src/pro/**', license: 'PolyForm Noncommercial 1.0.0' },
  { path: 'tests/**', license: 'ISC (tests for ISC code)' },
];

export interface LicenseDocLink {
  readonly label: string;
  readonly path: string;
}

export const LICENSE_DOC_LINKS: readonly LicenseDocLink[] = [
  { label: 'LICENSE-NOTICE.md', path: 'LICENSE-NOTICE.md' },
  { label: 'LICENSE (ISC)', path: 'LICENSE' },
  { label: 'PolyForm Noncommercial 1.0.0', path: 'src/pro/macros/LICENSE' },
];

export function repoFileUrl(relativePath: string): string {
  if (!APP_REPO) return '';
  return `${APP_REPO}/blob/master/${relativePath}`;
}
