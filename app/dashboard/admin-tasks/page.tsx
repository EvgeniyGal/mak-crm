'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search, Archive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

interface AdminTask {
  id: string
  title: string
  type: string
  comment: string | null
  status: string
  created_at: string
}

export default function AdminTasksPage() {
  const supabase = createClient()
  const { isOwner } = useOwner()
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [formData, setFormData] = useState({
    title: '',
    type: 'admin',
    comment: '',
    status: 'active',
  })

  const { t } = useTranslation()

  const fetchTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('admin_tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        comment: formData.comment || null,
      }

      if (editingTask) {
        const { error } = await supabase
          .from('admin_tasks')
          .update(submitData)
          .eq('id', editingTask.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('admin_tasks')
          .insert([submitData])
        if (error) throw error
      }

      await fetchTasks()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving task:', error)
      alert(t('adminTasks.errorSaving'))
    }
  }

  const handleEdit = useCallback((task: AdminTask) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      type: task.type,
      comment: task.comment || '',
      status: task.status,
    })
    setIsModalOpen(true)
  }, [])

  const handleArchive = useCallback(async (id: string) => {
    const comment = prompt('Введіть примітку для архівування:')
    if (comment === null) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .update({
          status: 'archive',
          comment: comment,
        })
        .eq('id', id)
      if (error) throw error
      await fetchTasks()
    } catch (error) {
      console.error('Error archiving task:', error)
      alert('Помилка архівування завдання')
    }
  }, [supabase, fetchTasks])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchTasks()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert(t('common.errorDeleting'))
    }
  }, [supabase, fetchTasks, t])

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'admin',
      comment: '',
      status: 'active',
    })
    setEditingTask(null)
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      searchTerm === '' ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.comment && task.comment.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesType = typeFilter === 'all' || task.type === typeFilter
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter

    return matchesSearch && matchesType && matchesStatus
  })

  // Column definitions for DataTable
  const columns: ColumnDef<AdminTask>[] = useMemo(() => [
    {
      accessorKey: 'title',
      header: t('adminTasks.titleLabel'),
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.original.title}</div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('adminTasks.type'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.type}</div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('adminTasks.comment'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 max-w-xs truncate">{row.original.comment || '-'}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          row.original.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {row.original.status === 'active' ? t('adminTasks.active') : t('adminTasks.archive')}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: t('common.createdAt'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{formatDate(row.original.created_at)}</div>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const task = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(task)}
              className="text-blue-600 hover:text-blue-900"
              title={t('common.edit')}
            >
              <Edit className="h-4 w-4" />
            </button>
            {task.status === 'active' && (
              <button
                onClick={() => handleArchive(task.id)}
                className="text-yellow-600 hover:text-yellow-900"
                title={t('adminTasks.archive')}
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => handleDelete(task.id)}
              className="text-red-600 hover:text-red-900"
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, handleEdit, handleArchive, handleDelete])

  const handleExportXLS = () => {
    const columns: ExportColumn<AdminTask>[] = [
      { header: t('adminTasks.titleLabel'), accessor: (row) => row.title },
      { header: t('adminTasks.type'), accessor: (row) => row.type },
      { header: t('adminTasks.comment'), accessor: (row) => row.comment || '' },
      { header: t('common.status'), accessor: (row) => row.status === 'active' ? t('adminTasks.active') : t('adminTasks.archive') },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredTasks, columns, 'admin-tasks')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn<AdminTask>[] = [
      { header: t('adminTasks.titleLabel'), accessor: (row) => row.title },
      { header: t('adminTasks.type'), accessor: (row) => row.type },
      { header: t('adminTasks.comment'), accessor: (row) => row.comment || '' },
      { header: t('common.status'), accessor: (row) => row.status === 'active' ? t('adminTasks.active') : t('adminTasks.archive') },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredTasks, columns, 'admin-tasks')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('adminTasks.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredTasks.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('adminTasks.addTask')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('adminTasks.addTask')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('adminTasks.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('common.all')} {t('adminTasks.allTypes')}</option>
            <option value="first lesson">{t('adminTasks.firstLesson')}</option>
            <option value="absent">{t('adminTasks.absent')}</option>
            <option value="admin">{t('adminTasks.admin')}</option>
            <option value="birthday">{t('adminTasks.birthday')}</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('common.all')} {t('common.statuses')}</option>
            <option value="active">{t('common.active')}</option>
            <option value="archive">{t('adminTasks.archive')}</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredTasks}
        initialPageSize={10}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingTask ? t('adminTasks.editTask') : t('adminTasks.addTask')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.title')} *
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('adminTasks.type')} *
            </label>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="first lesson">{t('adminTasks.firstLesson')}</option>
              <option value="absent">{t('adminTasks.absent')}</option>
              <option value="admin">{t('adminTasks.admin')}</option>
              <option value="birthday">{t('adminTasks.birthday')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('adminTasks.comment')}
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:border-blue-500 focus:bg-white"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.status')} *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">{t('common.active')}</option>
              <option value="archive">{t('adminTasks.archive')}</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingTask ? "default" : "success"}>
              {editingTask ? t('common.saveChanges') : t('adminTasks.addTask')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

