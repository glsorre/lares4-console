import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isReadOnlyMode, setReadOnlyMode, subscribeReadOnlyMode } from '../runtime/read-only-prefs.js';

export function ReadOnlyToggle() {
  const { t } = useTranslation();
  const [active, setActive] = useState<boolean>(() => isReadOnlyMode());

  useEffect(() => {
    return subscribeReadOnlyMode(setActive);
  }, []);

  const toggle = () => setReadOnlyMode(!active);
  const label = active ? t('readOnly.onLabel') : t('readOnly.offLabel');

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={cn(
        'shrink-0 border-border/80 bg-background/60 shadow-sm backdrop-blur-sm',
        active && 'border-amber-500/60 bg-amber-100/70 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      )}
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {active
        ? <EyeOff className="size-4" aria-hidden />
        : <Eye className="size-4" aria-hidden />}
    </Button>
  );
}
