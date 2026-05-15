import { Check, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { changeLanguage } from '../../i18n/index.js';
import { SUPPORTED_LOCALES, isSupportedLocale, type Locale } from '../../i18n/types.js';

const LOCALE_META: Record<Locale, { flag: string; nameKey: string }> = {
  en: { flag: '🇬🇧', nameKey: 'language.english' },
  it: { flag: '🇮🇹', nameKey: 'language.italian' },
};

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const current: Locale = isSupportedLocale(i18n.language) ? i18n.language : 'en';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className={cn('shrink-0 border-border/80 bg-background/60 shadow-sm backdrop-blur-sm')}
          title={t('language.triggerTitle', { code: current.toUpperCase() })}
          aria-label={t('language.menuAria')}
        >
          <Globe className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {SUPPORTED_LOCALES.map((loc) => {
          const meta = LOCALE_META[loc];
          const active = loc === current;
          return (
            <DropdownMenuItem
              key={loc}
              onSelect={() => {
                if (!active) void changeLanguage(loc);
              }}
              aria-checked={active}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{meta.flag}</span>
                <span>{t(meta.nameKey)}</span>
              </span>
              {active ? <Check className="size-4 opacity-80" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
