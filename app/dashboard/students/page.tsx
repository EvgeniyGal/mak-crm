'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatAge, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search, FileText, ArrowUpDown, ArrowUp, ArrowDown, Upload } from 'lucide-react'
import { decode as decodeWindows1251 } from 'windows-1251'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
  student_date_of_birth: string | null
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
  status?: string
  capacity: number
}

export default function StudentsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [classCapacities, setClassCapacities] = useState<Record<string, { available: number; total: number; isFull: boolean }>>({})
  const [, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [selectedStudentForSummary, setSelectedStudentForSummary] = useState<Student | null>(null)
  const [studentSummary, setStudentSummary] = useState<{
    attendances: Array<{ date: string; class_name: string; status: string }>
    payments: Array<{ date: string; class_name: string; amount: number; status: string; type: string; available_lessons: number }>
    firstLessonDate: string | null
  } | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [minAgeYears, setMinAgeYears] = useState<string>('')
  const [minAgeMonths, setMinAgeMonths] = useState<string>('')
  const [maxAgeYears, setMaxAgeYears] = useState<string>('')
  const [maxAgeMonths, setMaxAgeMonths] = useState<string>('')
  const [courseFilter, setCourseFilter] = useState<string>('all')
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
      let allStudents: Student[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allStudents = [...allStudents, ...data]
          // If we got less than batchSize, we've reached the end
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setStudents(allStudents)
    } catch (error) {
      console.error('Error fetching students:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchCourses = useCallback(async () => {
    try {
      // Fetch all courses (not just active) to show names for enrolled courses
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, room_id, student_ids, status, capacity')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const calculateCapacities = useCallback(() => {
    const capacities: Record<string, { available: number; total: number; isFull: boolean }> = {}
    
    classes.forEach(cls => {
      const enrolledCount = cls.student_ids?.length || 0
      const capacity = cls.capacity || 0
      const available = capacity - enrolledCount
      
      capacities[cls.id] = {
        available: Math.max(0, available),
        total: capacity,
        isFull: available <= 0,
      }
    })

    setClassCapacities(capacities)
  }, [classes])

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([
        fetchStudents(),
        fetchCourses()
      ])
    }
    loadData()
  }, [fetchStudents, fetchCourses])

  useEffect(() => {
    calculateCapacities()
  }, [calculateCapacities])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check capacity for each enrolled class
    for (const classId of formData.enrolled_class_ids) {
      const capacity = classCapacities[classId]
      if (capacity && capacity.isFull && !editingStudent?.enrolled_class_ids.includes(classId)) {
        const courseName = classes.find(c => c.id === classId)?.name || classId
        alert(`Курс "${courseName}" заповнений. Неможливо додати студента.`)
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
                .from('courses')
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
                .from('courses')
                .update({ student_ids: updatedStudentIds })
                .eq('id', classId)
              
              // Create student_class_lessons record if it doesn't exist
              await supabase
                .from('student_class_lessons')
                .upsert({
                  student_id: studentId,
                  class_id: classId,
                  lesson_count: 0
                }, {
                  onConflict: 'student_id,class_id'
                })
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
              .from('courses')
              .update({ student_ids: updatedStudentIds })
              .eq('id', classId)
            
            // Create student_class_lessons record if it doesn't exist
            await supabase
              .from('student_class_lessons')
              .upsert({
                student_id: newStudent.id,
                class_id: classId,
                lesson_count: 0
              }, {
                onConflict: 'student_id,class_id'
              })
          }
        }
      }

      await fetchStudents()
      await fetchCourses() // Refresh courses to update capacities
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
      student_date_of_birth: student.student_date_of_birth || '',
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

  const fetchStudentSummary = async (student: Student) => {
    setLoadingSummary(true)
    try {
      // Fetch student presences
      const { data: presences } = await supabase
        .from('student_presences')
        .select('status, attendance_id')
        .eq('student_id', student.id)

      const attendanceIds = presences?.map(p => p.attendance_id) || []

      // Fetch attendances with course names
      let attendances: Array<{ date: string; class_name: string; status: string }> = []
      if (attendanceIds.length > 0) {
        const { data: attendancesData } = await supabase
          .from('attendances')
          .select('id, date, class_id')
          .in('id', attendanceIds)

        if (attendancesData) {
          // Get course names
          const classIds = [...new Set(attendancesData.map(a => a.class_id))]
          const { data: coursesData } = await supabase
            .from('courses')
            .select('id, name')
            .in('id', classIds)

          const coursesMap = new Map(coursesData?.map(c => [c.id, c.name]) || [])

          // Combine data
          attendances = attendancesData.map(attendance => {
            const presence = presences?.find(p => p.attendance_id === attendance.id)
            return {
              date: attendance.date,
              class_name: coursesMap.get(attendance.class_id) || '-',
              status: presence?.status || 'unknown',
            }
          }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        }
      }

      // Fetch payments
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('created_at, status, type, class_id, package_type_id, comment')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false })

      if (paymentsError) {
        console.error('Error fetching payments:', paymentsError)
        throw paymentsError
      }

      let paymentsData: Array<{ date: string; class_name: string; amount: number; status: string; type: string; available_lessons: number }> = []
      if (payments && payments.length > 0) {
        console.log(`Found ${payments.length} payments for student ${student.id}`)
        
        // Get course names and package amounts
        const classIds = [...new Set(payments.map(p => p.class_id).filter(Boolean))]
        const packageIds = [...new Set(payments.map(p => p.package_type_id).filter(Boolean))]

        let coursesData: Array<{ id: string; name: string }> = []
        let packagesData: Array<{ id: string; amount: number }> = []

        if (classIds.length > 0) {
          const { data, error: coursesError } = await supabase
            .from('courses')
            .select('id, name')
            .in('id', classIds)

          if (coursesError) {
            console.error('Error fetching courses:', coursesError)
          } else {
            coursesData = data || []
          }
        }

        if (packageIds.length > 0) {
          const { data, error: packagesError } = await supabase
            .from('package_types')
            .select('id, amount')
            .in('id', packageIds)

          if (packagesError) {
            console.error('Error fetching package types:', packagesError)
          } else {
            packagesData = data || []
          }
        }

        const coursesMap = new Map(coursesData.map(c => [c.id, c.name]))
        const packagesMap = new Map(packagesData.map(p => [p.id, p.amount]))

        // Get available lessons from student_class_lessons table
        const { data: lessonsData } = await supabase
          .from('student_class_lessons')
          .select('class_id, lesson_count')
          .eq('student_id', student.id)
          .in('class_id', classIds)

        const lessonsMap = new Map(lessonsData?.map(l => [l.class_id, l.lesson_count]) || [])

        paymentsData = payments.map(p => ({
          date: p.created_at,
          class_name: coursesMap.get(p.class_id) || '-',
          amount: packagesMap.get(p.package_type_id) || 0,
          status: p.status,
          type: p.type,
          available_lessons: lessonsMap.get(p.class_id) || 0,
        }))

        console.log('Processed payments data:', paymentsData)
      } else {
        console.log('No payments found for student', student.id)
      }

      // Find first lesson date (earliest attendance)
      const firstLessonDate = attendances.length > 0
        ? attendances.reduce((earliest, curr) => 
            new Date(curr.date) < new Date(earliest.date) ? curr : earliest
          ).date
        : null

      setStudentSummary({
        attendances,
        payments: paymentsData,
        firstLessonDate,
      })
    } catch (error) {
      console.error('Error fetching student summary:', error)
      alert('Помилка завантаження даних')
    } finally {
      setLoadingSummary(false)
    }
  }

  const handleViewSummary = async (student: Student) => {
    setSelectedStudentForSummary(student)
    setIsSummaryModalOpen(true)
    await fetchStudentSummary(student)
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

    // Age filter - convert years and months to total months for comparison
    let matchesAgeRange = true
    if (student.student_date_of_birth) {
      const dob = new Date(student.student_date_of_birth)
      const now = new Date()
      let years = now.getFullYear() - dob.getFullYear()
      let months = now.getMonth() - dob.getMonth()
      if (months < 0) {
        years--
        months += 12
      }
      if (now.getDate() < dob.getDate()) {
        months--
        if (months < 0) {
          years--
          months += 12
        }
      }
      const totalMonths = years * 12 + months
      
      const hasMinAge = minAgeYears !== '' || minAgeMonths !== ''
      const hasMaxAge = maxAgeYears !== '' || maxAgeMonths !== ''
      
      if (hasMinAge) {
        const minTotalMonths = (minAgeYears ? parseInt(minAgeYears) || 0 : 0) * 12 + (minAgeMonths ? parseInt(minAgeMonths) || 0 : 0)
        matchesAgeRange = matchesAgeRange && totalMonths >= minTotalMonths
      }
      if (hasMaxAge) {
        const maxTotalMonths = (maxAgeYears ? parseInt(maxAgeYears) || 0 : 0) * 12 + (maxAgeMonths ? parseInt(maxAgeMonths) || 0 : 0)
        matchesAgeRange = matchesAgeRange && totalMonths <= maxTotalMonths
      }
    }

    // Course filter
    const matchesCourse = courseFilter === 'all' || 
      (student.enrolled_class_ids && student.enrolled_class_ids.includes(courseFilter))

    return matchesSearch && matchesStatus && matchesAgeRange && matchesCourse
  })

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let aValue: string | number = a[sortBy as keyof Student] as string | number
    let bValue: string | number = b[sortBy as keyof Student] as string | number

    if (sortBy === 'age') {
      aValue = a.student_date_of_birth ? new Date(a.student_date_of_birth).getTime() : 0
      bValue = b.student_date_of_birth ? new Date(b.student_date_of_birth).getTime() : 0
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

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-4 w-4 inline ml-1 text-gray-400" />
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-4 w-4 inline ml-1 text-gray-600" />
      : <ArrowDown className="h-4 w-4 inline ml-1 text-gray-600" />
  }

  const getClassName = (classId: string | null | undefined): string | null => {
    if (!classId) return null
    const foundClass = classes.find(c => c.id === classId)
    return foundClass?.name || null
  }

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('students.studentName'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('students.lastName'), accessor: (row) => row.student_last_name },
      { header: t('students.dateOfBirth'), accessor: (row) => formatDate(row.student_date_of_birth) },
      { header: t('students.age'), accessor: (row) => formatAge(row.student_date_of_birth, t('common.yearsShort'), t('common.monthsShort')) },
      { header: t('students.parentName'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('students.phone'), accessor: (row) => row.phone },
      { header: t('students.email'), accessor: (row) => row.email || '' },
      { header: t('students.status'), accessor: (row) => row.status === 'active' ? t('common.active') : row.status === 'inactive' ? t('common.inactive') : row.status === 'moved' ? t('common.moved') : t('common.dontDisturb') },
      { header: t('students.enrolledClasses'), accessor: (row) => row.enrolled_class_ids?.map(getClassName).filter((name: string | null): name is string => name !== null).join(', ') || '-' },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(sortedStudents, columns, 'students')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('students.studentName'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('students.lastName'), accessor: (row) => row.student_last_name },
      { header: t('students.dateOfBirth'), accessor: (row) => formatDate(row.student_date_of_birth) },
      { header: t('students.age'), accessor: (row) => formatAge(row.student_date_of_birth, t('common.yearsShort'), t('common.monthsShort')) },
      { header: t('students.parentName'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('students.phone'), accessor: (row) => row.phone },
      { header: t('students.email'), accessor: (row) => row.email || '' },
      { header: t('students.status'), accessor: (row) => row.status === 'active' ? t('common.active') : row.status === 'inactive' ? t('common.inactive') : row.status === 'moved' ? t('common.moved') : t('common.dontDisturb') },
      { header: t('students.enrolledClasses'), accessor: (row) => row.enrolled_class_ids?.map(getClassName).filter((name: string | null): name is string => name !== null).join(', ') || '-' },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(sortedStudents, columns, 'students')
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('students.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedStudents.length === 0}
            />
          )}
          {isOwner && (
            <Button onClick={() => setIsImportModalOpen(true)} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Імпорт
            </Button>
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('students.addStudent')}
          </Button>
        </div>
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
            {[
              { value: 'active', label: t('common.active') },
              { value: 'inactive', label: t('common.inactive') },
              { value: 'moved', label: t('common.moved') },
              { value: "don't disturb", label: t('common.dontDisturb') },
            ]
              .sort((a, b) => a.label.localeCompare(b.label, 'uk'))
              .map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
          </Select>
          <Select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('dashboard.classes')}</option>
            {classes
              .filter(cls => cls.status === 'active')
              .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
              .map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('students.age')} {t('common.from')}
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t('common.yearsShort')}
                value={minAgeYears}
                onChange={(e) => setMinAgeYears(e.target.value)}
                className="w-20"
                min="0"
              />
              <Input
                type="number"
                placeholder={t('common.monthsShort')}
                value={minAgeMonths}
                onChange={(e) => setMinAgeMonths(e.target.value)}
                className="w-20"
                min="0"
                max="11"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('students.age')} {t('common.to')}
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t('common.yearsShort')}
                value={maxAgeYears}
                onChange={(e) => setMaxAgeYears(e.target.value)}
                className="w-20"
                min="0"
              />
              <Input
                type="number"
                placeholder={t('common.monthsShort')}
                value={maxAgeMonths}
                onChange={(e) => setMaxAgeMonths(e.target.value)}
                className="w-20"
                min="0"
                max="11"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                  onClick={() => handleSort('student_full_name')}
                >
                  {t('students.student')}
                  {getSortIcon('student_full_name')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('age')}
                >
                  Вік
                  {getSortIcon('age')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Батьки
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Телефон
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('students.status')}
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
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('created_at')}
                >
                  Створено
                  {getSortIcon('created_at')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
                    {student.student_first_name} {student.student_last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.student_date_of_birth ? formatAge(student.student_date_of_birth, t('common.yearsShort'), t('common.monthsShort')) : '-'}
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
                      {student.status === 'active' ? t('common.active') :
                       student.status === 'inactive' ? t('common.inactive') :
                       student.status === 'moved' ? t('common.moved') :
                       t('common.dontDisturb')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.enrolled_class_ids && Array.isArray(student.enrolled_class_ids) && student.enrolled_class_ids.length > 0
                      ? (() => {
                          const looksLikeUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
                          const classNames = student.enrolled_class_ids
                            .map(item => getClassName(item) ?? (looksLikeUUID(item) ? null : item))
                            .filter((name): name is string => !!name)
                          return classNames.length > 0 ? classNames.join(', ') : '-'
                        })()
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.interested_class_ids && Array.isArray(student.interested_class_ids) && student.interested_class_ids.length > 0
                      ? (() => {
                          const looksLikeUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
                          const classNames = student.interested_class_ids
                            .map(item => getClassName(item) ?? (looksLikeUUID(item) ? null : item))
                            .filter((name): name is string => !!name)
                          return classNames.length > 0 ? classNames.join(', ') : '-'
                        })()
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
                      onClick={() => handleViewSummary(student)}
                      className="text-green-600 hover:text-green-900 mr-3"
                      title={t('students.viewSummary')}
                    >
                      <FileText className="h-4 w-4" />
                    </button>
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
                {t('students.status')} *
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
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-gray-900 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white"
              rows={3}
              placeholder="Додайте коментар про студента..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Зареєстровані класи
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2 bg-blue-50">
              {classes.filter(cls => cls.status === 'active').map((cls) => {
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
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2 bg-blue-50">
              {classes.filter(cls => cls.status === 'active').map((cls) => (
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
            <Button type="submit" variant={editingStudent ? "default" : "success"}>
              {editingStudent ? 'Зберегти зміни' : 'Додати студента'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Student Summary Modal */}
      <Modal
        isOpen={isSummaryModalOpen}
        onClose={() => { setIsSummaryModalOpen(false); setSelectedStudentForSummary(null); setStudentSummary(null) }}
        title={selectedStudentForSummary ? `${t('students.studentSummary')}: ${selectedStudentForSummary.student_first_name} ${selectedStudentForSummary.student_last_name}` : t('students.studentSummary')}
        size="lg"
      >
        {loadingSummary ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : studentSummary ? (
          <div className="space-y-6">
            {/* First Lesson Date */}
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{t('students.firstLessonDate')}</h3>
              <p className="text-gray-700">
                {studentSummary.firstLessonDate 
                  ? formatDate(studentSummary.firstLessonDate)
                  : t('students.noFirstLesson')}
              </p>
            </div>

            {/* Attendances */}
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{t('students.attendedClasses')} ({studentSummary.attendances.length})</h3>
              {studentSummary.attendances.length > 0 ? (
                <div className="border rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.class')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('attendances.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {studentSummary.attendances.map((attendance, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatDate(attendance.date)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{attendance.class_name}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              attendance.status === 'present' ? 'bg-green-100 text-green-800' :
                              attendance.status === 'absent' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {attendance.status === 'present' ? t('attendances.present') :
                               attendance.status === 'absent' ? t('attendances.absent') :
                               t('attendances.absentValidReason')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">{t('students.noAttendances')}</p>
              )}
            </div>

            {/* Payments */}
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{t('payments.title')} ({studentSummary.payments.length})</h3>
              {studentSummary.payments.length > 0 ? (
                <div className="border rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.class')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.amount')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.paymentType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.availableLessons')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {studentSummary.payments.map((payment, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatDate(payment.date)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.class_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.amount} {t('common.uah')}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              payment.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {payment.status === 'paid' ? t('payments.paid') : t('payments.pending')}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {payment.type === 'cash' ? t('payments.cash') : 
                             payment.type === 'card' ? t('payments.card') : 
                             t('payments.free')}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.available_lessons}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">{t('students.noPayments')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Імпорт студентів з CSV"
        size="xl"
      >
        <ImportStudentsModal
          onImport={async (studentsToImport) => {
            try {
              // Import students in batches
              const batchSize = 10
              const importedStudentIds: string[] = []
              
              for (let i = 0; i < studentsToImport.length; i += batchSize) {
                const batch = studentsToImport.slice(i, i + batchSize)
                const { data: insertedStudents, error } = await supabase
                  .from('students')
                  .insert(batch)
                  .select('id, enrolled_class_ids')
                
                if (error) throw error
                
                if (insertedStudents) {
                  // Update classes with new student IDs and create student_class_lessons records
                  for (const student of insertedStudents) {
                    importedStudentIds.push(student.id)
                    for (const classId of student.enrolled_class_ids || []) {
                      const cls = classes.find(c => c.id === classId)
                      if (cls) {
                        const updatedStudentIds = [...(cls.student_ids || []), student.id].filter(Boolean)
                        await supabase
                          .from('courses')
                          .update({ student_ids: updatedStudentIds })
                          .eq('id', classId)
                        
                        // Create student_class_lessons record if it doesn't exist
                        await supabase
                          .from('student_class_lessons')
                          .upsert({
                            student_id: student.id,
                            class_id: classId,
                            lesson_count: 0
                          }, {
                            onConflict: 'student_id,class_id'
                          })
                      }
                    }
                  }
                }
              }
              
              await fetchStudents()
              await fetchCourses()
              setIsImportModalOpen(false)
              alert(`Успішно імпортовано ${studentsToImport.length} студентів`)
            } catch (error) {
              console.error('Error importing students:', error)
              alert('Помилка імпорту студентів')
            }
          }}
          onClose={() => setIsImportModalOpen(false)}
          classes={classes}
        />
      </Modal>
    </div>
  )
}

// Import Students Modal Component
interface ImportStudentsModalProps {
  onImport: (students: Array<{
    student_first_name: string
    student_last_name: string
    student_date_of_birth: string | null
    parent_first_name: string
    parent_middle_name: string | null
    phone: string
    email: string | null
    status: string
    comment: string | null
    enrolled_class_ids: string[]
    interested_class_ids: string[]
  }>) => Promise<void>
  onClose: () => void
  classes: Class[]
}

function ImportStudentsModal({ onImport, onClose, classes }: ImportStudentsModalProps) {
  const [csvData, setCsvData] = useState<string[][]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({})
  const [previewData, setPreviewData] = useState<Array<Record<string, string | string[] | null>>>([])
  const [importing, setImporting] = useState(false)

  // Available database fields
  const dbFields = [
    { value: 'student_first_name', label: "Ім'я студента" },
    { value: 'student_last_name', label: 'Прізвище студента' },
    { value: 'student_date_of_birth', label: 'Дата народження' },
    { value: 'parent_first_name', label: "Ім'я батька" },
    { value: 'parent_middle_name', label: 'По батькові' },
    { value: 'phone', label: 'Телефон' },
    { value: 'email', label: 'Email' },
    { value: 'status', label: 'Статус' },
    { value: 'comment', label: 'Коментар' },
    { value: 'enrolled_classes', label: 'Курси (назви)' },
    { value: 'interested_classes', label: 'Желаемые курсы (назви)' },
    { value: 'skip', label: 'Пропустити' },
  ]

  // Auto-detect common column names
  const autoDetectMapping = (headers: string[]) => {
    const mapping: Record<string, string> = {}
    const headerLower = headers.map(h => h.toLowerCase().trim())
    
    headers.forEach((header, index) => {
      const h = headerLower[index]
      if (h.includes('имя ребенка') || h.includes('имя студента') || h.includes('ребенок')) {
        mapping[header] = 'student_first_name'
      } else if (h.includes('фамилия') || h.includes('прізвище')) {
        mapping[header] = 'student_last_name'
      } else if (h.includes('имя родителя') || h.includes('имя батька') || h.includes('родитель')) {
        mapping[header] = 'parent_first_name'
      } else if (h.includes('телефон') || h.includes('phone')) {
        mapping[header] = 'phone'
      } else if (h.includes('email') || h.includes('почта')) {
        mapping[header] = 'email'
      } else if (h.includes('дата рождения') || h.includes('дата народження') || h.includes('дата рождения')) {
        mapping[header] = 'student_date_of_birth'
      } else if (h.includes('курсы') || h.includes('курси') || h.includes('занятия')) {
        mapping[header] = 'enrolled_classes'
      } else if (h.includes('желаемые') || h.includes('желаемые курсы')) {
        mapping[header] = 'interested_classes'
      } else if (h.includes('комментарий') || h.includes('коментар')) {
        mapping[header] = 'comment'
      }
    })
    
    return mapping
  }


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    
    // Try to read as Windows-1251 first, fallback to UTF-8
    reader.onload = async (event) => {
      try {
        // Read as ArrayBuffer to handle encoding
        const arrayBuffer = event.target?.result as ArrayBuffer
        if (!arrayBuffer) return

        // Try Windows-1251 decoding first
        let text: string
        try {
          const bytes = new Uint8Array(arrayBuffer)
          text = decodeWindows1251(bytes)
        } catch {
          // Fallback to UTF-8
          const decoder = new TextDecoder('utf-8')
          text = decoder.decode(arrayBuffer)
        }
        
        // Parse CSV with semicolon delimiter
        const lines = text.split('\n').filter(line => line.trim())
        const parsed: string[][] = []
        
        lines.forEach(line => {
          // Handle CSV with semicolon delimiter
          const values: string[] = []
          let current = ''
          let inQuotes = false
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ';' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())
          parsed.push(values)
        })

        if (parsed.length > 0) {
          setCsvHeaders(parsed[0])
          setCsvData(parsed.slice(1))
          const autoMapping = autoDetectMapping(parsed[0])
          setFieldMapping(autoMapping)
          generatePreview(parsed[0], parsed.slice(1), autoMapping)
        }
      } catch (error) {
        console.error('Error reading file:', error)
        alert('Помилка читання файлу. Перевірте кодування файлу.')
      }
    }
    
    reader.readAsArrayBuffer(file)
  }

  const generatePreview = (headers: string[], data: string[][], mapping: Record<string, string>) => {
    const preview: Array<Record<string, string | string[] | null>> = []
    const maxPreview = Math.min(5, data.length)

    for (let i = 0; i < maxPreview; i++) {
      const row: Record<string, string | string[] | null> = {}
      headers.forEach((header, index) => {
        const dbField = mapping[header]
        if (dbField && dbField !== 'skip' && data[i] && data[i][index] !== undefined) {
          let value: string | string[] = data[i][index]?.trim() || ''
          
          // Convert date formats
          if (dbField === 'student_date_of_birth') {
            value = value ? convertDate(value as string) : '2099-01-01'
          }
          
          // Parse classes (comma or bracket separated)
          if (dbField === 'enrolled_classes' || dbField === 'interested_classes') {
            value = parseClasses(value as string)
          }
          
          row[dbField] = value
        }
      })
      
      // Set defaults
      if (!row.student_first_name) row.student_first_name = ''
      if (!row.student_last_name) row.student_last_name = ''
      if (!row.student_date_of_birth) row.student_date_of_birth = null
      if (!row.parent_first_name) row.parent_first_name = ''
      if (!row.status) row.status = 'active'
      if (!row.enrolled_class_ids) row.enrolled_class_ids = []
      if (!row.interested_class_ids) row.interested_class_ids = []
      
      preview.push(row)
    }
    
    setPreviewData(preview)
  }

  const convertDate = (dateStr: string): string => {
    // Default date if parsing fails
    const DEFAULT_DATE = '2099-01-01'
    
    if (!dateStr || !dateStr.trim()) return DEFAULT_DATE
    
    const trimmed = dateStr.trim()
    
    // Format: "2022-10-14 00:00:00.0" or "2022-10-14T00:00:00" (YYYY-MM-DD)
    if (trimmed.includes('-') && (trimmed.includes(' ') || trimmed.includes('T'))) {
      const datePart = trimmed.split(/[\sT]/)[0]
      // Validate the date part
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [year, month, day] = datePart.split('-').map(Number)
        if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return datePart
        }
      }
    }
    
    // Format: "01.07.2020  0:00:00" or "21.01.2020  0:00:00" (DD.MM.YYYY with optional time)
    // This is the most common format in Ukrainian/Russian CSV files
    const dotMatchWithTime = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+.*$/)
    if (dotMatchWithTime) {
      const [, day, month, year] = dotMatchWithTime
      const dayNum = parseInt(day, 10)
      const monthNum = parseInt(month, 10)
      const yearNum = parseInt(year, 10)
      // Validate date - DD.MM.YYYY format
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        // Construct as YYYY-MM-DD (ISO format)
        return `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      }
    }
    
    // Format: "25.01.2022" (DD.MM.YYYY) - without time
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (dotMatch) {
      const [, day, month, year] = dotMatch
      const dayNum = parseInt(day, 10)
      const monthNum = parseInt(month, 10)
      const yearNum = parseInt(year, 10)
      // Validate date - DD.MM.YYYY format
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        // Construct as YYYY-MM-DD (ISO format)
        return `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      }
    }
    
    // Format: "25,01,2022" or "25/01/2022" (DD/MM/YYYY or DD,MM,YYYY)
    const slashMatch = trimmed.match(/^(\d{1,2})[,\/](\d{1,2})[,\/](\d{4})$/)
    if (slashMatch) {
      const [, day, month, year] = slashMatch
      const dayNum = parseInt(day, 10)
      const monthNum = parseInt(month, 10)
      const yearNum = parseInt(year, 10)
      // Validate date - DD/MM/YYYY format
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        // Construct as YYYY-MM-DD (ISO format)
        return `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      }
    }
    
    // Format: "2022.01.25" (YYYY.MM.DD)
    const ymdDotMatch = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
    if (ymdDotMatch) {
      const [, year, month, day] = ymdDotMatch
      const dayNum = parseInt(day, 10)
      const monthNum = parseInt(month, 10)
      const yearNum = parseInt(year, 10)
      // Validate date
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        return `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
      }
    }
    
    // Format: "лет: 05 месяцев: 03" - calculate from age
    const ageMatch = trimmed.match(/лет:\s*(\d+)\s*месяцев:\s*(\d+)/)
    if (ageMatch) {
      const [, years, months] = ageMatch
      const today = new Date()
      const birthDate = new Date(today.getFullYear() - parseInt(years, 10), today.getMonth() - parseInt(months, 10), today.getDate())
      if (!isNaN(birthDate.getTime())) {
        const year = birthDate.getFullYear()
        if (year >= 1900 && year <= 2100) {
          return birthDate.toISOString().split('T')[0]
        }
      }
    }
    
    // Try to parse as ISO date (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number)
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return trimmed
      }
    }
    
    // Last resort: try JavaScript Date parsing (but be careful - it might interpret as MM/DD/YYYY)
    // Only use this if we can't match any pattern above
    const parsed = new Date(trimmed)
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      if (year >= 1900 && year <= 2100) {
        return parsed.toISOString().split('T')[0]
      }
    }
    
    // If all parsing fails, return default date
    console.warn(`Could not parse date: "${dateStr}", using default date: ${DEFAULT_DATE}`)
    return DEFAULT_DATE
  }

  const parseClasses = (classStr: string): string[] => {
    if (!classStr) return []
    
    // Extract class names from brackets like "[Мини-сад Пн-Пт  3-4 года-Тодорова Юлия]"
    const bracketMatches = classStr.match(/\[([^\]]+)\]/g)
    if (bracketMatches) {
      return bracketMatches.map(match => match.replace(/[\[\]]/g, '').trim())
    }
    
    // Split by comma if no brackets
    return classStr.split(',').map(c => c.trim()).filter(Boolean)
  }

  const findClassByName = (className: string): string | null => {
    if (!className) return null
    
    // Try exact match first
    const exactMatch = classes.find(c => c.name === className)
    if (exactMatch) return exactMatch.id
    
    // Try partial match - extract key words from CSV class name
    const csvLower = className.toLowerCase()
    const keyWords = csvLower.split(/[\s\-,\/]+/).filter(w => w.length > 2)
    
    // Try to find class by matching key words
    for (const cls of classes) {
      const dbNameLower = cls.name.toLowerCase()
      // Check if most key words are present in database class name
      const matches = keyWords.filter(word => dbNameLower.includes(word))
      if (matches.length >= Math.min(2, keyWords.length)) {
        return cls.id
      }
    }
    
    return null
  }

  const handleMappingChange = (csvHeader: string, dbField: string) => {
    const newMapping = { ...fieldMapping, [csvHeader]: dbField }
    setFieldMapping(newMapping)
    generatePreview(csvHeaders, csvData, newMapping)
  }

  const handleImport = async () => {
    if (csvData.length === 0) return

    setImporting(true)
    try {
      const studentsToImport: Array<{
        student_first_name: string
        student_last_name: string
        student_date_of_birth: string | null
        parent_first_name: string
        parent_middle_name: string | null
        phone: string
        email: string | null
        status: string
        comment: string | null
        enrolled_class_ids: string[]
        interested_class_ids: string[]
      }> = []

      csvData.forEach((row) => {
        const student: {
          student_first_name: string
          student_last_name: string
          student_date_of_birth: string | null
          parent_first_name: string
          parent_middle_name: string | null
          phone: string
          email: string | null
          status: string
          comment: string | null
          enrolled_class_ids: string[]
          interested_class_ids: string[]
        } = {
          student_first_name: '',
          student_last_name: '',
          student_date_of_birth: null,
          parent_first_name: '',
          parent_middle_name: null,
          phone: '',
          email: null,
          status: 'active',
          comment: null,
          enrolled_class_ids: [],
          interested_class_ids: [],
        }

        csvHeaders.forEach((header, index) => {
          const dbField = fieldMapping[header]
          if (dbField && dbField !== 'skip' && row[index] !== undefined) {
            let value: string | null = row[index]?.trim() || ''
            
            if (dbField === 'student_date_of_birth') {
              value = value ? convertDate(value) : '2099-01-01'
            } else if (dbField === 'enrolled_classes' && value) {
              const classNames = parseClasses(value)
              const classIds = classNames
                .map(name => findClassByName(name))
                .filter((id): id is string => Boolean(id))
              student.enrolled_class_ids = classIds
              return
            } else if (dbField === 'interested_classes' && value) {
              const classNames = parseClasses(value)
              const classIds = classNames
                .map(name => findClassByName(name))
                .filter((id): id is string => Boolean(id))
              student.interested_class_ids = classIds
              return
            } else if (dbField === 'phone' && value) {
              // Normalize phone number - remove spaces, keep + if present
              value = value.replace(/\s/g, '')
              // If starts with 0, can optionally convert to +380
              if (value.startsWith('0') && value.length === 10) {
                value = '+380' + value.substring(1)
              }
            } else if (dbField === 'email' && !value) {
              value = null
            } else if (dbField === 'parent_middle_name' && !value) {
              value = null
            } else if (dbField === 'comment' && !value) {
              value = null
            }
            
            ;(student as Record<string, string | string[] | null>)[dbField] = value
          }
        })

        // Handle case where student name might be in one field (split by space)
        // If we have student_first_name but it contains both first and last name
        if (student.student_first_name && !student.student_last_name) {
          const nameParts = student.student_first_name.trim().split(/\s+/)
          if (nameParts.length > 1) {
            student.student_first_name = nameParts[0]
            student.student_last_name = nameParts.slice(1).join(' ')
          }
        }
        
        // Skip rows with no student name at all
        if (!student.student_first_name && !student.student_last_name) {
          return
        }

        // Only import if we have at least first name or last name
        if (student.student_first_name || student.student_last_name) {
          studentsToImport.push(student)
        }
      })

      await onImport(studentsToImport)
    } catch (error) {
      console.error('Error importing:', error)
      alert('Помилка імпорту')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Виберіть CSV файл
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          Підтримується формат CSV з роздільником &quot;;&quot;
        </p>
      </div>

      {csvHeaders.length > 0 && (
        <>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Зіставлення полів
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
              {csvHeaders.map((header) => (
                <div key={header} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-48 truncate" title={header}>
                    {header}:
                  </span>
                  <Select
                    value={fieldMapping[header] || 'skip'}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    className="flex-1"
                  >
                    {dbFields.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {previewData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Попередній перегляд (перші 5 рядків)
              </h3>
              <div className="border rounded overflow-x-auto max-h-64">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Ім&apos;я</th>
                      <th className="px-2 py-1 text-left">Прізвище</th>
                      <th className="px-2 py-1 text-left">Дата народження</th>
                      <th className="px-2 py-1 text-left">Батьки</th>
                      <th className="px-2 py-1 text-left">Телефон</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-1">{row.student_first_name || '-'}</td>
                        <td className="px-2 py-1">{row.student_last_name || '-'}</td>
                        <td className="px-2 py-1">{row.student_date_of_birth || '-'}</td>
                        <td className="px-2 py-1">{row.parent_first_name || '-'}</td>
                        <td className="px-2 py-1">{row.phone || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Скасувати
            </Button>
            <Button
              variant="success"
              onClick={handleImport}
              disabled={importing || csvData.length === 0}
            >
              {importing ? 'Імпорт...' : `Імпортувати ${csvData.length} студентів`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

