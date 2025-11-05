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
      const { data: activeStudents } = await supabase
        .from('students')
        .select('id, created_at')
        .eq('status', 'active')

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
      const { data: attendances } = await supabase
        .from('attendances')
        .select('id, class_id')
        .gte('date', startDate.toISOString().split('T')[0])

      const attendanceIds = attendances?.map(a => a.id) || []

      const { data: presences } = await supabase
        .from('student_presences')
        .select('status, attendance_id')
        .in('attendance_id', attendanceIds.length > 0 ? attendanceIds : [''])

      const totalPresences = presences?.length || 0
      const presentCount = presences?.filter(p => p.status === 'present').length || 0
      const overallAttendanceRate = totalPresences > 0 ? (presentCount / totalPresences) * 100 : 0

      // Get payment data
      const { data: payments } = await supabase
        .from('payments')
        .select('status, type')
        .gte('created_at', startDate.toISOString())

      const totalPayments = payments?.length || 0
      const paidPayments = payments?.filter(p => p.status === 'paid').length || 0
      const paymentCompletionRate = totalPayments > 0 ? (paidPayments / totalPayments) * 100 : 0

      // Payment types
      const paymentTypesData = [
        { name: 'Готівка', value: payments?.filter(p => p.type === 'cash').length || 0 },
        { name: 'Картка', value: payments?.filter(p => p.type === 'card').length || 0 },
        { name: 'Тест', value: payments?.filter(p => p.type === 'test').length || 0 },
      ]

      // Get expenditures and salaries
      const { data: expenditures } = await supabase
        .from('expenditures')
        .select('amount')
        .gte('created_at', startDate.toISOString())

      const { data: salaries } = await supabase
        .from('teacher_salaries')
        .select('amount')
        .gte('created_at', startDate.toISOString())

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
        .from('classes')
        .select('id, name')
        .eq('status', 'active')

      const attendanceByClassData: AttendanceByClass[] = []
      
      if (classes && attendances) {
        for (const cls of classes) {
          const classAttendances = attendances.filter(a => a.class_id === cls.id)
          const classAttendanceIds = classAttendances.map(a => a.id)
          
          const classPresences = presences?.filter(p => classAttendanceIds.includes(p.attendance_id)) || []
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
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Аналітика</h1>
        <Select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="w-48"
        >
          <option value="week">Останній тиждень</option>
          <option value="month">Останній місяць</option>
          <option value="sixmonths">Останні 6 місяців</option>
        </Select>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Активні студенти</h3>
          <p className="text-3xl font-bold mt-2">{kpiData?.totalActiveStudents || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Нові студенти (тиждень)</h3>
          <p className="text-3xl font-bold mt-2">{kpiData?.newStudentsWeek || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Відвідуваність</h3>
          <p className="text-3xl font-bold mt-2">{kpiData?.overallAttendanceRate || 0}%</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Оплата</h3>
          <p className="text-3xl font-bold mt-2">{kpiData?.paymentCompletionRate || 0}%</p>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Фінансовий звіт</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Платежі</p>
            <p className="text-2xl font-bold text-green-600">{kpiData?.totalPayments || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Витрати</p>
            <p className="text-2xl font-bold text-red-600">{kpiData?.totalExpenditures || 0} грн</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Зарплати</p>
            <p className="text-2xl font-bold text-blue-600">{kpiData?.totalSalaries || 0} грн</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrollment Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Динаміка набору студентів</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={enrollmentTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('uk-UA', { month: 'short', day: 'numeric' })} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" name="Кількість студентів" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Attendance by Class */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Відвідуваність по класах</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendanceByClass}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="rate" fill="#10b981" name="Відвідуваність (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Types */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Типи платежів</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentTypes}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
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
  )
}
