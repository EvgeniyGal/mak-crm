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
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [stats, setStats] = useState<AttendanceStats>({})
  const [attendanceStudents, setAttendanceStudents] = useState<Record<string, Array<{ name: string; status: string }>>>({})
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null)
  const [selectedClassStudents, setSelectedClassStudents] = useState<Student[]>([])
  const [studentAvailableLessons, setStudentAvailableLessons] = useState<Record<string, number>>({})
  const [createPaymentModalOpen, setCreatePaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState<{ student_id: string; class_id: string; package_type_id: string; status: string; type: string }>({
    student_id: '',
    class_id: '',
    package_type_id: '',
    status: 'paid',
    type: 'cash',
  })
  const [classPackageTypes, setClassPackageTypes] = useState<Array<{ id: string; name: string; lesson_count: number; amount: number }>>([])
  const [studentPresences, setStudentPresences] = useState<Record<string, { status: string; comment: string }>>({})
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
  const [courseSchedules, setCourseSchedules] = useState<Array<{ id: string; week_day: number; time_slot: string }>>([])
  const [availableDates, setAvailableDates] = useState<Array<{ value: string; label: string }>>([])

  const fetchAttendances = useCallback(async () => {
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
  }, [supabase])

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, student_ids')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }, [supabase])

  const fetchAllStats = useCallback(async () => {
    const newStats: AttendanceStats = {}
    const newAttendanceStudents: Record<string, Array<{ name: string; status: string }>> = {}
    
    for (const attendance of attendances) {
      const { data } = await supabase
        .from('student_presences')
        .select('student_id, status')
        .eq('attendance_id', attendance.id)

      if (data) {
        newStats[attendance.id] = {
          present: data.filter(p => p.status === 'present').length,
          absent: data.filter(p => p.status === 'absent').length,
          validReason: data.filter(p => p.status === 'absent with valid reason').length,
        }
        
        // Get student names for this attendance
        const studentList: Array<{ name: string; status: string }> = []
        data.forEach((presence) => {
          const student = students.find(s => s.id === presence.student_id)
          if (student) {
            studentList.push({
              name: `${student.student_first_name} ${student.student_last_name}`,
              status: presence.status
            })
          }
        })
        newAttendanceStudents[attendance.id] = studentList
      }
    }
    setStats(newStats)
    setAttendanceStudents(newAttendanceStudents)
  }, [supabase, attendances, students])

  useEffect(() => {
    fetchAttendances()
    fetchClasses()
    fetchStudents()
  }, [fetchAttendances, fetchClasses, fetchStudents])

  useEffect(() => {
    if (attendances.length > 0) {
      fetchAllStats()
    }
  }, [attendances, fetchAllStats])

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

  // This function is no longer needed - we use student_class_lessons instead
  // Keeping it commented out in case it's referenced elsewhere, but it should be removed
  // const checkStudentPayment = async (studentId: string, classId: string) => {
  //   // Deprecated - use getStudentLessonsForClass instead
  //   return null
  // }

  const getStudentLessonsForClass = async (studentId: string, classId: string) => {
    try {
      // Get student_class_lessons record for this student and class
      const { data: lessonRecord, error } = await supabase
        .from('student_class_lessons')
        .select('id, lesson_count')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .single()
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
        console.error('Error fetching student_class_lessons:', error)
        return null
      }
      
      if (!lessonRecord) {
        // If record doesn't exist, create it with 0 lessons
        const { data: newRecord, error: insertError } = await supabase
          .from('student_class_lessons')
          .insert({
            student_id: studentId,
            class_id: classId,
            lesson_count: 0
          })
          .select()
          .single()
        
        if (insertError) {
          console.error('Error creating student_class_lessons record:', insertError)
          return null
        }
        
        return {
          id: newRecord.id,
          lesson_count: newRecord.lesson_count
        }
      }
      
      return {
        id: lessonRecord.id,
        lesson_count: lessonRecord.lesson_count
      }
    } catch (error) {
      console.error('Error in getStudentLessonsForClass:', error)
      return null
    }
  }

  const refreshStudentLessons = async (classId: string) => {
    if (!classId) return
    
    const selectedClass = classes.find(c => c.id === classId)
    if (!selectedClass) return

    const classStudents = students.filter(s => selectedClass.student_ids.includes(s.id))
    const lessonsMap: Record<string, number> = {}
    for (const student of classStudents) {
      const lessonRecord = await getStudentLessonsForClass(student.id, classId)
      const lessonCount = lessonRecord?.lesson_count ?? 0
      console.log(`Refreshing student ${student.id}: found ${lessonCount} lessons`)
      lessonsMap[student.id] = lessonCount
    }
    console.log('Updated lessons map:', lessonsMap)
    setStudentAvailableLessons(prev => {
      const updated = { ...prev, ...lessonsMap }
      console.log('Final lessons map:', updated)
      return updated
    })
  }

  // Generate dates from previous week to current date based on schedule week_day
  // Excludes dates that already have attendance
  const generateAvailableDates = (
    schedules: Array<{ week_day: number }>, 
    existingDate?: string,
    existingAttendanceDates?: Set<string>
  ): Array<{ value: string; label: string }> => {
    if (schedules.length === 0) {
      // If no schedules but editing with existing date, include that date
      if (existingDate) {
        return [{ value: existingDate, label: formatDate(existingDate) }]
      }
      return []
    }

    const today = new Date()
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    
    // Start from 7 days ago (previous week)
    const startDate = new Date(currentDate)
    startDate.setDate(startDate.getDate() - 7)
    
    const dates: Array<{ value: string; label: string }> = []
    const dateSet = new Set<string>() // To avoid duplicates
    const excludedDates = existingAttendanceDates || new Set<string>()
    
    // Get unique week_days from schedules
    const weekDays = [...new Set(schedules.map(s => s.week_day))]
    
    // If editing and existing date is provided, add it first (even if outside range)
    if (existingDate && !dateSet.has(existingDate)) {
      dateSet.add(existingDate)
      dates.push({ value: existingDate, label: formatDate(existingDate) })
    }
    
    // Iterate from startDate to currentDate
    const current = new Date(startDate)
    while (current <= currentDate) {
      // JavaScript getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      // Database week_day: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
      // Convert: week_day = (jsDay === 0 ? 6 : jsDay - 1)
      const jsDay = current.getDay()
      const weekDay = jsDay === 0 ? 6 : jsDay - 1
      
      // Check if this day matches any schedule's week_day
      if (weekDays.includes(weekDay)) {
        const dateStr = current.toISOString().split('T')[0]
        
        // Only add if:
        // 1. Not already in the set (avoid duplicates)
        // 2. Not already has attendance (unless it's the date being edited)
        if (!dateSet.has(dateStr) && !excludedDates.has(dateStr)) {
          dateSet.add(dateStr)
          const formattedDate = formatDate(dateStr)
          dates.push({ value: dateStr, label: formattedDate })
        }
      }
      
      current.setDate(current.getDate() + 1)
    }
    
    // Sort dates in descending order (most recent first)
    return dates.sort((a, b) => b.value.localeCompare(a.value))
  }

  const fetchCourseSchedules = async (classId: string, existingDate?: string, editingAttendanceId?: string) => {
    try {
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('schedules')
        .select('id, week_day, time_slot')
        .eq('class_id', classId)
      
      if (schedulesError) throw schedulesError
      const schedules = schedulesData || []
      setCourseSchedules(schedules)
      
      // Fetch existing attendances for this class to exclude those dates
      const today = new Date()
      const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const startDate = new Date(currentDate)
      startDate.setDate(startDate.getDate() - 7)
      
      const { data: existingAttendances, error: attendancesError } = await supabase
        .from('attendances')
        .select('id, date')
        .eq('class_id', classId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', currentDate.toISOString().split('T')[0])
      
      if (attendancesError) throw attendancesError
      
      // Get dates that already have attendance (exclude the one being edited)
      const existingAttendanceDates = new Set(
        (existingAttendances || [])
          .filter(a => !editingAttendanceId || a.id !== editingAttendanceId)
          .map(a => a.date)
      )
      
      // Generate available dates based on schedules, excluding existing attendances
      const dates = generateAvailableDates(schedules, existingDate, existingAttendanceDates)
      setAvailableDates(dates)
    } catch (error) {
      console.error('Error fetching course schedules:', error)
      setCourseSchedules([])
      setAvailableDates([])
    }
  }

  const handleClassChange = async (classId: string) => {
    const selectedClass = classes.find(c => c.id === classId)
    if (!selectedClass) {
      setSelectedClassStudents([])
      setCourseSchedules([])
      setAvailableDates([])
      setFormData({ ...formData, date: '' })
      return
    }

    // Fetch schedules for this course first (for new attendance, no existing date or editing id)
    await fetchCourseSchedules(classId, undefined, editingAttendance?.id)

    const classStudents = students.filter(s => selectedClass.student_ids.includes(s.id))
    setSelectedClassStudents(classStudents)

    // Fetch available lessons per student for this class and initialize presences
    const presences: Record<string, { status: string; comment: string }> = {}
    const lessonsMap: Record<string, number> = {}
    for (const student of classStudents) {
      const lessonRecord = await getStudentLessonsForClass(student.id, classId)
      lessonsMap[student.id] = lessonRecord?.lesson_count ?? 0
      presences[student.id] = { status: 'present', comment: '' }
    }
    setStudentAvailableLessons(lessonsMap)
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

        // Restore lesson counts in student_class_lessons
        if (oldPresences) {
          for (const presence of oldPresences) {
            if (presence.status !== 'absent with valid reason') {
              const lessonRecord = await getStudentLessonsForClass(presence.student_id, editingAttendance.class_id)
              if (lessonRecord) {
                await supabase
                  .from('student_class_lessons')
                  .update({
                    lesson_count: lessonRecord.lesson_count + 1
                  })
                  .eq('id', lessonRecord.id)
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

      // Create student presences and update student_class_lessons
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

        // Update student_class_lessons lesson_count (decrement for present/absent, not for absent with valid reason)
        if (presence.status !== 'absent with valid reason') {
          const lessonRecord = await getStudentLessonsForClass(studentId, formData.class_id)
          if (lessonRecord) {
            const newLessonCount = Math.max(0, lessonRecord.lesson_count - 1)
            await supabase
              .from('student_class_lessons')
              .update({
                lesson_count: newLessonCount
              })
              .eq('id', lessonRecord.id)
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
      // Fetch schedules for this course, including existing date and editing attendance id
      await fetchCourseSchedules(attendance.class_id, attendance.date, attendance.id)
      
      const classStudents = students.filter(s => selectedClass.student_ids.includes(s.id))
      setSelectedClassStudents(classStudents)
      await fetchStudentPresences(attendance.id)
    }

    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цю відвідуваність? Це також змінить кількість доступних уроків.')) return

    try {
      // Get attendance to get class_id
      const { data: attendance } = await supabase
        .from('attendances')
        .select('class_id')
        .eq('id', id)
        .single()

      if (!attendance) return

      // Get presences before deleting
      const { data: presences } = await supabase
        .from('student_presences')
        .select('student_id, status')
        .eq('attendance_id', id)

      // Restore lesson counts in student_class_lessons
      if (presences) {
        for (const presence of presences) {
          if (presence.status !== 'absent with valid reason') {
            const lessonRecord = await getStudentLessonsForClass(presence.student_id, attendance.class_id)
            if (lessonRecord) {
              await supabase
                .from('student_class_lessons')
                .update({
                  lesson_count: lessonRecord.lesson_count + 1
                })
                .eq('id', lessonRecord.id)
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
    setCourseSchedules([])
    setAvailableDates([])
  }

  const filteredAttendances = attendances.filter((attendance) => {
    // Check if search term matches date or class name
    const matchesDateOrClass =
      searchTerm === '' ||
      formatDate(attendance.date).includes(searchTerm) ||
      classes.find(c => c.id === attendance.class_id)?.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Check if search term matches any student name in this attendance
    const studentsList = attendanceStudents[attendance.id] || []
    const matchesStudent = searchTerm === '' || 
      studentsList.some(student => 
        student.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    
    const matchesSearch = matchesDateOrClass || matchesStudent

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

  const getClassName = (classId: string) => {
    return classes.find(c => c.id === classId)?.name || classId
  }

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('attendances.class'), accessor: (row) => getClassName(row.class_id) },
      { header: t('attendances.date'), accessor: (row) => formatDate(row.date) },
      { 
        header: 'Студенти', 
        accessor: (row) => {
          const studentsList = attendanceStudents[row.id] || []
          return studentsList.map(s => `${s.name} (${s.status === 'present' ? 'Присутній' : s.status === 'absent' ? 'Відсутній' : 'Поважна причина'})`).join('; ')
        }
      },
      { header: t('classAttendances.totalPresent'), accessor: (row) => stats[row.id]?.present || 0 },
      { header: t('classAttendances.totalAbsent'), accessor: (row) => stats[row.id]?.absent || 0 },
      { header: t('classAttendances.totalValidReason'), accessor: (row) => stats[row.id]?.validReason || 0 },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredAttendances, columns, 'attendances')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('attendances.class'), accessor: (row) => getClassName(row.class_id) },
      { header: t('attendances.date'), accessor: (row) => formatDate(row.date) },
      { 
        header: 'Студенти', 
        accessor: (row) => {
          const studentsList = attendanceStudents[row.id] || []
          return studentsList.map(s => `${s.name} (${s.status === 'present' ? 'Присутній' : s.status === 'absent' ? 'Відсутній' : 'Поважна причина'})`).join('; ')
        }
      },
      { header: t('classAttendances.totalPresent'), accessor: (row) => stats[row.id]?.present || 0 },
      { header: t('classAttendances.totalAbsent'), accessor: (row) => stats[row.id]?.absent || 0 },
      { header: t('classAttendances.totalValidReason'), accessor: (row) => stats[row.id]?.validReason || 0 },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredAttendances, columns, 'attendances')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('attendances.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredAttendances.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('attendances.addAttendance')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('attendances.searchPlaceholder')}
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
            <option value="all">{t('common.all')} {t('courses.title')}</option>
            {classes
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="flex gap-4">
          <Input
            type="date"
            placeholder={t('common.from')}
            value={dateRangeStart}
            onChange={(e) => setDateRangeStart(e.target.value)}
            className="w-48"
          />
          <Input
            type="date"
            placeholder={t('common.to')}
            value={dateRangeEnd}
            onChange={(e) => setDateRangeEnd(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">
                  Дата
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Курс
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Студенти
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
                const studentsList = attendanceStudents[attendance.id] || []
                return (
                  <tr key={attendance.id}>
                    <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
                      {formatDate(attendance.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">
                      {className}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-col gap-1 max-w-xs">
                        {studentsList.length > 0 ? (
                          studentsList.map((student, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${
                                student.status === 'present' ? 'bg-green-500' :
                                student.status === 'absent' ? 'bg-red-500' :
                                'bg-yellow-500'
                              }`}></span>
                              <span className="truncate">{student.name}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
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
        title={editingAttendance ? t('attendances.editAttendance') : t('attendances.addAttendance')}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-4">
          <div className="grid grid-cols-2 gap-4 flex-shrink-0">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Курс *
              </label>
              <Select
                value={formData.class_id}
                onChange={(e) => {
                  setFormData({ ...formData, class_id: e.target.value, date: '' })
                  handleClassChange(e.target.value)
                }}
                required
              >
                <option value="">Вибрати курс</option>
                {classes
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('attendances.date')} *
              </label>
              {formData.class_id && availableDates.length > 0 ? (
                <Select
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                >
                  <option value="">Вибрати дату</option>
                  {availableDates.map((date) => (
                    <option key={date.value} value={date.value}>
                      {date.label}
                    </option>
                  ))}
                </Select>
              ) : formData.class_id && availableDates.length === 0 ? (
                <div className="text-sm text-yellow-600 p-2 bg-yellow-50 border border-yellow-200 rounded">
                  Немає доступних дат за розкладом для цього курсу
                </div>
              ) : (
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  disabled
                  placeholder="Спочатку виберіть курс"
                />
              )}
            </div>
          </div>

        {selectedClassStudents.length > 0 ? (
          <div className="flex flex-col flex-1 min-h-0">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('attendances.students')}
            </label>
            <div className="space-y-2 flex-1 overflow-y-auto border rounded p-4">
              {selectedClassStudents.map((student) => (
                <div key={student.id} className="flex items-center gap-4 p-2 border-b">
                  <div className="flex-1">
                    <p className="font-medium">{student.student_first_name} {student.student_last_name}</p>
                    <div className="mt-1 text-sm flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded ${
                        (studentAvailableLessons[student.id] ?? 0) === 0
                          ? 'bg-red-100 text-red-800'
                          : (studentAvailableLessons[student.id] ?? 0) <= 3
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }`}>
                        {t('payments.availableLessons')}: {studentAvailableLessons[student.id] ?? 0}
                      </span>
                      {(studentAvailableLessons[student.id] ?? 0) < 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            // Prefill payment form for this student and selected class
                            setPaymentForm({
                              student_id: student.id,
                              class_id: formData.class_id,
                              package_type_id: '',
                              status: 'paid',
                              type: 'cash',
                            })
                            // Load package types for selected class
                            try {
                              const { data } = await supabase
                                .from('package_types')
                                .select('id, name, lesson_count, amount')
                                .eq('class_id', formData.class_id)
                              setClassPackageTypes((data as { id: string; name: string; lesson_count: number; amount: number }[] | null)?.map(pt => ({ id: pt.id, name: pt.name, lesson_count: pt.lesson_count, amount: pt.amount })) || [])
                            } catch {
                              setClassPackageTypes([])
                            }
                            setCreatePaymentModalOpen(true)
                          }}
                        >
                          {t('payments.addPayment')}
                        </Button>
                      )}
                    </div>
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
                    <option value="present">{t('attendances.present')}</option>
                    <option value="absent">{t('attendances.absent')}</option>
                    <option value="absent with valid reason">{t('attendances.absentValidReason')}</option>
                  </Select>
                  <Input
                    placeholder={t('attendances.comment')}
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
        ) : formData.class_id && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              {t('attendances.noStudents')}
            </p>
          </div>
        )}

          <div className="flex flex-col gap-2 flex-shrink-0 pt-4 border-t">
            {!editingAttendance && selectedClassStudents.length > 0 && selectedClassStudents.some(student => {
              const hasValidReason = studentPresences[student.id]?.status === 'absent with valid reason'
              return !hasValidReason && (studentAvailableLessons[student.id] ?? 0) < 1
            }) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-red-800">
                  {t('attendances.studentsWithoutPayment')}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
                Скасувати
              </Button>
              <Button 
                type="submit" 
                variant={editingAttendance ? "default" : "success"}
                disabled={
                  selectedClassStudents.length === 0 || 
                  (!editingAttendance && selectedClassStudents.some(student => {
                    const hasValidReason = studentPresences[student.id]?.status === 'absent with valid reason'
                    return !hasValidReason && (studentAvailableLessons[student.id] ?? 0) < 1
                  }))
                }
              >
                {editingAttendance ? 'Зберегти зміни' : 'Додати відвідуваність'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Create Payment Modal */}
      <Modal
        isOpen={createPaymentModalOpen}
        onClose={async () => {
          setCreatePaymentModalOpen(false)
          // Small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 100))
          // Refresh payment data when modal closes
          if (formData.class_id) {
            console.log('Modal closed, refreshing payments for class:', formData.class_id)
            await refreshStudentLessons(formData.class_id)
          }
        }}
        title={t('payments.addPayment')}
        size="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              // Validate package type is selected
              if (!paymentForm.package_type_id) {
                alert('Будь ласка, виберіть тип пакету')
                return
              }
              
              // Get package type to get lesson_count
              const { data: pkgData, error: pkgError } = await supabase
                .from('package_types')
                .select('lesson_count')
                .eq('id', paymentForm.package_type_id)
                .single()
              
              if (pkgError) {
                console.error('Error fetching package type:', pkgError)
                // Fallback to local data
                const pkg = classPackageTypes.find(pt => pt.id === paymentForm.package_type_id)
                if (!pkg || !pkg.lesson_count || pkg.lesson_count <= 0) {
                  alert('Будь ласка, виберіть тип пакету з доступними уроками')
                  return
                }
              } else if (!pkgData || !pkgData.lesson_count || pkgData.lesson_count <= 0) {
                alert('Будь ласка, виберіть тип пакету з доступними уроками')
                return
              }
              
              const lessonCount = pkgData?.lesson_count || classPackageTypes.find(pt => pt.id === paymentForm.package_type_id)?.lesson_count || 0
              
              // Create payment (without available_lesson_count)
              // Extract only the fields that exist in the payments table
              // Explicitly create a new object to avoid any property pollution
              const paymentData = {
                student_id: paymentForm.student_id,
                class_id: paymentForm.class_id,
                package_type_id: paymentForm.package_type_id,
                status: paymentForm.status,
                type: paymentForm.type,
              }
              
              // Verify the object doesn't have available_lesson_count
              if ('available_lesson_count' in paymentData) {
                delete (paymentData as any).available_lesson_count
              }
              
              console.log('Creating payment with clean data:', paymentData)
              console.log('Payment data keys:', Object.keys(paymentData))
              
              const { data: newPayment, error } = await supabase
                .from('payments')
                .insert([paymentData])
                .select()
                .single()
              
              if (error) {
                console.error('Error inserting payment:', error)
                throw error
              }
              
              console.log('Payment created:', newPayment)
              
              // Add lessons to student_class_lessons regardless of payment status
              if (lessonCount > 0 && paymentForm.student_id && paymentForm.class_id) {
                // Get or create student_class_lessons record
                const { data: existingRecord, error: fetchError } = await supabase
                  .from('student_class_lessons')
                  .select('id, lesson_count')
                  .eq('student_id', paymentForm.student_id)
                  .eq('class_id', paymentForm.class_id)
                  .single()

                if (fetchError && fetchError.code !== 'PGRST116') {
                  console.error('Error fetching student_class_lessons:', fetchError)
                } else if (existingRecord) {
                  // Update existing record - add lessons
                  const { error: updateError } = await supabase
                    .from('student_class_lessons')
                    .update({
                      lesson_count: existingRecord.lesson_count + lessonCount
                    })
                    .eq('id', existingRecord.id)
                  if (updateError) {
                    console.error('Error updating student_class_lessons:', updateError)
                  }
                } else {
                  // Create new record
                  const { error: insertError } = await supabase
                    .from('student_class_lessons')
                    .insert({
                      student_id: paymentForm.student_id,
                      class_id: paymentForm.class_id,
                      lesson_count: lessonCount
                    })
                  if (insertError) {
                    console.error('Error creating student_class_lessons:', insertError)
                  }
                }
              }
              
              // Refresh all students' lesson data to ensure consistency
              if (formData.class_id) {
                await refreshStudentLessons(formData.class_id)
              }
              
              setCreatePaymentModalOpen(false)
            } catch (error) {
              console.error('Error creating payment:', error)
              alert('Помилка створення платежу: ' + (error instanceof Error ? error.message : String(error)))
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.student')}</label>
              <Select value={paymentForm.student_id} disabled>
                <option value="{paymentForm.student_id}">
                  {students.find(s => s.id === paymentForm.student_id)?.student_first_name} {students.find(s => s.id === paymentForm.student_id)?.student_last_name}
                </option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.class')}</label>
              <Select value={paymentForm.class_id} disabled>
                <option value="{paymentForm.class_id}">{classes.find(c => c.id === paymentForm.class_id)?.name}</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.packageType')}</label>
              <Select
                value={paymentForm.package_type_id}
                onChange={(e) => {
                  setPaymentForm({
                    ...paymentForm,
                    package_type_id: e.target.value,
                  })
                }}
              >
                <option value="">{t('payments.selectPackageType')}</option>
                {classPackageTypes.length === 0 && (
                  <option value="" disabled>
                    {t('payments.selectClassFirst')}
                  </option>
                )}
                {classPackageTypes.map(pt => (
                  <option key={pt.id} value={pt.id}>{pt.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.amount') || 'Сума'}</label>
              <Input
                type="text"
                value={
                  paymentForm.package_type_id
                    ? `${classPackageTypes.find(pt => pt.id === paymentForm.package_type_id)?.amount || 0} грн`
                    : '-'
                }
                readOnly
                disabled
                className="bg-gray-50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.status')}</label>
              <Select value={paymentForm.status} onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value })}>
                <option value="paid">{t('payments.paid')}</option>
                <option value="pending">{t('payments.pending')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.paymentType')}</label>
              <Select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}>
                <option value="cash">{t('payments.cash')}</option>
                <option value="card">{t('payments.card')}</option>
                <option value="free">{t('payments.free')}</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreatePaymentModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="success" disabled={!paymentForm.student_id || !paymentForm.class_id || !paymentForm.package_type_id}>
              {t('payments.addPayment')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
