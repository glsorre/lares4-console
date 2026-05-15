import { useTranslation } from 'react-i18next';
import { KeyRound, ShieldAlert, TriangleAlert, WifiOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type ConnErrorKind = 'auth' | 'network' | 'tls' | 'validation' | 'generic';

interface ClassifiedError {
  kind: ConnErrorKind;
  titleKey: string;
  hintKey?: string;
  Icon: typeof TriangleAlert;
}

export function classifyConnectionError(raw: string): ClassifiedError {
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

export function ConnectionErrorAlert({ raw }: { raw: string }) {
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
