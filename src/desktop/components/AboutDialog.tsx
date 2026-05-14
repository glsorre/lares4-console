import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, ExternalLink, GitBranch, RefreshCw, Scale, ShieldCheck, ShieldOff, Terminal, TriangleAlert, User } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getUpdaterAdapter, runCheck, type CheckOutcome } from '../runtime/updater.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  APP_AUTHOR,
  APP_DISPLAY_NAME,
  APP_REPO,
  APP_TAGLINE,
  APP_VERSION,
  LICENSE_DOC_LINKS,
  LICENSE_SUMMARY,
  repoFileUrl,
} from '../runtime/app-meta.js';
import {
  ACKNOWLEDGEMENTS,
  type AcknowledgementEntry,
} from '../runtime/acknowledgements.generated.js';
import {
  FEATURE_IDS,
  FEATURES,
  getBundleRaw,
  getFeatureLicensePayload,
  type FeatureId,
} from '../runtime/commercial-license-prefs.js';
import {
  peekVerifyResult,
  type LicensePayload,
} from '../runtime/license-verify.js';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function handleOpen(url: string) {
  if (!url) return;
  void openExternal(url).catch(() => {
    /* swallow — best-effort link open */
  });
}

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => handleOpen(href)}
      className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
      <ExternalLink className="size-3 opacity-70" aria-hidden />
    </button>
  );
}

interface ActiveLicenseRow {
  id: FeatureId;
  title: string;
  payload: LicensePayload | null;
  expired: boolean;
  bundle: boolean;
}

function readActiveLicenses(): ActiveLicenseRow[] {
  const bundleRaw = getBundleRaw();
  const bundleVerified = bundleRaw ? peekVerifyResult(bundleRaw) : undefined;
  const bundleExpired =
    bundleVerified?.ok &&
    bundleVerified.payload.exp !== undefined &&
    bundleVerified.payload.exp * 1000 <= Date.now();
  return FEATURE_IDS.map((id) => {
    const payload = getFeatureLicensePayload(id);
    return {
      id,
      title: FEATURES[id].title.replace(/ commercial license$/i, ''),
      payload,
      expired: !payload && Boolean(bundleExpired),
      bundle: payload?.f === '*',
    };
  });
}

function formatLicenseExp(exp: number | undefined): string {
  if (exp === undefined) return 'perpetual';
  try {
    return new Date(exp * 1000).toISOString().slice(0, 10);
  } catch {
    return String(exp);
  }
}

