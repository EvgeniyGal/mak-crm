'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Plus, Edit, Trash2, Calendar, ChevronLeft, ChevronRight, Eye, CheckCircle2 } from 'lucide-react'
import { Calendar as BigCalendar, momentLocalizer, Event, SlotInfo } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'moment/locale/uk'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

const DragAndDropCalendar = withDragAndDrop(BigCalendar)

interface EventWithId extends Event {
  id?: string
}

// Type for the args parameter from react-big-calendar's onEventDrop/onEventResize
type EventInteractionArgs = {
  event: EventWithId
  start: Date | string
  end: Date | string
  [key: string]: unknown
}

moment.locale('uk')
const localizer = momentLocalizer(moment)

// Custom toolbar component that hides all UI elements
const CustomToolbar = () => {
  return <div style={{ display: 'none' }} /> // Hide the toolbar completely
}

// Custom event component without button (button moved to header)
const createCustomEvent = (hasAttendance: (classId: string, date: string) => boolean) => {
  // eslint-disable-next-line react/display-name, @typescript-eslint/no-explicit-any
  return (props: any) => {
    const event = props.event as EventWithId & { resource: Schedule }
    const schedule = event.resource
    const eventDate = moment(event.start).format('YYYY-MM-DD')
    const hasAtt = hasAttendance(schedule.class_id, eventDate)
    
    return (
      <div className="rbc-event-content" style={{ position: 'relative', width: '100%', height: '100%', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, paddingRight: hasAtt ? '18px' : '0' }}>
          {event.title}
        </span>
        {hasAtt && (
          <span 
            title="Відвідуваність додана"
            style={{ 
              position: 'absolute', 
              top: '2px', 
              right: '2px',
              zIndex: 10
            }}
          >
            <CheckCircle2 
              size={14} 
              style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
            />
          </span>
        )}
      </div>
    )
  }
}

// Custom day header component with button to view day details
const createCustomDayHeader = (onViewDayDetails: (date: string) => void) => {
  // eslint-disable-next-line react/display-name, @typescript-eslint/no-explicit-any
  return (props: any) => {
    const { label, date } = props
    const headerDate = date instanceof Date ? date : new Date(date)
    
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onViewDayDetails(moment(headerDate).format('YYYY-MM-DD'))
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0 4px' }}>
        <span>{label}</span>
        <button
          onClick={handleClick}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            padding: '2px 6px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
            fontSize: '11px',
            color: '#2563eb',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'
          }}
          title="Переглянути деталі дня"
        >
          <Eye size={14} />
        </button>
      </div>
    )
  }
}

interface Schedule {
  id: string
  class_id: string
  room_id: string | null // Kept for backward compatibility, but not used in form
  time_slot: string // start_time (kept for backward compatibility)
  end_time: string | null
  week_day: number
  created_at: string
  classes?: { name: string; teachers_ids: string[]; room_id: string | null; rooms?: { name: string } }
}

interface Class {
  id: string
  name: string
  teachers_ids: string[]
  room_id: string | null
  student_ids?: string[]
}

interface Room {
  id: string
  name: string
}

interface Teacher {
  id: string
  first_name: string
  last_name: string
}

