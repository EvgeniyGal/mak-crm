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

type PaymentPackageRow = { amount: number }

type PaymentRow = {
  status: string
  type: string
  class_id: string
  // Supabase join can return a single object or an array depending on relation config
  package_types?: PaymentPackageRow | PaymentPackageRow[]
}

interface EnrollmentTrend {
  date: string
  count: number
}

interface AttendanceByClass {
  name: string
  rate: number
}

interface SalaryByTeacher {
  name: string
  amount: number
}

interface IncomeByClass {
  name: string
  amount: number
}
interface PaymentTypesCount {
  name: string
  value: number
}

interface PaymentTypesAmount {
  name: string
  value: number
}

interface ExpendituresByDay {
  date: string
  regular: number
  staff: number
  till: number
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
  const [paymentTypesCount, setPaymentTypesCount] = useState<PaymentTypesCount[]>([])
  const [paymentTypesAmount, setPaymentTypesAmount] = useState<PaymentTypesAmount[]>([])
  const [dateRange, setDateRange] = useState('month')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [salaryByTeacher, setSalaryByTeacher] = useState<SalaryByTeacher[]>([])
  const [incomeByClass, setIncomeByClass] = useState<IncomeByClass[]>([])
  const [expendituresByDay, setExpendituresByDay] = useState<ExpendituresByDay[]>([])

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
      const endDate = new Date()
      
      if (dateRange === 'custom' && customStartDate) {
        startDate.setTime(new Date(customStartDate).getTime())
      } else if (dateRange === 'week') {
        startDate.setDate(now.getDate() - 7)
      } else if (dateRange === 'month') {
        startDate.setMonth(now.getMonth() - 1)
      } else if (dateRange === 'sixmonths') {
        startDate.setMonth(now.getMonth() - 6)
      }

      if (dateRange === 'custom' && customEndDate) {
        endDate.setTime(new Date(customEndDate).getTime())
      } else {
        endDate.setTime(now.getTime())
      }

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      // Get active students
      let allActiveStudents: Array<{ id: string; created_at: string; enrolled_class_ids: string[] }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, created_at, enrolled_class_ids')
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
      const enrolledStudents = activeStudents.filter(
        (s) => Array.isArray(s.enrolled_class_ids) && s.enrolled_class_ids.length > 0
      )

      // Get new students
      const newStudentsWeek = enrolledStudents?.filter(s => {
        const created = new Date(s.created_at)
        const weekAgo = new Date(now)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return created >= weekAgo
      }).length || 0

