import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, ClipboardCopy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  t: TFunction;
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught render error', error, info);
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleCopy = async (): Promise<void> => {
    const { error } = this.state;
    if (!error) return;
    const payload = `${error.name}: ${error.message}\n\n${error.stack ?? '(no stack)'}`;
    try {
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1500);
    } catch {
      // ignore — clipboard might be denied
    }
  };

  render(): ReactNode {
    const { error, copied } = this.state;
    const { t } = this.props;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
        <Card className="bg-pane/80 border-border/60 w-full max-w-xl shadow-lg ring-1 ring-border/40">
          <CardContent className="flex flex-col gap-4 p-6">
            <Alert variant="destructive">
              <AlertOctagon className="size-4" aria-hidden />
              <AlertTitle>{t('errorBoundary.title')}</AlertTitle>
              <AlertDescription>{t('errorBoundary.description')}</AlertDescription>
            </Alert>
            <pre className="bg-muted/60 border-border/60 max-h-48 overflow-auto rounded-md border p-3 font-mono text-[12px] leading-snug">
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={this.handleReload} className="gap-1.5">
                <RefreshCw className="size-3.5" aria-hidden />
                {t('errorBoundary.reload')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void this.handleCopy()}
                className="gap-1.5"
              >
                <ClipboardCopy className="size-3.5" aria-hidden />
                {copied ? t('errorBoundary.copied') : t('errorBoundary.copyStack')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>;
}
