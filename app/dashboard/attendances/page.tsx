'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'

interface Attendance {
  id: string
  date: string
  class_id: string
  created_at: string
}

interface StudentPresence {
  id: string
  student_id: string
  attendance_id: string
  status: string
  comment: string | null
}

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
}

interface Class {
  id: string
  name: string
  student_ids: string[]
}

interface AttendanceStats {
  [attendanceId: string]: {
    present: number
    absent: number
    validReason: number
  }
}

export default function AttendancesPage() {
  const supabase = createClient()
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [stats, setStats] = useState<AttendanceStats>({})
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null)
  const [selectedClassStudents, setSelectedClassStudents] = useState<Student[]>([])
  const [studentPresences, setStudentPresences] = useState<Record<string, { status: string; comment: string }>>({})
  const [studentNeedingPayment, setStudentNeedingPayment] = useState<Student | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    date: '',
    class_id: '',
  })

  useEffect(() => {
    fetchAttendances()
    fetchClasses()
    fetchStudents()
  }, [])

  useEffect(() => {
    if (attendances.length > 0) {
      fetchAllStats()
    }
  }, [attendances])

  const fetchAttendances = async () => {
    try {
      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .order('date', { ascending: false })

      if (error) throw error
      setAttendances(data || [])
    } catch (error) {
      console.error('Error fetching attendances:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllStats = async () => {
    const newStats: AttendanceStats = {}
    for (const attendance of attendances) {
      const { data } = await supabase
        .from('student_presences')
        .select('status')
        .eq('attendance_id', attendance.id)

      if (data) {
        newStats[attendance.id] = {
          present: data.filter(p => p.status === 'present').length,
          absent: data.filter(p => p.status === 'absent').length,
          validReason: data.filter(p => p.status === 'absent with valid reason').length,
        }
      }
    }
    setStats(newStats)
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, student_ids')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }

  const fetchStudentPresences = async (attendanceId: string) => {
    try {
      const { data, error } = await supabase
        .from('student_presences')
        .select('*')
        .eq('attendance_id', attendanceId)

      if (error) throw error

      const presences: Record<string, { status: string; comment: string }> = {}
      data?.forEach((p: StudentPresence) => {
        presences[p.student_id] = {
          status: p.status,
          comment: p.comment || '',
        }
      })
      setStudentPresences(presences)
    } catch (error) {
      console.error('Error fetching student presences:', error)
    }
  }

  const checkStudentPayment = async (studentId: string): Promise<{ id: string; available_lesson_count: number } | null> => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id, available_lesson_count')
        .eq('student_id', studentId)
        .eq('status', 'paid')
        .gt('available_lesson_count', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return null
      return data
    } catch {
      return null
    }
  }

  const handleClassChange = async (classId: string) => {
    const selectedClass = classes.find(c => c.id === classId)
    if (!selectedClass) return

    const classStudents = students.filter(s => selectedClass.student_ids.includes(s.id))
    setSelectedClassStudents(classStudents)

    // Check payments for all students
    const presences: Record<string, { status: string; comment: string }> = {}
    for (const student of classStudents) {
      const payment = await checkStudentPayment(student.id)
      if (!payment || payment.available_lesson_count < 1) {
        setStudentNeedingPayment(student)
        setPaymentModalOpen(true)
        return
      }
      presences[student.id] = { status: 'present', comment: '' }
    }
    setStudentPresences(presences)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      let attendanceId: string

      if (editingAttendance) {
        // Get old presences to restore payment counts
        const { data: oldPresences } = await supabase
          .from('student_presences')
          .select('student_id, status')
          .eq('attendance_id', editingAttendance.id)

        // Restore payment counts
        if (oldPresences) {
          for (const presence of oldPresences) {
            if (presence.status !== 'absent with valid reason') {
              const { data: payment } = await supabase
                .from('payments')
                .select('id, available_lesson_count')
                .eq('student_id', presence.student_id)
                .eq('status', 'paid')
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (payment) {
                await supabase
                  .from('payments')
                  .update({
                    available_lesson_count: payment.available_lesson_count + 1,
                  })
                  .eq('id', payment.id)
              }
            }
          }
        }

        // Update existing attendance
        const { data, error } = await supabase
          .from('attendances')
          .update({
            date: formData.date,
            class_id: formData.class_id,
          })
          .eq('id', editingAttendance.id)
          .select()
          .single()

        if (error) throw error
        attendanceId = data.id

        // Delete existing presences
        await supabase
          .from('student_presences')
          .delete()
          .eq('attendance_id', attendanceId)
      } else {
        // Create new attendance
        const { data, error } = await supabase
          .from('attendances')
          .insert({
            date: formData.date,
            class_id: formData.class_id,
          })
          .select()
          .single()

        if (error) throw error
        attendanceId = data.id
      }

      // Create student presences and update payments
      for (const [studentId, presence] of Object.entries(studentPresences)) {
        const { data: presenceData, error: presenceError } = await supabase
          .from('student_presences')
          .insert({
            student_id: studentId,
            attendance_id: attendanceId,
            status: presence.status,
            comment: presence.comment || null,
          })
          .select()
          .single()

        if (presenceError) throw presenceError

        // Update payment available_lesson_count
        if (presence.status !== 'absent with valid reason' && presenceData) {
          const payment = await checkStudentPayment(studentId)
          if (payment) {
            await supabase
              .from('payments')
              .update({
                available_lesson_count: Math.max(0, payment.available_lesson_count - 1),
                student_presence_ids: [...(payment.student_presence_ids || []), presenceData.id],
              })
              .eq('id', payment.id)
          }
        }
      }

      await fetchAttendances()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving attendance:', error)
      alert('Помилка збереження відвідуваності')
    }
  }

  const handleEdit = async (attendance: Attendance) => {
    setEditingAttendance(attendance)
    setFormData({
      date: attendance.date,
      class_id: attendance.class_id,
    })

    const selectedClass = classes.find(c => c.id === attendance.class_id)
    if (selectedClass) {
      const classStudents = students.filter(s => selectedClass.student_ids.includes(s.id))
      setSelectedClassStudents(classStudents)
      await fetchStudentPresences(attendance.id)
    }

    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цю відвідуваність? Це також змінить кількість доступних уроків.')) return

    try {
      // Get presences before deleting
      const { data: presences } = await supabase
        .from('student_presences')
        .select('student_id, status')
        .eq('attendance_id', id)

      // Restore payment counts
      if (presences) {
        for (const presence of presences) {
          if (presence.status !== 'absent with valid reason') {
            const { data: payment } = await supabase
              .from('payments')
              .select('id, available_lesson_count')
              .eq('student_id', presence.student_id)
              .eq('status', 'paid')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (payment) {
              await supabase
                .from('payments')
                .update({
                  available_lesson_count: payment.available_lesson_count + 1,
                })
                .eq('id', payment.id)
            }
          }
        }
      }

      await supabase.from('attendances').delete().eq('id', id)
      await fetchAttendances()
    } catch (error) {
      console.error('Error deleting attendance:', error)
      alert('Помилка видалення відвідуваності')
    }
  }

  const resetForm = () => {
    setFormData({
      date: '',
      class_id: '',
    })
    setEditingAttendance(null)
    setSelectedClassStudents([])
    setStudentPresences({})
  }

  const filteredAttendances = attendances.filter((attendance) => {
    const matchesSearch =
      searchTerm === '' ||
      formatDate(attendance.date).includes(searchTerm) ||
      classes.find(c => c.id === attendance.class_id)?.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesClass = classFilter === 'all' || attendance.class_id === classFilter

    const matchesDateRange =
      (!dateRangeStart || attendance.date >= dateRangeStart) &&
      (!dateRangeEnd || attendance.date <= dateRangeEnd)

    return matchesSearch && matchesClass && matchesDateRange
  })

  const paginatedAttendances = filteredAttendances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredAttendances.length / itemsPerPage)

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Відвідуваність</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Додати відвідуваність
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за датою або класом..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі класи</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-4">
          <Input
            type="date"
            placeholder="Від"
            value={dateRangeStart}
            onChange={(e) => setDateRangeStart(e.target.value)}
            className="w-48"
          />
          <Input
            type="date"
            placeholder="До"
            value={dateRangeEnd}
            onChange={(e) => setDateRangeEnd(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Клас
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статистика
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Створено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedAttendances.map((attendance) => {
                const className = classes.find(c => c.id === attendance.class_id)?.name || '-'
                const attendanceStats = stats[attendance.id] || { present: 0, absent: 0, validReason: 0 }
                return (
                  <tr key={attendance.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(attendance.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {className}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2 flex-wrap">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          Присутні: {attendanceStats.present}
                        </span>
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                          Відсутні: {attendanceStats.absent}
                        </span>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                          Поважна причина: {attendanceStats.validReason}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(attendance.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(attendance)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(attendance.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-700">Показати:</label>
            <Select
              value={itemsPerPage.toString()}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="w-20"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </Select>
            <span className="text-sm text-gray-700">
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredAttendances.length)} з {filteredAttendances.length}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Попередня
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Наступна
            </Button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingAttendance ? 'Редагувати відвідуваність' : 'Додати відвідуваність'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата *
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Клас *
              </label>
              <Select
                value={formData.class_id}
                onChange={(e) => {
                  setFormData({ ...formData, class_id: e.target.value })
                  handleClassChange(e.target.value)
                }}
                required
              >
                <option value="">Вибрати клас</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {selectedClassStudents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Студенти класу
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-4">
                {selectedClassStudents.map((student) => (
                  <div key={student.id} className="flex items-center gap-4 p-2 border-b">
                    <div className="flex-1">
                      <p className="font-medium">{student.student_first_name} {student.student_last_name}</p>
                    </div>
                    <Select
                      value={studentPresences[student.id]?.status || 'present'}
                      onChange={(e) => {
                        setStudentPresences({
                          ...studentPresences,
                          [student.id]: {
                            ...studentPresences[student.id],
                            status: e.target.value,
                          },
                        })
                      }}
                      className="w-48"
                    >
                      <option value="present">Присутній</option>
                      <option value="absent">Відсутній</option>
                      <option value="absent with valid reason">Відсутній з поважною причиною</option>
                    </Select>
                    <Input
                      placeholder="Коментар"
                      value={studentPresences[student.id]?.comment || ''}
                      onChange={(e) => {
                        setStudentPresences({
                          ...studentPresences,
                          [student.id]: {
                            ...studentPresences[student.id],
                            comment: e.target.value,
                          },
                        })
                      }}
                      className="w-48"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">
              {editingAttendance ? 'Зберегти зміни' : 'Додати відвідуваність'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment Required Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Потрібен платіж"
        size="md"
      >
        <div className="space-y-4">
          <p>
            Студент {studentNeedingPayment?.student_first_name} {studentNeedingPayment?.student_last_name} не має активного платежу з доступними уроками.
          </p>
          <p className="text-sm text-gray-600">
            Будь ласка, створіть платіж для цього студента перед відміткою відвідуваності.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => {
              setPaymentModalOpen(false)
              window.location.href = '/dashboard/payments'
            }}>
              Перейти до платежів
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
