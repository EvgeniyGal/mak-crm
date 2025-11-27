'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

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
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    teacher: '',
    payment_type: 'cash',
    amount: 0,
    comment: '',
  })

  const fetchSalaries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_salaries')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setSalaries(data || [])
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
      const submitData = {
        ...formData,
        payment_type: formData.payment_type || null,
        comment: formData.comment || null,
      }

      if (editingSalary) {
        const { error } = await supabase
          .from('teacher_salaries')
          .update(submitData)
          .eq('id', editingSalary.id)
        if (error) throw error
      } else {
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

  const handleEdit = (salary: TeacherSalary) => {
    setEditingSalary(salary)
    setFormData({
      teacher: salary.teacher,
      payment_type: salary.payment_type || 'cash',
      amount: salary.amount,
      comment: salary.comment || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
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
  }

  const resetForm = () => {
    setFormData({
      teacher: '',
      payment_type: 'cash',
      amount: 0,
      comment: '',
    })
    setEditingSalary(null)
  }

  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId)
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : teacherId
  }

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

  const sortedSalaries = [...filteredSalaries].sort((a, b) => {
    let aValue: string | number | Date = ''
    let bValue: string | number | Date = ''

    if (sortBy === 'created_at') {
      aValue = new Date(a.created_at)
      bValue = new Date(b.created_at)
    } else if (sortBy === 'teacher') {
      aValue = getTeacherName(a.teacher).toLowerCase()
      bValue = getTeacherName(b.teacher).toLowerCase()
    } else if (sortBy === 'payment_type') {
      aValue = (a.payment_type || '').toLowerCase()
      bValue = (b.payment_type || '').toLowerCase()
    } else if (sortBy === 'amount') {
      aValue = a.amount
      bValue = b.amount
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })

  const paginatedSalaries = sortedSalaries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedSalaries.length / itemsPerPage)

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-4 w-4 inline ml-1 text-gray-400" />
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-4 w-4 inline ml-1 text-gray-600" />
      : <ArrowDown className="h-4 w-4 inline ml-1 text-gray-600" />
  }

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('teacherSalaries.teacher'), accessor: (row) => getTeacherName(row.teacher) },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'till' ? t('expenditures.paymentTypeTill') : '' },
      { header: t('teacherSalaries.amount'), accessor: (row) => row.amount },
      { header: t('teacherSalaries.comment'), accessor: (row) => row.comment || '' },
      { header: t('teacherSalaries.date') || 'Дата', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(sortedSalaries, columns, 'teacher-salaries')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('teacherSalaries.teacher'), accessor: (row) => getTeacherName(row.teacher) },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'till' ? t('expenditures.paymentTypeTill') : '' },
      { header: t('teacherSalaries.amount'), accessor: (row) => row.amount },
      { header: t('teacherSalaries.comment'), accessor: (row) => row.comment || '' },
      { header: t('teacherSalaries.date') || 'Дата', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(sortedSalaries, columns, 'teacher-salaries')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('teacherSalaries.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedSalaries.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('teacherSalaries.addSalary')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('common.search') + '...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={teacherFilter}
            onChange={(e) => { setTeacherFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('teachers.title')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.first_name} {teacher.last_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.from')}</label>
            <Input
              type="date"
              value={dateRangeStart}
              onChange={(e) => { setDateRangeStart(e.target.value); setCurrentPage(1) }}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.to')}</label>
            <Input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => { setDateRangeEnd(e.target.value); setCurrentPage(1) }}
              className="w-48"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('teacher')}
                >
                  {t('teacherSalaries.teacher')}
                  {getSortIcon('teacher')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('payment_type')}
                >
                  {t('expenditures.paymentType')}
                  {getSortIcon('payment_type')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('amount')}
                >
                  {t('teacherSalaries.amount')}
                  {getSortIcon('amount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teacherSalaries.comment')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('created_at')}
                >
                  {t('common.createdAt')}
                  {getSortIcon('created_at')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedSalaries.map((salary) => (
                <tr key={salary.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    {getTeacherName(salary.teacher)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {salary.payment_type === 'cash' ? t('expenditures.paymentTypeCash') :
                     salary.payment_type === 'till' ? t('expenditures.paymentTypeTill') :
                     '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {salary.amount.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {salary.comment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(salary.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(salary)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(salary.id)}
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

        {/* Pagination */}
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
            <span className="text-sm text-gray-700">
              {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedSalaries.length)} {t('common.of')} {sortedSalaries.length}
            </span>
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
              <option value="till">{t('expenditures.paymentTypeTill')}</option>
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
