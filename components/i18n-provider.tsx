'use client'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import '@/lib/i18n/config'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation()

  useEffect(() => {
    // After hydration, check localStorage for saved language preference
    // This happens after the initial render, so it won't cause hydration mismatch
    const savedLang = localStorage.getItem('i18nextLng')
    if (savedLang && (savedLang === 'uk' || savedLang === 'en')) {
      if (i18n.language !== savedLang) {
        // Change language after hydration to avoid mismatch
        i18n.changeLanguage(savedLang).catch(() => {
          i18n.changeLanguage('uk')
        })
      }
    }
  }, [i18n])

  // Render children immediately - language is 'uk' on both server and initial client render
  return <>{children}</>
}

