'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Edit, Trash2, Archive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

interface AdminTask {
  id: string
  title: string
  type: string
  comment: string | null
  status: string
  created_at: string
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
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([])
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [finance, setFinance] = useState<FinanceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    type: 'admin',
    comment: '',
    status: 'active',
  })

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch active tasks
      const { data: tasksData } = await supabase
        .from('admin_tasks')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10)

      setTasks(tasksData || [])

      // Fetch absent students (3 consecutive absences)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      // Get all active students with enrolled classes
      let allActiveStudents: Array<{
        id: string
        student_first_name: string
        student_last_name: string
        parent_first_name: string
        parent_middle_name: string | null
        phone: string
        enrolled_class_ids: string[]
      }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name, parent_first_name, parent_middle_name, phone, enrolled_class_ids')
          .eq('status', 'active')
          .not('enrolled_class_ids', 'is', null)
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

      const { data: classesData } = await supabase
        .from('courses')
        .select('id, name')

      // Get all attendances in date range
      let allAttendances: Array<{ id: string; date: string; class_id: string }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('attendances')
          .select('id, date, class_id')
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
          .order('date', { ascending: false })
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

      const attendancesData = allAttendances

      const attendanceIds = attendancesData?.map(a => a.id) || []
      
      interface StudentPresence {
        student_id: string
        attendance_id: string
        status: string
      }
      
      let presencesData: StudentPresence[] = []
      if (attendanceIds.length > 0) {
        const { data } = await supabase
          .from('student_presences')
          .select('student_id, attendance_id, status')
          .in('attendance_id', attendanceIds)
        presencesData = (data || []) as StudentPresence[]
      }

      const absentStudentsList: AbsentStudent[] = []
      
      if (activeStudents && classesData && attendancesData && presencesData) {
        for (const student of activeStudents) {
          const enrolledClassIds = student.enrolled_class_ids || []
          if (enrolledClassIds.length === 0) continue

          // Get attendances for this student's enrolled classes, ordered by date DESC
          const studentAttendances = attendancesData
            .filter(a => enrolledClassIds.includes(a.class_id))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

          if (studentAttendances.length < 3) continue

          // Get presences for this student
          const studentPresences = presencesData.filter(p => p.student_id === student.id)

          // Check for 3 consecutive absences starting from the most recent attendance
          let consecutiveAbsences = 0
          let lastAbsentDate: string | null = null
          
          for (const attendance of studentAttendances) {
            const presence = studentPresences.find(p => p.attendance_id === attendance.id)
            
            // If no presence record OR status is 'absent', count as absent
            if (!presence || presence.status === 'absent') {
              consecutiveAbsences++
              if (consecutiveAbsences === 1) {
                lastAbsentDate = attendance.date
              }
              // If we found 3 consecutive absences, we're done
              if (consecutiveAbsences >= 3) {
                break
              }
            } else {
              // If we encounter a present or absent with valid reason, reset the counter
              // Only reset if we haven't found 3 consecutive yet
              if (consecutiveAbsences < 3) {
                consecutiveAbsences = 0
                lastAbsentDate = null
              }
            }
          }

          // If student has 3 or more consecutive absences
          if (consecutiveAbsences >= 3) {
            const enrolledClasses = enrolledClassIds
              .map((id: string) => classesData.find(c => c.id === id)?.name || id)
              .filter((name: string) => name !== undefined)

            absentStudentsList.push({
              student_id: student.id,
              student_name: `${student.student_first_name} ${student.student_last_name}`,
              parent_name: `${student.parent_first_name} ${student.parent_middle_name || ''}`.trim(),
              phone: student.phone || '',
              enrolled_classes: enrolledClasses,
              last_attendance_date: lastAbsentDate,
            })
          }
        }
      }

      setAbsentStudents(absentStudentsList)

      // Fetch birthdays (students this week, teachers next week)
      const today = new Date()
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)

      // Get all active students for birthdays
      let allStudentsData: Array<{
        id: string
        student_first_name: string
        student_last_name: string
        student_date_of_birth: string | null
      }> = []
      from = 0
      hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name, student_date_of_birth')
          .eq('status', 'active')
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allStudentsData = [...allStudentsData, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const studentsData = allStudentsData

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
            // Use THIS YEAR for the birthday, not next year
            const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
            // Next week range: 7-14 days from today
            const nextWeekStart = new Date(today)
            nextWeekStart.setDate(nextWeekStart.getDate() + 7)
            const nextWeekEnd = new Date(today)
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 14)
            
            // Check if birthday falls in next week (7-14 days from today)
            if (thisYear >= nextWeekStart && thisYear <= nextWeekEnd) {
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
        updated_at: string
        package_types: {
          amount: string | number
        } | null
      }
      if (paymentsData2) {
        (paymentsData2 as PaymentWithPackage[]).forEach((p) => {
          // Use updated_at date (when status was changed to 'paid') or fallback to created_at
          const paymentDate = new Date(p.updated_at || p.created_at)
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
  }, [supabase, t])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const handleEdit = (task: AdminTask) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      type: task.type,
      comment: task.comment || '',
      status: task.status,
    })
    setIsModalOpen(true)
  }

  const handleArchive = async (id: string) => {
    const comment = prompt(`${t('adminTasks.archive')} - ${t('adminTasks.comment')}:`)
    if (comment === null) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .update({
          status: 'archive',
          comment: comment,
        })
        .eq('id', id)
      if (error) throw error
      await fetchDashboardData()
    } catch (error) {
      console.error('Error archiving task:', error)
      alert(t('adminTasks.errorSaving'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchDashboardData()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert(t('common.errorDeleting'))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        comment: formData.comment || null,
      }

      if (editingTask) {
        const { error } = await supabase
          .from('admin_tasks')
          .update(submitData)
          .eq('id', editingTask.id)
        if (error) throw error
      }

      await fetchDashboardData()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving task:', error)
      alert(t('adminTasks.errorSaving'))
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'admin',
      comment: '',
      status: 'active',
    })
    setEditingTask(null)
  }

  // Column definitions for Absent Students table
  const absentStudentsColumns: ColumnDef<AbsentStudent>[] = useMemo(() => [
    {
      accessorKey: 'student_name',
      header: t('dashboard.student'),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.original.student_name}</div>
      ),
    },
    {
      accessorKey: 'parent_name',
      header: t('dashboard.parent'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.parent_name}</div>
      ),
    },
    {
      accessorKey: 'phone',
      header: t('dashboard.phone'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.phone}</div>
      ),
    },
    {
      accessorKey: 'enrolled_classes',
      header: t('dashboard.enrolledClasses'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.enrolled_classes.join(', ')}</div>
      ),
    },
    {
      accessorKey: 'last_attendance_date',
      header: t('dashboard.lastAttendance'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {row.original.last_attendance_date ? formatDate(row.original.last_attendance_date) : t('common.no')}
        </div>
      ),
    },
  ], [t])

  // Column definitions for Birthdays table
  const birthdaysColumns: ColumnDef<Birthday>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('dashboard.name'),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.original.name}</div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('dashboard.type'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.type === 'student' ? t('dashboard.student') : t('dashboard.teachers')}
        </div>
      ),
    },
    {
      accessorKey: 'birthday_date',
      header: t('dashboard.birthday'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {formatDate(row.original.birthday_date)}
        </div>
      ),
    },
  ], [t])

  // Column definitions for Admin Tasks table
  const tasksColumns: ColumnDef<AdminTask>[] = useMemo(() => [
    {
      accessorKey: 'title',
      header: t('adminTasks.titleLabel'),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.original.title}</div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('adminTasks.type'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 capitalize">{row.original.type}</div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('adminTasks.comment'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 max-w-xs truncate" title={row.original.comment || ''}>
          {row.original.comment || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
            status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}>
            {status === 'active' ? t('adminTasks.active') : t('adminTasks.archive')}
          </span>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: t('common.createdAt'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const task = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(task)}
              className="text-blue-600 hover:text-blue-900"
              title={t('common.edit')}
            >
              <Edit className="h-4 w-4" />
            </button>
            {task.status === 'active' && (
              <button
                onClick={() => handleArchive(task.id)}
                className="text-yellow-600 hover:text-yellow-900"
                title={t('adminTasks.archive')}
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => handleDelete(task.id)}
              className="text-red-600 hover:text-red-900"
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, handleEdit, handleArchive, handleDelete])

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-900" suppressHydrationWarning>{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.title')}</h1>

      {/* Area 2: Absent Students */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.absentStudents')}</h2>
        {absentStudents.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noAbsentStudents')}</p>
        ) : (
          <DataTable
            columns={absentStudentsColumns}
            data={absentStudents}
            initialPageSize={10}
            maxHeight="400px"
          />
        )}
      </div>

      {/* Area 3: Birthdays */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.birthdays')}</h2>
        {birthdays.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noBirthdays')}</p>
        ) : (
          <DataTable
            columns={birthdaysColumns}
            data={birthdays}
            initialPageSize={10}
            maxHeight="400px"
          />
        )}
      </div>

      {/* Area 4: Finance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.finance')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {finance.map((f) => (
            <div key={f.period} className="border-l-4 border-green-500 pl-4 py-2">
              <p className="font-semibold text-gray-900 mb-2">{f.period}</p>
              <div className="text-sm space-y-1 text-gray-700">
                <p>{t('dashboard.paymentsLabel')}: <span className="font-medium">{f.payments.toFixed(2)} грн</span></p>
                <p>{t('dashboard.expendituresLabel')}: <span className="font-medium">{f.expenditures.toFixed(2)} грн</span></p>
                <p>{t('dashboard.salaries')}: <span className="font-medium">{f.salaries.toFixed(2)} грн</span></p>
                <p className="font-semibold text-gray-900">{t('dashboard.inTill')}: {f.till.toFixed(2)} грн</p>
              </div>
            </div>
          ))}
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
            className="p-2 md:px-3 md:py-1.5"
            title={`${t('common.all')} ${t('adminTasks.title').toLowerCase()}`}
          >
            <span className="hidden md:inline">{t('common.all')} {t('adminTasks.title').toLowerCase()}</span>
          </Button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noTasks')}</p>
        ) : (
          <DataTable
            columns={tasksColumns}
            data={tasks}
            initialPageSize={10}
            maxHeight="400px"
          />
        )}
      </div>

      {/* Edit Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingTask ? t('adminTasks.editTask') : t('adminTasks.addTask')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('adminTasks.titleLabel')} *
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('adminTasks.type')} *
            </label>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="first lesson">{t('adminTasks.firstLesson')}</option>
              <option value="absent">{t('adminTasks.absent')}</option>
              <option value="admin">{t('adminTasks.admin')}</option>
              <option value="birthday">{t('adminTasks.birthday')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('adminTasks.comment')}
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:border-blue-500 focus:bg-white"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.status')} *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">{t('common.active')}</option>
              <option value="archive">{t('adminTasks.archive')}</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingTask ? "default" : "success"}>
              {editingTask ? t('common.saveChanges') : t('adminTasks.addTask')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

