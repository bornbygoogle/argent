import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from '@/locales/fr/common.json';
import en from '@/locales/en/common.json';

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export const FALLBACK_LOCALE = 'en';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { common: fr },
      en: { common: en },
    },
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    nonExplicitSupportedLngs: true,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'argent.locale',
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  });

// Keep <html lang> in sync with the active locale.
const applyHtmlLang = (lng: string) => {
  const code = lng?.startsWith('fr') ? 'fr' : 'en';
  document.documentElement.setAttribute('lang', code);
};
applyHtmlLang(i18n.language);
i18n.on('languageChanged', applyHtmlLang);

export { i18n };
export default i18n;
