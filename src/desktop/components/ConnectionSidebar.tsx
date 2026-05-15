import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ConnectionProfile, LoadError } from '../runtime/profiles-repository-desktop.js';
import { useSessionController } from '@pro/tabs/context.js';
import { useConnectionStatus } from '../runtime/session-store.js';
import { ConnectionProfileList } from './ConnectionProfileList.js';
import { ConnectionForm, type ConnectionFormValues } from './ConnectionForm.js';

type View = 'list' | 'form';

const DEFAULT_SENDER = 'lares4 console';

const EMPTY_FORM: ConnectionFormValues = {
  ip: '',
  pin: '',
  name: '',
  sender: DEFAULT_SENDER,
  wss: true,
  readOnly: false,
  saveAsDefault: true,
};

function profileToFormValues(p: ConnectionProfile): ConnectionFormValues {
  return {
    ip: p.ip,
    pin: p.pin,
    name: p.name,
    sender: p.sender,
    wss: p.wss,
    readOnly: p.readOnly === true,
    saveAsDefault: false,
  };
}

export function ConnectionSidebar() {
  const { t } = useTranslation();
  const { controller } = useSessionController();
  const { connected, connectionStatus, error: sessionError } = useConnectionStatus();

  const [view, setView] = useState<View>('list');
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | undefined>(undefined);

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [persistedDefault, setPersistedDefault] = useState<string | undefined>(undefined);
  const [profilesLoadError, setProfilesLoadError] = useState<LoadError | undefined>(undefined);
  const [connectingName, setConnectingName] = useState<string | undefined>(undefined);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultingName, setDefaultingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    const data = await controller.listProfiles();
    setProfiles(data.profiles);
    setPersistedDefault(data.defaultProfile);
    setProfilesLoadError(data.loadError);
    return data;
  }, [controller]);

  useEffect(() => {
    void (async () => {
      const data = await refreshProfiles();
      if (data.profiles.length === 0) setView('form');
    })();
  }, [refreshProfiles]);

  useEffect(() => {
    if (connectionStatus !== 'connecting') setConnectingName(undefined);
  }, [connectionStatus]);

  function openNewForm() {
    setEditingProfile(undefined);
    setErrorMsg(null);
    setView('form');
  }

  function openEditForm(p: ConnectionProfile) {
    setEditingProfile(p);
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

  function connectFromForm(values: ConnectionFormValues) {
    setErrorMsg(null);
    const profileName = editingProfile?.name ?? (values.name.trim() || undefined);
    void controller.connect({ ip: values.ip, pin: values.pin, sender: values.sender, wss: values.wss, profileName });
  }

  async function saveAndConnect(values: ConnectionFormValues) {
    const trimmed = values.name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await controller.saveProfile({
        name: trimmed,
        ip: values.ip,
        pin: values.pin,
        sender: values.sender,
        wss: values.wss,
        readOnly: values.readOnly,
        makeDefault: values.saveAsDefault,
      });
      await refreshProfiles();
      void controller.connect({ ip: values.ip, pin: values.pin, sender: values.sender, wss: values.wss, profileName: trimmed });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function updateProfile(values: ConnectionFormValues) {
    const trimmed = values.name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await controller.saveProfile({
        name: trimmed,
        ip: values.ip,
        pin: values.pin,
        sender: values.sender,
        wss: values.wss,
        readOnly: values.readOnly,
        makeDefault: values.saveAsDefault,
      });
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

  const isConnecting = connectionStatus === 'connecting';
  const showError = errorMsg ?? (!!sessionError && !connected ? sessionError : null);
  const canGoBack = profiles.length > 0;
  const isEditMode = editingProfile !== undefined;

  if (view === 'list') {
    return (
      <>
        <ConnectionProfileList
          profiles={profiles}
          persistedDefault={persistedDefault}
          connectingName={connectingName}
          defaultingName={defaultingName}
          showError={showError}
          loadError={profilesLoadError}
          onNewProfile={openNewForm}
          onEditProfile={openEditForm}
          onConnect={connectFromCard}
          onDisconnect={() => controller.disconnect()}
          onMakeDefault={(name) => void makeDefault(name)}
          onRequestDelete={(name) => setDeleteTarget(name)}
        />

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
      </>
    );
  }

  const initialForForm = editingProfile ? profileToFormValues(editingProfile) : EMPTY_FORM;

  return (
    <ConnectionForm
      key={editingProfile?.name ?? '__new__'}
      initial={initialForForm}
      isEditMode={isEditMode}
      editingProfileName={editingProfile?.name}
      canGoBack={canGoBack}
      isConnecting={isConnecting}
      saving={saving}
      showError={showError}
      onBack={goBack}
      onConnect={connectFromForm}
      onSaveAndConnect={(values) => void saveAndConnect(values)}
      onUpdateProfile={(values) => void updateProfile(values)}
    />
  );
}
