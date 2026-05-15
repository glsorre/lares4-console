import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Cable,
  Check,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
  TriangleAlert,
  Unplug,
  WifiOff,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ConnectionProfile } from '../runtime/profiles-repository-desktop.js';
import { useSessionController } from '@pro/tabs/context.js';

type View = 'list' | 'form';

type ConnErrorKind = 'auth' | 'network' | 'tls' | 'validation' | 'generic';

interface ClassifiedError {
  kind: ConnErrorKind;
  titleKey: string;
  hintKey?: string;
  Icon: typeof TriangleAlert;
}

function classifyConnectionError(raw: string): ClassifiedError {
  const lower = raw.toLowerCase();
  if (/pin|auth|unauthor|forbidden|denied/.test(lower)) {
    return { kind: 'auth', titleKey: 'connect.errAuthTitle', hintKey: 'connect.errAuthHint', Icon: KeyRound };
  }
  if (/tls|ssl|cert|self-?signed|handshake/.test(lower)) {
    return { kind: 'tls', titleKey: 'connect.errTlsTitle', hintKey: 'connect.errTlsHint', Icon: ShieldAlert };
  }
  if (/etimedout|econnrefused|enotfound|enetunreach|network|unreachable|timeout|socket|connection (closed|reset|aborted)/.test(lower)) {
    return { kind: 'network', titleKey: 'connect.errNetTitle', hintKey: 'connect.errNetHint', Icon: WifiOff };
  }
  if (/required|invalid|empty|missing|format/.test(lower)) {
    return { kind: 'validation', titleKey: 'connect.errValidationTitle', Icon: TriangleAlert };
  }
  return { kind: 'generic', titleKey: 'connect.errGenericTitle', Icon: TriangleAlert };
}

