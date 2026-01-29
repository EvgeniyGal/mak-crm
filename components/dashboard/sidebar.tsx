'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  Home,
  Users,
  UserCheck,
  UserPlus,
  ClipboardCheck,
  Calendar,
  GraduationCap,
  Clock,
  Building,
  DollarSign,
  CheckSquare,
  TrendingUp,
  LogOut,
  FileText,
  ChevronDown,
  ChevronRight,
  User,
  Wallet,
  X,
} from 'lucide-react'
import { LanguageSwitcher } from '@/components/language-switcher'
import { useTranslation } from 'react-i18next'
import ukTranslation from '@/lib/i18n/locales/uk.json'
import { LucideIcon } from 'lucide-react'

interface User {
  role: 'admin' | 'owner'
}

interface MenuItem {
  href?: string
  label: string
  icon: LucideIcon
  ownerOnly?: boolean
  children?: MenuItem[]
}

type TranslationFunction = (key: string) => string

// Menu items will be generated with translations
const getMenuItems = (t: TranslationFunction): MenuItem[] => [
  { href: '/dashboard', label: t('dashboard.home'), icon: Home },
  { href: '/dashboard/students', label: t('dashboard.studentList'), icon: Users },
  { href: '/dashboard/new-students', label: t('dashboard.newStudents'), icon: UserPlus },
  { href: '/dashboard/student-absentees', label: t('dashboard.studentAbsentees'), icon: UserCheck },
  { href: '/dashboard/attendances', label: t('dashboard.attendances'), icon: ClipboardCheck },
  { href: '/dashboard/class-attendances', label: t('dashboard.classAttendances'), icon: Calendar },
  { href: '/dashboard/teachers', label: t('dashboard.teachers'), icon: GraduationCap },
  { href: '/dashboard/classes', label: t('dashboard.classes'), icon: Users },
  { href: '/dashboard/schedules', label: t('dashboard.schedules'), icon: Clock },
  { href: '/dashboard/rooms', label: t('dashboard.rooms'), icon: Building },
  { href: '/dashboard/payments', label: t('dashboard.payments'), icon: DollarSign },
  { href: '/dashboard/admin-tasks', label: t('dashboard.adminTasks'), icon: CheckSquare },
  { href: '/dashboard/expenditures', label: t('dashboard.expenditures'), icon: FileText },
  { href: '/dashboard/teacher-salaries', label: t('dashboard.teacherSalaries'), icon: TrendingUp },
  { href: '/dashboard/finance', label: t('dashboard.finance'), icon: Wallet },
  { href: '/dashboard/users', label: t('dashboard.users'), icon: Users, ownerOnly: true },
  { href: '/dashboard/analytics', label: t('dashboard.analytics'), icon: TrendingUp, ownerOnly: true },
]

const getGroupKey = (label: string) => {
  return label.toLowerCase().replace(/\s+/g, '-')
}

