// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock.js';
import { connectionChipClasses } from '@/desktop/runtime/status-chips.js';
import { useTabs } from '../context.js';

export function TabsStrip() {
  const { controller, snapshot } = useTabs();
  const [licenseTick, setLicenseTick] = useState(0);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);

  const canAdd = useMemo(
    () => controller.canAddTab(),
    [controller, snapshot.tabs.length, licenseTick],
  );
  const closeTarget = closeTargetId
    ? snapshot.tabs.find((t) => t.id === closeTargetId)
    : undefined;

  function requestClose(tabId: string) {
    const meta = snapshot.tabs.find((t) => t.id === tabId);
    if (meta && meta.status !== 'idle') {
      setCloseTargetId(tabId);
      return;
    }
    controller.closeTab(tabId);
  }

  function confirmClose() {
    if (closeTargetId) controller.closeTab(closeTargetId);
    setCloseTargetId(null);
  }

  const onlyOneTab = snapshot.tabs.length === 1;

  return (
    <div
      className="border-border/80 bg-card/30 flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-1.5"
      role="tablist"
      aria-label="Connection tabs"
    >
      {snapshot.tabs.map((tab) => {
        const isActive = tab.id === snapshot.activeId;
        const dotClasses = connectionChipClasses(tab.status);
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => controller.setActive(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                controller.setActive(tab.id);
              }
            }}
            className={cn(
              'group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
              isActive
                ? 'border-border bg-background text-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <span
              className={cn('inline-block size-2 shrink-0 rounded-full border', dotClasses)}
              aria-hidden
            />
            <span className="max-w-[12rem] truncate font-medium">{tab.label}</span>
            {!onlyOneTab && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground -mr-1 size-5 shrink-0 p-0 opacity-60 group-hover:opacity-100"
                aria-label={`Close ${tab.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  requestClose(tab.id);
                }}
              >
                <X className="size-3" aria-hidden />
              </Button>
            )}
          </div>
        );
      })}

      {canAdd ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-foreground h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={() => controller.addTab()}
          aria-label="New tab"
          title="New tab"
        >
          <Plus className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">New tab</span>
        </Button>
      ) : (
        <ProFeatureLock
          featureId="tabs"
          label="New tab"
          variant="inline"
          leadingIcon={Plus}
          onLicenseChanged={() => setLicenseTick((n) => n + 1)}
        />
      )}

      <Dialog open={closeTargetId !== null} onOpenChange={(open) => { if (!open) setCloseTargetId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect and close tab?</DialogTitle>
            <DialogDescription>
              {closeTarget
                ? `"${closeTarget.label}" is ${closeTarget.status}. Closing the tab will disconnect the session.`
                : 'This tab has an active session. Closing it will disconnect.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseTargetId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmClose}>
              Disconnect and close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
