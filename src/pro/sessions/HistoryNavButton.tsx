// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// See LICENSE in this directory.

import { History as HistoryIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ProFeatureLock } from '@/desktop/components/ProFeatureLock.js';
import { useLicensed } from '@/desktop/runtime/session-store.js';

export function HistoryNavButton() {
  const { t } = useTranslation();
  const licensed = useLicensed();
  const location = useLocation();
  const navigate = useNavigate();
  const lockLabel = t('pro.sessions.navLabel');

  if (!licensed.sessions) {
    return (
      <ProFeatureLock
        featureId="sessions"
        label={lockLabel}
        variant="inline"
        leadingIcon={HistoryIcon}
      />
    );
  }

  const active = location.pathname.startsWith('/history');
  const label = active ? t('pro.sessions.navBackLabel') : t('pro.sessions.navLabel');
  const displayLabel = t('pro.sessions.navLabel');

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        'h-7 shrink-0 gap-1 px-2 text-xs',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={() => navigate(active ? '/console' : '/history')}
    >
      <HistoryIcon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">{displayLabel}</span>
    </Button>
  );
}
