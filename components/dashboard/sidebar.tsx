'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  Home,
  Users,
  UserCheck,
  CreditCard,
  ClipboardCheck,
  Calendar,
  GraduationCap,
  Clock,
  Building,
  DollarSign,
  CheckSquare,
  TrendingUp,
  Settings,
  LogOut,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface User {
  role: 'admin' | 'owner'
}

interface MenuItem {
  href?: string
  label: string
  icon: any
  ownerOnly?: boolean
  children?: MenuItem[]
}

const menuItems: MenuItem[] = [
  { href: '/dashboard', label: 'Головна', icon: Home },
  {
    label: 'Студенти',
    icon: Users,
    children: [
      { href: '/dashboard/students', label: 'Перелік студентів', icon: Users },
      { href: '/dashboard/student-absentees', label: 'Відсутні студенти', icon: UserCheck },
      { href: '/dashboard/student-payments', label: 'Платежі студентів', icon: CreditCard },
      { href: '/dashboard/attendances', label: 'Відвідуваність', icon: ClipboardCheck },
      { href: '/dashboard/class-attendances', label: 'Відвідуваність класів', icon: Calendar },
    ],
  },
  { href: '/dashboard/teachers', label: 'Вчителі', icon: GraduationCap },
  { href: '/dashboard/classes', label: 'Класи', icon: Users },
  { href: '/dashboard/schedules', label: 'Розклад', icon: Clock },
  { href: '/dashboard/rooms', label: 'Кімнати', icon: Building },
  { href: '/dashboard/payments', label: 'Платежі', icon: DollarSign },
  { href: '/dashboard/admin-tasks', label: 'Завдання', icon: CheckSquare },
  { href: '/dashboard/expenditures', label: 'Витрати', icon: FileText },
  { href: '/dashboard/teacher-salaries', label: 'Зарплати вчителів', icon: TrendingUp },
  { href: '/dashboard/users', label: 'Користувачі', icon: Users, ownerOnly: true },
  { href: '/dashboard/analytics', label: 'Аналітика', icon: TrendingUp, ownerOnly: true },
]

const getGroupKey = (label: string) => {
  return label.toLowerCase().replace(/\s+/g, '-')
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([getGroupKey('Студенти')]))

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
  }, [pathname])

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

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
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
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    
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
    <div className="w-64 bg-gray-900 text-white h-screen flex flex-col overflow-hidden">
      <div className="p-4 pb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">MAK CRM</h1>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 space-y-1">
        {visibleItems.map((item) => renderMenuItem(item))}
      </nav>
      <div className="p-4 pt-4 border-t border-gray-700 flex-shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-3 px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white w-full"
        >
          <LogOut className="h-5 w-5" />
          <span>Вихід</span>
        </button>
      </div>
    </div>
  )
}

