import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Cable,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
  Unplug,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useSessionController } from '../runtime/session-controller-context.js';
import type { Macro } from '../../core/macros.js';
import { MacroEditorDialog } from './MacroEditorDialog.js';

type View = 'list' | 'form';

export function ConnectionSidebar() {
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
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultingName, setDefaultingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [macrosOpen, setMacrosOpen] = useState(true);
  const [macroEditorOpen, setMacroEditorOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | undefined>(undefined);
  const [deleteMacroId, setDeleteMacroId] = useState<string | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [recordingNameOpen, setRecordingNameOpen] = useState(false);

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
      await controller.saveProfile({ name: trimmed, ip, pin, sender, wss, makeDefault: saveAsDefault });
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
      await controller.saveProfile({ name: trimmed, ip, pin, sender, wss, makeDefault: saveAsDefault });
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
              {sessionActive ? 'Active connection' : 'Connections'}
            </h2>
            <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={openNewForm} aria-label="New connection">
              <Plus className="size-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {showError && (
            <Alert variant="destructive" className="mb-3 py-2">
              <AlertDescription className="text-xs">{showError}</AlertDescription>
            </Alert>
          )}

          {profiles.length === 0 ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              No profiles. Use <strong className="text-foreground">+</strong> to add one.
            </p>
          ) : orphanActiveName ? (
            <div className="border-emerald-500/40 ring-emerald-500/20 rounded-lg border bg-card p-2.5 shadow-sm ring-1">
              <div className="mb-2 flex items-center gap-1">
                <span className="text-foreground truncate text-xs font-semibold leading-tight">{orphanActiveName}</span>
                <Badge className="h-3.5 bg-emerald-100 px-1 text-[0.55rem] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Connected
                </Badge>
              </div>
              <p className="text-muted-foreground mb-2 text-[0.6rem]">Profile no longer in saved list.</p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 w-full gap-1.5 text-xs"
                onClick={() => controller.disconnect()}
              >
                <Unplug className="size-3" aria-hidden />
                Disconnect
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
                            <span className="text-foreground truncate text-xs font-semibold leading-tight">
                              {p.name}
                            </span>
                            {isActiveProfile && (
                              <Badge className="h-3.5 bg-emerald-100 px-1 text-[0.55rem] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Connected
                              </Badge>
                            )}
                            {p.name === persistedDefault && (
                              <Badge variant="secondary" className="h-3.5 px-1 text-[0.55rem]">Default</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground font-mono text-[0.65rem]">{p.ip}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-6 shrink-0 p-0 opacity-50 hover:opacity-100"
                              aria-label={`Options for ${p.name}`}
                            >
                              <MoreHorizontal className="size-3.5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem onSelect={() => openEditForm(p)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={p.name === persistedDefault || defaultingName !== null}
                              onSelect={() => void makeDefault(p.name)}
                            >
                              {defaultingName === p.name ? 'Setting…' : 'Set as default'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive gap-1.5"
                              onSelect={() => setDeleteTarget(p.name)}
                            >
                              <Trash2 className="size-3" aria-hidden />
                              Delete
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
                          Disconnect
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
                            <><Loader2 className="size-3 animate-spin" aria-hidden />Connecting…</>
                          ) : (
                            <><Cable className="size-3" aria-hidden />Connect</>
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {snapshot.connected && (
            <MacrosSection
              open={macrosOpen}
              setOpen={setMacrosOpen}
              macros={snapshot.macros}
              activeMacro={snapshot.activeMacro}
              recording={snapshot.recordingMacro}
              recordingSteps={snapshot.recordingMacroSteps}
              onNew={() => { setEditingMacro(undefined); setMacroEditorOpen(true); }}
              onEdit={(m) => { setEditingMacro(m); setMacroEditorOpen(true); }}
              onRun={(m) => controller.runMacro(m.id)}
              onPause={() => controller.pauseMacro()}
              onResume={() => controller.resumeMacro()}
              onStop={() => controller.stopMacro()}
              onDelete={(id) => setDeleteMacroId(id)}
              onStartRecording={() => controller.startRecordingMacro()}
              onStopRecording={() => {
                setRecordingName('');
                setRecordingNameOpen(true);
              }}
              onCancelRecording={() => controller.cancelRecordingMacro()}
            />
          )}
        </div>

        <MacroEditorDialog
          open={macroEditorOpen}
          initial={editingMacro}
          onOpenChange={setMacroEditorOpen}
          onSave={async (input) => { await controller.saveMacro(input); }}
        />

        <Dialog open={recordingNameOpen} onOpenChange={(open) => { if (!open) setRecordingNameOpen(false); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save recorded macro</DialogTitle>
              <DialogDescription>
                Captured {snapshot.recordingMacroSteps} step{snapshot.recordingMacroSteps === 1 ? '' : 's'}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="rec-name" className="text-xs text-muted-foreground">Name</Label>
              <Input
                id="rec-name"
                className="h-8 text-xs"
                autoFocus
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder="evening"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { controller.cancelRecordingMacro(); setRecordingNameOpen(false); }}>
                Discard
              </Button>
              <Button
                type="button"
                disabled={!recordingName.trim()}
                onClick={() => {
                  void controller.stopRecordingMacro(recordingName.trim());
                  setRecordingNameOpen(false);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteMacroId !== null} onOpenChange={(open) => { if (!open) setDeleteMacroId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete macro?</DialogTitle>
              <DialogDescription>This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteMacroId(null)}>Cancel</Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  const id = deleteMacroId;
                  setDeleteMacroId(null);
                  if (id) void controller.removeMacro(id);
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <DialogContent showCloseButton={!deleting}>
            <DialogHeader>
              <DialogTitle>Remove profile?</DialogTitle>
              <DialogDescription>
                Removes <span className="text-foreground font-medium">{deleteTarget ?? ''}</span> permanently.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
                {deleting ? <><Loader2 className="size-4 animate-spin" aria-hidden />Removing</> : 'Remove'}
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
            <Button type="button" variant="ghost" size="sm" className="size-7 shrink-0 p-0" onClick={goBack} aria-label="Back">
              <ArrowLeft className="size-3.5" aria-hidden />
            </Button>
          )}
          <h2 className="font-heading text-foreground truncate text-sm font-semibold">
            {isEditMode ? `Edit` : 'New connection'}
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
            <Label htmlFor="sb-ip" className="text-xs text-muted-foreground">IP / host</Label>
            <Input
              id="sb-ip"
              value={ip}
              className="h-8 font-mono text-xs"
              placeholder="192.168.1.10"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              onChange={(e) => setIp(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-pin" className="text-xs text-muted-foreground">PIN</Label>
            <Input
              id="sb-pin"
              type="password"
              value={pin}
              className="h-8 font-mono text-xs"
              placeholder="••••••"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-wss" checked={wss} onCheckedChange={(c) => setWss(c === true)} className="size-3.5" />
            <Label htmlFor="sb-wss" className="text-xs font-normal leading-none">Secure WebSocket (WSS)</Label>
          </div>
        </div>
      </div>

      {/* Save as profile + Actions — pinned to bottom */}
      <div className="border-t border-border/60 flex flex-col gap-0">
        <div className="px-3 pt-3 pb-2 space-y-3">
          <p className="text-muted-foreground text-[0.6rem] font-medium uppercase tracking-wider">
            Save as profile — optional
          </p>
          <div className="space-y-1">
            <Label htmlFor="sb-name" className="text-xs text-muted-foreground">Profile name</Label>
            <Input
              id="sb-name"
              value={name}
              className="h-8 text-xs"
              placeholder="e.g. Home panel"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-sender" className="text-xs text-muted-foreground">Sender label</Label>
            <Input
              id="sb-sender"
              value={sender}
              className="h-8 text-xs"
              placeholder="lares4 console"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setSender(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-default" checked={saveAsDefault} onCheckedChange={(c) => setSaveAsDefault(c === true)} className="size-3.5" />
            <Label htmlFor="sb-default" className="text-xs font-normal leading-none">Set as default</Label>
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
              Update profile
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={connectDisabled}
              onClick={connectFromForm}
            >
              {isConnecting
                ? <><Loader2 className="size-3 animate-spin" aria-hidden />Connecting…</>
                : <><Cable className="size-3" aria-hidden />Connect</>}
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
                ? <><Loader2 className="size-3 animate-spin" aria-hidden />Connecting…</>
                : <><Cable className="size-3" aria-hidden />Connect</>}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={saveConnectDisabled}
              title={!name.trim() ? 'Enter a name to save.' : undefined}
              onClick={() => void saveAndConnect()}
            >
              {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
              Save &amp; connect
            </Button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

interface MacrosSectionProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  macros: Macro[];
  activeMacro?: { name: string; position: number; total: number; status: 'stopped' | 'playing' | 'paused' };
  recording: boolean;
  recordingSteps: number;
  onNew: () => void;
  onEdit: (m: Macro) => void;
  onRun: (m: Macro) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDelete: (id: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
}

function MacrosSection(props: MacrosSectionProps) {
  const {
    open, setOpen, macros, activeMacro, recording, recordingSteps,
    onNew, onEdit, onRun, onPause, onResume, onStop, onDelete,
    onStartRecording, onStopRecording, onCancelRecording,
  } = props;
  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <button
        type="button"
        className="text-foreground flex w-full items-center justify-between gap-1 text-xs font-semibold"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
          Macros
          <span className="text-muted-foreground font-normal">· {macros.length}</span>
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={(e) => { e.stopPropagation(); onNew(); }}
            aria-label="New macro"
          >
            <Plus className="size-3" aria-hidden />
          </Button>
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {activeMacro && (
            <div className="bg-muted/40 border-border/60 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[0.65rem]">
              <span className="truncate font-mono">
                {activeMacro.name} · {activeMacro.position}/{activeMacro.total} · {activeMacro.status}
              </span>
              <span className="flex items-center gap-0.5">
                {activeMacro.status === 'playing' ? (
                  <Button type="button" variant="ghost" size="sm" className="size-5 p-0" onClick={onPause} aria-label="Pause macro">
                    <Pause className="size-3" aria-hidden />
                  </Button>
                ) : activeMacro.position < activeMacro.total ? (
                  <Button type="button" variant="ghost" size="sm" className="size-5 p-0" onClick={onResume} aria-label="Resume macro">
                    <Play className="size-3" aria-hidden />
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" className="size-5 p-0" onClick={onStop} aria-label="Stop macro">
                  <Square className="size-3" aria-hidden />
                </Button>
              </span>
            </div>
          )}

          {recording && (
            <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[0.65rem]">
              <span className="flex items-center gap-1.5">
                <Circle className="size-2.5 fill-current" aria-hidden />
                Recording · {recordingSteps} step{recordingSteps === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="sm" className="size-5 p-0" onClick={onStopRecording} aria-label="Stop recording">
                  <Check className="size-3" aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="sm" className="size-5 p-0" onClick={onCancelRecording} aria-label="Cancel recording">
                  <Trash2 className="size-3" aria-hidden />
                </Button>
              </span>
            </div>
          )}

          {macros.length === 0 ? (
            <p className="text-muted-foreground text-xs leading-relaxed">
              No macros. Use <strong className="text-foreground">+</strong> to create one.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {macros.map((m) => {
                const isActive = activeMacro?.name === m.name;
                return (
                  <li key={m.id}>
                    <div className={cn(
                      'border-border/60 flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 shadow-sm',
                      isActive && 'border-primary/40 ring-1 ring-primary/20',
                    )}>
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-xs font-medium leading-tight">{m.name}</p>
                        <p className="text-muted-foreground text-[0.6rem]">{m.steps.length} step{m.steps.length === 1 ? '' : 's'}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => onRun(m)}
                        disabled={isActive}
                        aria-label={`Run ${m.name}`}
                      >
                        <Play className="size-3" aria-hidden />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="size-6 p-0 opacity-50 hover:opacity-100" aria-label={`Options for ${m.name}`}>
                            <MoreHorizontal className="size-3" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onSelect={() => onEdit(m)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(m.id)}>
                            <Trash2 className="size-3" aria-hidden />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!recording && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs"
              onClick={onStartRecording}
              disabled={activeMacro !== undefined}
            >
              <Circle className="size-3" aria-hidden />
              Record
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
