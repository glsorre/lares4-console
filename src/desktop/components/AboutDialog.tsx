import type { ReactNode } from 'react';
import { ExternalLink, GitBranch, Scale, Terminal, User } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { Badge } from '@/components/ui/badge';
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

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
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
                <Badge variant="secondary" className="font-mono text-[10px]">
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
                      <span className="text-[10px] text-muted-foreground">
                        v{dep.version}
                      </span>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">
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