      const newStudentsMonth = enrolledStudents?.filter(s => {
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
          .gte('date', startDateStr)
          .lte('date', endDateStr)
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
      let allPayments: PaymentRow[] = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('payments')
          .select('status, type, class_id, package_types(amount)')
          .gte('created_at', `${startDateStr}T00:00:00.000Z`)
          .lte('created_at', `${endDateStr}T23:59:59.999Z`)
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allPayments = [...allPayments, ...(data as PaymentRow[])]
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

      // Payment types by count
      const paymentTypesCountData: PaymentTypesCount[] = [
        { name: 'Готівка', value: payments?.filter(p => p.type === 'cash').length || 0 },
        { name: 'Картка', value: payments?.filter(p => p.type === 'card').length || 0 },
      ]

      // Payment types by amount
      const getPackageAmount = (pkg?: PaymentPackageRow | PaymentPackageRow[]) => {
        if (!pkg) return 0
        if (Array.isArray(pkg)) {
          return pkg.reduce((sum, p) => sum + Number(p.amount), 0)
        }
        return Number(pkg.amount)
      }

      const sumAmountByType = (type: string) =>
        payments
          ?.filter(p => p.type === type)
          .reduce((sum, p) => sum + getPackageAmount(p.package_types), 0) || 0

      const paymentTypesAmountData: PaymentTypesAmount[] = [
        { name: 'Готівка', value: sumAmountByType('cash') },
        { name: 'Картка', value: sumAmountByType('card') },
      ]

      // Get expenditures and salaries
      let allExpenditures: Array<{ amount: number; type: string; created_at: string }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('expenditures')
          .select('amount, type, created_at')
          .gte('created_at', `${startDateStr}T00:00:00.000Z`)
          .lte('created_at', `${endDateStr}T23:59:59.999Z`)
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

      let allSalaries: Array<{ amount: number; teacher: string }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('teacher_salaries')
          .select('amount, teacher')
          .gte('created_at', `${startDateStr}T00:00:00.000Z`)
          .lte('created_at', `${endDateStr}T23:59:59.999Z`)
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

      const totalExpenditures =
        expenditures?.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
      const totalSalaries =
        salaries?.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0) || 0

      const uniqueTeacherIds = new Set<string>(
        salaries.map((s) => (s.teacher ? String(s.teacher) : '')).filter(Boolean)
      )

      // Salary by teacher (for chart)
      let salaryByTeacherData: SalaryByTeacher[] = []
      if (uniqueTeacherIds.size > 0) {
        const teacherTotals = Array.from(uniqueTeacherIds).reduce<Record<string, number>>(
          (acc, id) => {
            const totalForTeacher =
              salaries
                .filter((s) => String(s.teacher) === id)
                .reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0) || 0
            acc[id] = totalForTeacher
            return acc
          },
          {}
        )

        const { data: teachersData } = await supabase
          .from('teachers')
          .select('id, first_name, last_name')
          .in('id', Array.from(uniqueTeacherIds))

        if (teachersData) {
          salaryByTeacherData = teachersData
            .map((t) => ({
              name: `${t.first_name} ${t.last_name}`,
              amount: Math.round(teacherTotals[t.id] || 0),
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10)
        }
      }
      // Note: totalPaymentsAmount calculation would need to join with package_types for actual amount

      // Enrollment trends
      const enrollmentTrendsData: EnrollmentTrend[] = []
      const days =
        dateRange === 'week'
          ? 7
          : dateRange === 'month'
          ? 30
          : dateRange === 'sixmonths'
          ? 180
          : Math.max(
              1,
              Math.ceil(
                (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
              )
            )
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        
        const count = enrolledStudents?.filter(s => {
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

      // Income by class (only paid payments within range)
      let incomeByClassData: IncomeByClass[] = []

      if (classes && payments) {
        const incomeByClassTotals: Record<string, number> = {}

        payments
          .filter((p) => p.status === 'paid')
          .forEach((p) => {
            const amount = getPackageAmount(p.package_types)
            if (!incomeByClassTotals[p.class_id]) {
              incomeByClassTotals[p.class_id] = 0
            }
            incomeByClassTotals[p.class_id] += amount
          })

        const classesById = Object.fromEntries(classes.map((c) => [c.id, c]))

        incomeByClassData = Object.entries(incomeByClassTotals)
          .map(([classId, amount]) => ({
            name: classesById[classId]?.name || 'Невідомий курс',
            amount: Math.round(amount),
          }))
          .sort((a, b) => b.amount - a.amount)
      }

      // Expenditures by type (within range)
      // Expenditures by day within range
      const expendituresByDayData: ExpendituresByDay[] = []
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(endDate)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]

        const dayItems = expenditures.filter(
          (e) => e.created_at.split('T')[0] === dateStr
        )

        const regular =
          dayItems
            ?.filter((e) => e.type === 'regular')
            .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
        const staff =
          dayItems
            ?.filter((e) => e.type === 'staff')
            .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0
        const till =
          dayItems
            ?.filter((e) => e.type === 'till')
            .reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0) || 0

        expendituresByDayData.push({
          date: dateStr,
          regular,
          staff,
          till,
        })
      }

      setKpiData({
        totalActiveStudents: enrolledStudents?.length || 0,
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
      setPaymentTypesCount(paymentTypesCountData)
      setPaymentTypesAmount(paymentTypesAmountData)
      setSalaryByTeacher(salaryByTeacherData)
      setIncomeByClass(incomeByClassData)
      setExpendituresByDay(expendituresByDayData)

    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, dateRange, customStartDate, customEndDate])

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
          onChange={(e) => {
            const value = e.target.value
            setDateRange(value)
          }}
          className="w-full md:w-48"
        >
          <option value="week">Останній тиждень</option>
          <option value="month">Останній місяць</option>
          <option value="sixmonths">Останні 6 місяців</option>
          <option value="custom">Власний період</option>
        </Select>
      </div>

      {dateRange === 'custom' && (
        <div className="flex flex-col md:flex-row gap-4 md:items-center">
          <div className="flex flex-col">
            <label className="text-xs md:text-sm text-gray-500 mb-1">Початкова дата</label>
            <input
              type="date"
              className="flex h-10 rounded-md border-2 border-gray-400 bg-gray-50 px-3 py-2 text-sm text-gray-900 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 focus-visible:ring-offset-2 focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50 w-full md:w-48"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs md:text-sm text-gray-500 mb-1">Кінцева дата</label>
            <input
              type="date"
              className="flex h-10 rounded-md border-2 border-gray-400 bg-gray-50 px-3 py-2 text-sm text-gray-900 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 focus-visible:ring-offset-2 focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50 w-full md:w-48"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h3 className="text-xs md:text-sm font-medium text-gray-500">
            Студенти, записані на заняття
          </h3>
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
          <h2 className="text-lg md:text-xl font-semibold mb-4">
            Кількість активних студентів у базі
          </h2>
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
          <div className="flex flex-col gap-6 w-full">
            <div className="w-full h-[220px] md:h-[260px]">
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">
                За кількістю платежів
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentTypesCount}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentTypesCount.map((entry, index) => (
                      <Cell key={`count-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full h-[220px] md:h-[260px]">
              <h3 className="text-xs md:text-sm font-medium text-gray-500 mb-2">
                За сумою платежів
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentTypesAmount}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) =>
                      `${name} ${Number(value || 0).toLocaleString('uk-UA')} грн`
                    }
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentTypesAmount.map((entry, index) => (
                      <Cell key={`amount-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Expenditures by Day */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Витрати за днями</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expendituresByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('uk-UA', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) =>
                    `${Number(value || 0).toLocaleString('uk-UA')} грн`
                  }
                />
                <Bar dataKey="regular" stackId="a" fill="#f97316" name="Регулярні" />
                <Bar dataKey="staff" stackId="a" fill="#0ea5e9" name="Персонал" />
                <Bar dataKey="till" stackId="a" fill="#22c55e" name="Каса" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Salary by Teacher */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Зарплата по вчителям</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salaryByTeacher}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) =>
                    `${Number(value || 0).toLocaleString('uk-UA')} грн`
                  }
                />
                <Bar dataKey="amount" fill="#6366f1" name="Зарплата (грн)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income by Class */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold mb-4">Дохід по класах</h2>
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeByClass}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) =>
                    `${Number(value || 0).toLocaleString('uk-UA')} грн`
                  }
                />
                <Bar dataKey="amount" fill="#22c55e" name="Дохід (грн)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
