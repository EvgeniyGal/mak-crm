'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

interface AdminTask {
  id: string
  title: string
  type: string
  comment: string | null
  status: string
  created_at: string
}

interface FirstLesson {
  student_id: string
  student_name: string
  parent_name: string
  phone: string
  class_name: string
  date: string
}

interface AbsentStudent {
  student_id: string
  student_name: string
  parent_name: string
  phone: string
  enrolled_classes: string[]
  last_attendance_date: string | null
}

interface Birthday {
  id: string
  name: string
  type: 'student' | 'teacher'
  birthday_date: string
}

interface FinanceSummary {
  period: string
  payments: number
  expenditures: number
  salaries: number
  till: number
}

export default function DashboardPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [firstLessons, setFirstLessons] = useState<FirstLesson[]>([])
  const [absentStudents] = useState<AbsentStudent[]>([])
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [finance, setFinance] = useState<FinanceSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Fetch active tasks
      const { data: tasksData } = await supabase
        .from('admin_tasks')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10)

      setTasks(tasksData || [])

      // Fetch first lessons (payments with type 'test' from current week)
      const startOfWeek = new Date()
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(endOfWeek.getDate() + 6)

      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          *,
          students!inner(student_first_name, student_last_name, parent_first_name, parent_middle_name, phone),
          classes!inner(name)
        `)
        .eq('type', 'test')
        .gte('created_at', startOfWeek.toISOString())
        .lte('created_at', endOfWeek.toISOString())

      interface PaymentWithRelations {
        student_id: string
        created_at: string
        students: {
          student_first_name: string
          student_last_name: string
          parent_first_name: string
          parent_middle_name: string | null
          phone: string
        }
        classes: {
          name: string
        }
      }
      if (paymentsData) {
        setFirstLessons(
          (paymentsData as PaymentWithRelations[]).map((p) => ({
            student_id: p.student_id,
            student_name: `${p.students.student_first_name} ${p.students.student_last_name}`,
            parent_name: `${p.students.parent_first_name} ${p.students.parent_middle_name || ''}`,
            phone: p.students.phone,
            class_name: p.classes.name,
            date: p.created_at,
          }))
        )
      }

      // Fetch absent students (3 consecutive absences) - simplified for now
      // This would need more complex logic with server-side calculations

      // Fetch birthdays (students this week, teachers next week)
      const today = new Date()
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)

      const { data: studentsData } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name, student_date_of_birth')
        .eq('status', 'active')

      const { data: teachersData } = await supabase
        .from('teachers')
        .select('id, first_name, last_name, date_of_birth')
        .eq('status', 'active')

      const birthdayList: Birthday[] = []
      if (studentsData) {
        studentsData.forEach((s) => {
          if (s.student_date_of_birth) {
            const dob = new Date(s.student_date_of_birth)
            const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
            if (thisYear >= today && thisYear <= nextWeek) {
              birthdayList.push({
                id: s.id,
                name: `${s.student_first_name} ${s.student_last_name}`,
                type: 'student',
                birthday_date: s.student_date_of_birth,
              })
            }
          }
        })
      }
      if (teachersData) {
        teachersData.forEach((t) => {
          if (t.date_of_birth) {
            const dob = new Date(t.date_of_birth)
            const nextYear = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate())
            const nextWeekEnd = new Date(today)
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 14)
            if (nextYear >= today && nextYear <= nextWeekEnd) {
              birthdayList.push({
                id: t.id,
                name: `${t.first_name} ${t.last_name}`,
                type: 'teacher',
                birthday_date: t.date_of_birth,
              })
            }
          }
        })
      }
      setBirthdays(birthdayList)

      // Fetch finance summaries
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const weekStart = new Date(todayStart)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)

      const { data: paymentsData2 } = await supabase
        .from('payments')
        .select('*, package_types!inner(amount)')
        .eq('status', 'paid')

      const { data: expendituresData } = await supabase
        .from('expenditures')
        .select('amount, created_at')

      const { data: salariesData } = await supabase
        .from('teacher_salaries')
        .select('amount, created_at')

      // Calculate finance summaries
      const financeList: FinanceSummary[] = [
        {
          period: t('dashboard.today'),
          payments: 0,
          expenditures: 0,
          salaries: 0,
          till: 0,
        },
        {
          period: t('dashboard.thisWeek'),
          payments: 0,
          expenditures: 0,
          salaries: 0,
          till: 0,
        },
        {
          period: t('dashboard.thisMonth'),
          payments: 0,
          expenditures: 0,
          salaries: 0,
          till: 0,
        },
      ]

      interface PaymentWithPackage {
        created_at: string
        package_types: {
          amount: string | number
        } | null
      }
      if (paymentsData2) {
        (paymentsData2 as PaymentWithPackage[]).forEach((p) => {
          const paymentDate = new Date(p.created_at)
          const amount = typeof p.package_types?.amount === 'number' 
            ? p.package_types.amount 
            : parseFloat(String(p.package_types?.amount || 0))
          
          if (paymentDate >= todayStart) {
            financeList[0].payments += amount
            financeList[1].payments += amount
            financeList[2].payments += amount
          } else if (paymentDate >= weekStart) {
            financeList[1].payments += amount
            financeList[2].payments += amount
          } else if (paymentDate >= monthStart) {
            financeList[2].payments += amount
          }
        })
      }

      if (expendituresData) {
        expendituresData.forEach((e) => {
          const expDate = new Date(e.created_at)
          const amount = parseFloat(e.amount.toString())
          
          if (expDate >= todayStart) {
            financeList[0].expenditures += amount
            financeList[1].expenditures += amount
            financeList[2].expenditures += amount
          } else if (expDate >= weekStart) {
            financeList[1].expenditures += amount
            financeList[2].expenditures += amount
          } else if (expDate >= monthStart) {
            financeList[2].expenditures += amount
          }
        })
      }

      if (salariesData) {
        salariesData.forEach((s) => {
          const salDate = new Date(s.created_at)
          const amount = parseFloat(s.amount.toString())
          
          if (salDate >= todayStart) {
            financeList[0].salaries += amount
            financeList[1].salaries += amount
            financeList[2].salaries += amount
          } else if (salDate >= weekStart) {
            financeList[1].salaries += amount
            financeList[2].salaries += amount
          } else if (salDate >= monthStart) {
            financeList[2].salaries += amount
          }
        })
      }

      financeList.forEach((f) => {
        f.till = f.payments - f.expenditures - f.salaries
      })

      setFinance(financeList)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-900">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Area 1: First Lesson */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.firstLesson')}</h2>
          <div className="space-y-2">
            {firstLessons.length === 0 ? (
              <p className="text-gray-500">{t('dashboard.noFirstLessons')}</p>
            ) : (
              firstLessons.map((lesson) => (
                <div key={lesson.student_id} className="border-b pb-2">
                  <p className="font-medium text-gray-900">{lesson.student_name}</p>
                  <p className="text-sm text-gray-600">{lesson.parent_name} - {lesson.phone}</p>
                  <p className="text-sm text-gray-500">{lesson.class_name} - {formatDate(lesson.date)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Area 2: Absent Students */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.absentStudents')}</h2>
          <div className="space-y-2">
            {absentStudents.length === 0 ? (
              <p className="text-gray-500">{t('dashboard.noAbsentStudents')}</p>
            ) : (
              absentStudents.map((student) => (
                <div key={student.student_id} className="border-b pb-2">
                  <p className="font-medium text-gray-900">{student.student_name}</p>
                  <p className="text-sm text-gray-600">{student.parent_name} - {student.phone}</p>
                  <p className="text-sm text-gray-500">
                    {t('dashboard.lastAttendance')}: {student.last_attendance_date ? formatDate(student.last_attendance_date) : t('common.no')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Area 3: Birthdays */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.birthdays')}</h2>
          <div className="space-y-2">
            {birthdays.length === 0 ? (
              <p className="text-gray-500">{t('dashboard.noBirthdays')}</p>
            ) : (
              birthdays.map((b) => (
                <div key={b.id} className="border-b pb-2">
                  <p className="font-medium text-gray-900">{b.name}</p>
                  <p className="text-sm text-gray-600">{b.type === 'student' ? t('dashboard.student') : t('dashboard.teachers')}</p>
                  <p className="text-sm text-gray-500">{formatDate(b.birthday_date)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Area 4: Finance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.finance')}</h2>
          <div className="space-y-4">
            {finance.map((f) => (
              <div key={f.period} className="border-b pb-2">
                <p className="font-medium text-gray-900">{f.period}</p>
                <div className="text-sm space-y-1 text-gray-900">
                  <p>{t('dashboard.paymentsLabel')}: {f.payments.toFixed(2)} грн</p>
                  <p>{t('dashboard.expendituresLabel')}: {f.expenditures.toFixed(2)} грн</p>
                  <p>{t('dashboard.salaries')}: {f.salaries.toFixed(2)} грн</p>
                  <p className="font-semibold">{t('dashboard.inTill')}: {f.till.toFixed(2)} грн</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Area 5: Admin Tasks */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">{t('adminTasks.title')}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/dashboard/admin-tasks'}
          >
            {t('common.all')} {t('adminTasks.title').toLowerCase()}
          </Button>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-gray-500">{t('dashboard.noTasks')}</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="border-b pb-3 last:border-b-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{task.title}</p>
                    <p className="text-sm text-gray-600 capitalize">{t('dashboard.type')}: {task.type}</p>
                    {task.comment && <p className="text-sm text-gray-500 mt-1">{task.comment}</p>}
                    <p className="text-xs text-gray-400 mt-1">{formatDate(task.created_at)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

