'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

interface Class {
  id: string
  name: string
  teachers_ids: string[]
  room_id: string | null
  schedule_ids: string[]
  student_ids: string[]
  status: string
  created_at: string
}

interface Teacher {
  id: string
  first_name: string
  last_name: string
}

interface Room {
  id: string
  name: string
  capacity: number
}

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
}

interface PackageType {
  id: string
  name: string
  amount: number
  lesson_count: number
  class_id: string
  status: string
}

export default function ClassesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [classes, setClasses] = useState<Class[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([])
  const [pendingPackages, setPendingPackages] = useState<Omit<PackageType, 'id' | 'class_id'>[]>([]) // For new classes
  const [showPackageForm, setShowPackageForm] = useState(false)
  interface PackageTypeWithIndex extends Omit<PackageType, 'id' | 'class_id'> {
    id?: string | number
    class_id?: string
  }
  const [editingPackageType, setEditingPackageType] = useState<PackageTypeWithIndex | null>(null)
  const [packageFormData, setPackageFormData] = useState({
    name: '',
    amount: 0,
    lesson_count: 0,
    status: 'active',
  })
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    name: '',
    teachers_ids: [] as string[],
    room_id: '',
    student_ids: [] as string[],
    status: 'active',
  })

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchTeachers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('status', 'active')

      if (error) throw error
      setTeachers(data || [])
    } catch (error) {
      console.error('Error fetching teachers:', error)
    }
  }, [supabase])

  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  }, [supabase])

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')
        .eq('status', 'active')

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }, [supabase])

  const fetchPackageTypes = useCallback(async () => {
    const classId = editingClass?.id || (formData.name ? classes.find(c => c.name === formData.name)?.id : null)
    if (!classId) return

    try {
      const { data, error } = await supabase
        .from('package_types')
        .select('*')
        .eq('class_id', classId)

      if (error) throw error
      setPackageTypes(data || [])
    } catch (error) {
      console.error('Error fetching package types:', error)
    }
  }, [supabase, editingClass, formData.name, classes])

  useEffect(() => {
    fetchClasses()
    fetchTeachers()
    fetchRooms()
    fetchStudents()
  }, [fetchClasses, fetchTeachers, fetchRooms, fetchStudents])

  useEffect(() => {
    if (editingClass || formData.name) {
      fetchPackageTypes()
    }
  }, [editingClass, formData.name, fetchPackageTypes])

  const handleCreatePackageType = async () => {
    if (!formData.name) {
      alert('Спочатку введіть назву класу')
      return
    }

    // If editing existing class, save to database immediately
    if (editingClass?.id) {
      try {
        if (editingPackageType) {
          // Update existing package type
          const { error } = await supabase
            .from('package_types')
            .update({
              name: packageFormData.name,
              amount: packageFormData.amount,
              lesson_count: packageFormData.lesson_count,
              status: packageFormData.status,
            })
            .eq('id', editingPackageType.id as string)

          if (error) throw error
        } else {
          // Create new package type for existing class
          const { error } = await supabase
            .from('package_types')
            .insert([{
              ...packageFormData,
              class_id: editingClass.id,
            }])

          if (error) throw error
        }
        
        await fetchPackageTypes()
        setPackageFormData({
          name: '',
          amount: 0,
          lesson_count: 0,
          status: 'active',
        })
        setShowPackageForm(false)
        setEditingPackageType(null)
      } catch (error) {
        console.error('Error saving package type:', error)
        alert(t('classes.errorSavingPackage'))
      }
    } else {
      // For new class, store in pending packages
      if (editingPackageType && editingPackageType.id !== undefined) {
        // Update pending package using stored index
        const index = editingPackageType.id
        if (typeof index === 'number' && index >= 0 && index < pendingPackages.length) {
          const updated = [...pendingPackages]
          updated[index] = packageFormData
          setPendingPackages(updated)
        }
      } else {
        // Add new pending package
        setPendingPackages([...pendingPackages, packageFormData])
      }
      
      setPackageFormData({
        name: '',
        amount: 0,
        lesson_count: 0,
        status: 'active',
      })
      setShowPackageForm(false)
      setEditingPackageType(null)
    }
  }

  const handleEditPackageType = (pkg: PackageType | Omit<PackageType, 'id' | 'class_id'>, index?: number) => {
    const pkgToEdit: PackageTypeWithIndex = { 
      ...pkg, 
      id: 'id' in pkg ? pkg.id : undefined,
      class_id: 'class_id' in pkg ? pkg.class_id : undefined
    }
    // Store index for pending packages
    if (index !== undefined && !editingClass) {
      pkgToEdit.id = index
    }
    setEditingPackageType(pkgToEdit)
    setPackageFormData({
      name: pkg.name,
      amount: pkg.amount,
      lesson_count: pkg.lesson_count,
      status: pkg.status,
    })
    setShowPackageForm(true)
  }

  const handleDeletePackageType = async (pkgId: string | number) => {
    if (!confirm(t('classes.confirmDeletePackage'))) {
      return
    }

    // If it's a pending package (index), remove from pendingPackages
    if (typeof pkgId === 'number') {
      setPendingPackages(pendingPackages.filter((_, i) => i !== pkgId))
      return
    }

    // Otherwise, delete from database
    try {
      const { error } = await supabase
        .from('package_types')
        .delete()
        .eq('id', pkgId)

      if (error) throw error
      await fetchPackageTypes()
    } catch (error) {
      console.error('Error deleting package type:', error)
      alert(t('classes.errorDeletingPackage'))
    }
  }

  const handleCancelPackageEdit = () => {
    setEditingPackageType(null)
    setPackageFormData({
      name: '',
      amount: 0,
      lesson_count: 0,
      status: 'active',
    })
    setShowPackageForm(false)
  }

  const getAvailableSeats = (classItem: Class) => {
    if (!classItem.room_id) return 0
    const room = rooms.find(r => r.id === classItem.room_id)
    if (!room) return 0
    return room.capacity - (classItem.student_ids?.length || 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check capacity
    if (formData.room_id) {
      const room = rooms.find(r => r.id === formData.room_id)
      if (room && formData.student_ids.length > room.capacity) {
        alert(t('classes.capacityError') + `: ${room.capacity} ${t('students.student')}`)
        return
      }
    }

    try {
      const submitData = {
        ...formData,
        room_id: formData.room_id || null,
        schedule_ids: [], // Will be handled separately
      }

      let classId: string
      if (editingClass) {
        const { error } = await supabase
          .from('classes')
          .update(submitData)
          .eq('id', editingClass.id)
        if (error) throw error
        classId = editingClass.id
      } else {
        const { data, error } = await supabase
          .from('classes')
          .insert([submitData])
          .select()
        if (error) throw error
        classId = data[0].id
        
        // Create pending packages for the new class
        if (pendingPackages.length > 0) {
          const packagesToInsert = pendingPackages.map(pkg => ({
            ...pkg,
            class_id: classId,
          }))
          const { error: packagesError } = await supabase
            .from('package_types')
            .insert(packagesToInsert)
          if (packagesError) {
            console.error('Error creating packages:', packagesError)
            // Continue even if packages fail - class is already created
          }
        }
      }

      await fetchClasses()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving class:', error)
      alert(t('classes.errorSaving'))
    }
  }

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem)
    setPendingPackages([]) // Clear pending packages when editing existing class
    setFormData({
      name: classItem.name,
      teachers_ids: classItem.teachers_ids,
      room_id: classItem.room_id || '',
      student_ids: classItem.student_ids,
      status: classItem.status,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('classes.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchClasses()
    } catch (error) {
      console.error('Error deleting class:', error)
      alert(t('classes.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      teachers_ids: [],
      room_id: '',
      student_ids: [],
      status: 'active',
    })
    setEditingClass(null)
    setEditingPackageType(null)
    setPendingPackages([])
    setPackageFormData({
      name: '',
      amount: 0,
      lesson_count: 0,
      status: 'active',
    })
    setShowPackageForm(false)
  }

  const selectedRoom = rooms.find(r => r.id === formData.room_id)
  const availableSeats = selectedRoom ? selectedRoom.capacity - formData.student_ids.length : 0

  const filteredClasses = classes.filter((classItem) => {
    const matchesSearch =
      searchTerm === '' ||
      classItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      classItem.teachers_ids.some(tId => {
        const teacher = teachers.find(t => t.id === tId)
        return teacher && `${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
      })

    const matchesStatus = statusFilter === 'all' || classItem.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const paginatedClasses = filteredClasses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredClasses.length / itemsPerPage)

  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId)
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherId
  }

  const getRoomName = (roomId: string | null) => {
    if (!roomId) return '-'
    const room = rooms.find(r => r.id === roomId)
    return room ? room.name : roomId
  }

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId)
    return student ? `${student.student_first_name} ${student.student_last_name}` : studentId
  }

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('classes.className'), accessor: (row) => row.name },
      { header: t('classes.teachers'), accessor: (row) => row.teachers_ids.map(getTeacherName).join(', ') || '-' },
      { header: t('classes.room'), accessor: (row) => getRoomName(row.room_id) },
      { header: t('classes.students'), accessor: (row) => row.student_ids?.length || 0 },
      { header: t('classes.freePlaces'), accessor: (row) => getAvailableSeats(row) },
      { header: t('classes.status'), accessor: (row) => row.status },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredClasses, columns, 'classes')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('classes.className'), accessor: (row) => row.name },
      { header: t('classes.teachers'), accessor: (row) => row.teachers_ids.map(getTeacherName).join(', ') || '-' },
      { header: t('classes.room'), accessor: (row) => getRoomName(row.room_id) },
      { header: t('classes.students'), accessor: (row) => row.student_ids?.length || 0 },
      { header: t('classes.freePlaces'), accessor: (row) => getAvailableSeats(row) },
      { header: t('classes.status'), accessor: (row) => row.status },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredClasses, columns, 'classes')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('classes.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredClasses.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('classes.addClass')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за назвою класу або вчителем..."
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
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="paused">Призупинені</option>
            <option value="archive">Архів</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.className')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.teachers')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.room')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.students')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.freePlaces')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('classes.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedClasses.map((classItem) => {
                const available = getAvailableSeats(classItem)
                return (
                  <tr key={classItem.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {classItem.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {classItem.teachers_ids.length > 0
                        ? classItem.teachers_ids.map(id => getTeacherName(id)).join(', ')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getRoomName(classItem.room_id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {classItem.student_ids.length > 0
                        ? classItem.student_ids.slice(0, 3).map(id => getStudentName(id)).join(', ')
                        : '-'}
                      {classItem.student_ids.length > 3 && ` +${classItem.student_ids.length - 3}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        available > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {available} / {classItem.room_id ? rooms.find(r => r.id === classItem.room_id)?.capacity || 0 : 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        classItem.status === 'active' ? 'bg-green-100 text-green-800' :
                        classItem.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {classItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(classItem)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(classItem.id)}
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredClasses.length)} з {filteredClasses.length}
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
        title={editingClass ? t('classes.editClass') : t('classes.addClass')}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('classes.className')} *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('classes.room')}
              </label>
              <Select
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              >
                <option value="">{t('classes.selectRoom')}</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} (місткість: {room.capacity})
                  </option>
                ))}
              </Select>
              {selectedRoom && (
                <div className="mt-2 text-sm text-gray-600">
                  Місткість: {selectedRoom.capacity} | Вільні місця: {availableSeats}
                  {availableSeats <= 0 && (
                    <span className="ml-2 text-red-600 font-semibold">Клас заповнений!</span>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('classes.status')} *
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="active">{t('common.active')}</option>
                <option value="paused">{t('classes.pause')}</option>
                <option value="archive">{t('classes.archive')}</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('classes.teachers')}
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
              {teachers.map((teacher) => (
                <label key={teacher.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.teachers_ids.includes(teacher.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          teachers_ids: [...formData.teachers_ids, teacher.id],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          teachers_ids: formData.teachers_ids.filter(id => id !== teacher.id),
                        })
                      }
                    }}
                    className="mr-2"
                  />
                  {teacher.first_name} {teacher.last_name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('classes.packageTypes')}
              </label>
              {formData.name && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPackageForm(!showPackageForm)}
                >
                  {showPackageForm ? t('common.cancel') : t('classes.addPackage')}
                </Button>
              )}
            </div>
            {showPackageForm && formData.name && (
              <div className="mb-4 p-4 border-2 border-gray-400 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {editingPackageType ? t('classes.editPackage') : t('classes.addPackage')}
                  </h3>
                  {editingPackageType && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelPackageEdit}
                    >
                      Скасувати
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('classes.packageName')} *</label>
                    <Input
                      value={packageFormData.name}
                      onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                      placeholder="Напр. Базовий пакет"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('classes.amountZeroHint')}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packageFormData.amount}
                      onChange={(e) => setPackageFormData({ ...packageFormData, amount: Number(e.target.value) })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('classes.lessonCount')} *</label>
                    <Input
                      type="number"
                      min="1"
                      value={packageFormData.lesson_count}
                      onChange={(e) => setPackageFormData({ ...packageFormData, lesson_count: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Статус *</label>
                    <Select
                      value={packageFormData.status}
                      onChange={(e) => setPackageFormData({ ...packageFormData, status: e.target.value })}
                    >
                      <option value="active">Активний</option>
                      <option value="archive">Архів</option>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    type="button"
                    onClick={handleCreatePackageType}
                    disabled={!packageFormData.name || packageFormData.amount < 0 || packageFormData.lesson_count <= 0}
                  >
                    {editingPackageType ? t('common.save') : t('classes.addPackage')}
                  </Button>
                  {editingPackageType && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelPackageEdit}
                    >
                      Скасувати
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="mb-4 space-y-2 max-h-48 overflow-y-auto border-2 border-gray-400 rounded p-3 bg-white">
              {/* Show existing packages for editing class */}
              {editingClass && packageTypes.filter(pt => pt.class_id === editingClass.id).map((pkg) => (
                <div key={pkg.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-gray-200">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{pkg.name}</span>
                    <span className="text-sm text-gray-600 ml-2">- {pkg.lesson_count} уроків ({pkg.amount} грн)</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${pkg.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {pkg.status === 'active' ? 'Активний' : 'Архів'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditPackageType(pkg)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Редагувати"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePackageType(pkg.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Видалити"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {/* Show pending packages for new class */}
              {!editingClass && pendingPackages.map((pkg, index) => (
                <div key={index} className="flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-gray-200">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{pkg.name}</span>
                    <span className="text-sm text-gray-600 ml-2">- {pkg.lesson_count} уроків ({pkg.amount} грн)</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded ${pkg.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {pkg.status === 'active' ? 'Активний' : 'Архів'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditPackageType(pkg, index)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Редагувати"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePackageType(index)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Видалити"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {((editingClass && packageTypes.filter(pt => pt.class_id === editingClass.id).length === 0) ||
                (!editingClass && pendingPackages.length === 0)) && (
                <p className="text-sm text-gray-500 text-center py-2">Немає типів пакетів</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('classes.students')} {availableSeats >= 0 && `(${formData.student_ids.length} / ${selectedRoom?.capacity || '∞'})`}
            </label>
            {availableSeats <= 0 && formData.room_id && (
              <div className="mb-2 p-2 bg-red-50 text-red-700 rounded text-sm">
                Клас заповнений! Неможливо додати більше студентів.
              </div>
            )}
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
              {students.map((student) => {
                const isSelected = formData.student_ids.includes(student.id)
                const canSelect = !formData.room_id || availableSeats > 0 || isSelected
                return (
                  <label key={student.id} className={`flex items-center ${!canSelect ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked && canSelect) {
                          setFormData({
                            ...formData,
                            student_ids: [...formData.student_ids, student.id],
                          })
                        } else if (!e.target.checked) {
                          setFormData({
                            ...formData,
                            student_ids: formData.student_ids.filter(id => id !== student.id),
                          })
                        }
                      }}
                      disabled={!canSelect}
                      className="mr-2"
                    />
                    {student.student_first_name} {student.student_last_name}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {editingClass ? t('common.save') : t('classes.addClass')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

