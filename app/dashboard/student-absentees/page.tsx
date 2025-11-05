'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { calculateAge, formatDate } from '@/lib/utils'
import { Search } from 'lucide-react'

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
  student_date_of_birth: string
  parent_first_name: string
  parent_middle_name: string | null
  phone: string
  email: string | null
  enrolled_class_ids: string[]
}

interface Class {
  id: string
  name: string
}

interface AbsenteeData extends Student {
  enrolled_classes: string[]
  last_attendance_date: string | null
  total_absences: number
}

export default function StudentAbsenteesPage() {
  const supabase = createClient()
  const [students, setStudents] = useState<AbsenteeData[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRangeStart, setDateRangeStart] = useState(() => {
    const date = new Date()
    date.setMonth(0)
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [dateRangeEnd, setDateRangeEnd] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [classFilter, setClassFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('student_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const fetchAbsentees = useCallback(async () => {
    setLoading(true)
    try {
      // Get all active students
      const { data: activeStudents, error: studentsError } = await supabase
        .from('students')
        .select('*')
        .eq('status', 'active')

      if (studentsError) throw studentsError

      if (!activeStudents) {
        setStudents([])
        setLoading(false)
        return
      }

      // Get attendances in date range
      const { data: attendances, error: attendancesError } = await supabase
        .from('attendances')
        .select('id, date, class_id')
        .gte('date', dateRangeStart)
        .lte('date', dateRangeEnd)

      if (attendancesError) throw attendancesError

      const attendanceIds = attendances?.map(a => a.id) || []
      const classIdsInRange = [...new Set(attendances?.map(a => a.class_id) || [])]

      // Get student presences for these attendances
      const { data: presences } = await supabase
        .from('student_presences')
        .select('student_id, attendance_id, status')
        .in('attendance_id', attendanceIds.length > 0 ? attendanceIds : [''])

      // Build absence data
      const absenteeList: AbsenteeData[] = []

      for (const student of activeStudents) {
        // Check if student has enrolled classes
        const enrolledClassIds = student.enrolled_class_ids || []
        
        // Only show if student is enrolled in classes that had attendances in range
        const hasRelevantClasses = enrolledClassIds.some((id: string) => classIdsInRange.includes(id))
        if (!hasRelevantClasses && classIdsInRange.length > 0) continue

        // Get all attendances for this student's classes
        const studentAttendances = attendances?.filter(a => 
          enrolledClassIds.includes(a.class_id)
        ) || []

        // Get presences for this student
        const studentPresences = presences?.filter(p => 
          p.student_id === student.id
        ) || []

        // Check if student has any presences (attended any class)
        const hasAnyPresence = studentPresences.length > 0

        // Calculate total absences (attendances without presence)
        let totalAbsences = 0
        let lastAttendanceDate: string | null = null

        for (const attendance of studentAttendances) {
          const hasPresence = studentPresences.some(p => p.attendance_id === attendance.id)
          if (!hasPresence) {
            totalAbsences++
          } else {
            // Find the latest attendance date
            const presence = studentPresences.find(p => p.attendance_id === attendance.id)
            if (presence && (!lastAttendanceDate || attendance.date > lastAttendanceDate)) {
              lastAttendanceDate = attendance.date
            }
          }
        }

        // Only include if student has absences or never attended
        if (totalAbsences > 0 || !hasAnyPresence) {
          const enrolledClasses = enrolledClassIds
            .map((id: string) => classes.find(c => c.id === id)?.name || id)
            .filter((name: string) => name !== undefined)

          absenteeList.push({
            ...student,
            enrolled_classes: enrolledClasses,
            last_attendance_date: lastAttendanceDate,
            total_absences: totalAbsences,
          })
        }
      }

      // Apply class filter
      let filtered = absenteeList
      if (classFilter !== 'all') {
        filtered = absenteeList.filter(s => 
          s.enrolled_class_ids.includes(classFilter)
        )
      }

      setStudents(filtered)
    } catch (error) {
      console.error('Error fetching absentees:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, dateRangeStart, dateRangeEnd, classFilter, classes])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  useEffect(() => {
    if (dateRangeStart && dateRangeEnd) {
      fetchAbsentees()
    }
  }, [dateRangeStart, dateRangeEnd, classFilter, fetchAbsentees])

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      searchTerm === '' ||
      `${student.student_first_name} ${student.student_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${student.parent_first_name} ${student.parent_middle_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.phone.includes(searchTerm) ||
      (student.email && student.email.toLowerCase().includes(searchTerm.toLowerCase()))

    return matchesSearch
  })

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let aValue: string | number | null
    let bValue: string | number | null

    if (sortBy === 'student_name') {
      aValue = `${a.student_first_name} ${a.student_last_name}`
      bValue = `${b.student_first_name} ${b.student_last_name}`
    } else if (sortBy === 'age') {
      aValue = new Date(a.student_date_of_birth).getTime()
      bValue = new Date(b.student_date_of_birth).getTime()
    } else if (sortBy === 'last_attendance') {
      aValue = a.last_attendance_date ? new Date(a.last_attendance_date).getTime() : 0
      bValue = b.last_attendance_date ? new Date(b.last_attendance_date).getTime() : 0
    } else if (sortBy === 'total_absences') {
      aValue = a.total_absences
      bValue = b.total_absences
    } else {
      return 0
    }

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

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Відсутні студенти</h1>
      </div>

      {/* Date Range and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата від
            </label>
            <Input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата до
            </label>
            <Input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за ім'ям, батьком, телефоном або email..."
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
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium">Сортувати за:</label>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-48"
          >
            <option value="student_name">Ім&apos;ям студента</option>
            <option value="age">Віком</option>
            <option value="last_attendance">Датою останньої відвідуваності</option>
            <option value="total_absences">Кількістю пропусків</option>
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
                  Студент
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
                  Зареєстровані класи
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Остання відвідуваність
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Загальна кількість пропусків
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
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
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.enrolled_classes.length > 0
                      ? student.enrolled_classes.join(', ')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {student.last_attendance_date ? formatDate(student.last_attendance_date) : 'Ніколи'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      student.total_absences === 0 ? 'bg-yellow-100 text-yellow-800' :
                      student.total_absences <= 3 ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {student.total_absences}
                    </span>
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
    </div>
  )
}
