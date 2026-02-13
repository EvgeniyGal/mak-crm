'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface KPIData {
  totalActiveStudents: number
  newStudentsWeek: number
  newStudentsMonth: number
  overallAttendanceRate: number
  paymentCompletionRate: number
  totalPayments: number
  totalExpenditures: number
  totalSalaries: number
}

interface EnrollmentTrend {
  date: string
  count: number
}

interface AttendanceByClass {
  name: string
  rate: number
}

interface PaymentTypes {
  name: string
  value: number
}

interface User {
  id: string
  role: string
  [key: string]: unknown
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [kpiData, setKpiData] = useState<KPIData | null>(null)
  const [enrollmentTrends, setEnrollmentTrends] = useState<EnrollmentTrend[]>([])
  const [attendanceByClass, setAttendanceByClass] = useState<AttendanceByClass[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentTypes[]>([])
  const [dateRange, setDateRange] = useState('month')

  const checkAccess = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data && data.role === 'owner') {
        setCurrentUser(data)
      } else {
        router.push('/dashboard')
      }
    } else {
      router.push('/auth/login')
    }
  }, [supabase, router])

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const startDate = new Date()
      
      if (dateRange === 'week') {
        startDate.setDate(now.getDate() - 7)
      } else if (dateRange === 'month') {
        startDate.setMonth(now.getMonth() - 1)
      } else {
        startDate.setMonth(now.getMonth() - 6)
      }

      // Get active students
      let allActiveStudents: Array<{ id: string; created_at: string }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, created_at')
          .eq('status', 'active')
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allActiveStudents = [...allActiveStudents, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const activeStudents = allActiveStudents

      // Get new students
      const newStudentsWeek = activeStudents?.filter(s => {
        const created = new Date(s.created_at)
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return created >= weekAgo
      }).length || 0

      const newStudentsMonth = activeStudents?.filter(s => {
        const created = new Date(s.created_at)
        const monthAgo = new Date(now)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return created >= monthAgo
      }).length || 0

      // Get attendance data
      let allAttendances: Array<{ id: string; class_id: string }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('attendances')
          .select('id, class_id')
          .gte('date', startDate.toISOString().split('T')[0])
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allAttendances = [...allAttendances, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const attendances = allAttendances
      const attendanceIds = attendances?.map(a => a.id) || []

      // Fetch presences in batches if needed (for large arrays, we might need to batch the .in() query)
      let allPresences: Array<{ status: string; attendance_id: string }> = []
      if (attendanceIds.length > 0) {
        // Supabase .in() can handle arrays, but if it's very large we might need batching
        // For now, fetch all at once since .in() should handle reasonable sizes
        const { data: presences, error } = await supabase
          .from('student_presences')
          .select('status, attendance_id')
          .in('attendance_id', attendanceIds)

        if (error) throw error
        allPresences = presences || []
      }

      const totalPresences = allPresences?.length || 0
      const presentCount = allPresences?.filter(p => p.status === 'present').length || 0
      const overallAttendanceRate = totalPresences > 0 ? (presentCount / totalPresences) * 100 : 0

      // Get payment data
      let allPayments: Array<{ status: string; type: string }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('payments')
          .select('status, type')
          .gte('created_at', startDate.toISOString())
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allPayments = [...allPayments, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const payments = allPayments

      const totalPayments = payments?.length || 0
      const paidPayments = payments?.filter(p => p.status === 'paid').length || 0
      const paymentCompletionRate = totalPayments > 0 ? (paidPayments / totalPayments) * 100 : 0

      // Payment types
      const paymentTypesData = [
        { name: 'Готівка', value: payments?.filter(p => p.type === 'cash').length || 0 },
        { name: 'Картка', value: payments?.filter(p => p.type === 'card').length || 0 },
        { name: 'Безплатне', value: payments?.filter(p => p.type === 'free').length || 0 },
      ]

      // Get expenditures and salaries
      let allExpenditures: Array<{ amount: number }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('expenditures')
          .select('amount')
          .gte('created_at', startDate.toISOString())
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allExpenditures = [...allExpenditures, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const expenditures = allExpenditures

      let allSalaries: Array<{ amount: number }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('teacher_salaries')
          .select('amount')
          .gte('created_at', startDate.toISOString())
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allSalaries = [...allSalaries, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const salaries = allSalaries

      const totalExpenditures = expenditures?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
      const totalSalaries = salaries?.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0) || 0
      // Note: totalPaymentsAmount calculation would need to join with package_types for actual amount

      // Enrollment trends
      const enrollmentTrendsData: EnrollmentTrend[] = []
      const days = dateRange === 'week' ? 7 : dateRange === 'month' ? 30 : 180
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        
        const count = activeStudents?.filter(s => {
          const created = new Date(s.created_at)
          return created.toISOString().split('T')[0] <= dateStr
        }).length || 0

        enrollmentTrendsData.push({
          date: dateStr,
          count,
        })
      }

      // Attendance by class
      const { data: classes } = await supabase
        .from('courses')
        .select('id, name')
        .eq('status', 'active')

      const attendanceByClassData: AttendanceByClass[] = []
      
      if (classes && attendances) {
        for (const cls of classes) {
          const classAttendances = attendances.filter(a => a.class_id === cls.id)
          const classAttendanceIds = classAttendances.map(a => a.id)
          
          const classPresences = allPresences?.filter(p => classAttendanceIds.includes(p.attendance_id)) || []
          const classPresentCount = classPresences.filter(p => p.status === 'present').length
          const rate = classPresences.length > 0 ? (classPresentCount / classPresences.length) * 100 : 0

          attendanceByClassData.push({
            name: cls.name,
            rate: Math.round(rate),
          })
        }
      }

      setKpiData({
        totalActiveStudents: activeStudents?.length || 0,
        newStudentsWeek,
        newStudentsMonth,
        overallAttendanceRate: Math.round(overallAttendanceRate),
        paymentCompletionRate: Math.round(paymentCompletionRate),
        totalPayments: totalPayments,
        totalExpenditures: Math.round(totalExpenditures),
        totalSalaries: Math.round(totalSalaries),
      })

      setEnrollmentTrends(enrollmentTrendsData)
      setAttendanceByClass(attendanceByClassData.slice(0, 10)) // Top 10
      setPaymentTypes(paymentTypesData)

    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, dateRange])

  useEffect(() => {
    checkAccess()
  }, [checkAccess])

  useEffect(() => {
    if (currentUser) {
      fetchAnalytics()
    }
  }, [currentUser, fetchAnalytics])

  if (!currentUser || currentUser.role !== 'owner') {
    return <div className="p-8">Завантаження...</div>
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-xl md:text-3xl font-bold">Аналітика</h1>
        <Select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="w-full md:w-48"
        >
          <option value="week">Останній тиждень</option>
          <option value="month">Останній місяць</option>
          <option value="sixmonths">Останні 6 місяців</option>
        </Select>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-medium text-gray-500">Активні студенти</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">{kpiData?.totalActiveStudents || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-medium text-gray-500">Нові студенти (тиждень)</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">{kpiData?.newStudentsWeek || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-medium text-gray-500">Відвідуваність</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">{kpiData?.overallAttendanceRate || 0}%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-medium text-gray-500">Оплата</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">{kpiData?.paymentCompletionRate || 0}%</p>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4">Фінансовий звіт</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs md:text-sm text-gray-500">Платежі</p>
            <p className="text-xl md:text-2xl font-bold text-green-600">{kpiData?.totalPayments || 0}</p>
          </div>
          <div>
            <p className="text-xs md:text-sm text-gray-500">Витрати</p>
            <p className="text-xl md:text-2xl font-bold text-red-600">{kpiData?.totalExpenditures || 0} грн</p>
          </div>
          <div>
            <p className="text-xs md:text-sm text-gray-500">Зарплати</p>
            <p className="text-xl md:text-2xl font-bold text-blue-600">{kpiData?.totalSalaries || 0} грн</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Enrollment Trends */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Динаміка набору студентів</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={enrollmentTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" name="Кількість студентів" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attendance by Class */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Відвідуваність по класах</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceByClass}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="rate" fill="#10b981" name="Відвідуваність (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Types */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Типи платежів</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentTypes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentTypes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
