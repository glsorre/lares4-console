import { useEffect, useState } from 'react';
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
  FEATURES,
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

function formatExp(exp: number | undefined): string {
  if (exp === undefined) return 'perpetual';
  try {
    return new Date(exp * 1000).toISOString().slice(0, 10);
  } catch {
    return String(exp);
  }
}

export function CommercialLicenseDialog({ open, onOpenChange, featureId, onChanged }: CommercialLicenseDialogProps) {
  const descriptor = FEATURES[featureId];
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{descriptor.title}</DialogTitle>
          <DialogDescription>{descriptor.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`lic-key-${featureId}`} className="text-xs text-muted-foreground">
              License key
            </Label>
            <Input
              id={`lic-key-${featureId}`}
              className="h-8 font-mono text-xs"
              autoFocus
              value={key}
              placeholder="LARES4-..."
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError(null);
              }}
            />
            <p className="text-muted-foreground text-[0.65rem]">
              Stored locally. Verified offline via Ed25519 signature — no network call.
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{verifyFailureMessage(error)}</AlertDescription>
            </Alert>
          )}
          {activePayload && !error && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Licensed to</span>
                <span className="font-mono">{activePayload.sub || '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Scope</span>
                <span className="font-mono">{activePayload.f === '*' ? 'all features (bundle)' : activePayload.f}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-mono">{formatExp(activePayload.exp)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          {storedRaw !== null && (
            <Button type="button" variant="outline" onClick={clear} disabled={pending}>
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || trimmed.length === 0 || trimmed === storedRaw}
            onClick={save}
          >
            {pending ? 'Verifying…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
