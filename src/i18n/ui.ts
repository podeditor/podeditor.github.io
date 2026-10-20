export const languages = {
  en: { code: 'en', badge: 'US', label: 'English', dir: 'ltr' },
  es: { code: 'es', badge: 'ES', label: 'Español', dir: 'ltr' },
  pt: { code: 'pt', badge: 'BR', label: 'Português', dir: 'ltr' },
  de: { code: 'de', badge: 'DE', label: 'Deutsch', dir: 'ltr' },
  fr: { code: 'fr', badge: 'FR', label: 'Français', dir: 'ltr' },
  ja: { code: 'ja', badge: 'JP', label: '日本語', dir: 'ltr' },
  zh: { code: 'zh', badge: 'CN', label: '简体中文', dir: 'ltr' },
} as const;

export type SupportedLanguage = keyof typeof languages;
export const defaultLang: SupportedLanguage = 'en';

import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';

export const translations = {
  en,
  es,
  pt,
  de,
  fr,
  ja,
  zh,
} as const;

export function useTranslations(lang: SupportedLanguage = defaultLang) {
  const current = translations[lang] || translations[defaultLang];
  return current;
}
