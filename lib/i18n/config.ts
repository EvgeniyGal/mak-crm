import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ukTranslation from './locales/uk.json'
import enTranslation from './locales/en.json'

// Initialize i18next
if (!i18n.isInitialized) {
  // Always start with 'uk' to match server-side rendering
  // Language detection will happen after hydration to prevent mismatch
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
      lng: 'uk', // Always start with 'uk' to match server
      fallbackLng: 'uk',
      defaultNS: 'translation',
      interpolation: {
        escapeValue: false,
      },
      // Disable auto-detection during initialization to prevent hydration mismatch
      // Detection will be handled manually after hydration
      ...(isServer ? {} : {
        detection: {
          order: [], // Disable auto-detection on init
          caches: ['localStorage'],
          lookupLocalStorage: 'i18nextLng',
        },
      }),
      react: {
        useSuspense: false,
      },
    })
}

export default i18n

