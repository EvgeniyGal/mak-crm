'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ExportButtonProps {
  onExportXLS: () => void
  onExportCSV: () => void
  disabled?: boolean
}

export function ExportButton({ onExportXLS, onExportCSV, disabled = false }: ExportButtonProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2"
      >
        <Download className="h-4 w-4" />
        {t('common.export')}
      </Button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
            <div className="py-1">
              <button
                onClick={() => {
                  onExportXLS()
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                disabled={disabled}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t('common.exportXLS')}
              </button>
              <button
                onClick={() => {
                  onExportCSV()
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                disabled={disabled}
              >
                <FileText className="h-4 w-4" />
                {t('common.exportCSV')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

