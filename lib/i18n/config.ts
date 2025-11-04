import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ukTranslation from './locales/uk.json'
import enTranslation from './locales/en.json'

// Initialize i18next
if (!i18n.isInitialized) {
  // On server, don't use language detection - always use fallback
  // On client, use language detection after hydration
  const isServer = typeof window === 'undefined'
  
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        uk: {
          translation: ukTranslation,
        },
        en: {
          translation: enTranslation,
        },
      },
      lng: isServer ? 'uk' : undefined, // Force 'uk' on server, detect on client
      fallbackLng: 'uk',
      defaultNS: 'translation',
      interpolation: {
        escapeValue: false,
      },
      detection: isServer ? false : {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
      },
      react: {
        useSuspense: false,
      },
    })
}

export default i18n

