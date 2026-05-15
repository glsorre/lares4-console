import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getFeatureLicense,
  getFeatureLicensePayload,
  getBundleRaw,
  setFeatureLicense,
  setBundleLicense,
  verifyAndSaveFeatureLicense,
  type FeatureId,
} from '../runtime/commercial-license-prefs';
import {
  verifyFailureMessage,
  type LicensePayload,
  type VerifyFailureReason,
} from '../runtime/license-verify';

interface CommercialLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureId: FeatureId;
  onChanged?: () => void;
}

function formatExpDate(exp: number | undefined): string | null {
  if (exp === undefined) return null;
  try {
    return new Date(exp * 1000).toISOString().slice(0, 10);
  } catch {
    return String(exp);
  }
}

export function CommercialLicenseDialog({ open, onOpenChange, featureId, onChanged }: CommercialLicenseDialogProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [error, setError] = useState<VerifyFailureReason | null>(null);
  const [pending, setPending] = useState(false);
  const [activePayload, setActivePayload] = useState<LicensePayload | null>(null);

  useEffect(() => {
    if (open) {
      const stored = getFeatureLicense(featureId) ?? getBundleRaw() ?? '';
      setKey(stored);
      setError(null);
      setPending(false);
      setActivePayload(getFeatureLicensePayload(featureId));
    }
  }, [open, featureId]);

  const trimmed = key.trim();
  const storedRaw = getFeatureLicense(featureId) ?? getBundleRaw();

  async function save() {
    if (trimmed.length === 0) return;
    setPending(true);
    setError(null);
    const result = await verifyAndSaveFeatureLicense(featureId, trimmed);
    setPending(false);
    if (!result.ok) {
      setError(result.reason);
      setActivePayload(null);
      return;
    }
    setActivePayload(result.payload);
    onChanged?.();
    onOpenChange(false);
  }

  function clear() {
    setFeatureLicense(featureId, null);
    setBundleLicense(null);
    setKey('');
    setError(null);
    setActivePayload(null);
    onChanged?.();
    onOpenChange(false);
  }

  const errorMsg = error ? (() => {
    const { key: tKey, params } = verifyFailureMessage(error);
    return t(tKey, params);
  })() : null;
  const expFormatted = activePayload ? formatExpDate(activePayload.exp) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`license.feature.${featureId}.title`)}</DialogTitle>
          <DialogDescription>{t(`license.feature.${featureId}.description`)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`lic-key-${featureId}`} className="text-xs text-muted-foreground">
              {t('license.dialog.keyLabel')}
            </Label>
            <Input
              id={`lic-key-${featureId}`}
              className="h-8 font-mono text-xs"
              autoFocus
              value={key}
              placeholder={t('license.dialog.keyPlaceholder')}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError(null);
              }}
            />
            <p className="text-muted-foreground text-[0.65rem]">
              {t('license.dialog.keyNote')}
            </p>
          </div>
          {errorMsg && (
            <Alert variant="destructive">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}
          {activePayload && !errorMsg && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('license.dialog.licensedTo')}</span>
                <span className="font-mono">{activePayload.sub || t('common.dash')}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('license.dialog.scope')}</span>
                <span className="font-mono">{activePayload.f === '*' ? t('license.dialog.scopeAll') : activePayload.f}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t('license.dialog.expires')}</span>
                <span className="font-mono">{expFormatted ?? t('license.dialog.expPerpetual')}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          {storedRaw !== null && (
            <Button type="button" variant="outline" onClick={clear} disabled={pending}>
              {t('license.dialog.clear')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending || trimmed.length === 0 || trimmed === storedRaw}
            onClick={save}
          >
            {pending ? t('license.dialog.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
