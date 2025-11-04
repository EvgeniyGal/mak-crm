import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ukTranslation from './locales/uk.json'
import enTranslation from './locales/en.json'

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
    fallbackLng: 'uk',
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n

