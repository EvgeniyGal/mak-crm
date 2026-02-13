'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

interface Teacher {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  status: string
  comment: string | null
  assigned_class_ids: string[]
  created_at: string
}

interface Class {
  id: string
  name: string
}

export default function TeachersPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [itemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    date_of_birth: '',
    phone: '',
    email: '',
    status: 'active',
    comment: '',
    assigned_class_ids: [] as string[],
  })

  const fetchTeachers = useCallback(async () => {
    try {
      let allTeachers: Teacher[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('teachers')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allTeachers = [...allTeachers, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setTeachers(allTeachers)
    } catch (error) {
      console.error('Error fetching teachers:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

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

  useEffect(() => {
    fetchTeachers()
    fetchClasses()
  }, [fetchTeachers, fetchClasses])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        assigned_class_ids: formData.assigned_class_ids,
        middle_name: formData.middle_name || null,
        phone: formData.phone || null,
        email: formData.email || null,
        comment: formData.comment || null,
        date_of_birth: formData.date_of_birth || null,
      }

      if (editingTeacher) {
        const { error } = await supabase
          .from('teachers')
          .update(submitData)
          .eq('id', editingTeacher.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('teachers')
          .insert([submitData])
        if (error) throw error
      }

      await fetchTeachers()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving teacher:', error)
      alert(t('teachers.errorSaving'))
    }
  }

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setFormData({
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      middle_name: teacher.middle_name || '',
      date_of_birth: teacher.date_of_birth || '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      status: teacher.status,
      comment: teacher.comment || '',
      assigned_class_ids: teacher.assigned_class_ids,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('teachers.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchTeachers()
    } catch (error) {
      console.error('Error deleting teacher:', error)
      alert(t('teachers.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      middle_name: '',
      date_of_birth: '',
      phone: '',
      email: '',
      status: 'active',
      comment: '',
      assigned_class_ids: [],
    })
    setEditingTeacher(null)
  }

  const filteredTeachers = teachers.filter((teacher) => {
    const matchesSearch =
      searchTerm === '' ||
      `${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.phone && teacher.phone.includes(searchTerm)) ||
      (teacher.email && teacher.email.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || teacher.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // DataTable handles sorting internally, so we just pass filteredTeachers
  const sortedTeachers = filteredTeachers

  const getClassName = (classId: string) => {
    return classes.find(c => c.id === classId)?.name || classId
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return t('teachers.active')
      case 'probational':
        return t('teachers.probational')
      case 'fired':
        return t('teachers.fired')
      default:
        return status
    }
  }

  // Column definitions for DataTable
  const columns: ColumnDef<Teacher>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('teachers.teacher'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = `${rowA.original.first_name} ${rowA.original.last_name}`.toLowerCase()
        const b = `${rowB.original.first_name} ${rowB.original.last_name}`.toLowerCase()
        return a.localeCompare(b)
      },
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.first_name} {row.original.last_name} {row.original.middle_name || ''}
        </div>
      ),
    },
    {
      accessorKey: 'date_of_birth',
      header: t('teachers.dateOfBirth'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {row.original.date_of_birth ? formatDate(row.original.date_of_birth) : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: t('teachers.phone'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">{row.original.phone || '-'}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: t('teachers.email'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">{row.original.email || '-'}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('teachers.status'),
      enableSorting: true,
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
            status === 'active' ? 'bg-green-100 text-green-800' :
            status === 'probational' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {getStatusLabel(status)}
          </span>
        )
      },
    },
    {
      accessorKey: 'assigned_classes',
      header: t('teachers.assignedClasses'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.assigned_class_ids.length > 0
            ? row.original.assigned_class_ids.map(id => getClassName(id)).join(', ')
            : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('teachers.comment'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 max-w-xs truncate" title={row.original.comment || ''}>
          {row.original.comment || '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const teacher = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(teacher)}
              className="text-blue-600 hover:text-blue-900"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(teacher.id)}
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
      { header: t('teachers.firstName'), accessor: (row) => row.first_name },
      { header: t('teachers.lastName'), accessor: (row) => row.last_name },
      { header: t('teachers.middleName'), accessor: (row) => row.middle_name || '' },
      { header: t('teachers.dateOfBirth'), accessor: (row) => row.date_of_birth ? formatDate(row.date_of_birth) : '' },
      { header: t('teachers.phone'), accessor: (row) => row.phone || '' },
      { header: t('teachers.email'), accessor: (row) => row.email || '' },
      { header: t('teachers.status'), accessor: (row) => getStatusLabel(row.status) },
      { header: t('teachers.assignedClasses'), accessor: (row) => row.assigned_class_ids.map(getClassName).join(', ') || '' },
      { header: t('teachers.comment'), accessor: (row) => row.comment || '' },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(sortedTeachers, columns, 'teachers')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('teachers.firstName'), accessor: (row) => row.first_name },
      { header: t('teachers.lastName'), accessor: (row) => row.last_name },
      { header: t('teachers.middleName'), accessor: (row) => row.middle_name || '' },
      { header: t('teachers.dateOfBirth'), accessor: (row) => row.date_of_birth ? formatDate(row.date_of_birth) : '' },
      { header: t('teachers.phone'), accessor: (row) => row.phone || '' },
      { header: t('teachers.email'), accessor: (row) => row.email || '' },
      { header: t('teachers.status'), accessor: (row) => getStatusLabel(row.status) },
      { header: t('teachers.assignedClasses'), accessor: (row) => row.assigned_class_ids.map(getClassName).join(', ') || '' },
      { header: t('teachers.comment'), accessor: (row) => row.comment || '' },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(sortedTeachers, columns, 'teachers')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-gray-900 truncate min-w-0">{t('teachers.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedTeachers.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('teachers.addTeacher')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('teachers.addTeacher')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('common.search') + '...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('teachers.allStatuses')}</option>
            <option value="active">{t('teachers.active')}</option>
            <option value="probational">{t('teachers.probational')}</option>
            <option value="fired">{t('teachers.fired')}</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedTeachers}
        initialPageSize={itemsPerPage}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingTeacher ? t('teachers.editTeacher') : t('teachers.addTeacher')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.firstName')} *
              </label>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.lastName')} *
              </label>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.middleName')}
              </label>
              <Input
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.dateOfBirth')}
              </label>
              <Input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.phone')}
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.email')}
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.status')} *
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="active">{t('teachers.active')}</option>
                <option value="probational">{t('teachers.probational')}</option>
                <option value="fired">{t('teachers.fired')}</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('teachers.comment')}
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
              {t('teachers.assignedClasses')}
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2 bg-blue-50">
              {classes.map((cls) => (
                <label key={cls.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.assigned_class_ids.includes(cls.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          assigned_class_ids: [...formData.assigned_class_ids, cls.id],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          assigned_class_ids: formData.assigned_class_ids.filter(id => id !== cls.id),
                        })
                      }
                    }}
                    className="mr-2"
                  />
                  {cls.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingTeacher ? "default" : "success"}>
              {editingTeacher ? t('common.save') : t('teachers.addTeacher')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

