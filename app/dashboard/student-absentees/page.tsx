'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatAge, formatDate } from '@/lib/utils'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

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
  consecutive_absences: number
}

export default function StudentAbsenteesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
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
  const [tempDateRangeStart, setTempDateRangeStart] = useState(() => {
    const date = new Date()
    date.setMonth(0)
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [tempDateRangeEnd, setTempDateRangeEnd] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [classFilter, setClassFilter] = useState<string>('all')
  const [minAgeYears, setMinAgeYears] = useState('')
  const [minAgeMonths, setMinAgeMonths] = useState('')
  const [maxAgeYears, setMaxAgeYears] = useState('')
  const [maxAgeMonths, setMaxAgeMonths] = useState('')
  const [sortBy, setSortBy] = useState<string>('student_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Helper to detect UUID-like strings (to avoid rendering raw IDs)
  const isUUIDLike = (str: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
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
      interface StudentPresence {
        student_id: string
        attendance_id: string
        status: string
      }
      let presences: StudentPresence[] = []
      if (attendanceIds.length > 0) {
        const { data: presencesData } = await supabase
          .from('student_presences')
          .select('student_id, attendance_id, status')
          .in('attendance_id', attendanceIds)
        presences = presencesData || []
      }

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

        if (studentAttendances.length === 0) continue

        // Get presences for this student
        const studentPresences = presences.filter(p => 
          p.student_id === student.id
        )

        // Calculate total absences and consecutive absences
        // Sort attendances by date to calculate consecutive absences
        const sortedAttendances = [...studentAttendances].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        let totalAbsences = 0
        let lastAttendanceDate: string | null = null
        let maxConsecutiveAbsences = 0
        let currentConsecutiveAbsences = 0

        for (const attendance of sortedAttendances) {
          const presence = studentPresences.find(p => p.attendance_id === attendance.id)
          const isAbsent = !presence || 
            presence.status === 'absent' || 
            presence.status === 'absent with valid reason'

          if (isAbsent) {
            // No presence record = absent
            totalAbsences++
            currentConsecutiveAbsences++
            maxConsecutiveAbsences = Math.max(maxConsecutiveAbsences, currentConsecutiveAbsences)
          } else if (presence.status === 'present') {
            // Student was present, reset consecutive counter and update last attendance date
            currentConsecutiveAbsences = 0
            if (!lastAttendanceDate || attendance.date > lastAttendanceDate) {
              lastAttendanceDate = attendance.date
            }
          }
        }

        // Only include if student has absences
        if (totalAbsences > 0) {
          const enrolledClasses = enrolledClassIds
            .map((raw: string) => {
              const match = classes.find(c => c.id === raw)
              if (match) return match.name
              // Some records may store literal class names; include them if not UUID-like
              return isUUIDLike(raw) ? null : raw
            })
            .filter((name: string | null): name is string => Boolean(name))

          absenteeList.push({
            ...student,
            enrolled_classes: enrolledClasses,
            last_attendance_date: lastAttendanceDate,
            total_absences: totalAbsences,
            consecutive_absences: maxConsecutiveAbsences,
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

  // Sync temp dates with actual dates when they change externally
  useEffect(() => {
    setTempDateRangeStart(dateRangeStart)
  }, [dateRangeStart])

  useEffect(() => {
    setTempDateRangeEnd(dateRangeEnd)
  }, [dateRangeEnd])

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      searchTerm === '' ||
      `${student.student_first_name} ${student.student_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${student.parent_first_name} ${student.parent_middle_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.phone.includes(searchTerm) ||
      (student.email && student.email.toLowerCase().includes(searchTerm.toLowerCase()))

    // Age filter - convert years and months to total months for comparison
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
    
    let matchesAgeRange = true
    if (hasMinAge) {
      const minTotalMonths = (minAgeYears ? parseInt(minAgeYears) || 0 : 0) * 12 + (minAgeMonths ? parseInt(minAgeMonths) || 0 : 0)
      matchesAgeRange = matchesAgeRange && totalMonths >= minTotalMonths
    }
    if (hasMaxAge) {
      const maxTotalMonths = (maxAgeYears ? parseInt(maxAgeYears) || 0 : 0) * 12 + (maxAgeMonths ? parseInt(maxAgeMonths) || 0 : 0)
      matchesAgeRange = matchesAgeRange && totalMonths <= maxTotalMonths
    }

    return matchesSearch && matchesAgeRange
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
    } else if (sortBy === 'consecutive_absences') {
      aValue = a.consecutive_absences
      bValue = b.consecutive_absences
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

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('studentAbsentees.student'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('studentAbsentees.parent'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('studentAbsentees.phone'), accessor: (row) => row.phone },
      { header: t('studentAbsentees.enrolledClasses'), accessor: (row) => row.enrolled_classes.join(', ') || '-' },
      { header: t('studentAbsentees.lastAttendance'), accessor: (row) => row.last_attendance_date ? formatDate(row.last_attendance_date) : t('common.no') },
    ]
    exportToXLS(sortedStudents, columns, 'student-absentees')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('studentAbsentees.student'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('studentAbsentees.parent'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('studentAbsentees.phone'), accessor: (row) => row.phone },
      { header: t('studentAbsentees.enrolledClasses'), accessor: (row) => row.enrolled_classes.join(', ') || '-' },
      { header: t('studentAbsentees.lastAttendance'), accessor: (row) => row.last_attendance_date ? formatDate(row.last_attendance_date) : t('common.no') },
    ]
    exportToCSV(sortedStudents, columns, 'student-absentees')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('studentAbsentees.title')}</h1>
        {isOwner && (
          <ExportButton 
            onExportXLS={handleExportXLS}
            onExportCSV={handleExportCSV}
            disabled={sortedStudents.length === 0}
          />
        )}
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
              value={tempDateRangeStart}
              onChange={(e) => setTempDateRangeStart(e.target.value)}
              onBlur={(e) => {
                if (e.target.value) {
                  setDateRangeStart(e.target.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tempDateRangeStart) {
                  setDateRangeStart(tempDateRangeStart)
                  e.currentTarget.blur()
                }
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата до
            </label>
            <Input
              type="date"
              value={tempDateRangeEnd}
              onChange={(e) => setTempDateRangeEnd(e.target.value)}
              onBlur={(e) => {
                if (e.target.value) {
                  setDateRangeEnd(e.target.value)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tempDateRangeEnd) {
                  setDateRangeEnd(tempDateRangeEnd)
                  e.currentTarget.blur()
                }
              }}
            />
          </div>
        </div>
        <div className="flex gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Вік від
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
              Вік до
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                  onClick={() => {
                    if (sortBy === 'student_name') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortBy('student_name')
                      setSortOrder('asc')
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    Студент
                    {sortBy === 'student_name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none"
                  onClick={() => {
                    if (sortBy === 'age') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortBy('age')
                      setSortOrder('asc')
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    Вік
                    {sortBy === 'age' ? (
                      sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
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
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none"
                  onClick={() => {
                    if (sortBy === 'last_attendance') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortBy('last_attendance')
                      setSortOrder('asc')
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    Остання відвідуваність
                    {sortBy === 'last_attendance' ? (
                      sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 select-none"
                  onClick={() => {
                    if (sortBy === 'consecutive_absences') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortBy('consecutive_absences')
                      setSortOrder('asc')
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    Пропуски підряд
                    {sortBy === 'consecutive_absences' ? (
                      sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedStudents.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium sticky left-0 bg-white z-10">
                    {student.student_first_name} {student.student_last_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatAge(student.student_date_of_birth, t('common.yearsShort'), t('common.monthsShort'))}
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
                      student.consecutive_absences === 0 ? 'bg-yellow-100 text-yellow-800' :
                      student.consecutive_absences <= 3 ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {student.consecutive_absences}
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
