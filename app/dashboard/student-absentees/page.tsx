'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatAge, formatDate } from '@/lib/utils'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

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
      let allActiveStudents: Student[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error: studentsError } = await supabase
          .from('students')
          .select('*')
          .eq('status', 'active')
          .range(from, from + batchSize - 1)

        if (studentsError) throw studentsError

        if (data && data.length > 0) {
          allActiveStudents = [...allActiveStudents, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      const activeStudents = allActiveStudents

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

  // Column definitions for DataTable
  const columns: ColumnDef<AbsenteeData>[] = useMemo(() => [
    {
      id: 'student_name',
      header: 'Студент',
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = `${rowA.original.student_first_name} ${rowA.original.student_last_name}`
        const b = `${rowB.original.student_first_name} ${rowB.original.student_last_name}`
        return a.localeCompare(b, 'uk')
      },
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">
          {row.original.student_first_name} {row.original.student_last_name}
        </div>
      ),
    },
    {
      id: 'age',
      header: 'Вік',
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = new Date(rowA.original.student_date_of_birth).getTime()
        const b = new Date(rowB.original.student_date_of_birth).getTime()
        return a - b
      },
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {formatAge(row.original.student_date_of_birth, t('common.yearsShort'), t('common.monthsShort'))}
        </div>
      ),
    },
    {
      id: 'parent_name',
      header: 'Батьки',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.parent_first_name} {row.original.parent_middle_name || ''}
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Телефон',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.phone}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.email || '-'}</div>
      ),
    },
    {
      id: 'enrolled_classes',
      header: 'Зареєстровані класи',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.enrolled_classes.length > 0
            ? row.original.enrolled_classes.join(', ')
            : '-'}
        </div>
      ),
    },
    {
      id: 'last_attendance',
      header: 'Остання відвідуваність',
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.last_attendance_date ? new Date(rowA.original.last_attendance_date).getTime() : 0
        const b = rowB.original.last_attendance_date ? new Date(rowB.original.last_attendance_date).getTime() : 0
        return a - b
      },
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.last_attendance_date ? formatDate(row.original.last_attendance_date) : 'Ніколи'}
        </div>
      ),
    },
    {
      accessorKey: 'consecutive_absences',
      header: 'Пропуски підряд',
      enableSorting: true,
      cell: ({ row }) => (
        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
          row.original.consecutive_absences === 0 ? 'bg-yellow-100 text-yellow-800' :
          row.original.consecutive_absences <= 3 ? 'bg-orange-100 text-orange-800' :
          'bg-red-100 text-red-800'
        }`}>
          {row.original.consecutive_absences}
        </span>
      ),
    },
  ], [t])

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('studentAbsentees.student'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('studentAbsentees.parent'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('studentAbsentees.phone'), accessor: (row) => row.phone },
      { header: t('studentAbsentees.enrolledClasses'), accessor: (row) => row.enrolled_classes.join(', ') || '-' },
      { header: t('studentAbsentees.lastAttendance'), accessor: (row) => row.last_attendance_date ? formatDate(row.last_attendance_date) : t('common.no') },
    ]
    exportToXLS(filteredStudents, columns, 'student-absentees')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('studentAbsentees.student'), accessor: (row) => `${row.student_first_name} ${row.student_last_name}` },
      { header: t('studentAbsentees.parent'), accessor: (row) => `${row.parent_first_name} ${row.parent_middle_name || ''}`.trim() },
      { header: t('studentAbsentees.phone'), accessor: (row) => row.phone },
      { header: t('studentAbsentees.enrolledClasses'), accessor: (row) => row.enrolled_classes.join(', ') || '-' },
      { header: t('studentAbsentees.lastAttendance'), accessor: (row) => row.last_attendance_date ? formatDate(row.last_attendance_date) : t('common.no') },
    ]
    exportToCSV(filteredStudents, columns, 'student-absentees')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('studentAbsentees.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredStudents.length === 0}
            />
          )}
        </div>
      </div>

      {/* Date Range and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="w-full"
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
              className="w-full"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за ім'ям, батьком, телефоном або email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
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
      <DataTable
        columns={columns}
        data={filteredStudents}
        initialPageSize={10}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />
    </div>
  )
}
