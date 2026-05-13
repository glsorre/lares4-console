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
import {
  FEATURES,
  getFeatureLicense,
  setFeatureLicense,
  type FeatureId,
} from '../runtime/commercial-license-prefs';

interface CommercialLicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureId: FeatureId;
  onChanged?: () => void;
}

export function CommercialLicenseDialog({ open, onOpenChange, featureId, onChanged }: CommercialLicenseDialogProps) {
  const descriptor = FEATURES[featureId];
  const [key, setKey] = useState('');

  useEffect(() => {
    if (open) setKey(getFeatureLicense(featureId) ?? '');
  }, [open, featureId]);

  const trimmed = key.trim();
  const stored = getFeatureLicense(featureId);

  function save() {
    setFeatureLicense(featureId, trimmed.length > 0 ? trimmed : null);
    onChanged?.();
    onOpenChange(false);
  }

  function clear() {
    setFeatureLicense(featureId, null);
    setKey('');
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
        <div className="space-y-1">
          <Label htmlFor={`lic-key-${featureId}`} className="text-xs text-muted-foreground">License key</Label>
          <Input
            id={`lic-key-${featureId}`}
            className="h-8 font-mono text-xs"
            autoFocus
            value={key}
            placeholder="paste commercial license key"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="text-muted-foreground text-[0.65rem]">
            Stored locally in this browser. Not transmitted anywhere.
          </p>
        </div>
        <DialogFooter>
          {stored !== null && (
            <Button type="button" variant="outline" onClick={clear}>
              Clear
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={trimmed.length === 0 || trimmed === stored} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
