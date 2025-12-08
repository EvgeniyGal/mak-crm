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

interface Course {
  id: string
  name: string
  teachers_ids: string[]
  room_id: string | null
  schedule_ids: string[]
  student_ids: string[]
  status: string
  capacity: number
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

interface Schedule {
  id?: string
  week_day: number
  start_time: string
  end_time: string
  time_slot?: string // For existing schedules from DB
  class_id?: string
}

export default function CoursesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [courses, setCourses] = useState<Course[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([])
  const [pendingPackages, setPendingPackages] = useState<Omit<PackageType, 'id' | 'class_id'>[]>([]) // For new courses
  const [schedules, setSchedules] = useState<Schedule[]>([]) // For existing courses
  const [pendingSchedules, setPendingSchedules] = useState<Schedule[]>([]) // For new courses
  const [showPackageForm, setShowPackageForm] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  
  const weekDays = [
    t('schedules.sunday'),
    t('schedules.monday'),
    t('schedules.tuesday'),
    t('schedules.wednesday'),
    t('schedules.thursday'),
    t('schedules.friday'),
    t('schedules.saturday'),
  ]
  
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
  const [scheduleFormData, setScheduleFormData] = useState({
    week_day: 0,
    start_time: '',
    end_time: '',
  })
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [studentSearchTerm, setStudentSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    name: '',
    teachers_ids: [] as string[],
    room_id: '',
    student_ids: [] as string[],
    status: 'active',
    capacity: 20,
  })

  const fetchCourses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCourses(data || [])
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
    const courseId = editingCourse?.id || (formData.name ? courses.find(c => c.name === formData.name)?.id : null)
    if (!courseId) return