function ErrorAlert({ raw }: { raw: string }) {
  const { t } = useTranslation();
  const err = classifyConnectionError(raw);
  const Icon = err.Icon;
  return (
    <Alert variant="destructive" className="mb-3 py-2">
      <Icon className="size-3.5" aria-hidden />
      <AlertTitle className="text-xs font-semibold">{t(err.titleKey)}</AlertTitle>
      <AlertDescription className="text-xs leading-snug">
        <span className="break-words">{raw}</span>
        {err.hintKey && (
          <span className="text-muted-foreground mt-1 block">{t(err.hintKey)}</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function ConnectionSidebar() {
  const { t } = useTranslation();
  const { controller, snapshot } = useSessionController();

  const [view, setView] = useState<View>('list');
  const [editingProfile, setEditingProfile] = useState<string | undefined>(undefined);

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [persistedDefault, setPersistedDefault] = useState<string | undefined>(undefined);
  const [connectingName, setConnectingName] = useState<string | undefined>(undefined);

  const [ip, setIp] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [sender, setSender] = useState('lares4 console');
  const [wss, setWss] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultingName, setDefaultingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    const data = await controller.listProfiles();
    setProfiles(data.profiles);
    setPersistedDefault(data.defaultProfile);
    return data;
  }, [controller]);

  useEffect(() => {
    void (async () => {
      const data = await refreshProfiles();
      if (data.profiles.length === 0) setView('form');
    })();
  }, [refreshProfiles]);

  // Clear connectingName when no longer connecting
  useEffect(() => {
    if (snapshot.connectionStatus !== 'connecting') setConnectingName(undefined);
  }, [snapshot.connectionStatus]);

  function openNewForm() {
    setEditingProfile(undefined);
    setIp('');
    setPin('');
    setName('');
    setSender('lares4 console');
    setWss(true);
    setReadOnly(false);
    setSaveAsDefault(true);
    setErrorMsg(null);
    setView('form');
  }

  function openEditForm(p: ConnectionProfile) {
    setEditingProfile(p.name);
    setIp(p.ip);
    setPin(p.pin);
    setName(p.name);
    setSender(p.sender);
    setWss(p.wss);
    setReadOnly(p.readOnly === true);
    setSaveAsDefault(false);
    setErrorMsg(null);
    setView('form');
  }

  function goBack() {
    setView('list');
    setEditingProfile(undefined);
    setErrorMsg(null);
  }

  function connectFromCard(p: ConnectionProfile) {
    setConnectingName(p.name);
    setErrorMsg(null);
    void controller.connect({ ip: p.ip, pin: p.pin, sender: p.sender, wss: p.wss, profileName: p.name });
  }

  function connectFromForm() {
    setErrorMsg(null);
    const profileName = editingProfile ?? (name.trim() || undefined);
    void controller.connect({ ip, pin, sender, wss, profileName });
  }

  async function saveAndConnect() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await controller.saveProfile({ name: trimmed, ip, pin, sender, wss, readOnly, makeDefault: saveAsDefault });
      await refreshProfiles();
      void controller.connect({ ip, pin, sender, wss, profileName: trimmed });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function updateProfile() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await controller.saveProfile({ name: trimmed, ip, pin, sender, wss, readOnly, makeDefault: saveAsDefault });
      await refreshProfiles();
      setView('list');
      setEditingProfile(undefined);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(profileName: string) {
    setDefaultingName(profileName);
    setErrorMsg(null);
    try {
      await controller.setDefaultProfileName(profileName);
      await refreshProfiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDefaultingName(null);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      await controller.removeProfile(target);
      const data = await refreshProfiles();
      if (data.profiles.length === 0) setView('form');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const isConnecting = snapshot.connectionStatus === 'connecting';
  const connectDisabled = isConnecting || !ip.trim() || !pin.trim();
  const saveConnectDisabled = connectDisabled || !name.trim() || saving;
  const showError = errorMsg ?? (!!snapshot.error && !snapshot.connected ? snapshot.error : null);
  const canGoBack = profiles.length > 0;
  const isEditMode = editingProfile !== undefined;

  // ── List view ──────────────────────────────────────────────────────
  if (view === 'list') {
    const sessionActive = snapshot.connected && snapshot.activeProfileName !== undefined;
    const visibleProfiles = sessionActive
      ? profiles.filter((p) => p.name === snapshot.activeProfileName)
      : profiles;
    const orphanActiveName = sessionActive && visibleProfiles.length === 0
      ? snapshot.activeProfileName
      : undefined;
    return (
      <div className="flex h-full flex-col gap-0">
        <div className="border-b border-border/60 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-foreground text-sm font-semibold">
              {sessionActive ? t('connect.activeConnection') : t('connect.connections')}
            </h2>
            <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={openNewForm} aria-label={t('connect.newConnectionAria')}>
              <Plus className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {showError && <ErrorAlert raw={showError} />}

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
                onClick={() => controller.disconnect()}
              >
                <Unplug className="size-3" aria-hidden />
                {t('connect.disconnect')}
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleProfiles.map((p) => {
                const isThisConnecting = isConnecting && connectingName === p.name;
                const isActiveProfile = snapshot.connected && snapshot.activeProfileName === p.name;
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
                            <DropdownMenuItem onSelect={() => openEditForm(p)}>
                              {t('connect.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={p.name === persistedDefault || defaultingName !== null}
                              onSelect={() => void makeDefault(p.name)}
                            >
                              {defaultingName === p.name ? t('connect.settingDots') : t('connect.setAsDefault')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive gap-1.5"
                              onSelect={() => setDeleteTarget(p.name)}
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
                          onClick={() => controller.disconnect()}
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
                          onClick={() => connectFromCard(p)}
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

        <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <DialogContent showCloseButton={!deleting}>
            <DialogHeader>
              <DialogTitle>{t('connect.removeProfileTitle')}</DialogTitle>
              <DialogDescription>
                <Trans i18nKey="connect.removeProfileDesc" values={{ name: deleteTarget ?? '' }} components={{ strong: <span className="text-foreground font-medium" /> }} />
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                {t('connect.cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? <><Loader2 className="size-4 animate-spin" aria-hidden />{t('connect.removing')}</> : t('connect.remove')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Form view ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col gap-0">
      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button type="button" variant="ghost" size="sm" className="size-7 shrink-0 p-0" onClick={goBack} aria-label={t('connect.back')}>
              <ArrowLeft className="size-3.5" aria-hidden />
            </Button>
          )}
          <h2 className="font-heading text-foreground truncate text-sm font-semibold">
            {isEditMode ? t('connect.editTitle') : t('connect.newConnectionTitle')}
          </h2>
        </div>
        {isEditMode && (
          <p className="text-muted-foreground mt-0.5 pl-9 text-xs truncate">{editingProfile}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {showError && (
          <Alert variant="destructive" className="mb-3 py-2">
            <AlertDescription className="text-xs">{showError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sb-ip" className="text-xs text-muted-foreground">{t('connect.ipHost')}</Label>
            <Input
              id="sb-ip"
              value={ip}
              className="h-8 font-mono text-xs"
              placeholder={t('connect.ipPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onChange={(e) => setIp(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-pin" className="text-xs text-muted-foreground">{t('connect.pin')}</Label>
            <Input
              id="sb-pin"
              type="password"
              value={pin}
              className="h-8 font-mono text-xs"
              placeholder={t('connect.pinPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-wss" checked={wss} onCheckedChange={(c) => setWss(c === true)} className="size-3.5" />
            <Label htmlFor="sb-wss" className="text-xs font-normal leading-none">{t('connect.wss')}</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-readonly" checked={readOnly} onCheckedChange={(c) => setReadOnly(c === true)} className="size-3.5" />
            <Label htmlFor="sb-readonly" className="text-xs font-normal leading-none">{t('connect.readOnlyOnConnect')}</Label>
          </div>
        </div>
      </div>

      {/* Save as profile + Actions — pinned to bottom */}
      <div className="border-t border-border/60 flex flex-col gap-0">
        <div className="px-3 pt-3 pb-2 space-y-3">
          <p className="text-muted-foreground text-[0.6rem] font-medium uppercase tracking-wider">
            {t('connect.saveAsProfile')}
          </p>
          <div className="space-y-1">
            <Label htmlFor="sb-name" className="text-xs text-muted-foreground">{t('connect.profileName')}</Label>
            <Input
              id="sb-name"
              value={name}
              className="h-8 text-xs"
              placeholder={t('connect.profileNamePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-sender" className="text-xs text-muted-foreground">{t('connect.senderLabel')}</Label>
            <Input
              id="sb-sender"
              value={sender}
              className="h-8 text-xs"
              placeholder={t('connect.senderPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setSender(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-default" checked={saveAsDefault} onCheckedChange={(c) => setSaveAsDefault(c === true)} className="size-3.5" />
            <Label htmlFor="sb-default" className="text-xs font-normal leading-none">{t('connect.setAsDefaultCheckbox')}</Label>
          </div>
        </div>
        <div className={cn('border-t border-border/60 px-3 py-3', 'flex flex-col gap-2')}>
        {isEditMode ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={!name.trim() || saving}
              onClick={() => void updateProfile()}
            >
              {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
              {t('connect.updateProfile')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={connectDisabled}
              onClick={connectFromForm}
            >
              {isConnecting
                ? <><Loader2 className="size-3 animate-spin" aria-hidden />{t('connect.connectingBtn')}</>
                : <><Cable className="size-3" aria-hidden />{t('connect.connectBtn')}</>}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={connectDisabled}
              onClick={connectFromForm}
            >
              {isConnecting && !saving
                ? <><Loader2 className="size-3 animate-spin" aria-hidden />{t('connect.connectingBtn')}</>
                : <><Cable className="size-3" aria-hidden />{t('connect.connectBtn')}</>}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={saveConnectDisabled}
              title={!name.trim() ? t('connect.enterNameTitle') : undefined}
              onClick={() => void saveAndConnect()}
            >
              {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
              {t('connect.saveAndConnect')}
            </Button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

