'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { calculateAge, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
  student_date_of_birth: string
  parent_first_name: string
  parent_middle_name: string | null
  phone: string
  email: string | null
  status: string
  comment: string | null
  enrolled_class_ids: string[]
  interested_class_ids: string[]
  created_at: string
}

interface Class {
  id: string
  name: string
  room_id: string | null
  student_ids: string[]
}

interface Room {
  id: string
  name: string
  capacity: number
}

export default function StudentsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [classCapacities, setClassCapacities] = useState<Record<string, { available: number; total: number; isFull: boolean }>>({})
  const [, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [formData, setFormData] = useState({
    student_first_name: '',
    student_last_name: '',
    student_date_of_birth: '',
    parent_first_name: '',
    parent_middle_name: '',
    phone: '',
    email: '',
    status: 'active',
    comment: '',
    enrolled_class_ids: [] as string[],
    interested_class_ids: [] as string[],
  })

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, room_id, student_ids')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name, capacity')

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  }, [supabase])

  const calculateCapacities = useCallback(() => {
    const capacities: Record<string, { available: number; total: number; isFull: boolean }> = {}
    
    classes.forEach(cls => {
      if (!cls.room_id) {
        capacities[cls.id] = { available: Infinity, total: Infinity, isFull: false }
        return
      }

      const room = rooms.find(r => r.id === cls.room_id)
      if (!room) {
        capacities[cls.id] = { available: 0, total: 0, isFull: true }
        return
      }

      const enrolledCount = cls.student_ids?.length || 0
      const available = room.capacity - enrolledCount
      
      capacities[cls.id] = {
        available: Math.max(0, available),
        total: room.capacity,
        isFull: available <= 0,
      }
    })

    setClassCapacities(capacities)
  }, [classes, rooms])

  useEffect(() => {
    fetchStudents()
    fetchClasses()
    fetchRooms()
  }, [fetchStudents, fetchClasses, fetchRooms])

  useEffect(() => {
    calculateCapacities()
  }, [calculateCapacities])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check capacity for each enrolled class
    for (const classId of formData.enrolled_class_ids) {
      const capacity = classCapacities[classId]
      if (capacity && capacity.isFull && !editingStudent?.enrolled_class_ids.includes(classId)) {
        const className = classes.find(c => c.id === classId)?.name || classId
        alert(`Клас "${className}" заповнений. Неможливо додати студента.`)
        return
      }
    }

    try {
      const submitData = {
        ...formData,
        enrolled_class_ids: formData.enrolled_class_ids,
        interested_class_ids: formData.interested_class_ids,
        parent_middle_name: formData.parent_middle_name || null,
        email: formData.email || null,
        comment: formData.comment || null,
      }

      const studentId = editingStudent?.id

      if (editingStudent) {
        // Update student
        const { error } = await supabase
          .from('students')
          .update(submitData)
          .eq('id', editingStudent.id)
        if (error) throw error

        // Update class student_ids arrays
        const oldEnrolled = editingStudent.enrolled_class_ids || []
        const newEnrolled = formData.enrolled_class_ids

        // Remove from old classes
        for (const classId of oldEnrolled) {
          if (!newEnrolled.includes(classId)) {
            const cls = classes.find(c => c.id === classId)
            if (cls) {
              const updatedStudentIds = (cls.student_ids || []).filter(id => id !== studentId)
              await supabase
                .from('classes')
                .update({ student_ids: updatedStudentIds })
                .eq('id', classId)
            }
          }
        }

        // Add to new classes
        for (const classId of newEnrolled) {
          if (!oldEnrolled.includes(classId)) {
            const cls = classes.find(c => c.id === classId)
            if (cls) {
              const updatedStudentIds = [...(cls.student_ids || []), studentId].filter(Boolean)
              await supabase
                .from('classes')
                .update({ student_ids: updatedStudentIds })
                .eq('id', classId)
            }
          }
        }
      } else {
        // Create new student
        const { data: newStudent, error } = await supabase
          .from('students')
          .insert([submitData])
          .select()
          .single()
        
        if (error) throw error

        // Add to classes
        for (const classId of formData.enrolled_class_ids) {
          const cls = classes.find(c => c.id === classId)
          if (cls && newStudent) {
            const updatedStudentIds = [...(cls.student_ids || []), newStudent.id]
            await supabase
              .from('classes')
              .update({ student_ids: updatedStudentIds })
              .eq('id', classId)
          }
        }
      }

      await fetchStudents()
      await fetchClasses() // Refresh classes to update capacities
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving student:', error)
      alert('Помилка збереження студента')
    }
  }

  const handleEdit = (student: Student) => {
    setEditingStudent(student)
    setFormData({
      student_first_name: student.student_first_name,
      student_last_name: student.student_last_name,
      student_date_of_birth: student.student_date_of_birth,
      parent_first_name: student.parent_first_name,
      parent_middle_name: student.parent_middle_name || '',
      phone: student.phone,
      email: student.email || '',
      status: student.status,
      comment: student.comment || '',
      enrolled_class_ids: student.enrolled_class_ids,
      interested_class_ids: student.interested_class_ids,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цього студента?')) return

    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchStudents()
    } catch (error) {
      console.error('Error deleting student:', error)
      alert('Помилка видалення студента')
    }
  }

  const resetForm = () => {
    setFormData({
      student_first_name: '',
      student_last_name: '',
      student_date_of_birth: '',
      parent_first_name: '',
      parent_middle_name: '',
      phone: '',
      email: '',
      status: 'active',
      comment: '',
      enrolled_class_ids: [],
      interested_class_ids: [],
    })
    setEditingStudent(null)
  }

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      searchTerm === '' ||
      `${student.student_first_name} ${student.student_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${student.parent_first_name} ${student.parent_middle_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.phone.includes(searchTerm) ||
      (student.email && student.email.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || student.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let aValue: string | number = a[sortBy as keyof Student] as string | number
    let bValue: string | number = b[sortBy as keyof Student] as string | number

    if (sortBy === 'age') {
      aValue = new Date(a.student_date_of_birth).getTime()
      bValue = new Date(b.student_date_of_birth).getTime()
    } else if (sortBy === 'student_full_name') {
      aValue = `${a.student_first_name} ${a.student_last_name}`
      bValue = `${b.student_first_name} ${b.student_last_name}`
    }

    // Handle null/undefined values
    if (aValue == null) aValue = ''
    if (bValue == null) bValue = ''

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })

  const paginatedStudents = sortedStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage)

  const getClassName = (classId: string) => {
    return classes.find(c => c.id === classId)?.name || classId
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('students.title')}</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          {t('students.addStudent')}
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('students.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('students.allStatuses')}</option>
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
            <option value="moved">{t('common.moved')}</option>
            <option value="don't disturb">{t('common.dontDisturb')}</option>
          </Select>
        </div>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium">{t('common.sortBy')}</label>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-48"
          >
            <option value="created_at">{t('students.sortByDate')}</option>
            <option value="age">{t('students.sortByAge')}</option>
            <option value="student_full_name">{t('students.sortByName')}</option>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('students.student')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Вік
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Батько
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Телефон
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Зареєстровані класи
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Зацікавлені класи
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Коментар
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
              {paginatedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {student.student_first_name} {student.student_last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {calculateAge(student.student_date_of_birth)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.parent_first_name} {student.parent_middle_name || ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.phone}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      student.status === 'active' ? 'bg-green-100 text-green-800' :
                      student.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.enrolled_class_ids.length > 0
                      ? student.enrolled_class_ids.map(id => getClassName(id)).join(', ')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.interested_class_ids.length > 0
                      ? student.interested_class_ids.map(id => getClassName(id)).join(', ')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                    {student.comment ? (
                      <span className="truncate block" title={student.comment}>
                        {student.comment}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(student.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(student)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(student.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedStudents.length)} з {sortedStudents.length}
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
        title={editingStudent ? 'Редагувати студента' : 'Додати студента'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ім&apos;я студента *
              </label>
              <Input
                value={formData.student_first_name}
                onChange={(e) => setFormData({ ...formData, student_first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Прізвище студента *
              </label>
              <Input
                value={formData.student_last_name}
                onChange={(e) => setFormData({ ...formData, student_last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата народження *
              </label>
              <Input
                type="date"
                value={formData.student_date_of_birth}
                onChange={(e) => setFormData({ ...formData, student_date_of_birth: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ім&apos;я батька *
              </label>
              <Input
                value={formData.parent_first_name}
                onChange={(e) => setFormData({ ...formData, parent_first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                По батькові батька
              </label>
              <Input
                value={formData.parent_middle_name}
                onChange={(e) => setFormData({ ...formData, parent_middle_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Телефон *
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Статус *
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="active">Активний</option>
                <option value="inactive">Неактивний</option>
                <option value="moved">Переїхав</option>
                <option value="don't disturb">Не турбувати</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Коментар
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-gray-900 focus:outline-none focus:border-blue-500"
              rows={3}
              placeholder="Додайте коментар про студента..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Зареєстровані класи
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
              {classes.map((cls) => {
                const capacity = classCapacities[cls.id]
                const isFull = capacity?.isFull || false
                const isAlreadyEnrolled = editingStudent?.enrolled_class_ids.includes(cls.id)
                const canEnroll = !isFull || isAlreadyEnrolled || !capacity
                
                return (
                  <label 
                    key={cls.id} 
                    className={`flex items-center justify-between ${!canEnroll ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.enrolled_class_ids.includes(cls.id)}
                        onChange={(e) => {
                          if (e.target.checked && canEnroll) {
                            setFormData({
                              ...formData,
                              enrolled_class_ids: [...formData.enrolled_class_ids, cls.id],
                            })
                          } else if (!e.target.checked) {
                            setFormData({
                              ...formData,
                              enrolled_class_ids: formData.enrolled_class_ids.filter(id => id !== cls.id),
                            })
                          }
                        }}
                        disabled={!canEnroll}
                        className="mr-2"
                      />
                      {cls.name}
                    </div>
                    {capacity && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        isFull ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {isFull ? 'Заповнений' : `${capacity.available}/${capacity.total}`}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Зацікавлені класи
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
              {classes.map((cls) => (
                <label key={cls.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.interested_class_ids.includes(cls.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          interested_class_ids: [...formData.interested_class_ids, cls.id],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          interested_class_ids: formData.interested_class_ids.filter(id => id !== cls.id),
                        })
                      }
                    }}
                    className="mr-2"
                  />
                  {cls.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">
              {editingStudent ? 'Зберегти зміни' : 'Додати студента'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

