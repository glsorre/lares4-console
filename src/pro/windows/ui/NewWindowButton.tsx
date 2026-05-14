// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { SquarePlus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock.js';
import { useSessionController } from '@pro/tabs/context.js';
import { useWindows } from '../context.js';

export function NewWindowButton() {
  const { controller, snapshot } = useWindows();
  const { snapshot: session } = useSessionController();
  const location = useLocation();

  if (!session.licensed.multiwindow) {
    return (
      <ProFeatureLock
        featureId="multiwindow"
        label="New window"
        variant="inline"
        leadingIcon={SquarePlus}
      />
    );
  }

  const label = 'New window';

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-foreground h-7 shrink-0 gap-1 px-2 text-xs"
      onClick={() => { void controller.openWindow(location.pathname || '/'); }}
      disabled={!snapshot.canOpen}
      aria-label={label}
      title={label}
    >
      <SquarePlus className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