export default function SchedulesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  
  const weekDays = [
    t('schedules.sunday'),
    t('schedules.monday'),
    t('schedules.tuesday'),
    t('schedules.wednesday'),
    t('schedules.thursday'),
    t('schedules.friday'),
    t('schedules.saturday'),
  ]
  
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [roomFilter, setRoomFilter] = useState<string>('')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false)
  const [selectedScheduleForAttendance, setSelectedScheduleForAttendance] = useState<Schedule | null>(null)
  const [selectedDateForAttendance, setSelectedDateForAttendance] = useState<string>('')
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null)
  const [students, setStudents] = useState<Array<{ id: string; student_first_name: string; student_last_name: string }>>([])
  const [classStudents, setClassStudents] = useState<Array<{ id: string; student_first_name: string; student_last_name: string }>>([])
  const [studentPresences, setStudentPresences] = useState<Record<string, { status: string; comment: string }>>({})
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
  const [isDayDetailsModalOpen, setIsDayDetailsModalOpen] = useState(false)
  const [selectedDateForDetails, setSelectedDateForDetails] = useState<string>('')
  const [dayAttendanceData, setDayAttendanceData] = useState<Array<{
    class_id: string
    class_name: string
    students: Array<{
      id: string
      student_first_name: string
      student_last_name: string
      status: string
      comment: string | null
    }>
  }>>([])
  const [loadingDayDetails, setLoadingDayDetails] = useState(false)
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean>>(new Map())

  const [formData, setFormData] = useState({
    class_id: '',
    start_time: '',
    end_time: '',
    week_day: 0,
  })

  const fetchSchedules = useCallback(async () => {
    try {
      // Query schedules with courses relationship (table was renamed from classes to courses)
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          courses(name, teachers_ids, room_id, rooms(name))
        `)
        .order('week_day', { ascending: true })
        .order('time_slot', { ascending: true })

      if (error) {
        console.error('Error fetching schedules:', error)
        // If courses relationship fails, try fetching separately
        const { data: schedulesOnly, error: schedulesError } = await supabase
          .from('schedules')
          .select('*')
          .order('week_day', { ascending: true })
          .order('time_slot', { ascending: true })
        
        if (schedulesError) throw schedulesError
        
        // Fetch courses separately and merge
        const schedulesWithCourses = await Promise.all((schedulesOnly || []).map(async (schedule) => {
          const { data: courseData } = await supabase
            .from('courses')
            .select('name, teachers_ids, room_id')
            .eq('id', schedule.class_id)
            .single()
          
          let roomData = null
          if (courseData?.room_id) {
            const { data: room } = await supabase
              .from('rooms')
              .select('name')
              .eq('id', courseData.room_id)
              .single()
            roomData = room
          }
          
          return {
            ...schedule,
            courses: courseData ? {
              ...courseData,
              rooms: roomData
            } : null
          }
        }))
        
        const normalizedSchedules = schedulesWithCourses.map(s => ({
          ...s,
          classes: s.courses || s.classes
        }))
        
        setSchedules(normalizedSchedules as Schedule[])
        console.log(`Fetched ${normalizedSchedules.length} schedules (separate queries)`)
        return
      }
      
      const schedulesData = data || []
      console.log(`✅ Fetched ${schedulesData.length} schedules:`, schedulesData.map(s => ({ 
        id: s.id, 
        class: s.courses?.name || s.classes?.name, 
        week_day: s.week_day, 
        time: s.time_slot 
      })))
      
      // Normalize the data structure - use 'classes' key for backward compatibility
      const normalizedSchedules = schedulesData.map(s => ({
        ...s,
        classes: s.courses || s.classes // Support both old and new structure
      }))
      
      setSchedules(normalizedSchedules as Schedule[])
    } catch (error) {
      console.error('Error fetching schedules:', error)
      setSchedules([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Fetch attendance data for all classes and dates
  const fetchAttendanceData = useCallback(async () => {
    try {
      // Get current date range (4 weeks before to 12 weeks after)
      const today = moment().startOf('day')
      const currentSunday = today.clone().day(0)
      if (currentSunday.isAfter(today)) {
        currentSunday.subtract(1, 'week')
      }
      const startDate = currentSunday.clone().subtract(4, 'weeks')
      const endDate = currentSunday.clone().add(12, 'weeks').add(6, 'days')

      // Fetch all attendances in this date range
      const { data: attendances, error } = await supabase
        .from('attendances')
        .select('class_id, date')
        .gte('date', startDate.format('YYYY-MM-DD'))
        .lte('date', endDate.format('YYYY-MM-DD'))

      if (error) {
        console.error('Error fetching attendance data:', error)
        return
      }

      // Create a map: "classId-date" -> true
      const attendanceMap = new Map<string, boolean>()
      attendances?.forEach(attendance => {
        const key = `${attendance.class_id}-${attendance.date}`
        attendanceMap.set(key, true)
      })

      setAttendanceMap(attendanceMap)
    } catch (error) {
      console.error('Error in fetchAttendanceData:', error)
    }
  }, [supabase])

  // Helper function to check if attendance exists
  const hasAttendance = useCallback((classId: string, date: string): boolean => {
    const key = `${classId}-${date}`
    return attendanceMap.has(key)
  }, [attendanceMap])

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, teachers_ids, room_id, student_ids')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  }, [supabase])

  const fetchTeachers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')

      if (error) throw error
      setTeachers(data || [])
    } catch (error) {
      console.error('Error fetching teachers:', error)
    }
  }, [supabase])

  const fetchStudents = useCallback(async () => {
    try {
      let allStudents: Array<{ id: string; student_first_name: string; student_last_name: string }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name')
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allStudents = [...allStudents, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setStudents(allStudents)
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }, [supabase])

  // Generate events for multiple weeks so calendar navigation works
  const events = useMemo(() => {
    // Apply room filter if selected
    const filteredSchedules = roomFilter
      ? schedules.filter((s) => {
          // Check room_id from the schedule's classes relationship or from classes state
          const roomId = s.classes?.room_id || classes.find((c) => c.id === s.class_id)?.room_id
          return roomId === roomFilter
        })
      : schedules

    const eventsList: (EventWithId & { resource: Schedule })[] = []
    
    if (filteredSchedules.length === 0) {
      return eventsList
    }

    // Generate events for a wide range centered on current date
    const today = moment().startOf('day')
    // Get the current Sunday (week starts on Sunday in our system)
    const currentSunday = today.clone().day(0) // day(0) sets to Sunday
    if (currentSunday.isAfter(today)) {
      // If today is not Sunday, go back to last Sunday
      currentSunday.subtract(1, 'week')
    }
    
    // Start from 4 weeks before current Sunday, end 12 weeks after
    const startDate = currentSunday.clone().subtract(4, 'weeks')
    // const endDate = currentSunday.clone().add(12, 'weeks').add(6, 'days') // Add 6 days to get to Saturday
    
    filteredSchedules.forEach((schedule) => {
      // Parse time slot - handle both HH:mm:ss and HH:mm formats
      const startTime = moment(schedule.time_slot, ['HH:mm:ss', 'HH:mm'], true)
      if (!startTime.isValid()) {
        console.warn(`Invalid time_slot for schedule ${schedule.id}: ${schedule.time_slot}`)
        return
      }
      
      let endTime = schedule.end_time 
        ? moment(schedule.end_time, ['HH:mm:ss', 'HH:mm'], true)
        : startTime.clone().add(1, 'hour')
      
      if (!endTime.isValid()) {
        endTime = startTime.clone().add(1, 'hour')
      }
      
      // Ensure week_day is valid (0-6)
      const weekDay = Math.max(0, Math.min(6, schedule.week_day))
      
      // Generate recurring events for each week in the date range
      // Start from the Sunday of startDate
      
      // Generate events for up to 16 weeks
      for (let weekOffset = 0; weekOffset < 16; weekOffset++) {
        const weekSunday = startDate.clone().add(weekOffset, 'weeks')
        
        // Calculate the date for this week_day in this week
        // weekSunday is Sunday (day 0), so we add weekDay days
        const eventDate = weekSunday.clone().add(weekDay, 'days')
        
        const eventStart = eventDate.clone()
          .set({ 
            hour: startTime.hour(), 
            minute: startTime.minute(), 
            second: 0, 
            millisecond: 0 
          })

        const eventEnd = eventDate.clone()
          .set({ 
            hour: endTime.hour(), 
            minute: endTime.minute(), 
            second: 0, 
            millisecond: 0 
          })

        eventsList.push({
          id: `${schedule.id}-${weekSunday.format('YYYY-WW')}`,
          title: schedule.classes?.name || t('schedules.noName') || 'Без назви',
          start: eventStart.toDate(),
          end: eventEnd.toDate(),
          resource: schedule,
        } as EventWithId & { resource: Schedule })
      }
    })
    
    // Debug: log event count and sample events
    if (eventsList.length > 0) {
      console.log(`✅ Generated ${eventsList.length} events from ${filteredSchedules.length} schedules`)
      if (eventsList.length > 0) {
        console.log('Sample events:', eventsList.slice(0, 3).map(e => ({
          title: e.title,
          start: moment(e.start).format('YYYY-MM-DD HH:mm'),
          weekDay: moment(e.start).day()
        })))
      }
    } else {
      console.log(`⚠️ No events generated. Schedules: ${schedules.length}, Filtered: ${filteredSchedules.length}`)
      if (filteredSchedules.length > 0) {
        console.log('Schedule details:', filteredSchedules.map(s => ({
          id: s.id,
          class: s.classes?.name,
          week_day: s.week_day,
          time_slot: s.time_slot
        })))
      }
    }
    
    return eventsList
  }, [schedules, classes, roomFilter, t])

  const checkConflicts = useCallback(() => {
    if (!formData.class_id || !formData.start_time || formData.week_day === undefined) {
      setConflicts([])
      return
    }

    const newConflicts: string[] = []
    const editingId = editingSchedule?.id
    const startTime = moment(formData.start_time, 'HH:mm')
    const endTime = formData.end_time 
      ? moment(formData.end_time, 'HH:mm')
      : moment(formData.start_time, 'HH:mm').add(1, 'hour')

    // Get the selected class's room_id
    const selectedClass = classes.find(c => c.id === formData.class_id)
    const classRoomId = selectedClass?.room_id

    // Check room conflicts (time range overlap) - use class's room
    if (classRoomId) {
      const roomConflict = schedules.find(s => {
        if (s.id === editingId || s.week_day !== formData.week_day) {
          return false
        }
        
        // Get the room_id from the schedule's class
        const scheduleClass = classes.find(c => c.id === s.class_id)
        const scheduleRoomId = scheduleClass?.room_id
        
        // Check if rooms conflict
        if (!scheduleRoomId || scheduleRoomId !== classRoomId) {
          return false
        }
        
        const sStart = moment(s.time_slot, 'HH:mm:ss')
        const sEnd = s.end_time 
          ? moment(s.end_time, 'HH:mm:ss')
          : moment(s.time_slot, 'HH:mm:ss').add(1, 'hour')
        
        return (startTime.isBefore(sEnd) && endTime.isAfter(sStart))
      })

      if (roomConflict) {
        const roomName = rooms.find(r => r.id === classRoomId)?.name || t('rooms.roomName')
        newConflicts.push(t('schedules.roomOccupied', { roomName }))
      }
    }

    // Check teacher conflicts (time range overlap)
    if (selectedClass?.teachers_ids) {
      for (const teacherId of selectedClass.teachers_ids) {
        const teacherSchedules = schedules.filter(s => {
          if (s.id === editingId) return false
          const scheduleClass = classes.find(c => c.id === s.class_id)
          return scheduleClass?.teachers_ids.includes(teacherId) && s.week_day === formData.week_day
        })

        const teacherConflict = teacherSchedules.find(s => {
          const sStart = moment(s.time_slot, 'HH:mm:ss')
          const sEnd = s.end_time 
            ? moment(s.end_time, 'HH:mm:ss')
            : moment(s.time_slot, 'HH:mm:ss').add(1, 'hour')
          
          return (startTime.isBefore(sEnd) && endTime.isAfter(sStart))
        })

                 if (teacherConflict) {
           const teacher = teachers.find(teach => teach.id === teacherId)
           newConflicts.push(t('schedules.teacherOccupied', { 
            firstName: teacher?.first_name || '', 
            lastName: teacher?.last_name || '' 
          }))
        }
      }
    }

    setConflicts(newConflicts)
  }, [formData, schedules, classes, rooms, teachers, editingSchedule, t])

  useEffect(() => {
    fetchSchedules()
    fetchClasses()
    fetchRooms()
    fetchTeachers()
    fetchStudents()
    fetchAttendanceData()
  }, [fetchSchedules, fetchClasses, fetchRooms, fetchTeachers, fetchStudents, fetchAttendanceData])

  useEffect(() => {
    checkConflicts()
  }, [checkConflicts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (conflicts.length > 0) {
      alert(t('schedules.conflictMessage'))
      return
    }

    if (!formData.end_time) {
      // Calculate end_time as 1 hour after start_time if not provided
      const start = moment(formData.start_time, 'HH:mm')
      const end = start.clone().add(1, 'hour')
      formData.end_time = end.format('HH:mm')
    }

    try {
      const submitData = {
        class_id: formData.class_id,
        room_id: null, // Room is set at class level, not schedule level
        time_slot: formData.start_time, // Using time_slot as start_time for backward compatibility
        end_time: formData.end_time,
        week_day: Number(formData.week_day),
      }

      if (editingSchedule) {
        const { error } = await supabase
          .from('schedules')
          .update(submitData)
          .eq('id', editingSchedule.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('schedules')
          .insert([submitData])
        if (error) throw error
      }

      await fetchSchedules()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving schedule:', error)
      alert(t('schedules.errorSaving'))
    }
  }

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setFormData({
      class_id: schedule.class_id,
      start_time: schedule.time_slot,
      end_time: schedule.end_time || '',
      week_day: schedule.week_day,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('schedules.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchSchedules()
    } catch (error) {
      console.error('Error deleting schedule:', error)
      alert(t('schedules.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      class_id: '',
      start_time: '',
      end_time: '',
      week_day: 0,
    })
    setEditingSchedule(null)
    setConflicts([])
  }

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

    const classStudents = students.filter(s => selectedClass.student_ids?.includes(s.id))
    const lessonsMap: Record<string, number> = {}
    for (const student of classStudents) {
      const lessonRecord = await getStudentLessonsForClass(student.id, classId)
      const lessonCount = lessonRecord?.lesson_count ?? 0
      lessonsMap[student.id] = lessonCount
    }
    setStudentAvailableLessons(prev => {
      const updated = { ...prev, ...lessonsMap }
      return updated
    })
  }

  const handleOpenAttendanceModal = async (schedule: Schedule, date: string) => {
    setSelectedScheduleForAttendance(schedule)
    setSelectedDateForAttendance(date)
    
    // Check if attendance already exists for this date and class
    try {
      const { data: existingAttendance, error: attendanceError } = await supabase
        .from('attendances')
        .select('id')
        .eq('date', date)
        .eq('class_id', schedule.class_id)
        .single()

      if (attendanceError && attendanceError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking for existing attendance:', attendanceError)
      }

      if (existingAttendance) {
        // Edit mode - load existing attendance
        setEditingAttendanceId(existingAttendance.id)
        
        // Fetch existing presences
        const { data: existingPresences, error: presencesError } = await supabase
          .from('student_presences')
          .select('student_id, status, comment')
          .eq('attendance_id', existingAttendance.id)

        if (presencesError) {
          console.error('Error fetching existing presences:', presencesError)
        }

        // Get class students
        const selectedClass = classes.find(c => c.id === schedule.class_id)
        if (selectedClass && selectedClass.student_ids) {
          const classStudents = students.filter(s => selectedClass!.student_ids!.includes(s.id))
          setClassStudents(classStudents)

          // Fetch available lessons per student and load existing presences
          const presences: Record<string, { status: string; comment: string }> = {}
          const lessonsMap: Record<string, number> = {}
          for (const student of classStudents) {
            const lessonRecord = await getStudentLessonsForClass(student.id, schedule.class_id)
            lessonsMap[student.id] = lessonRecord?.lesson_count ?? 0
            
            // Load existing presence if exists, otherwise default to 'present'
            const existingPresence = existingPresences?.find(p => p.student_id === student.id)
            presences[student.id] = existingPresence 
              ? { status: existingPresence.status, comment: existingPresence.comment || '' }
              : { status: 'present', comment: '' }
          }
          setStudentAvailableLessons(lessonsMap)
          setStudentPresences(presences)
        }
      } else {
        // Add mode - initialize with defaults
        setEditingAttendanceId(null)
        
        // Get class students
        const selectedClass = classes.find(c => c.id === schedule.class_id)
        if (selectedClass && selectedClass.student_ids) {
          const classStudents = students.filter(s => selectedClass!.student_ids!.includes(s.id))
          setClassStudents(classStudents)

          // Fetch available lessons per student and initialize presences
          const presences: Record<string, { status: string; comment: string }> = {}
          const lessonsMap: Record<string, number> = {}
          for (const student of classStudents) {
            const lessonRecord = await getStudentLessonsForClass(student.id, schedule.class_id)
            lessonsMap[student.id] = lessonRecord?.lesson_count ?? 0
            presences[student.id] = { status: 'present', comment: '' }
          }
          setStudentAvailableLessons(lessonsMap)
          setStudentPresences(presences)
        }
      }
    } catch (error) {
      console.error('Error in handleOpenAttendanceModal:', error)
      // On error, default to add mode
      setEditingAttendanceId(null)
    }
    
    setIsAttendanceModalOpen(true)
  }

  const handleCreateAttendance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedScheduleForAttendance) return

    const isEditing = editingAttendanceId !== null

    // Check if any students don't have payment (only for new attendance)
    // Exclude students with "absent with valid reason" since they don't consume a lesson
    if (!isEditing && classStudents.some(student => {
      const hasValidReason = studentPresences[student.id]?.status === 'absent with valid reason'
      return !hasValidReason && (studentAvailableLessons[student.id] ?? 0) < 1
    })) {
      alert(t('attendances.studentsWithoutPayment') || 'Деякі студенти не мають платежу. Будь ласка, створіть платіж перед додаванням відвідуваності.')
      return
    }

    try {
      let attendanceId: string

      if (isEditing && editingAttendanceId) {
        // Edit mode - restore payment counts from old presences
        const { data: oldPresences } = await supabase
          .from('student_presences')
          .select('student_id, status, id')
          .eq('attendance_id', editingAttendanceId)

        // Restore lesson counts in student_class_lessons
        if (oldPresences) {
          for (const presence of oldPresences) {
            if (presence.status !== 'absent with valid reason') {
              const lessonRecord = await getStudentLessonsForClass(presence.student_id, selectedScheduleForAttendance.class_id)
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

        // Update existing attendance (though date and class_id shouldn't change)
        const { data, error: updateError } = await supabase
          .from('attendances')
          .update({
            date: selectedDateForAttendance,
            class_id: selectedScheduleForAttendance.class_id,
          })
          .eq('id', editingAttendanceId)
          .select()
          .single()

        if (updateError) throw updateError
        attendanceId = data.id

        // Delete existing presences
        await supabase
          .from('student_presences')
          .delete()
          .eq('attendance_id', attendanceId)
      } else {
        // Create new attendance
        const { data: attendanceData, error: attendanceError } = await supabase
          .from('attendances')
          .insert({
            date: selectedDateForAttendance,
            class_id: selectedScheduleForAttendance.class_id,
          })
          .select()
          .single()

        if (attendanceError) throw attendanceError
        attendanceId = attendanceData.id
      }

      // Create student presences and update student_class_lessons
      for (const [studentId, presence] of Object.entries(studentPresences)) {
        const { error: presenceError } = await supabase
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
          const lessonRecord = await getStudentLessonsForClass(studentId, selectedScheduleForAttendance.class_id)
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

      setIsAttendanceModalOpen(false)
      setSelectedScheduleForAttendance(null)
      setSelectedDateForAttendance('')
      setEditingAttendanceId(null)
      await fetchAttendanceData() // Refresh attendance indicators
      setStudentPresences({})
      setClassStudents([])
      const successMsg = isEditing 
        ? (t('attendances.editSuccessMessage') || 'Відвідуваність успішно оновлена')
        : (t('attendances.successMessage') || 'Відвідуваність успішно створена')
      alert(successMsg)
    } catch (error) {
      console.error('Error saving attendance:', error)
      const errorMsg = isEditing
        ? (t('attendances.editErrorMessage') || 'Помилка оновлення відвідуваності')
        : (t('attendances.errorMessage') || 'Помилка створення відвідуваності')
      alert(errorMsg)
    }
  }

  // Handle drag and drop in calendar
  const handleEventDrop = async (args: EventInteractionArgs) => {
    const { event, start, end } = args
    const eventWithResource = event as EventWithId & { resource: Schedule }
    const schedule = eventWithResource.resource
    
    // Extract schedule ID from event ID (format: uuid-YYYY-WW)
    // UUIDs have 5 parts separated by hyphens, so if there are more parts, remove the last 2 (year-week)
    let scheduleId = schedule.id
    if (typeof event.id === 'string') {
      const parts = event.id.split('-')
      if (parts.length > 5) {
        // UUID has 5 parts, remove last 2 (year and week)
        scheduleId = parts.slice(0, -2).join('-')
      } else {
        scheduleId = event.id
      }
    }
    
    // Create moment objects from the Date objects provided by react-big-calendar
    const newStartTime = moment(start instanceof Date ? start : new Date(start))
    const newEndTime = moment(end instanceof Date ? end : new Date(end))
    
    // Calculate week_day: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Use native Date.getDay() for consistency - it returns 0-6 where 0 is Sunday
    const startDate = start instanceof Date ? start : new Date(start)
    const newWeekDay = startDate.getDay()

    // Find the actual schedule record
    const actualSchedule = schedules.find(s => s.id === scheduleId) || schedule

    // Quick conflict check - use class's room_id
    const actualClass = classes.find(c => c.id === actualSchedule.class_id)
    const classRoomId = actualClass?.room_id
    
    if (classRoomId) {
      const roomConflict = schedules.find(s => {
        if (s.id === scheduleId || s.week_day !== newWeekDay) {
          return false
        }
        
        // Get the room_id from the schedule's class
        const scheduleClass = classes.find(c => c.id === s.class_id)
        const scheduleRoomId = scheduleClass?.room_id
        
        // Check if rooms conflict
        if (!scheduleRoomId || scheduleRoomId !== classRoomId) {
          return false
        }
        
        const sStart = moment(s.time_slot, 'HH:mm:ss')
        const sEnd = s.end_time 
          ? moment(s.end_time, 'HH:mm:ss')
          : moment(s.time_slot, 'HH:mm:ss').add(1, 'hour')
        
        return (newStartTime.isBefore(sEnd) && newEndTime.isAfter(sStart))
      })

      if (roomConflict) {
        alert(t('schedules.cannotMoveRoomOccupied'))
        await fetchSchedules() // Refresh to show correct position
        return
      }
    }

      try {
        const { error } = await supabase
          .from('schedules')
          .update({
            time_slot: newStartTime.format('HH:mm:ss'),
            end_time: newEndTime.format('HH:mm:ss'),
            week_day: newWeekDay,
            room_id: null, // Room is set at class level
          })
          .eq('id', scheduleId)

      if (error) throw error
      await fetchSchedules()
    } catch (error) {
      console.error('Error updating schedule:', error)
      alert(t('schedules.errorUpdating'))
      await fetchSchedules() // Refresh on error
    }
  }

  // Handle resize (drag boundary) in calendar
  const handleEventResize = async (args: EventInteractionArgs) => {
    const { event, start, end } = args
    const eventWithResource = event as EventWithId & { resource: Schedule }
    const schedule = eventWithResource.resource
    
    // Extract schedule ID from event ID (format: uuid-YYYY-WW)
    // UUIDs have 5 parts separated by hyphens, so if there are more parts, remove the last 2 (year-week)
    let scheduleId = schedule.id
    if (typeof event.id === 'string') {
      const parts = event.id.split('-')
      if (parts.length > 5) {
        // UUID has 5 parts, remove last 2 (year and week)
        scheduleId = parts.slice(0, -2).join('-')
      } else {
        scheduleId = event.id
      }
    }
    
    const newStartTime = moment(start instanceof Date ? start : new Date(start))
    const newEndTime = moment(end instanceof Date ? end : new Date(end))

    try {
      const { error } = await supabase
        .from('schedules')
        .update({
          time_slot: newStartTime.format('HH:mm:ss'),
          end_time: newEndTime.format('HH:mm:ss'),
        })
        .eq('id', scheduleId)

      if (error) throw error
      await fetchSchedules()
    } catch (error) {
      console.error('Error resizing schedule:', error)
      alert(t('schedules.errorResizing'))
    }
  }

  // Handle selecting a time slot to create new schedule
  const handleSelectSlot = ({ start, end }: SlotInfo) => {
    const startMoment = moment(start)
    const endMoment = moment(end)
    setFormData({
      class_id: '',
      start_time: startMoment.format('HH:mm'),
      end_time: endMoment.format('HH:mm'),
      week_day: startMoment.day(),
    })
    setIsModalOpen(true)
  }

  const paginatedSchedules = schedules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  const totalPages = Math.ceil(schedules.length / itemsPerPage)

  const getTeacherNames = (teacherIds: string[]) => {
    return teacherIds
      .map(id => {
        const teacher = teachers.find(t => t.id === id)
        return teacher ? `${teacher.first_name} ${teacher.last_name}` : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  // Generate a consistent color for each class based on class ID
  const getClassColor = (classId: string | undefined): { bg: string; border: string } => {
    if (!classId) {
      return { bg: '#6b7280', border: '#4b5563' } // Gray for classes without ID
    }

    // Predefined palette of distinct colors
    const colors = [
      { bg: '#3b82f6', border: '#2563eb' }, // Blue
      { bg: '#10b981', border: '#059669' }, // Green
      { bg: '#f59e0b', border: '#d97706' }, // Amber
      { bg: '#ef4444', border: '#dc2626' }, // Red
      { bg: '#8b5cf6', border: '#7c3aed' }, // Purple
      { bg: '#ec4899', border: '#db2777' }, // Pink
      { bg: '#06b6d4', border: '#0891b2' }, // Cyan
      { bg: '#84cc16', border: '#65a30d' }, // Lime
      { bg: '#f97316', border: '#ea580c' }, // Orange
      { bg: '#6366f1', border: '#4f46e5' }, // Indigo
      { bg: '#14b8a6', border: '#0d9488' }, // Teal
      { bg: '#a855f7', border: '#9333ea' }, // Violet
      { bg: '#22c55e', border: '#16a34a' }, // Emerald
      { bg: '#f43f5e', border: '#e11d48' }, // Rose
      { bg: '#0ea5e9', border: '#0284c7' }, // Sky
      { bg: '#64748b', border: '#475569' }, // Slate
    ]

    // Simple hash function to convert class ID to a number
    let hash = 0
    for (let i = 0; i < classId.length; i++) {
      hash = classId.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    // Use absolute value and modulo to get index
    const colorIndex = Math.abs(hash) % colors.length
    return colors[colorIndex]
  }

  const eventStyleGetter = (event: EventWithId) => {
    const schedule = (event as EventWithId & { resource: Schedule }).resource
    const classId = schedule.class_id
    const { bg, border } = getClassColor(classId)
    
    return {
      style: {
        backgroundColor: bg,
        borderColor: border,
        color: 'white',
        borderRadius: '4px',
        border: '1px solid',
        padding: '2px 4px',
      },
    }
  }

  const getWeekDayName = (weekDay: number) => {
    return weekDays[weekDay] || ''
  }

  const getRoomName = (roomId: string | null) => {
    if (!roomId) return '-'
    const room = rooms.find(r => r.id === roomId)
    return room ? room.name : roomId
  }

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('schedules.class'), accessor: (row) => row.classes?.name || '' },
      { header: t('schedules.weekDay'), accessor: (row) => getWeekDayName(row.week_day) },
      { header: t('schedules.startTime'), accessor: (row) => row.time_slot },
      { header: t('schedules.endTime'), accessor: (row) => row.end_time || '' },
      { header: t('schedules.room'), accessor: (row) => row.classes?.rooms?.name || getRoomName(row.classes?.room_id || null) },
      { header: t('schedules.teacher'), accessor: (row) => row.classes?.teachers_ids ? getTeacherNames(row.classes.teachers_ids) : '' },
    ]
    exportToXLS(schedules, columns, 'schedules')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('schedules.class'), accessor: (row) => row.classes?.name || '' },
      { header: t('schedules.weekDay'), accessor: (row) => getWeekDayName(row.week_day) },
      { header: t('schedules.startTime'), accessor: (row) => row.time_slot },
      { header: t('schedules.endTime'), accessor: (row) => row.end_time || '' },
      { header: t('schedules.room'), accessor: (row) => row.classes?.rooms?.name || getRoomName(row.classes?.room_id || null) },
      { header: t('schedules.teacher'), accessor: (row) => row.classes?.teachers_ids ? getTeacherNames(row.classes.teachers_ids) : '' },
    ]
    exportToCSV(schedules, columns, 'schedules')
  }

  const fetchDayAttendanceDetails = async (date: string) => {
    setLoadingDayDetails(true)
    try {
      // Fetch all attendances for this date
      const { data: attendances, error: attendancesError } = await supabase
        .from('attendances')
        .select(`
          id,
          class_id,
          courses(name)
        `)
        .eq('date', date)

      if (attendancesError) {
        console.error('Error fetching attendances:', attendancesError)
        // Fallback: fetch attendances without relationship
        const { data: attendancesOnly, error: attendancesOnlyError } = await supabase
          .from('attendances')
          .select('id, class_id')
          .eq('date', date)
        
        if (attendancesOnlyError) throw attendancesOnlyError
        
        if (!attendancesOnly || attendancesOnly.length === 0) {
          setDayAttendanceData([])
          setLoadingDayDetails(false)
          return
        }

        // Fetch course names separately
        const attendancesWithCourses = await Promise.all(attendancesOnly.map(async (attendance) => {
          const { data: courseData } = await supabase
            .from('courses')
            .select('name')
            .eq('id', attendance.class_id)
            .single()
          
          return {
            ...attendance,
            courses: courseData
          }
        }))

        const attendanceIds = attendancesWithCourses.map(a => a.id)

        // Fetch all student presences for these attendances
        const { data: presences, error: presencesError } = await supabase
          .from('student_presences')
          .select(`
            id,
            student_id,
            attendance_id,
            status,
            comment,
            students(student_first_name, student_last_name)
          `)
          .in('attendance_id', attendanceIds)

        if (presencesError) throw presencesError

        // Group by class
        const groupedByClass: Record<string, {
          class_id: string
          class_name: string
          students: Array<{
            id: string
            student_first_name: string
            student_last_name: string
            status: string
            comment: string | null
          }>
        }> = {}

        attendancesWithCourses.forEach(attendance => {
          const classId = attendance.class_id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const className = (attendance.courses as any)?.name || classes.find(c => c.id === classId)?.name || t('schedules.noName') || 'Без назви'
          
          if (!groupedByClass[classId]) {
            groupedByClass[classId] = {
              class_id: classId,
              class_name: className,
              students: []
            }
          }

          // Add students for this attendance
          const classPresences = presences?.filter(p => p.attendance_id === attendance.id) || []
          classPresences.forEach(presence => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const student = presence.students as any
            groupedByClass[classId].students.push({
              id: presence.student_id,
              student_first_name: student?.student_first_name || '',
              student_last_name: student?.student_last_name || '',
              status: presence.status,
              comment: presence.comment
            })
          })
        })

        // Convert to array
        const result = Object.values(groupedByClass)
        setDayAttendanceData(result)
        setLoadingDayDetails(false)
        return
      }

      if (!attendances || attendances.length === 0) {
        setDayAttendanceData([])
        setLoadingDayDetails(false)
        return
      }

      // Get all attendance IDs
      const attendanceIds = attendances.map(a => a.id)

      // Fetch all student presences for these attendances
      const { data: presences, error: presencesError } = await supabase
        .from('student_presences')
        .select(`
          id,
          student_id,
          attendance_id,
          status,
          comment,
          students(student_first_name, student_last_name)
        `)
        .in('attendance_id', attendanceIds)

      if (presencesError) {
        console.error('Error fetching presences:', presencesError)
        // Fallback: fetch presences without relationship
        const { data: presencesOnly, error: presencesOnlyError } = await supabase
          .from('student_presences')
          .select('id, student_id, attendance_id, status, comment')
          .in('attendance_id', attendanceIds)
        
        if (presencesOnlyError) throw presencesOnlyError

        // Fetch student names separately
        const studentIds = [...new Set(presencesOnly?.map(p => p.student_id) || [])]
        const { data: studentsData } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name')
          .in('id', studentIds)

        const studentsMap = new Map(studentsData?.map(s => [s.id, s]) || [])

        // Group by class
        const groupedByClass: Record<string, {
          class_id: string
          class_name: string
          students: Array<{
            id: string
            student_first_name: string
            student_last_name: string
            status: string
            comment: string | null
          }>
        }> = {}

        attendances.forEach(attendance => {
          const classId = attendance.class_id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const className = (attendance.courses as any)?.name || classes.find(c => c.id === classId)?.name || t('schedules.noName') || 'Без назви'
          
          if (!groupedByClass[classId]) {
            groupedByClass[classId] = {
              class_id: classId,
              class_name: className,
              students: []
            }
          }

          // Add students for this attendance
          const classPresences = presencesOnly?.filter(p => p.attendance_id === attendance.id) || []
          classPresences.forEach(presence => {
            const student = studentsMap.get(presence.student_id)
            groupedByClass[classId].students.push({
              id: presence.student_id,
              student_first_name: student?.student_first_name || '',
              student_last_name: student?.student_last_name || '',
              status: presence.status,
              comment: presence.comment
            })
          })
        })

        // Convert to array
        const result = Object.values(groupedByClass)
        setDayAttendanceData(result)
        setLoadingDayDetails(false)
        return
      }

      // Group by class
      const groupedByClass: Record<string, {
        class_id: string
        class_name: string
        students: Array<{
          id: string
          student_first_name: string
          student_last_name: string
          status: string
          comment: string | null
        }>
      }> = {}

      attendances.forEach(attendance => {
        const classId = attendance.class_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const className = (attendance.courses as any)?.name || classes.find(c => c.id === classId)?.name || t('schedules.noName') || 'Без назви'
        
        if (!groupedByClass[classId]) {
          groupedByClass[classId] = {
            class_id: classId,
            class_name: className,
            students: []
          }
        }

        // Add students for this attendance
        const classPresences = presences?.filter(p => p.attendance_id === attendance.id) || []
        classPresences.forEach(presence => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const student = presence.students as any
          groupedByClass[classId].students.push({
            id: presence.student_id,
            student_first_name: student?.student_first_name || '',
            student_last_name: student?.student_last_name || '',
            status: presence.status,
            comment: presence.comment
          })
        })
      })

      // Convert to array
      const result = Object.values(groupedByClass)
      setDayAttendanceData(result)
    } catch (error) {
      console.error('Error fetching day attendance details:', error)
      setDayAttendanceData([])
    } finally {
      setLoadingDayDetails(false)
    }
  }

  const handleViewDayDetails = async (date: string) => {
    setSelectedDateForDetails(date)
    setIsDayDetailsModalOpen(true)
    await fetchDayAttendanceDetails(date)
  }

  if (loading) {
    return <div className="p-8 text-gray-900">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('schedules.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={schedules.length === 0}
            />
          )}
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => setView('list')}
          >
            {t('schedules.list')}
          </Button>
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            onClick={() => setView('calendar')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            {t('schedules.calendar')}
          </Button>
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('schedules.addSchedule')}
          </Button>
        </div>
      </div>

      {view === 'calendar' ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-700">{t('schedules.room')}:</label>
              <div className="w-64">
                <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
                  <option value="">{t('schedules.allRooms')}</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newDate = moment(currentDate).subtract(1, 'week').toDate()
                  setCurrentDate(newDate)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
                {t('common.today')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newDate = moment(currentDate).add(1, 'week').toDate()
                  setCurrentDate(newDate)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="ml-4 text-sm font-medium text-gray-700">
                {moment(currentDate).startOf('week').format('D MMM')} - {moment(currentDate).endOf('week').format('D MMM YYYY')}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4" style={{ height: '700px' }}>
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            startAccessor={(event: EventWithId) => event.start || new Date()}
            endAccessor={(event: EventWithId) => event.end || new Date()}
            style={{ height: '100%' }}
            view="week"
            views={['week']}
            defaultView="week"
            date={currentDate} // Controlled date for navigation
            onNavigate={(newDate: Date) => setCurrentDate(newDate)}
            culture="uk" // Use Ukrainian culture
            min={(() => { const d = new Date(); d.setHours(7, 0, 0, 0); return d })()}
            max={(() => { const d = new Date(); d.setHours(21, 0, 0, 0); return d })()}
            onEventDrop={handleEventDrop as (args: { event: object; start: Date | string; end: Date | string }) => void}
            onEventResize={handleEventResize as (args: { event: object; start: Date | string; end: Date | string }) => void}
            onSelectSlot={handleSelectSlot}
            selectable
            resizable
            draggableAccessor={() => true}
            eventPropGetter={eventStyleGetter}
            components={{
              toolbar: CustomToolbar,
              event: createCustomEvent(hasAttendance),
              header: createCustomDayHeader(handleViewDayDetails),
            }}
            messages={{
              next: t('common.next'),
              previous: t('common.previous'),
              today: t('common.today'),
              week: t('schedules.week'),
              noEventsInRange: t('schedules.noEventsInRange'),
            }}
            onSelectEvent={(event: EventWithId) => {
              const schedule = (event as EventWithId & { resource: Schedule }).resource
              const eventDate = event.start instanceof Date ? event.start : event.start ? new Date(event.start) : new Date()
              // Open attendance modal by default, user can edit schedule from list view
              handleOpenAttendanceModal(schedule, moment(eventDate).format('YYYY-MM-DD'))
            }}
            onDoubleClickEvent={(event: EventWithId) => {
              // Double click to edit schedule
              handleEdit((event as EventWithId & { resource: Schedule }).resource)
            }}
            popup
          />
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.room')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.class')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.teachers')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.startTime')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.endTime')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('schedules.day')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedSchedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                      {schedule.classes?.rooms?.name || schedule.classes?.room_id ? 
                        rooms.find(r => r.id === schedule.classes?.room_id)?.name || '-' : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                      {schedule.classes?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {schedule.classes?.teachers_ids
                        ? getTeacherNames(schedule.classes.teachers_ids)
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedule.time_slot}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {schedule.end_time || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {weekDays[schedule.week_day]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(schedule)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
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

          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-700">{t('common.show')}:</label>
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
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t('common.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingSchedule ? t('schedules.editSchedule') : t('schedules.addSchedule')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {conflicts.length > 0 && (
            <div className="p-3 bg-red-50 border-2 border-red-400 rounded">
              <p className="text-sm font-medium text-red-800 mb-2">{t('schedules.conflictsFound')}:</p>
              <ul className="list-disc list-inside text-sm text-red-700">
                {conflicts.map((conflict, idx) => (
                  <li key={idx}>{conflict}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('schedules.class')} *
            </label>
            <Select
              value={formData.class_id}
              onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
              required
            >
              <option value="">{t('schedules.selectClass')}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('schedules.startTime')} *
              </label>
              <Input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('schedules.endTime')} *
              </label>
              <Input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('schedules.dayOfWeek')} *
            </label>
            <Select
              value={formData.week_day.toString()}
              onChange={(e) => setFormData({ ...formData, week_day: Number(e.target.value) })}
              required
            >
              {weekDays.map((day, idx) => (
                <option key={idx} value={idx}>
                  {day}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-between items-center">
            {editingSchedule && (
              <Button
                type="button"
                variant="destructive"
                onClick={async () => {
                  if (confirm(t('schedules.confirmDelete'))) {
                    await handleDelete(editingSchedule.id)
                    setIsModalOpen(false)
                    resetForm()
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common.delete')}
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={conflicts.length > 0} variant={editingSchedule ? "default" : "success"}>
                {editingSchedule ? t('common.save') : t('schedules.addSchedule')}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Attendance Creation Modal */}
      <Modal
        isOpen={isAttendanceModalOpen}
        onClose={() => {
          setIsAttendanceModalOpen(false)
          setSelectedScheduleForAttendance(null)
          setSelectedDateForAttendance('')
          setEditingAttendanceId(null)
          setStudentPresences({})
          setClassStudents([])
        }}
        title={editingAttendanceId ? (t('attendances.editAttendance') || 'Редагувати відвідуваність') : (t('attendances.addAttendance') || 'Додати відвідуваність')}
        size="xl"
      >
        <form onSubmit={handleCreateAttendance} className="flex flex-col h-full space-y-4">
          <div className="grid grid-cols-2 gap-4 flex-shrink-0">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('attendances.class')} *
              </label>
              <Input
                type="text"
                value={selectedScheduleForAttendance ? classes.find(c => c.id === selectedScheduleForAttendance.class_id)?.name || '' : ''}
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('attendances.date')} *
              </label>
              <Input
                type="date"
                value={selectedDateForAttendance}
                disabled
              />
            </div>
          </div>

          {classStudents.length > 0 ? (
            <div className="flex flex-col flex-1 min-h-0">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('attendances.students')}
              </label>
              <div className="space-y-2 flex-1 overflow-y-auto border rounded p-4">
                {classStudents.map((student) => (
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
                          {t('payments.availableLessons') || 'Доступні уроки'}: {studentAvailableLessons[student.id] ?? 0}
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
                                class_id: selectedScheduleForAttendance!.class_id,
                                package_type_id: '',
                                status: 'paid',
                                type: 'cash',
                              })
                              // Load package types for selected class
                              try {
                                const { data } = await supabase
                                  .from('package_types')
                                  .select('id, name, lesson_count, amount')
                                  .eq('class_id', selectedScheduleForAttendance!.class_id)
                                setClassPackageTypes((data as { id: string; name: string; lesson_count: number; amount: number }[] | null)?.map(pt => ({ id: pt.id, name: pt.name, lesson_count: pt.lesson_count, amount: pt.amount })) || [])
                              } catch {
                                setClassPackageTypes([])
                              }
                              setCreatePaymentModalOpen(true)
                            }}
                          >
                            {t('payments.addPayment') || 'Додати платіж'}
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
                      <option value="present">{t('attendances.present') || 'Присутній'}</option>
                      <option value="absent">{t('attendances.absent') || 'Відсутній'}</option>
                      <option value="absent with valid reason">{t('attendances.absentValidReason') || 'Відсутній з поважною причиною'}</option>
                    </Select>
                    <Input
                      placeholder={t('attendances.comment') || 'Коментар'}
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
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                {t('attendances.noStudents') || 'У цьому класі немає студентів. Неможливо створити відвідуваність.'}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 flex-shrink-0 pt-4 border-t">
            {!editingAttendanceId && classStudents.length > 0 && classStudents.some(student => {
              const hasValidReason = studentPresences[student.id]?.status === 'absent with valid reason'
              return !hasValidReason && (studentAvailableLessons[student.id] ?? 0) < 1
            }) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
                <p className="text-sm text-red-800">
                  {t('attendances.studentsWithoutPayment') || 'Деякі студенти не мають платежу. Будь ласка, створіть платіж перед додаванням відвідуваності.'}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAttendanceModalOpen(false)
                  setSelectedScheduleForAttendance(null)
                  setSelectedDateForAttendance('')
                  setEditingAttendanceId(null)
                  setStudentPresences({})
                  setClassStudents([])
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button 
                type="submit" 
                variant="success"
                disabled={
                  classStudents.length === 0 || 
                  (!editingAttendanceId && classStudents.some(student => {
                    const hasValidReason = studentPresences[student.id]?.status === 'absent with valid reason'
                    return !hasValidReason && (studentAvailableLessons[student.id] ?? 0) < 1
                  }))
                }
              >
                {editingAttendanceId ? (t('attendances.saveAttendance') || 'Зберегти відвідуваність') : (t('attendances.addAttendance') || 'Додати відвідуваність')}
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
          if (selectedScheduleForAttendance) {
            await refreshStudentLessons(selectedScheduleForAttendance.class_id)
          }
        }}
        title={t('payments.addPayment') || 'Додати платіж'}
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
              const paymentData = {
                student_id: paymentForm.student_id,
                class_id: paymentForm.class_id,
                package_type_id: paymentForm.package_type_id,
                status: paymentForm.status,
                type: paymentForm.type,
              }
              
              // Verify the object doesn't have available_lesson_count
              if ('available_lesson_count' in paymentData) {
                delete (paymentData as Record<string, unknown>).available_lesson_count
              }
              
              console.log('Creating payment with clean data:', paymentData)
              
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
              if (selectedScheduleForAttendance) {
                await refreshStudentLessons(selectedScheduleForAttendance.class_id)
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.student') || 'Студент'}</label>
              <Select value={paymentForm.student_id} disabled>
                <option value={paymentForm.student_id}>
                  {students.find(s => s.id === paymentForm.student_id)?.student_first_name} {students.find(s => s.id === paymentForm.student_id)?.student_last_name}
                </option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.class') || 'Клас'}</label>
              <Select value={paymentForm.class_id} disabled>
                <option value={paymentForm.class_id}>{classes.find(c => c.id === paymentForm.class_id)?.name}</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.packageType') || 'Тип пакету'}</label>
              <Select
                value={paymentForm.package_type_id}
                onChange={(e) => {
                  setPaymentForm({
                    ...paymentForm,
                    package_type_id: e.target.value,
                  })
                }}
              >
                <option value="">{t('payments.selectPackageType') || 'Виберіть тип пакету'}</option>
                {classPackageTypes.length === 0 && (
                  <option value="" disabled>
                    {t('payments.selectClassFirst') || 'Спочатку виберіть клас'}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.status') || 'Статус'}</label>
              <Select value={paymentForm.status} onChange={(e) => setPaymentForm({ ...paymentForm, status: e.target.value })}>
                <option value="paid">{t('payments.paid') || 'Оплачено'}</option>
                <option value="pending">{t('payments.pending') || 'Очікується'}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.paymentType') || 'Тип платежу'}</label>
              <Select value={paymentForm.type} onChange={(e) => setPaymentForm({ ...paymentForm, type: e.target.value })}>
                <option value="cash">{t('payments.cash') || 'Готівка'}</option>
                <option value="card">{t('payments.card') || 'Картка'}</option>
                <option value="free">{t('payments.free') || 'Безплатне'}</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreatePaymentModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="success" disabled={!paymentForm.student_id || !paymentForm.class_id || !paymentForm.package_type_id}>
              {t('payments.addPayment') || 'Додати платіж'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Day Details Modal */}
      <Modal
        isOpen={isDayDetailsModalOpen}
        onClose={() => {
          setIsDayDetailsModalOpen(false)
          setSelectedDateForDetails('')
          setDayAttendanceData([])
        }}
        title={t('schedules.dayDetails') || `Деталі дня ${selectedDateForDetails ? moment(selectedDateForDetails).format('DD.MM.YYYY') : ''}`}
        size="xl"
      >
        {loadingDayDetails ? (
          <div className="p-8 text-center text-gray-600">{t('common.loading')}</div>
        ) : dayAttendanceData.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            {t('schedules.noAttendanceForDay') || 'Немає відвідуваності для цього дня'}
          </div>
        ) : (
          <div className="space-y-6">
            {dayAttendanceData.map((classData) => (
              <div key={classData.class_id} className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {classData.class_name}
                </h3>
                {classData.students.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('schedules.noStudents') || 'Немає студентів'}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                            {t('students.studentName') || 'Студент'}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                            {t('attendances.status') || 'Статус'}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                            {t('attendances.comment') || 'Коментар'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {classData.students.map((student) => (
                          <tr key={student.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {student.student_first_name} {student.student_last_name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <span className={`inline-block px-2 py-1 rounded text-xs ${
                                student.status === 'present'
                                  ? 'bg-green-100 text-green-800'
                                  : student.status === 'absent with valid reason'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {student.status === 'present'
                                  ? (t('attendances.present') || 'Присутній')
                                  : student.status === 'absent with valid reason'
                                  ? (t('attendances.absentValidReason') || 'Відсутній з поважною причиною')
                                  : (t('attendances.absent') || 'Відсутній')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {student.comment || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