    try {
      const { data, error } = await supabase
        .from('package_types')
        .select('*')
        .eq('class_id', courseId)

      if (error) throw error
      setPackageTypes(data || [])
    } catch (error) {
      console.error('Error fetching package types:', error)
    }
  }, [supabase, editingCourse, formData.name, courses])

  const fetchSchedules = useCallback(async () => {
    const courseId = editingCourse?.id
    if (!courseId) return

    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('class_id', courseId)
        .order('week_day', { ascending: true })
        .order('time_slot', { ascending: true })

      if (error) throw error
      // Transform DB format to component format
      const transformedSchedules: Schedule[] = (data || []).map(s => ({
        id: s.id,
        week_day: s.week_day,
        start_time: s.time_slot || '',
        end_time: s.end_time || '',
        class_id: s.class_id,
      }))
      setSchedules(transformedSchedules)
    } catch (error) {
      console.error('Error fetching schedules:', error)
    }
  }, [supabase, editingCourse])

  useEffect(() => {
    fetchCourses()
    fetchTeachers()
    fetchRooms()
    fetchStudents()
  }, [fetchCourses, fetchTeachers, fetchRooms, fetchStudents])

  useEffect(() => {
    if (editingCourse || formData.name) {
      fetchPackageTypes()
    }
  }, [editingCourse, formData.name, fetchPackageTypes])

  useEffect(() => {
    if (editingCourse) {
      fetchSchedules()
    } else {
      setSchedules([])
    }
  }, [editingCourse, fetchSchedules])

  const handleCreatePackageType = async () => {
    if (!formData.name && !editingCourse) {
      alert('Спочатку введіть назву курсу')
      return
    }

    // If editing existing course, save to database immediately
    if (editingCourse?.id) {
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
          // Create new package type for existing course
          const { error } = await supabase
            .from('package_types')
            .insert([{
              ...packageFormData,
              class_id: editingCourse.id,
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
        alert(t('courses.errorSavingPackage'))
      }
    } else {
      // For new course, store in pending packages
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
      if (index !== undefined && !editingCourse) {
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
    if (!confirm(t('courses.confirmDeletePackage'))) {
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
      alert(t('courses.errorDeletingPackage'))
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

  const handleCreateSchedule = async () => {
    if (!scheduleFormData.start_time) {
      alert('Будь ласка, введіть час початку')
      return
    }

    // If editing existing course, save to database immediately
    if (editingCourse?.id) {
      try {
        if (editingSchedule && editingSchedule.id) {
          // Update existing schedule
          const { error } = await supabase
            .from('schedules')
            .update({
              week_day: scheduleFormData.week_day,
              time_slot: scheduleFormData.start_time,
              end_time: scheduleFormData.end_time || null,
            })
            .eq('id', editingSchedule.id)

          if (error) throw error
        } else {
          // Create new schedule for existing course
          const { error } = await supabase
            .from('schedules')
            .insert([{
              class_id: editingCourse.id,
              room_id: formData.room_id || null,
              week_day: scheduleFormData.week_day,
              time_slot: scheduleFormData.start_time,
              end_time: scheduleFormData.end_time || null,
            }])

          if (error) throw error
        }
        
        await fetchSchedules()
        setScheduleFormData({
          week_day: 0,
          start_time: '',
          end_time: '',
        })
        setShowScheduleForm(false)
        setEditingSchedule(null)
      } catch (error) {
        console.error('Error saving schedule:', error)
        alert(t('schedules.errorSaving') || 'Помилка збереження розкладу')
      }
    } else {
      // For new course, store in pending schedules
      if (editingScheduleIndex !== null) {
        // Update existing pending schedule
        const updated = [...pendingSchedules]
        updated[editingScheduleIndex] = scheduleFormData
        setPendingSchedules(updated)
      } else {
        // Add new pending schedule
        setPendingSchedules([...pendingSchedules, scheduleFormData])
      }
      
      setScheduleFormData({
        week_day: 0,
        start_time: '',
        end_time: '',
      })
      setShowScheduleForm(false)
      setEditingScheduleIndex(null)
      setEditingSchedule(null)
    }
  }

  const handleEditSchedule = (schedule: Schedule, index?: number) => {
    if (editingCourse) {
      // Editing existing schedule
      setEditingSchedule(schedule)
      setScheduleFormData({
        week_day: schedule.week_day,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
      })
      setShowScheduleForm(true)
    } else {
      // Editing pending schedule
      if (index !== undefined) {
        setEditingScheduleIndex(index)
        setScheduleFormData(pendingSchedules[index])
        setShowScheduleForm(true)
      }
    }
  }

  const handleDeleteSchedule = async (schedule: Schedule, index?: number) => {
    if (!confirm(t('schedules.confirmDelete') || 'Ви впевнені, що хочете видалити цей розклад?')) {
      return
    }

    // If it's a pending schedule (for new course), remove from pendingSchedules
    if (index !== undefined && !editingCourse) {
      setPendingSchedules(pendingSchedules.filter((_, i) => i !== index))
      return
    }

    // Otherwise, delete from database (for existing course)
    if (schedule.id && editingCourse) {
      try {
        const { error } = await supabase
          .from('schedules')
          .delete()
          .eq('id', schedule.id)

        if (error) throw error
        await fetchSchedules()
      } catch (error) {
        console.error('Error deleting schedule:', error)
        alert(t('schedules.errorDeleting') || 'Помилка видалення розкладу')
      }
    }
  }

  const handleCancelScheduleEdit = () => {
    setScheduleFormData({
      week_day: 0,
      start_time: '',
      end_time: '',
    })
    setShowScheduleForm(false)
    setEditingScheduleIndex(null)
    setEditingSchedule(null)
  }

  const getAvailableSeats = (courseItem: Course) => {
    const enrolledCount = courseItem.student_ids?.length || 0
    return Math.max(0, (courseItem.capacity || 0) - enrolledCount)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check capacity
    if (formData.student_ids.length > formData.capacity) {
      alert(t('courses.capacityError') + `: ${formData.capacity} ${t('students.student')}`)
      return
    }

    try {
      const submitData = {
        ...formData,
        room_id: formData.room_id || null,
        schedule_ids: [], // Will be handled separately
      }

      let courseId: string
      if (editingCourse) {
        // Get old student_ids to compare
        const oldStudentIds = editingCourse.student_ids || []
        const newStudentIds = formData.student_ids || []
        
        // Find newly added students
        const addedStudents = newStudentIds.filter(id => !oldStudentIds.includes(id))
        // Find removed students
        const removedStudents = oldStudentIds.filter(id => !newStudentIds.includes(id))
        
        // Update course
        const { error } = await supabase
          .from('courses')
          .update(submitData)
          .eq('id', editingCourse.id)
        if (error) throw error
        courseId = editingCourse.id
        
        // Update students' enrolled_class_ids and create student_class_lessons records
        for (const studentId of addedStudents) {
          // Get student's current enrolled_class_ids
          const { data: student, error: studentError } = await supabase
            .from('students')
            .select('enrolled_class_ids')
            .eq('id', studentId)
            .single()
          
          if (!studentError && student) {
            const currentEnrolled = student.enrolled_class_ids || []
            if (!currentEnrolled.includes(courseId)) {
              // Update student's enrolled_class_ids
              await supabase
                .from('students')
                .update({
                  enrolled_class_ids: [...currentEnrolled, courseId]
                })
                .eq('id', studentId)
            }
          }
          
          // Create student_class_lessons record if it doesn't exist
          await supabase
            .from('student_class_lessons')
            .upsert({
              student_id: studentId,
              class_id: courseId,
              lesson_count: 0
            }, {
              onConflict: 'student_id,class_id'
            })
        }
        
        // Remove course from students' enrolled_class_ids
        for (const studentId of removedStudents) {
          const { data: student, error: studentError } = await supabase
            .from('students')
            .select('enrolled_class_ids')
            .eq('id', studentId)
            .single()
          
          if (!studentError && student) {
            const currentEnrolled = student.enrolled_class_ids || []
            const updatedEnrolled = currentEnrolled.filter((id: string) => id !== courseId)
            
            await supabase
              .from('students')
              .update({
                enrolled_class_ids: updatedEnrolled
              })
              .eq('id', studentId)
          }
        }
      } else {
        const { data, error } = await supabase
          .from('courses')
          .insert([submitData])
          .select()
        if (error) throw error
        courseId = data[0].id
        
        // Create pending packages for the new course
        if (pendingPackages.length > 0) {
          const packagesToInsert = pendingPackages.map(pkg => ({
            ...pkg,
            class_id: courseId,
          }))
          const { error: packagesError } = await supabase
            .from('package_types')
            .insert(packagesToInsert)
          if (packagesError) {
            console.error('Error creating packages:', packagesError)
            // Continue even if packages fail - course is already created
          }
        }
        
        // Create pending schedules for the new course
        if (pendingSchedules.length > 0) {
          const schedulesToInsert = pendingSchedules.map(schedule => ({
            class_id: courseId,
            room_id: formData.room_id || null,
            time_slot: schedule.start_time,
            end_time: schedule.end_time || null,
            week_day: schedule.week_day,
          }))
          const { error: schedulesError } = await supabase
            .from('schedules')
            .insert(schedulesToInsert)
          if (schedulesError) {
            console.error('Error creating schedules:', schedulesError)
            // Continue even if schedules fail - course is already created
          }
        }
        
        // For new course, update students' enrolled_class_ids and create student_class_lessons records
        if (formData.student_ids && formData.student_ids.length > 0) {
          for (const studentId of formData.student_ids) {
            // Get student's current enrolled_class_ids
            const { data: student, error: studentError } = await supabase
              .from('students')
              .select('enrolled_class_ids')
              .eq('id', studentId)
              .single()
            
            if (!studentError && student) {
              const currentEnrolled = student.enrolled_class_ids || []
              if (!currentEnrolled.includes(courseId)) {
                // Update student's enrolled_class_ids
                await supabase
                  .from('students')
                  .update({
                    enrolled_class_ids: [...currentEnrolled, courseId]
                  })
                  .eq('id', studentId)
              }
            }
            
            // Create student_class_lessons record if it doesn't exist
            await supabase
              .from('student_class_lessons')
              .upsert({
                student_id: studentId,
                class_id: courseId,
                lesson_count: 0
              }, {
                onConflict: 'student_id,class_id'
              })
          }
        }
      }

      await fetchCourses()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving course:', error)
      alert(t('courses.errorSaving'))
    }
  }

  const handleEdit = (courseItem: Course) => {
    setEditingCourse(courseItem)
    setPendingPackages([]) // Clear pending packages when editing existing course
    setFormData({
      name: courseItem.name,
      teachers_ids: courseItem.teachers_ids,
      room_id: courseItem.room_id || '',
      student_ids: courseItem.student_ids,
      status: courseItem.status,
      capacity: courseItem.capacity || 20,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('courses.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchCourses()
    } catch (error) {
      console.error('Error deleting course:', error)
      alert(t('courses.errorDeleting'))
    }
  }

  const resetForm = () => {
    setStudentSearchTerm('')
    setFormData({
      name: '',
      teachers_ids: [],
      room_id: '',
      student_ids: [],
      status: 'active',
      capacity: 20,
    })
    setEditingCourse(null)
    setEditingPackageType(null)
    setPendingPackages([])
    setPendingSchedules([])
    setSchedules([])
    setPackageFormData({
      name: '',
      amount: 0,
      lesson_count: 0,
      status: 'active',
    })
    setScheduleFormData({
      week_day: 0,
      start_time: '',
      end_time: '',
    })
    setShowPackageForm(false)
    setShowScheduleForm(false)
    setEditingScheduleIndex(null)
    setEditingSchedule(null)
  }

  const availableSeats = formData.capacity - formData.student_ids.length

  const filteredCourses = courses.filter((courseItem) => {
    const matchesSearch =
      searchTerm === '' ||
      courseItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      courseItem.teachers_ids.some(tId => {
        const teacher = teachers.find(t => t.id === tId)
        return teacher && `${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
      })

    const matchesStatus = statusFilter === 'all' || courseItem.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const paginatedCourses = filteredCourses.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage)

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
      { header: t('courses.courseName'), accessor: (row) => row.name },
      { header: t('courses.teachers'), accessor: (row) => row.teachers_ids.map(getTeacherName).join(', ') || '-' },
      { header: t('courses.room'), accessor: (row) => getRoomName(row.room_id) },
      { header: t('courses.students'), accessor: (row) => row.student_ids?.length || 0 },
      { header: t('courses.freePlaces'), accessor: (row) => getAvailableSeats(row) },
      { header: t('courses.status'), accessor: (row) => row.status },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredCourses, columns, 'courses')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('courses.courseName'), accessor: (row) => row.name },
      { header: t('courses.teachers'), accessor: (row) => row.teachers_ids.map(getTeacherName).join(', ') || '-' },
      { header: t('courses.room'), accessor: (row) => getRoomName(row.room_id) },
      { header: t('courses.students'), accessor: (row) => row.student_ids?.length || 0 },
      { header: t('courses.freePlaces'), accessor: (row) => getAvailableSeats(row) },
      { header: t('courses.status'), accessor: (row) => row.status },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredCourses, columns, 'courses')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('courses.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredCourses.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('courses.addCourse')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за назвою курсу або вчителем..."
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
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                  {t('courses.courseName')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('courses.teachers')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('courses.room')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('courses.students')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('courses.freePlaces')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('courses.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedCourses.map((courseItem) => {
                const available = getAvailableSeats(courseItem)
                return (
                  <tr key={courseItem.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium sticky left-0 bg-white z-10">
                      {courseItem.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {courseItem.teachers_ids.length > 0
                        ? courseItem.teachers_ids.map(id => getTeacherName(id)).join(', ')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getRoomName(courseItem.room_id)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {courseItem.student_ids.length > 0
                        ? courseItem.student_ids.slice(0, 3).map(id => getStudentName(id)).join(', ')
                        : '-'}
                      {courseItem.student_ids.length > 3 && ` +${courseItem.student_ids.length - 3}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        available > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {available} / {courseItem.capacity || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        courseItem.status === 'active' ? 'bg-green-100 text-green-800' :
                        courseItem.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {courseItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(courseItem)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(courseItem.id)}
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredCourses.length)} з {filteredCourses.length}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Попередня
            </Button>
            <Button
              variant="secondary"
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
        title={editingCourse ? t('courses.editCourse') : t('courses.addCourse')}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('courses.courseName')} *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="bg-blue-50 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('courses.room')}
              </label>
              <Select
                value={formData.room_id}
                onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                className="bg-green-50 focus:bg-white"
              >
                <option value="">{t('courses.selectRoom')}</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('courses.capacity')} *
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={formData.capacity}
                onChange={(e) => {
                  const value = e.target.value
                  const numValue = Number(value)
                  // Only allow positive integers greater than 0, or empty string while typing
                  if (value === '' || (Number.isInteger(numValue) && numValue > 0)) {
                    setFormData({ ...formData, capacity: value === '' ? 1 : numValue })
                  }
                }}
                onBlur={(e) => {
                  // Ensure value is at least 1 when field loses focus
                  const value = Number(e.target.value)
                  if (!value || value < 1 || !Number.isInteger(value)) {
                    setFormData({ ...formData, capacity: 1 })
                  }
                }}
                onKeyDown={(e) => {
                  // Prevent decimal point, minus sign, and 'e' (scientific notation)
                  if (e.key === '.' || e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                    e.preventDefault()
                  }
                }}
                required
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-purple-50 focus:bg-white"
              />
              <div className="mt-2 text-sm text-gray-600">
                Вільні місця: {availableSeats}
                {availableSeats <= 0 && (
                  <span className="ml-2 text-red-600 font-semibold">Курс заповнений!</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('courses.status')} *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
              className="bg-yellow-50 focus:bg-white"
            >
              <option value="active">{t('common.active')}</option>
              <option value="paused">{t('courses.pause')}</option>
              <option value="archive">{t('courses.archive')}</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('courses.teachers')}
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2 bg-indigo-50">
              {teachers.map((teacher) => (
                <label key={teacher.id} className="flex items-center p-1 rounded hover:bg-indigo-100">
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
                {t('courses.packageTypes')}
              </label>
              <Button
                type="button"
                variant={showPackageForm ? "outline" : "success"}
                size="sm"
                onClick={() => setShowPackageForm(!showPackageForm)}
                disabled={!formData.name && !editingCourse}
                title={!formData.name && !editingCourse ? 'Спочатку введіть назву курсу' : ''}
              >
                {showPackageForm ? t('common.cancel') : t('courses.addPackage')}
              </Button>
            </div>
            {!formData.name && !editingCourse && (
              <p className="text-sm text-gray-500 mb-2">Введіть назву курсу, щоб додати типи пакетів</p>
            )}
            {showPackageForm && (formData.name || editingCourse) && (
              <div className="mb-4 p-4 border-2 border-gray-400 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {editingPackageType ? t('courses.editPackage') : t('courses.addPackage')}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('courses.packageName')} *</label>
                    <Input
                      value={packageFormData.name}
                      onChange={(e) => setPackageFormData({ ...packageFormData, name: e.target.value })}
                      placeholder="Напр. Базовий пакет"
                      className="bg-blue-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('courses.amountZeroHint')}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packageFormData.amount}
                      onChange={(e) => setPackageFormData({ ...packageFormData, amount: Number(e.target.value) })}
                      placeholder="0.00"
                      className="bg-green-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('courses.lessonCount')} *</label>
                    <Input
                      type="number"
                      min="1"
                      value={packageFormData.lesson_count}
                      onChange={(e) => setPackageFormData({ ...packageFormData, lesson_count: Number(e.target.value) })}
                      className="bg-purple-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('courses.status')} *</label>
                    <Select
                      value={packageFormData.status}
                      onChange={(e) => setPackageFormData({ ...packageFormData, status: e.target.value })}
                      className="bg-yellow-50 focus:bg-white"
                    >
                      <option value="active">Активний</option>
                      <option value="archive">Архів</option>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    type="button"
                    variant={editingPackageType ? "default" : "success"}
                    onClick={handleCreatePackageType}
                    disabled={!packageFormData.name || packageFormData.amount < 0 || packageFormData.lesson_count <= 0}
                  >
                    {editingPackageType ? t('common.save') : t('courses.addPackage')}
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
            <div className="mb-4 space-y-2 max-h-48 overflow-y-auto border-2 border-gray-400 rounded p-3 bg-blue-50">
              {/* Show existing packages for editing course */}
              {editingCourse && packageTypes.filter(pt => pt.class_id === editingCourse.id).map((pkg) => (
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
              {/* Show pending packages for new course */}
              {!editingCourse && pendingPackages.map((pkg, index) => (
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
              {((editingCourse && packageTypes.filter(pt => pt.class_id === editingCourse.id).length === 0) ||
                (!editingCourse && pendingPackages.length === 0)) && (
                <p className="text-sm text-gray-500 text-center py-2">Немає типів пакетів</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {t('schedules.title')}
              </label>
              <Button
                type="button"
                variant={showScheduleForm ? "outline" : "success"}
                size="sm"
                onClick={() => setShowScheduleForm(!showScheduleForm)}
              >
                {showScheduleForm ? t('common.cancel') : t('schedules.addSchedule')}
              </Button>
            </div>
            {showScheduleForm && (
              <div className="mb-4 p-4 border-2 border-gray-400 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {(editingSchedule || editingScheduleIndex !== null) ? t('schedules.editSchedule') : t('schedules.addSchedule')}
                  </h3>
                  {(editingSchedule || editingScheduleIndex !== null) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelScheduleEdit}
                    >
                      Скасувати
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('schedules.weekDay')} *</label>
                    <Select
                      value={scheduleFormData.week_day.toString()}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, week_day: Number(e.target.value) })}
                      className="bg-blue-50 focus:bg-white"
                    >
                      {weekDays.map((day, idx) => (
                        <option key={idx} value={idx}>
                          {day}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('schedules.startTime')} *</label>
                    <Input
                      type="time"
                      value={scheduleFormData.start_time}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, start_time: e.target.value })}
                      className="bg-green-50 focus:bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('schedules.endTime')}</label>
                    <Input
                      type="time"
                      value={scheduleFormData.end_time}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, end_time: e.target.value })}
                      className="bg-purple-50 focus:bg-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    type="button"
                    variant={(editingSchedule || editingScheduleIndex !== null) ? "default" : "success"}
                    onClick={handleCreateSchedule}
                    disabled={!scheduleFormData.start_time}
                  >
                    {(editingSchedule || editingScheduleIndex !== null) ? t('common.save') : t('schedules.addSchedule')}
                  </Button>
                  {(editingSchedule || editingScheduleIndex !== null) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelScheduleEdit}
                    >
                      Скасувати
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="mb-4 space-y-2 max-h-48 overflow-y-auto border-2 border-gray-400 rounded p-3 bg-blue-50">
              {/* Show existing schedules for editing course */}
              {editingCourse && schedules.map((schedule) => (
                <div key={schedule.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-gray-200">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{weekDays[schedule.week_day]}</span>
                    <span className="text-sm text-gray-600 ml-2">
                      {schedule.start_time} {schedule.end_time ? `- ${schedule.end_time}` : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSchedule(schedule)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Редагувати"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(schedule)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Видалити"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {/* Show pending schedules for new course */}
              {!editingCourse && pendingSchedules.map((schedule, index) => (
                <div key={index} className="flex justify-between items-center p-2 rounded hover:bg-gray-50 border border-gray-200">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{weekDays[schedule.week_day]}</span>
                    <span className="text-sm text-gray-600 ml-2">
                      {schedule.start_time} {schedule.end_time ? `- ${schedule.end_time}` : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSchedule(schedule, index)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Редагувати"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(schedule, index)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Видалити"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {((editingCourse && schedules.length === 0) ||
                (!editingCourse && pendingSchedules.length === 0)) && (
                <p className="text-sm text-gray-500 text-center py-2">Немає розкладу</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('courses.students')} ({formData.student_ids.length} / {formData.capacity})
            </label>
            {availableSeats <= 0 && (
              <div className="mb-2 p-2 bg-red-50 text-red-700 rounded text-sm">
                Курс заповнений! Неможливо додати більше студентів.
              </div>
            )}
            <div className="mb-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder={t('common.search') + '...'}
                value={studentSearchTerm}
                onChange={(e) => setStudentSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2 bg-pink-50">
              {students
                .filter((student) => {
                  const fullName = `${student.student_first_name} ${student.student_last_name}`.toLowerCase()
                  return fullName.includes(studentSearchTerm.toLowerCase())
                })
                .map((student) => {
                const isSelected = formData.student_ids.includes(student.id)
                const canSelect = availableSeats > 0 || isSelected
                return (
                  <label key={student.id} className={`flex items-center p-1 rounded hover:bg-pink-100 ${!canSelect ? 'opacity-50' : ''}`}>
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
            <Button type="submit" variant={editingCourse ? "default" : "success"}>
              {editingCourse ? t('common.save') : t('courses.addCourse')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

