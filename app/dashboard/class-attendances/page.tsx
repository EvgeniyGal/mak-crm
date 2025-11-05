'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
}

interface AttendanceCell {
  date: string
  status: 'present' | 'absent' | 'absent with valid reason' | 'no class' | null
}

interface StudentAttendance extends Student {
  attendances: AttendanceCell[]
  totalPresent: number
  totalAbsent: number
  totalValidReason: number
}

export default function ClassAttendancesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])
  const [students, setStudents] = useState<StudentAttendance[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('status', 'active')
        .order('name')

      if (error) throw error
      setClasses(data || [])
      if (data && data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id)
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase, selectedClassId])

  const fetchAttendanceData = useCallback(async () => {
    if (!selectedClassId || !selectedMonth) return

    setLoading(true)
    try {
      const [year, month] = selectedMonth.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0)

      // Get class info
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('student_ids')
        .eq('id', selectedClassId)
        .single()

      if (classError) throw classError

      const studentIds = classData?.student_ids || []
      if (studentIds.length === 0) {
        setStudents([])
        setLoading(false)
        return
      }

      // Get students
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')
        .in('id', studentIds)

      if (studentsError) throw studentsError

      // Get attendances for this class in the month
      const { data: attendances, error: attendancesError } = await supabase
        .from('attendances')
        .select('id, date')
        .eq('class_id', selectedClassId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])

      if (attendancesError) throw attendancesError

      const attendanceIds = attendances?.map(a => a.id) || []

      // Get student presences
      const { data: presences, error: presencesError } = await supabase
        .from('student_presences')
        .select('student_id, attendance_id, status')
        .in('attendance_id', attendanceIds.length > 0 ? attendanceIds : [''])

      if (presencesError) throw presencesError

      // Build calendar days
      const daysInMonth = endDate.getDate()
      const days: string[] = []
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month - 1, i).toISOString().split('T')[0])
      }

      // Build attendance data for each student
      const studentAttendanceList: StudentAttendance[] = []

      if (studentsData) {
        for (const student of studentsData) {
          const attendanceCells: AttendanceCell[] = []
          let totalPresent = 0
          let totalAbsent = 0
          let totalValidReason = 0

          for (const day of days) {
            const attendance = attendances?.find(a => a.date === day)
            
            if (!attendance) {
              attendanceCells.push({ date: day, status: 'no class' })
            } else {
              const presence = presences?.find(p => 
                p.student_id === student.id && p.attendance_id === attendance.id
              )

              if (!presence) {
                attendanceCells.push({ date: day, status: null })
              } else {
                const status = presence.status as 'present' | 'absent' | 'absent with valid reason'
                attendanceCells.push({ date: day, status })

                if (status === 'present') totalPresent++
                else if (status === 'absent') totalAbsent++
                else if (status === 'absent with valid reason') totalValidReason++
              }
            }
          }

          studentAttendanceList.push({
            ...student,
            attendances: attendanceCells,
            totalPresent,
            totalAbsent,
            totalValidReason,
          })
        }
      }

      setStudents(studentAttendanceList)
    } catch (error) {
      console.error('Error fetching attendance data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedClassId, selectedMonth])

  useEffect(() => {
    fetchClasses()
  }, [fetchClasses])

  useEffect(() => {
    if (selectedClassId && selectedMonth) {
      fetchAttendanceData()
    }
  }, [selectedClassId, selectedMonth, fetchAttendanceData])

  const getStatusColor = (status: AttendanceCell['status']) => {
    switch (status) {
      case 'present':
        return 'bg-green-500'
      case 'absent':
        return 'bg-red-500'
      case 'absent with valid reason':
        return 'bg-yellow-500'
      case 'no class':
        return 'bg-gray-300'
      default:
        return 'bg-white border border-gray-300'
    }
  }

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'present':
        return t('attendances.present')
      case 'absent':
        return t('attendances.absent')
      case 'absent with valid reason':
        return t('attendances.validReason')
      case 'no class':
        return ''
      default:
        return '?'
    }
  }

  const [year, month] = selectedMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const days: number[] = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('classAttendances.title')}</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('classes.title')}
            </label>
            <Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">{t('classes.selectClass')}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.month')}
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8">Завантаження...</div>
      )}

      {!loading && selectedClassId && students.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-900 uppercase">{t('attendances.student')}</th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[40px]"
                    >
                      {day}
                    </th>
                  ))}
                  <th className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-900 uppercase">{t('attendances.present')}</th>
                  <th className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-900 uppercase">{t('attendances.absent')}</th>
                  <th className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-900 uppercase">{t('attendances.validReason')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-4 py-3 whitespace-nowrap font-medium sticky left-0 bg-white z-10 border-r">
                      {student.student_first_name} {student.student_last_name}
                    </td>
                    {student.attendances.map((attendance, idx) => (
                      <td
                        key={idx}
                        className="px-1 py-2 text-center text-xs"
                        title={`${formatDate(attendance.date)}: ${getStatusLabel(attendance.status)}`}
                      >
                        <div
                          className={`w-8 h-8 rounded mx-auto flex items-center justify-center ${getStatusColor(attendance.status)}`}
                        >
                          <span className="text-white font-bold text-xs">
                            {getStatusLabel(attendance.status)}
                          </span>
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center text-sm font-medium text-green-600 border-l">
                      {student.totalPresent}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-red-600">
                      {student.totalAbsent}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-yellow-600">
                      {student.totalValidReason}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-3 font-medium sticky left-0 bg-gray-50 z-10 border-r">
                    {t('attendances.totalPerDay')}
                  </td>
                  {days.map((day) => {
                    const date = new Date(year, month - 1, day).toISOString().split('T')[0]
                    const dayStudents = students.map(s => {
                      const att = s.attendances.find(a => a.date === date)
                      return att?.status
                    })
                    const present = dayStudents.filter(s => s === 'present').length
                    const absent = dayStudents.filter(s => s === 'absent').length
                    return (
                      <td key={day} className="px-1 py-2 text-center text-xs">
                        <div className="text-green-600 font-semibold">{present}</div>
                        <div className="text-red-600">{absent}</div>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-center font-medium border-l">
                    {students.reduce((sum, s) => sum + s.totalPresent, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-medium">
                    {students.reduce((sum, s) => sum + s.totalAbsent, 0)}
                  </td>
                  <td className="px-4 py-3 text-center font-medium">
                    {students.reduce((sum, s) => sum + s.totalValidReason, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 bg-gray-50 border-t">
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-green-500"></div>
                <span>{t('attendances.present')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-red-500"></div>
                <span>{t('attendances.absent')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-yellow-500"></div>
                <span>{t('attendances.validReason')}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-gray-300"></div>
                <span>{t('attendances.noClass')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && selectedClassId && students.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {t('classAttendances.noStudentsOrData')}
        </div>
      )}

      {!loading && !selectedClassId && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {t('classAttendances.selectClassMessage')}
        </div>
      )}
    </div>
  )
}
