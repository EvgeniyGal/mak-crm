'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Menu } from 'lucide-react'

const MOBILE_BREAKPOINT = 768

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const handleMobileClose = useCallback(() => setMobileMenuOpen(false), [])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isMobileOpen={mobileMenuOpen}
        onMobileClose={handleMobileClose}
      />
      {/* Content area: above sidebar when menu closed (z-50) so hamburger is clickable; below when open (z-20) so sidebar/backdrop are on top */}
      <div
        className={`flex flex-1 flex-col min-w-0 min-h-0 relative md:z-auto ${mobileMenuOpen ? 'z-20' : 'z-50'}`}
      >
        {/* Mobile header with hamburger - only visible on small screens */}
        <header className="md:hidden flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-gray-900 text-white border-b border-gray-700">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="font-semibold text-lg">MAK</span>
        </header>
        <main className="dashboard-main flex-1 min-h-0 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}

