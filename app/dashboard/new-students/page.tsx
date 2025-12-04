'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/select'

interface StudentWithTestLesson {
  student_id: string
  student_name: string
  parent_name: string
  phone: string
  email: string | null
  interested_courses: string[]
  joined_courses: string[]
}

interface StudentAttendedFirstTime {
  student_id: string
  student_name: string
  parent_name: string
  phone: string
  email: string | null
  interested_courses: string[]
  joined_courses: string[]
}

export default function NewStudentsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [studentsWithTestLesson, setStudentsWithTestLesson] = useState<StudentWithTestLesson[]>([])
  const [studentsAttendedFirstTime, setStudentsAttendedFirstTime] = useState<StudentAttendedFirstTime[]>([])
  const [loading, setLoading] = useState(true)
  
  // Month and year selection (default to current month/year)
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth())

  // Generate year options (current year and previous 5 years)
  const currentYear = currentDate.getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i)
  
  // Month names in Ukrainian
  const monthNames = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ]

  const fetchNewStudentsData = useCallback(async () => {
    try {
      // Use selected month and year instead of current date
      const monthStart = new Date(selectedYear, selectedMonth, 1)
      const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999)

      // Section 1: Fetch students who get test lesson this month (all test payments this month)
      const { data: testPaymentsThisMonth } = await supabase
        .from('payments')
        .select('student_id, created_at')
        .eq('type', 'free')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())
        .order('created_at', { ascending: true })

      if (testPaymentsThisMonth && testPaymentsThisMonth.length > 0) {
        // Get unique student IDs who have test payments this month
        const studentIds = Array.from(new Set(testPaymentsThisMonth.map(p => p.student_id)))

        // Get student details with courses
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name, parent_first_name, parent_middle_name, phone, email, enrolled_class_ids, interested_class_ids')
          .in('id', studentIds)

        // Get all courses for name mapping
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, name')

        if (studentsData && coursesData) {
          const studentsList: StudentWithTestLesson[] = studentsData.map((student) => {
            const enrolledCourses = (student.enrolled_class_ids || [])
              .map((id: string) => coursesData.find(c => c.id === id)?.name || id)
              .filter((name: string) => name !== undefined)
            
            const interestedCourses = (student.interested_class_ids || [])
              .map((id: string) => coursesData.find(c => c.id === id)?.name || id)
              .filter((name: string) => name !== undefined)

            return {
              student_id: student.id,
              student_name: `${student.student_first_name} ${student.student_last_name}`,
              parent_name: `${student.parent_first_name} ${student.parent_middle_name || ''}`.trim(),
              phone: student.phone || '',
              email: student.email || null,
              interested_courses: interestedCourses,
              joined_courses: enrolledCourses,
            }
          })

          setStudentsWithTestLesson(studentsList)
        }
      } else {
        setStudentsWithTestLesson([])
      }

      // Section 2: Fetch students who attend firstly this month (first attendance this month)
      // Get all student presences with attendance dates
      const { data: allPresencesWithDates } = await supabase
        .from('student_presences')
        .select(`
          student_id,
          attendance_id,
          status,
          attendances!inner(date)
        `)
        .eq('status', 'present')
        .order('attendances(date)', { ascending: true })

      // Find each student's first attendance date
      const studentFirstAttendances = new Map<string, string>()
      if (allPresencesWithDates) {
        interface PresenceWithDate {
          student_id: string
          attendances: {
            date: string
          } | {
            date: string
          }[]
        }
        allPresencesWithDates.forEach((p: PresenceWithDate) => {
          if (!studentFirstAttendances.has(p.student_id)) {
            const attendance = Array.isArray(p.attendances) ? p.attendances[0] : p.attendances
            if (attendance) {
              studentFirstAttendances.set(p.student_id, attendance.date)
            }
          }
        })
      }

      // Filter to students whose first attendance was this month
      const studentIdsFirstTime = Array.from(
        studentFirstAttendances.entries()
          .filter(([, date]) => {
            const attendanceDate = new Date(date)
            return attendanceDate >= monthStart && attendanceDate <= monthEnd
          })
          .map(([studentId]) => studentId)
      )

      if (studentIdsFirstTime.length > 0) {
        // Get student details with courses
        const { data: studentsDataFirst } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name, parent_first_name, parent_middle_name, phone, email, enrolled_class_ids, interested_class_ids')
          .in('id', studentIdsFirstTime)

        // Get all courses for name mapping
        const { data: coursesDataFirst } = await supabase
          .from('courses')
          .select('id, name')

        if (studentsDataFirst && coursesDataFirst) {
          const studentsListFirst: StudentAttendedFirstTime[] = studentsDataFirst.map((student) => {
            const enrolledCourses = (student.enrolled_class_ids || [])
              .map((id: string) => coursesDataFirst.find(c => c.id === id)?.name || id)
              .filter((name: string) => name !== undefined)
            
            const interestedCourses = (student.interested_class_ids || [])
              .map((id: string) => coursesDataFirst.find(c => c.id === id)?.name || id)
              .filter((name: string) => name !== undefined)

            return {
              student_id: student.id,
              student_name: `${student.student_first_name} ${student.student_last_name}`,
              parent_name: `${student.parent_first_name} ${student.parent_middle_name || ''}`.trim(),
              phone: student.phone || '',
              email: student.email || null,
              interested_courses: interestedCourses,
              joined_courses: enrolledCourses,
            }
          })

          setStudentsAttendedFirstTime(studentsListFirst)
        }
      } else {
        setStudentsAttendedFirstTime([])
      }
    } catch (error) {
      console.error('Error fetching new students data:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedYear, selectedMonth])

  useEffect(() => {
    fetchNewStudentsData()
  }, [fetchNewStudentsData])

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-900" suppressHydrationWarning>{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.newStudents')}</h1>
        <div className="flex gap-4 items-center">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.month')}</label>
            <Select
              value={selectedMonth.toString()}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="w-40"
            >
              {monthNames.map((month, index) => (
                <option key={index} value={index}>
                  {month}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.year')}</label>
            <Select
              value={selectedYear.toString()}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-32"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Area 1: Students Who Get Test Lesson This Month */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.studentsWithTestLesson')}</h2>
        {studentsWithTestLesson.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noStudentsWithTestLesson')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.student')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.parent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.phone')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.email')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('students.interestedClasses')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('students.enrolledClasses')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {studentsWithTestLesson.map((student) => (
                  <tr key={student.student_id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {student.student_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {student.interested_courses.length > 0 ? student.interested_courses.join(', ') : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {student.joined_courses.length > 0 ? student.joined_courses.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Area 2: Students Who Attend Firstly This Month */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">{t('dashboard.studentsAttendedFirstTime')}</h2>
        {studentsAttendedFirstTime.length === 0 ? (
          <p className="text-gray-500">{t('dashboard.noStudentsAttendedFirstTime')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.student')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.parent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.phone')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.email')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('students.interestedClasses')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('students.enrolledClasses')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {studentsAttendedFirstTime.map((student) => (
                  <tr key={student.student_id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {student.student_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.parent_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {student.interested_courses.length > 0 ? student.interested_courses.join(', ') : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {student.joined_courses.length > 0 ? student.joined_courses.join(', ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

