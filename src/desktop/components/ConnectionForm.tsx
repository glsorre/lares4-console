import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Cable, Check, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ConnectionFormValues {
  ip: string;
  pin: string;
  name: string;
  sender: string;
  wss: boolean;
  acceptInvalidCerts: boolean;
  readOnly: boolean;
  saveAsDefault: boolean;
}

interface ConnectionFormProps {
  initial: ConnectionFormValues;
  isEditMode: boolean;
  editingProfileName?: string;
  canGoBack: boolean;
  isConnecting: boolean;
  saving: boolean;
  showError: string | null;
  onBack: () => void;
  onConnect: (values: ConnectionFormValues) => void;
  onSaveAndConnect: (values: ConnectionFormValues) => void;
  onUpdateProfile: (values: ConnectionFormValues) => void;
}

export function ConnectionForm({
  initial,
  isEditMode,
  editingProfileName,
  canGoBack,
  isConnecting,
  saving,
  showError,
  onBack,
  onConnect,
  onSaveAndConnect,
  onUpdateProfile,
}: ConnectionFormProps) {
  const { t } = useTranslation();
  const [ip, setIp] = useState(initial.ip);
  const [pin, setPin] = useState(initial.pin);
  const [name, setName] = useState(initial.name);
  const [sender, setSender] = useState(initial.sender);
  const [wss, setWss] = useState(initial.wss);
  const [acceptInvalidCerts, setAcceptInvalidCerts] = useState(initial.acceptInvalidCerts);
  const [readOnly, setReadOnly] = useState(initial.readOnly);
  const [saveAsDefault, setSaveAsDefault] = useState(initial.saveAsDefault);

  const values: ConnectionFormValues = {
    ip,
    pin,
    name,
    sender,
    wss,
    acceptInvalidCerts: wss && acceptInvalidCerts,
    readOnly,
    saveAsDefault,
  };
  const connectDisabled = isConnecting || !ip.trim() || !pin.trim();
  const saveConnectDisabled = connectDisabled || !name.trim() || saving;

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <Button type="button" variant="ghost" size="sm" className="size-7 shrink-0 p-0" onClick={onBack} aria-label={t('connect.back')}>
              <ArrowLeft className="size-3.5" aria-hidden />
            </Button>
          )}
          <h2 className="font-heading text-foreground truncate text-sm font-semibold">
            {isEditMode ? t('connect.editTitle') : t('connect.newConnectionTitle')}
          </h2>
        </div>
        {isEditMode && editingProfileName && (
          <p className="text-muted-foreground mt-0.5 pl-9 text-xs truncate">{editingProfileName}</p>
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
          <div className={cn('flex items-center gap-1.5', !wss && 'opacity-50')}>
            <Checkbox
              id="sb-accept-invalid-certs"
              checked={wss && acceptInvalidCerts}
              disabled={!wss}
              onCheckedChange={(c) => setAcceptInvalidCerts(c === true)}
              className="size-3.5"
            />
            <Label htmlFor="sb-accept-invalid-certs" className="text-xs font-normal leading-none">
              {t('connect.acceptInvalidCerts')}
            </Label>
          </div>
          {wss && acceptInvalidCerts && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-[11px] leading-snug">
                {t('connect.acceptInvalidCertsWarn')}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-1.5">
            <Checkbox id="sb-readonly" checked={readOnly} onCheckedChange={(c) => setReadOnly(c === true)} className="size-3.5" />
            <Label htmlFor="sb-readonly" className="text-xs font-normal leading-none">{t('connect.readOnlyOnConnect')}</Label>
          </div>
        </div>
      </div>

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
                onClick={() => onUpdateProfile(values)}
              >
                {saving ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                {t('connect.updateProfile')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="w-full gap-1.5 text-xs"
                disabled={connectDisabled}
                onClick={() => onConnect(values)}
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
                onClick={() => onConnect(values)}
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
                onClick={() => onSaveAndConnect(values)}
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
