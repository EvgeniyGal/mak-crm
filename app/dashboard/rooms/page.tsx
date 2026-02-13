'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

interface Room {
  id: string
  name: string
  created_at: string
}

interface Class {
  id: string
  name: string
  room_id: string | null
}

export default function RoomsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [rooms, setRooms] = useState<Room[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [itemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    name: '',
  })

  const fetchRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setRooms(data || [])
    } catch (error) {
      console.error('Error fetching rooms:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchCourses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, room_id')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching courses:', error)
    }
  }, [supabase])

  useEffect(() => {
    fetchRooms()
    fetchCourses()
  }, [fetchRooms, fetchCourses])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingRoom) {
        const { error } = await supabase
          .from('rooms')
          .update(formData)
          .eq('id', editingRoom.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('rooms')
          .insert([formData])
        if (error) throw error
      }

      await fetchRooms()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving room:', error)
      alert(t('common.errorSaving'))
    }
  }

  const handleEdit = (room: Room) => {
    setEditingRoom(room)
    setFormData({
      name: room.name,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('rooms')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchRooms()
    } catch (error) {
      console.error('Error deleting room:', error)
      alert(t('common.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
    })
    setEditingRoom(null)
  }

  const getAssignedClasses = (roomId: string) => {
    return classes.filter(c => c.room_id === roomId)
  }

  const getClassesForRoom = (roomId: string) => {
    return classes.filter(c => c.room_id === roomId).map(c => c.name).join(', ') || '-'
  }

  // Column definitions for DataTable
  const columns: ColumnDef<Room>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('rooms.roomName'),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.name}</div>
      ),
    },
    {
      accessorKey: 'classes',
      header: t('rooms.classes'),
      cell: ({ row }) => {
        const assignedClasses = getAssignedClasses(row.original.id)
        return (
          <div className="text-sm text-gray-500">
            {assignedClasses.length > 0
              ? assignedClasses.map(c => c.name).join(', ')
              : '-'}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const room = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(room)}
              className="text-blue-600 hover:text-blue-900"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(room.id)}
              className="text-red-600 hover:text-red-900"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, classes, handleEdit, handleDelete])

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('rooms.roomName'), accessor: (row) => row.name },
      { header: t('rooms.classes'), accessor: (row) => getClassesForRoom(row.id) },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(rooms, columns, 'rooms')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('rooms.roomName'), accessor: (row) => row.name },
      { header: t('rooms.classes'), accessor: (row) => getClassesForRoom(row.id) },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(rooms, columns, 'rooms')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-gray-900 truncate min-w-0">{t('rooms.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={rooms.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('rooms.addRoom')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('rooms.addRoom')}</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={rooms}
        initialPageSize={itemsPerPage}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingRoom ? t('rooms.editRoom') : t('rooms.addRoom')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('rooms.roomName')} *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingRoom ? "default" : "success"}>
              {editingRoom ? t('common.save') : t('rooms.addRoom')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