interface SidebarProps {
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t, i18n } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const openedAtRef = useRef<number>(0)

  // Wait for client-side hydration to prevent SSR mismatch
  useEffect(() => {
    setMounted(true)
    // Load language from localStorage after mount
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('i18nextLng')
      if (savedLang && savedLang !== i18n.language) {
        i18n.changeLanguage(savedLang).catch(() => {
          // Fallback to Ukrainian if language change fails
          i18n.changeLanguage('uk')
        })
      } else if (!savedLang && i18n.language !== 'uk') {
        // Ensure Ukrainian is default
        i18n.changeLanguage('uk')
      }
    }
  }, [i18n])

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .single()
        if (data) setUser(data)
      }
    }
    fetchUser()
  }, [supabase])

  // Use fallback during SSR to prevent hydration mismatch
  // Only use translations when i18n is ready and mounted
  const menuItems = useMemo(() => {
    if (!mounted || !i18n.isInitialized) {
      return getMenuItems((key: string) => {
        // Return Ukrainian fallback during SSR or when not initialized
        const keys = key.split('.')
        let value: unknown = ukTranslation
        for (const k of keys) {
          value = (value as Record<string, unknown>)?.[k]
        }
        return (value as string) || key
      })
    }
    // Use actual translations when ready
    return getMenuItems((key: string) => {
      const translated = t(key, { defaultValue: key })
      // If translation returns the key unchanged, try Ukrainian fallback
      if (translated === key && i18n.language !== 'uk') {
        const keys = key.split('.')
        let value: unknown = ukTranslation
        for (const k of keys) {
          value = (value as Record<string, unknown>)?.[k]
        }
        return (value as string) || key
      }
      return translated
    })
  }, [mounted, t, i18n.language, i18n.isInitialized])

  // Auto-expand groups if current path is a child
  useEffect(() => {
    menuItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(
          child => pathname === child.href || pathname.startsWith(child.href + '/')
        )
        if (hasActiveChild) {
          setExpandedGroups(prev => new Set(prev).add(getGroupKey(item.label)))
        }
      }
    })
  }, [pathname, menuItems])

  // Track when mobile menu opened so we can ignore the same tap on backdrop
  useEffect(() => {
    if (isMobileOpen) {
      openedAtRef.current = Date.now()
    }
  }, [isMobileOpen])

  // Close profile menu and mobile menu when route changes
  useEffect(() => {
    setProfileMenuOpen(false)
    onMobileClose?.()
  }, [pathname, onMobileClose])

  const handleBackdropClick = () => {
    // Ignore clicks within 400ms of opening - same tap that opened the menu often hits the backdrop
    if (Date.now() - openedAtRef.current < 400) return
    onMobileClose?.()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const toggleGroup = (groupLabel: string) => {
    const groupKey = getGroupKey(groupLabel)
    setExpandedGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey)
      } else {
        newSet.add(groupKey)
      }
      return newSet
    })
  }

  const isGroupExpanded = (groupLabel: string) => {
    const groupKey = getGroupKey(groupLabel)
    return expandedGroups.has(groupKey)
  }

  const filterVisibleItems = (items: MenuItem[]): MenuItem[] => {
    return items.filter(item => {
      if (item.ownerOnly && user?.role !== 'owner') return false
      if (item.children) {
        return filterVisibleItems(item.children).length > 0
      }
      return true
    })
  }

  const visibleItems = filterVisibleItems(menuItems)

  const renderMenuItem = (item: MenuItem) => {
    if (item.children) {
      const groupKey = getGroupKey(item.label)
      const isExpanded = isGroupExpanded(item.label)
      const hasActiveChild = item.children.some(
        child => pathname === child.href || pathname.startsWith(child.href + '/')
      )

      return (
        <div key={groupKey}>
          <button
            onClick={() => toggleGroup(item.label)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-2 rounded-lg transition-colors',
              hasActiveChild
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            )}
          >
            <div className="flex items-center space-x-3">
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-700 pl-2">
              {item.children.map((child) => {
                if (child.ownerOnly && user?.role !== 'owner') return null
                const Icon = child.icon
                const isActive = pathname === child.href || pathname.startsWith(child.href + '/')
                if (!child.href) return null
                
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={cn(
                      'flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors',
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm">{child.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (!item.href) return null
    
    const Icon = item.icon
    const isActive = item.href === '/dashboard'
      ? pathname === item.href
      : (pathname === item.href || pathname.startsWith(item.href + '/'))
    
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors',
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
        )}
      >
        <Icon className="h-5 w-5" />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Backdrop for mobile - closes sidebar on tap */}
      {onMobileClose && (
        <div
          className="fixed inset-0 z-30 bg-black/50 transition-opacity duration-200 md:hidden"
          style={{
            opacity: isMobileOpen ? 1 : 0,
            pointerEvents: isMobileOpen ? 'auto' : 'none',
          }}
          onClick={handleBackdropClick}
          onKeyDown={(e) => e.key === 'Escape' && onMobileClose()}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'w-64 bg-gray-900 text-white h-screen flex flex-col overflow-hidden',
          'fixed left-0 top-0 z-40 transform transition-transform duration-200 ease-out md:relative md:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          /* When closed on mobile, don't capture clicks so hamburger button receives them */
          isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none md:pointer-events-auto'
        )}
        aria-label="Main navigation"
      >
      <div className="p-4 pb-4 flex-shrink-0 flex items-center justify-between gap-2">
        <div className="flex flex-col items-center justify-center flex-1 min-w-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 64 64"
            aria-hidden="true"
          >
            <text
              x="50%"
              y="50%"
              dominantBaseline="middle"
              textAnchor="middle"
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize="32"
              fontWeight="700"
              fill="#ffffff"
            >
              MAK
            </text>
          </svg>
        </div>
        {/* Close button - mobile only */}
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="md:hidden p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav
        className="flex-1 overflow-y-auto px-4 space-y-1"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) {
            onMobileClose?.()
          }
        }}
      >
        {visibleItems.map((item) => renderMenuItem(item))}
      </nav>
      <div className="p-4 pt-4 border-t border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Profile Button with Dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className={cn(
                'flex items-center justify-center w-full px-4 py-2 rounded-lg transition-colors',
                profileMenuOpen
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <User className="h-5 w-5" />
            </button>
            
            {/* Dropdown Menu */}
            {profileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setProfileMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-20 overflow-hidden">
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className={cn(
                      'flex items-center space-x-3 px-4 py-3 transition-colors',
                      pathname === '/dashboard/profile'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    )}
                  >
                    <User className="h-5 w-5" />
                    <span>{mounted ? t('profile.title') : 'Мій профіль'}</span>
                  </Link>
                  <div className="px-4 py-3 border-t border-gray-700">
                    <LanguageSwitcher />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Exit Button */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
      </aside>
    </>
  )
}

