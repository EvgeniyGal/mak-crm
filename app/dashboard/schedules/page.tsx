'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Calendar, Clock } from 'lucide-react'
import { Calendar as BigCalendar, momentLocalizer, Event, SlotInfo } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'moment/locale/uk'

const DragAndDropCalendar = withDragAndDrop(BigCalendar)

moment.locale('uk')
const localizer = momentLocalizer(moment)

// Custom toolbar component that hides all UI elements
const CustomToolbar = () => {
  return <div style={{ display: 'none' }} /> // Hide the toolbar completely
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

const weekDays = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота']

export default function SchedulesPage() {
  const supabase = createClient()
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

  const [formData, setFormData] = useState({
    class_id: '',
    start_time: '',
    end_time: '',
    week_day: 0,
  })

  useEffect(() => {
    fetchSchedules()
    fetchClasses()
    fetchRooms()
    fetchTeachers()
  }, [])

  useEffect(() => {
    checkConflicts()
  }, [formData, schedules])

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select(`
          *,
          classes(name, teachers_ids, room_id, rooms(name))
        `)
        .order('week_day', { ascending: true })
        .order('time_slot', { ascending: true })

      if (error) throw error
      setSchedules(data || [])
    } catch (error) {
      console.error('Error fetching schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, teachers_ids, room_id')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  const fetchRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error('Error fetching rooms:', error)
    }
  }

  const fetchTeachers = async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')

      if (error) throw error
      setTeachers(data || [])
    } catch (error) {
      console.error('Error fetching teachers:', error)
    }
  }

  // Convert schedules to calendar events - generate recurring weekly events
  // Generate events for multiple weeks so calendar navigation works
  const events = useMemo(() => {
    const eventsList: (Event & { resource: Schedule })[] = []
    const currentDate = moment()
    // Ensure we start from Sunday (0) not Monday
    // startOf('week') in Ukrainian locale might start on Monday, so we use isoWeek and subtract 1 day
    const startOfVisibleWeek = currentDate.clone().startOf('isoWeek').subtract(1, 'day').subtract(8, 'weeks')
    const endOfVisibleWeek = startOfVisibleWeek.clone().add(16, 'weeks') // Show 16 weeks total
    
    schedules.forEach((schedule) => {
      const startTime = moment(schedule.time_slot, 'HH:mm:ss')
      const endTime = schedule.end_time 
        ? moment(schedule.end_time, 'HH:mm:ss')
        : moment(schedule.time_slot, 'HH:mm:ss').add(1, 'hour')
      
      // Generate recurring events for each week
      let weekDate = startOfVisibleWeek.clone()
      while (weekDate.isBefore(endOfVisibleWeek)) {
        // week_day: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        // weekDate is already at Sunday (start of week), so we just add the day offset
        const eventStart = weekDate.clone()
          .add(schedule.week_day, 'days')
          .set({ hour: startTime.hour(), minute: startTime.minute(), second: 0, millisecond: 0 })

        const eventEnd = weekDate.clone()
          .add(schedule.week_day, 'days')
          .set({ hour: endTime.hour(), minute: endTime.minute(), second: 0, millisecond: 0 })

        eventsList.push({
          id: `${schedule.id}-${weekDate.format('YYYY-WW')}`, // Unique ID per week
          title: schedule.classes?.name || 'Без назви',
          start: eventStart.toDate(),
          end: eventEnd.toDate(),
          resource: schedule,
        } as Event & { resource: Schedule })
        
        // Move to the next week's Sunday
        weekDate.add(1, 'week')
      }
    })
    
    return eventsList
  }, [schedules])

  const checkConflicts = () => {
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
        const roomName = rooms.find(r => r.id === classRoomId)?.name || 'Кімната'
        newConflicts.push(`${roomName} вже зайнята на цей час`)
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
          const teacher = teachers.find(t => t.id === teacherId)
          newConflicts.push(`Вчитель ${teacher?.first_name} ${teacher?.last_name} вже має заняття на цей час`)
        }
      }
    }

    setConflicts(newConflicts)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (conflicts.length > 0) {
      alert('Виявлено конфлікти розкладу. Будь ласка, вирішіть їх перед збереженням.')
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
      alert('Помилка збереження розкладу')
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
    if (!confirm('Ви впевнені, що хочете видалити цей розклад?')) return

    try {
      const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchSchedules()
    } catch (error) {
      console.error('Error deleting schedule:', error)
      alert('Помилка видалення розкладу')
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

  // Handle drag and drop in calendar
  const handleEventDrop = async (args: any) => {
    const { event, start, end } = args
    const eventWithResource = event as Event & { resource: Schedule }
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
    const newStartTime = moment(start)
    const newEndTime = moment(end)
    
    // Calculate week_day: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Use native Date.getDay() for consistency - it returns 0-6 where 0 is Sunday
    const newWeekDay = new Date(start).getDay()

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
        alert('Неможливо перемістити: кімната вже зайнята на цей час.')
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
      alert('Помилка оновлення розкладу')
      await fetchSchedules() // Refresh on error
    }
  }

  // Handle resize (drag boundary) in calendar
  const handleEventResize = async (args: any) => {
    const { event, start, end } = args
    const eventWithResource = event as Event & { resource: Schedule }
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
    
    const newStartTime = moment(start)
    const newEndTime = moment(end)

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
      alert('Помилка зміни часу розкладу')
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

  const eventStyleGetter = (event: any) => {
    const schedule = (event as Event & { resource: Schedule }).resource
    const className = schedule.classes?.name || 'Без назви'
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

  if (loading) {
    return <div className="p-8 text-gray-900">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Розклад</h1>
        <div className="flex gap-2">
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => setView('list')}
          >
            Список
          </Button>
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            onClick={() => setView('calendar')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Календар
          </Button>
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            Додати розклад
          </Button>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="bg-white rounded-lg shadow p-4" style={{ height: '700px' }}>
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            startAccessor={(event: any) => event.start}
            endAccessor={(event: any) => event.end}
            style={{ height: '100%' }}
            view="week"
            views={['week']}
            defaultView="week"
            defaultDate={new Date()} // Set to current date
            culture="uk" // Use Ukrainian culture
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            onSelectSlot={handleSelectSlot}
            selectable
            resizable
            draggableAccessor={() => true}
            eventPropGetter={eventStyleGetter}
            components={{
              toolbar: CustomToolbar,
            }}
            messages={{
              next: 'Наступний',
              previous: 'Попередній',
              today: 'Сьогодні',
              week: 'Тиждень',
              noEventsInRange: 'Немає розкладу в цьому діапазоні',
            }}
            onSelectEvent={(event: any) => handleEdit((event as Event & { resource: Schedule }).resource)}
            popup
          />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Кімната</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Клас</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Вчителі</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Час початку</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Час закінчення</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">День</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase">Дії</th>
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
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingSchedule ? 'Редагувати розклад' : 'Додати розклад'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {conflicts.length > 0 && (
            <div className="p-3 bg-red-50 border-2 border-red-400 rounded">
              <p className="text-sm font-medium text-red-800 mb-2">Виявлено конфлікти:</p>
              <ul className="list-disc list-inside text-sm text-red-700">
                {conflicts.map((conflict, idx) => (
                  <li key={idx}>{conflict}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Клас *
            </label>
            <Select
              value={formData.class_id}
              onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
              required
            >
              <option value="">Вибрати клас</option>
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
                Час початку *
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
                Час закінчення *
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
              День тижня *
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
                  if (confirm('Ви впевнені, що хочете видалити цей розклад?')) {
                    await handleDelete(editingSchedule.id)
                    setIsModalOpen(false)
                    resetForm()
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Видалити
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
                Скасувати
              </Button>
              <Button type="submit" disabled={conflicts.length > 0}>
                {editingSchedule ? 'Зберегти зміни' : 'Додати розклад'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
