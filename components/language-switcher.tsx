'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const [currentLanguage, setCurrentLanguage] = useState('uk')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('i18nextLng') || i18n.language || 'uk'
      setCurrentLanguage(savedLang)
      
      if (i18n.language !== savedLang) {
        i18n.changeLanguage(savedLang)
      }
    }

    // Listen for language changes
    const handleLanguageChanged = (lng: string) => {
      setCurrentLanguage(lng)
    }

    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n])

  const changeLanguage = (lang: string) => {
    setCurrentLanguage(lang)
    if (typeof window !== 'undefined') {
      localStorage.setItem('i18nextLng', lang)
      i18n.changeLanguage(lang).then(() => {
        // Language change will trigger re-renders via useTranslation hook
      })
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-gray-300" />
        <select
          value="uk"
          disabled
          className="w-32 bg-gray-800 border-2 border-gray-700 text-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="uk">Українська</option>
          <option value="en">English</option>
        </select>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-gray-300" />
      <select
        value={currentLanguage}
        onChange={(e) => changeLanguage(e.target.value)}
        className="w-32 bg-gray-800 border-2 border-gray-700 text-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="uk">Українська</option>
        <option value="en">English</option>
      </select>
    </div>
  )
}

