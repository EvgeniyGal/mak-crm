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

interface TeacherSalary {
  id: string
  teacher: string
  payment_type: string | null
  amount: number
  comment: string | null
  created_at: string
}

interface Teacher {
  id: string
  first_name: string
  last_name: string
}

export default function TeacherSalariesPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [salaries, setSalaries] = useState<TeacherSalary[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSalary, setEditingSalary] = useState<TeacherSalary | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')

  const [formData, setFormData] = useState({
    teacher: '',
    payment_type: 'cash',
    amount: 0,
    comment: '',
    salary_date: '',
  })

  const fetchSalaries = useCallback(async () => {
    try {
      let allSalaries: TeacherSalary[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('teacher_salaries')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allSalaries = [...allSalaries, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setSalaries(allSalaries)
    } catch (error) {
      console.error('Error fetching salaries:', error)
    } finally {
      setLoading(false)
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

  useEffect(() => {
    fetchSalaries()
    fetchTeachers()
  }, [fetchSalaries, fetchTeachers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingSalary) {
        const updateData: {
          teacher: string
          payment_type: string | null
          amount: number
          comment: string | null
          created_at?: string
          updated_at?: string
        } = {
          teacher: formData.teacher,
          payment_type: formData.payment_type || null,
          amount: formData.amount,
          comment: formData.comment || null,
        }

        // Update salary date (created_at and updated_at) if provided
        if (formData.salary_date) {
          const salaryDate = new Date(formData.salary_date)
          salaryDate.setHours(12, 0, 0, 0) // Set to noon to avoid timezone issues
          const dateISO = salaryDate.toISOString()
          updateData.created_at = dateISO
          updateData.updated_at = dateISO // Set both dates to the selected date
        }

        const { error } = await supabase
          .from('teacher_salaries')
          .update(updateData)
          .eq('id', editingSalary.id)
        if (error) throw error
      } else {
        const submitData = {
          teacher: formData.teacher,
          payment_type: formData.payment_type || null,
          amount: formData.amount,
          comment: formData.comment || null,
        }
        const { error } = await supabase
          .from('teacher_salaries')
          .insert([submitData])
        if (error) throw error
      }

      await fetchSalaries()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving salary:', error)
      alert('Помилка збереження зарплати')
    }
  }

  const handleEdit = useCallback((salary: TeacherSalary) => {
    setEditingSalary(salary)
    // Format salary date for date input (YYYY-MM-DD)
    const salaryDate = salary.created_at ? new Date(salary.created_at).toISOString().split('T')[0] : ''
    setFormData({
      teacher: salary.teacher,
      payment_type: salary.payment_type || 'cash',
      amount: salary.amount,
      comment: salary.comment || '',
      salary_date: salaryDate,
    })
    setIsModalOpen(true)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цю запис про зарплату?')) return

    try {
      const { error } = await supabase
        .from('teacher_salaries')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchSalaries()
    } catch (error) {
      console.error('Error deleting salary:', error)
      alert('Помилка видалення зарплати')
    }
  }, [supabase, fetchSalaries])

  const resetForm = () => {
    setFormData({
      teacher: '',
      payment_type: 'cash',
      amount: 0,
      comment: '',
      salary_date: '',
    })
    setEditingSalary(null)
  }

  const getTeacherName = useCallback((teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId)
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherId
  }, [teachers])

  const filteredSalaries = salaries.filter((salary) => {
    const matchesSearch =
      searchTerm === '' ||
      getTeacherName(salary.teacher).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (salary.comment && salary.comment.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesTeacher = teacherFilter === 'all' || salary.teacher === teacherFilter

    // Date range filter
    let matchesDateRange = true
    if (dateRangeStart || dateRangeEnd) {
      const salaryDate = new Date(salary.created_at)
      if (dateRangeStart) {
        const startDate = new Date(dateRangeStart)
        startDate.setHours(0, 0, 0, 0)
        matchesDateRange = matchesDateRange && salaryDate >= startDate
      }
      if (dateRangeEnd) {
        const endDate = new Date(dateRangeEnd)
        endDate.setHours(23, 59, 59, 999)
        matchesDateRange = matchesDateRange && salaryDate <= endDate
      }
    }

    return matchesSearch && matchesTeacher && matchesDateRange
  })

  // Column definitions for DataTable
  const columns: ColumnDef<TeacherSalary>[] = useMemo(() => [
    {
      accessorKey: 'teacher',
      header: t('teacherSalaries.teacher'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = getTeacherName(rowA.original.teacher).toLowerCase()
        const b = getTeacherName(rowB.original.teacher).toLowerCase()
        return a.localeCompare(b, 'uk')
      },
      cell: ({ row }) => (
        <div className="font-medium">{getTeacherName(row.original.teacher)}</div>
      ),
    },
    {
      accessorKey: 'payment_type',
      header: t('expenditures.paymentType'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = (rowA.original.payment_type || '').toLowerCase()
        const b = (rowB.original.payment_type || '').toLowerCase()
        return a.localeCompare(b, 'uk')
      },
      cell: ({ row }) => {
        const paymentType = row.original.payment_type
        return (
          <div className="text-sm text-gray-500">
            {paymentType === 'cash' ? t('expenditures.paymentTypeCash') :
             paymentType === 'card' ? t('expenditures.paymentTypeCard') :
             '-'}
          </div>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: t('teacherSalaries.amount'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm font-medium">
          {row.original.amount.toFixed(2)} {t('common.uah')}
        </div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('teacherSalaries.comment'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 max-w-xs truncate">{row.original.comment || '-'}</div>
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
        const salary = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(salary)}
              className="text-blue-600 hover:text-blue-900"
              title={t('common.edit')}
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(salary.id)}
              className="text-red-600 hover:text-red-900"
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, teachers, getTeacherName, handleEdit, handleDelete])

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('teacherSalaries.teacher'), accessor: (row) => getTeacherName(row.teacher) },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'card' ? t('expenditures.paymentTypeCard') : '' },
      { header: t('teacherSalaries.amount'), accessor: (row) => row.amount },
      { header: t('teacherSalaries.comment'), accessor: (row) => row.comment || '' },
      { header: t('teacherSalaries.date') || 'Дата', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredSalaries, columns, 'teacher-salaries')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('teacherSalaries.teacher'), accessor: (row) => getTeacherName(row.teacher) },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'card' ? t('expenditures.paymentTypeCard') : '' },
      { header: t('teacherSalaries.amount'), accessor: (row) => row.amount },
      { header: t('teacherSalaries.comment'), accessor: (row) => row.comment || '' },
      { header: t('teacherSalaries.date') || 'Дата', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredSalaries, columns, 'teacher-salaries')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('teacherSalaries.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredSalaries.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('teacherSalaries.addSalary')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('teacherSalaries.addSalary')}</span>
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
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('common.all')} {t('teachers.title')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.first_name} {teacher.last_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="w-full md:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.from')}</label>
            <Input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.to')}</label>
            <Input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredSalaries}
        initialPageSize={10}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingSalary ? t('teacherSalaries.editSalary') : t('teacherSalaries.addSalary')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('teacherSalaries.teacher')} *
            </label>
            <Select
              value={formData.teacher}
              onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
              required
            >
              <option value="">{t('common.selectTeacher')}</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.first_name} {teacher.last_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('expenditures.paymentType')} *
            </label>
            <Select
              value={formData.payment_type}
              onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              required
            >
              <option value="cash">{t('expenditures.paymentTypeCash')}</option>
              <option value="card">{t('expenditures.paymentTypeCard')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('teacherSalaries.amount')} *
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('teacherSalaries.comment')}
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:border-blue-500 focus:bg-white"
              rows={3}
            />
          </div>
          {editingSalary && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teacherSalaries.date')}
              </label>
              <Input
                type="date"
                value={formData.salary_date}
                onChange={(e) => setFormData({ ...formData, salary_date: e.target.value })}
                className="w-full"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingSalary ? "default" : "success"}>
              {editingSalary ? t('common.saveChanges') : t('teacherSalaries.addSalary')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