function UpdatesTab() {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome | undefined>(undefined);

  const handleCheck = () => {
    setBusy(true);
    setOutcome(undefined);
    void (async () => {
      const adapter = await getUpdaterAdapter();
      const result = await runCheck(adapter);
      setOutcome(result);
      setBusy(false);
    })();
  };

  return (
    <div className="space-y-3 pt-2 text-xs">
      <p className="text-muted-foreground">
        Current version: <span className="font-mono">v{APP_VERSION}</span>.
      </p>
      <Button size="sm" onClick={handleCheck} disabled={busy}>
        {busy ? (
          <>
            <RefreshCw className="size-3.5 animate-spin" aria-hidden /> Checking…
          </>
        ) : (
          <>
            <RefreshCw className="size-3.5" aria-hidden /> Check for updates
          </>
        )}
      </Button>
      {outcome?.kind === 'up-to-date' && (
        <div className="inline-flex items-center gap-1.5 text-emerald-500">
          <CheckCircle2 className="size-3.5" aria-hidden /> You are on the latest version.
        </div>
      )}
      {outcome?.kind === 'available' && (
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-primary">
            <Download className="size-3.5" aria-hidden />
            Update available: v{outcome.info.version}
          </div>
          {outcome.info.body ? (
            <p className="text-muted-foreground whitespace-pre-wrap">{outcome.info.body}</p>
          ) : null}
          <p className="text-muted-foreground">
            Close this dialog to use the banner&apos;s install action.
          </p>
        </div>
      )}
      {outcome?.kind === 'unsupported' && (
        <div className="inline-flex items-center gap-1.5 text-muted-foreground">
          <TriangleAlert className="size-3.5" aria-hidden /> Auto-update not available in this build.
        </div>
      )}
      {outcome?.kind === 'error' && (
        <div className="inline-flex items-center gap-1.5 text-destructive">
          <TriangleAlert className="size-3.5" aria-hidden /> {outcome.message}
        </div>
      )}
    </div>
  );
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const [activeLicenses, setActiveLicenses] = useState<ActiveLicenseRow[]>(() => readActiveLicenses());
  useEffect(() => {
    if (open) setActiveLicenses(readActiveLicenses());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/15 text-primary ring-primary/20 flex size-10 shrink-0 items-center justify-center rounded-lg ring-1">
              <Terminal className="size-5" aria-hidden />
            </div>
            <div className="flex flex-col">
              <DialogTitle className="flex items-center gap-2">
                <span>{APP_DISPLAY_NAME}</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  v{APP_VERSION}
                </Badge>
              </DialogTitle>
              <DialogDescription>{APP_TAGLINE}</DialogDescription>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {APP_AUTHOR ? (
              <span className="inline-flex items-center gap-1">
                <User className="size-3" aria-hidden />
                {APP_AUTHOR}
              </span>
            ) : null}
            {APP_REPO ? (
              <ExternalAnchor href={APP_REPO}>
                <GitBranch className="size-3" aria-hidden />
                <span>Repository</span>
              </ExternalAnchor>
            ) : null}
          </div>
        </DialogHeader>

        <Tabs defaultValue="license" className="mt-2">
          <TabsList>
            <TabsTrigger value="license">
              <Scale className="size-3.5" aria-hidden />
              License
            </TabsTrigger>
            <TabsTrigger value="acks">Acknowledgements</TabsTrigger>
            <TabsTrigger value="updates">
              <Download className="size-3.5" aria-hidden />
              Updates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="license" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Lares4 Console ships under a dual-license model. Core source is open under
              the ISC License. Files under <code className="rounded bg-muted px-1 py-0.5 text-[11px]">src/pro/**</code>{' '}
              are licensed under the PolyForm Noncommercial License 1.0.0 — free for
              personal, research, education, and other noncommercial use; commercial use
              requires a separate license.
            </p>
            <div className="rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Path</th>
                    <th className="px-3 py-1.5 text-left font-medium">License</th>
                  </tr>
                </thead>
                <tbody>
                  {LICENSE_SUMMARY.map((row) => (
                    <tr key={row.path} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{row.path}</td>
                      <td className="px-3 py-1.5">{row.license}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-medium">Active commercial licenses</h3>
                <span className="text-xs text-muted-foreground">
                  Pro features under PolyForm Noncommercial 1.0.0
                </span>
              </div>
              <div className="rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Feature</th>
                      <th className="px-3 py-1.5 text-left font-medium">Status</th>
                      <th className="px-3 py-1.5 text-left font-medium">Licensee</th>
                      <th className="px-3 py-1.5 text-left font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLicenses.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-1.5">{row.title}</td>
                        <td className="px-3 py-1.5">
                          {row.payload ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500">
                              <ShieldCheck className="size-3.5" aria-hidden />
                              Active{row.bundle ? ' (bundle)' : ''}
                            </span>
                          ) : row.expired ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <TriangleAlert className="size-3.5" aria-hidden />
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <ShieldOff className="size-3.5" aria-hidden />
                              Not activated
                            </span>
                          )}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-1.5 font-mono">
                          {row.payload?.sub ?? '—'}
                        </td>
                        <td className="px-3 py-1.5 font-mono">
                          {row.payload ? formatLicenseExp(row.payload.exp) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Tokens verified offline against bundled Ed25519 public key. Manage keys per feature from each feature&apos;s settings.
              </p>
            </div>
            {APP_REPO ? (
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Full text:</span>
                {LICENSE_DOC_LINKS.map((doc) => (
                  <ExternalAnchor key={doc.path} href={repoFileUrl(doc.path)}>
                    {doc.label}
                  </ExternalAnchor>
                ))}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="updates" className="pt-2">
            <UpdatesTab />
          </TabsContent>

          <TabsContent value="acks" className="pt-2">
            <p className="text-xs text-muted-foreground pb-2">
              Built on the following open-source runtime dependencies:
            </p>
            <ScrollArea className="h-72 rounded-md border">
              <ul className="divide-y text-xs">
                {ACKNOWLEDGEMENTS.map((dep: AcknowledgementEntry) => (
                  <li
                    key={dep.name}
                    className="flex items-baseline justify-between gap-3 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      {dep.homepage ? (
                        <ExternalAnchor href={dep.homepage}>
                          <span className="font-mono truncate">{dep.name}</span>
                        </ExternalAnchor>
                      ) : (
                        <span className="font-mono truncate">{dep.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        v{dep.version}
                      </span>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {dep.license}
                    </Badge>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
