import { Trans, useTranslation } from 'react-i18next';
import {
  Cable,
  Loader2,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ConnectionProfile, LoadError } from '../runtime/profiles-repository-desktop.js';
import { useActiveProfileName, useConnectionStatus } from '../runtime/session-store.js';
import { ConnectionErrorAlert } from './ConnectionErrorAlert.js';

interface ConnectionProfileListProps {
  profiles: ConnectionProfile[];
  persistedDefault: string | undefined;
  connectingName: string | undefined;
  defaultingName: string | null;
  showError: string | null;
  loadError?: LoadError;
  onNewProfile: () => void;
  onEditProfile: (p: ConnectionProfile) => void;
  onConnect: (p: ConnectionProfile) => void;
  onDisconnect: () => void;
  onMakeDefault: (name: string) => void;
  onRequestDelete: (name: string) => void;
}

export function ConnectionProfileList({
  profiles,
  persistedDefault,
  connectingName,
  defaultingName,
  showError,
  loadError,
  onNewProfile,
  onEditProfile,
  onConnect,
  onDisconnect,
  onMakeDefault,
  onRequestDelete,
}: ConnectionProfileListProps) {
  const { t } = useTranslation();
  const { connected, connectionStatus } = useConnectionStatus();
  const activeProfileName = useActiveProfileName();
  const isConnecting = connectionStatus === 'connecting';
  const sessionActive = connected && activeProfileName !== undefined;
  const visibleProfiles = sessionActive
    ? profiles.filter((p) => p.name === activeProfileName)
    : profiles;
  const orphanActiveName = sessionActive && visibleProfiles.length === 0
    ? activeProfileName
    : undefined;

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-foreground text-sm font-semibold">
            {sessionActive ? t('connect.activeConnection') : t('connect.connections')}
          </h2>
          <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={onNewProfile} aria-label={t('connect.newConnectionAria')}>
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loadError && (
          <Alert variant="destructive" className="mb-3 py-2">
            <TriangleAlert className="size-3.5" aria-hidden />
            <AlertTitle className="text-xs font-semibold">{t('connect.profilesLoadErrorTitle')}</AlertTitle>
            <AlertDescription className="text-xs leading-snug">
              <span className="break-words">{t('connect.profilesLoadErrorBody')}</span>
              {loadError.quarantinedTo && (
                <span className="text-muted-foreground mt-1 block break-all">
                  <Trans
                    i18nKey="connect.profilesLoadErrorQuarantined"
                    values={{ filename: loadError.quarantinedTo }}
                    components={{ strong: <strong className="text-foreground" /> }}
                  />
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {showError && <ConnectionErrorAlert raw={showError} />}

        {profiles.length === 0 ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            <Trans i18nKey="connect.noProfilesHtml" components={{ strong: <strong className="text-foreground" /> }} />
          </p>
        ) : orphanActiveName ? (
          <div className="border-emerald-500/40 ring-emerald-500/20 rounded-lg border bg-card p-2.5 shadow-sm ring-1">
            <div className="mb-2 flex items-center gap-1">
              <span className="text-foreground truncate text-xs font-semibold leading-tight">{orphanActiveName}</span>
              <Badge className="h-3.5 bg-emerald-100 px-1 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {t('connect.connectedBadge')}
              </Badge>
            </div>
            <p className="text-muted-foreground mb-2 text-[0.6rem]">{t('connect.orphanProfileNote')}</p>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={onDisconnect}
            >
              <Unplug className="size-3" aria-hidden />
              {t('connect.disconnect')}
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleProfiles.map((p) => {
              const isThisConnecting = isConnecting && connectingName === p.name;
              const isActiveProfile = connected && activeProfileName === p.name;
              return (
                <li key={p.name}>
                  <div className={cn(
                    'border-border/60 rounded-lg border bg-card p-2.5 shadow-sm',
                    isActiveProfile && 'border-emerald-500/40 ring-1 ring-emerald-500/20',
                  )}>
                    <div className="mb-2 flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {p.name === persistedDefault && (
                            <Star
                              className="size-3 shrink-0 fill-current text-muted-foreground/70"
                              aria-label={t('connect.defaultProfileAria')}
                            />
                          )}
                          <span className="text-foreground truncate text-xs font-semibold leading-tight">
                            {p.name}
                          </span>
                          {isActiveProfile && (
                            <Badge className="h-3.5 bg-emerald-100 px-1 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              {t('connect.connectedBadge')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground font-mono text-xs">{p.ip}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-6 shrink-0 p-0 opacity-50 hover:opacity-100"
                            aria-label={t('connect.optionsForAria', { name: p.name })}
                          >
                            <MoreHorizontal className="size-3.5" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onSelect={() => onEditProfile(p)}>
                            {t('connect.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={p.name === persistedDefault || defaultingName !== null}
                            onSelect={() => onMakeDefault(p.name)}
                          >
                            {defaultingName === p.name ? t('connect.settingDots') : t('connect.setAsDefault')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive gap-1.5"
                            onSelect={() => onRequestDelete(p.name)}
                          >
                            <Trash2 className="size-3" aria-hidden />
                            {t('connect.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {isActiveProfile ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7 w-full gap-1.5 text-xs"
                        onClick={onDisconnect}
                      >
                        <Unplug className="size-3" aria-hidden />
                        {t('connect.disconnect')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 w-full gap-1.5 text-xs"
                        disabled={isConnecting}
                        onClick={() => onConnect(p)}
                      >
                        {isThisConnecting ? (
                          <><Loader2 className="size-3 animate-spin" aria-hidden />{t('connect.connectingBtn')}</>
                        ) : (
                          <><Cable className="size-3" aria-hidden />{t('connect.connectBtn')}</>
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
