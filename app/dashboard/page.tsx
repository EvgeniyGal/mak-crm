'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Edit, Trash2, Archive } from 'lucide-react'
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

      {/* Area 1: First Lesson */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.firstLesson')}</h2>
        {firstLessons.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noFirstLessons')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.student')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.parent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.phone')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.class')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.date')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {firstLessons.map((lesson) => (
                  <tr key={lesson.student_id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {lesson.student_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lesson.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lesson.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lesson.class_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(lesson.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Area 2: Absent Students */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.absentStudents')}</h2>
        {absentStudents.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noAbsentStudents')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.student')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.parent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.phone')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.enrolledClasses')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.lastAttendance')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {absentStudents.map((student) => (
                  <tr key={student.student_id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {student.student_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.phone}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {student.enrolled_classes.join(', ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.last_attendance_date ? formatDate(student.last_attendance_date) : t('common.no')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Area 3: Birthdays */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.birthdays')}</h2>
        {birthdays.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noBirthdays')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.type')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.birthday')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {birthdays.map((b) => (
                  <tr key={b.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {b.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {b.type === 'student' ? t('dashboard.student') : t('dashboard.teachers')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(b.birthday_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          >
            {t('common.all')} {t('adminTasks.title').toLowerCase()}
          </Button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noTasks')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminTasks.titleLabel')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminTasks.type')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('adminTasks.comment')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.createdAt')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {task.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {task.type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {task.comment || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        task.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(task.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(task)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                        title={t('common.edit')}
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {task.status === 'active' && (
                        <button
                          onClick={() => handleArchive(task.id)}
                          className="text-yellow-600 hover:text-yellow-900 mr-3"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500"
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
            <Button type="submit">
              {editingTask ? t('common.saveChanges') : t('adminTasks.addTask')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

