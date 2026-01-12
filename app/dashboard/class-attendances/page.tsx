'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

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

interface StudentDetails extends Student {
  parent_first_name: string
  parent_middle_name: string | null
  phone: string
  email: string | null
  student_date_of_birth: string | null
  status: string
  comment: string | null
}

interface Payment {
  id: string
  student_id: string
  class_id: string
  package_type_id: string
  status: string
  type: string
  created_at: string
  comment?: string
  courses?: { name: string }
  package_types?: { name: string; amount: number }
}

export default function ClassAttendancesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])
  const [students, setStudents] = useState<StudentAttendance[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  })
  const [loading, setLoading] = useState(false)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentDetails | null>(null)
  const [studentPayments, setStudentPayments] = useState<Payment[]>([])
  const [loadingStudentDetails, setLoadingStudentDetails] = useState(false)

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
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
      // Create dates in UTC to avoid timezone issues
      const startDate = new Date(Date.UTC(year, month - 1, 1))
      const endDate = new Date(Date.UTC(year, month, 0))

      // Get class info
      const { data: classData, error: classError } = await supabase
        .from('courses')
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
        // Format date as YYYY-MM-DD without timezone conversion
        const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`
        days.push(dayStr)
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

  const handleExportXLS = () => {
    if (students.length === 0) return
    
    // Flatten the data for export
    const exportData = students.flatMap(student => {
      return student.attendances.map(attendance => ({
        student_name: `${student.student_first_name} ${student.student_last_name}`,
        date: attendance.date,
        status: attendance.status ? getStatusLabel(attendance.status) : '',
        total_present: student.totalPresent,
        total_absent: student.totalAbsent,
        total_valid_reason: student.totalValidReason,
      }))
    })

    const columns: ExportColumn[] = [
      { header: t('classAttendances.student'), accessor: (row) => row.student_name },
      { header: t('attendances.date'), accessor: (row) => formatDate(row.date) },
      { header: t('common.status'), accessor: (row) => row.status },
      { header: t('classAttendances.totalPresent'), accessor: (row) => row.total_present },
      { header: t('classAttendances.totalAbsent'), accessor: (row) => row.total_absent },
      { header: t('classAttendances.totalValidReason'), accessor: (row) => row.total_valid_reason },
    ]
    exportToXLS(exportData, columns, 'class-attendances')
  }

  const handleExportCSV = () => {
    if (students.length === 0) return
    
    // Flatten the data for export
    const exportData = students.flatMap(student => {
      return student.attendances.map(attendance => ({
        student_name: `${student.student_first_name} ${student.student_last_name}`,
        date: attendance.date,
        status: attendance.status ? getStatusLabel(attendance.status) : '',
        total_present: student.totalPresent,
        total_absent: student.totalAbsent,
        total_valid_reason: student.totalValidReason,
      }))
    })

    const columns: ExportColumn[] = [
      { header: t('classAttendances.student'), accessor: (row) => row.student_name },
      { header: t('attendances.date'), accessor: (row) => formatDate(row.date) },
      { header: t('common.status'), accessor: (row) => row.status },
      { header: t('classAttendances.totalPresent'), accessor: (row) => row.total_present },
      { header: t('classAttendances.totalAbsent'), accessor: (row) => row.total_absent },
      { header: t('classAttendances.totalValidReason'), accessor: (row) => row.total_valid_reason },
    ]
    exportToCSV(exportData, columns, 'class-attendances')
  }

  const fetchStudentDetails = async (studentId: string) => {
    setLoadingStudentDetails(true)
    try {
      // Fetch student details
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single()

      if (studentError) {
        console.error('Error fetching student:', studentError)
        throw studentError
      }
      if (studentData) {
        setSelectedStudent(studentData as StudentDetails)
      }

      // Fetch all payments for this student
      let allStudentPayments: Payment[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      // First, try with joins (same as payments page)
      let useFallback = false
      while (hasMore) {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            *,
            courses!class_id(name),
            package_types(name, amount)
          `)
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) {
          console.error('Error fetching payments with joins:', error)
          useFallback = true
          break
        }

        if (data && data.length > 0) {
          allStudentPayments = [...allStudentPayments, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      // If join failed, use fallback approach
      if (useFallback) {
        console.log('Using fallback approach to fetch payments')
        allStudentPayments = []
        from = 0
        hasMore = true

        while (hasMore) {
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
            .range(from, from + batchSize - 1)

          if (error) {
            console.error('Error fetching payments (fallback):', error)
            throw error
          }

          if (data && data.length > 0) {
            allStudentPayments = [...allStudentPayments, ...data]
            hasMore = data.length === batchSize
            from += batchSize
          } else {
            hasMore = false
          }
        }

        // Fetch related courses and package_types
        if (allStudentPayments.length > 0) {
          const classIds = [...new Set(allStudentPayments.map(p => p.class_id).filter(Boolean))]
          const packageIds = [...new Set(allStudentPayments.map(p => p.package_type_id).filter(Boolean))]

          let coursesData: Array<{ id: string; name: string }> = []
          let packagesData: Array<{ id: string; name: string; amount: number }> = []

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
              .select('id, name, amount')
              .in('id', packageIds)
            
            if (packagesError) {
              console.error('Error fetching package types:', packagesError)
            } else {
              packagesData = data || []
            }
          }

          const coursesMap = new Map(coursesData.map(c => [c.id, c]))
          const packagesMap = new Map(packagesData.map(p => [p.id, p]))

          // Map the related data to payments
          allStudentPayments = allStudentPayments.map(payment => ({
            ...payment,
            courses: coursesMap.get(payment.class_id) ? { name: coursesMap.get(payment.class_id)!.name } : undefined,
            package_types: packagesMap.get(payment.package_type_id) ? {
              name: packagesMap.get(payment.package_type_id)!.name,
              amount: packagesMap.get(payment.package_type_id)!.amount
            } : undefined,
          }))
        }
      }

      console.log(`Total payments found: ${allStudentPayments.length}`)
      setStudentPayments(allStudentPayments)
    } catch (error) {
      console.error('Error fetching student details:', error)
      alert(t('common.errorSaving'))
    } finally {
      setLoadingStudentDetails(false)
    }
  }

  const handleStudentClick = async (studentId: string) => {
    setIsStudentModalOpen(true)
    await fetchStudentDetails(studentId)
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('classAttendances.title')}</h1>
        {isOwner && selectedClassId && students.length > 0 && (
          <ExportButton 
            onExportXLS={handleExportXLS}
            onExportCSV={handleExportCSV}
            disabled={students.length === 0}
          />
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('courses.title')}
            </label>
            <Select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              <option value="">{t('courses.selectCourse')}</option>
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
          <div className="overflow-auto max-h-[calc(100vh-300px)]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-30">
                <tr>
                  <th className="px-4 py-2 bg-gray-100 text-xs font-medium text-gray-900 uppercase sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">{t('attendances.student')}</th>
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
                    <td className="px-4 py-3 whitespace-nowrap font-medium sticky left-0 bg-white z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                      <button
                        onClick={() => handleStudentClick(student.id)}
                        className="text-blue-600 hover:text-blue-900 hover:underline cursor-pointer"
                      >
                        {student.student_first_name} {student.student_last_name}
                      </button>
                    </td>
                    {student.attendances.map((attendance, idx) => (
                      <td
                        key={idx}
                        className="px-1 py-2 text-center text-xs"
                        title={`${formatDate(attendance.date)}: ${getStatusLabel(attendance.status)}`}
                      >
                        <div
                          className={`w-8 h-8 rounded mx-auto ${getStatusColor(attendance.status)}`}
                        >
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
                  <td className="px-4 py-3 font-medium sticky left-0 bg-gray-50 z-10 border-r shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                    {t('attendances.totalPerDay')}
                  </td>
                  {days.map((day) => {
                    // Format date as YYYY-MM-DD without timezone conversion
                    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

      {/* Student Details Modal */}
      <Modal
        isOpen={isStudentModalOpen}
        onClose={() => { setIsStudentModalOpen(false); setSelectedStudent(null); setStudentPayments([]) }}
        title={selectedStudent ? `${selectedStudent.student_first_name} ${selectedStudent.student_last_name}` : t('students.studentSummary')}
        size="lg"
      >
        {loadingStudentDetails ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : selectedStudent ? (
          <div className="space-y-6">
            {/* Student Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-900">{t('students.studentName')}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">{t('students.parentName')}:</span>
                  <span className="ml-2 text-gray-900">
                    {selectedStudent.parent_first_name} {selectedStudent.parent_middle_name || ''}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">{t('students.phone')}:</span>
                  <span className="ml-2 text-gray-900">{selectedStudent.phone}</span>
                </div>
                {selectedStudent.email && (
                  <div>
                    <span className="font-medium text-gray-700">{t('common.email')}:</span>
                    <span className="ml-2 text-gray-900">{selectedStudent.email}</span>
                  </div>
                )}
                {selectedStudent.student_date_of_birth && (
                  <div>
                    <span className="font-medium text-gray-700">{t('students.dateOfBirth')}:</span>
                    <span className="ml-2 text-gray-900">{formatDate(selectedStudent.student_date_of_birth)}</span>
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-700">{t('common.status')}:</span>
                  <span className="ml-2 text-gray-900">
                    {selectedStudent.status === 'active' ? t('common.active') : 
                     selectedStudent.status === 'inactive' ? t('common.inactive') : 
                     selectedStudent.status === 'moved' ? t('common.moved') : 
                     t('common.dontDisturb')}
                  </span>
                </div>
              </div>
              {selectedStudent.comment && (
                <div className="mt-3">
                  <span className="font-medium text-gray-700">{t('students.comment')}:</span>
                  <p className="mt-1 text-sm text-gray-900">{selectedStudent.comment}</p>
                </div>
              )}
            </div>

            {/* Payments */}
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{t('payments.title')} ({studentPayments.length})</h3>
              {studentPayments.length > 0 ? (
                <div className="border rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.class')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.packageType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.amount')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.paymentType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.comment')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {studentPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatDate(payment.created_at)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.courses?.name || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.package_types?.name || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {payment.package_types?.amount ? `${payment.package_types.amount} ${t('common.uah')}` : '-'}
                          </td>
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
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.comment || '-'}</td>
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
    </div>
  )
}
