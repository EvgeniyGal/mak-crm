'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Use higher z-index so this modal appears above another open modal */
  elevated?: boolean
}

export function Modal({ isOpen, onClose, title, children, size = 'md', elevated }: ModalProps) {
  const zClass = elevated ? 'z-[60]' : 'z-50'

  const content = !isOpen ? null : (
    <div className={cn('fixed inset-0 flex items-center justify-center', zClass)}>
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white rounded-lg shadow-lg z-50 flex flex-col max-h-[90vh]',
          {
            'w-full max-w-sm': size === 'sm',
            'w-full max-w-md': size === 'md',
            'w-full max-w-lg': size === 'lg',
            'w-full max-w-4xl': size === 'xl',
          }
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={cn('p-6 overflow-y-auto', size === 'xl' || size === 'lg' ? 'flex-1' : 'max-h-[calc(90vh-120px)]')}>
          {children}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

