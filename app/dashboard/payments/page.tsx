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

interface Payment {
  id: string
  student_id: string
  class_id: string
  package_type_id: string
  status: string
  type: string
  available_lesson_count: number
  created_at: string
  updated_at?: string
  comment?: string
  students?: { student_first_name: string; student_last_name: string }
  courses?: { name: string }
  package_types?: { name: string; amount: number; lesson_count: number }
}

interface Student {
  id: string
  student_first_name: string
  student_last_name: string
}

interface Class {
  id: string
  name: string
}

interface PackageType {
  id: string
  name: string
  amount: number
  lesson_count: number
  class_id: string
}

export default function PaymentsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [payments, setPayments] = useState<Payment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [updatedRangeStart, setUpdatedRangeStart] = useState('')
  const [updatedRangeEnd, setUpdatedRangeEnd] = useState('')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    package_type_id: '',
    status: 'pending',
    type: 'cash',
    available_lesson_count: 0,
    comment: '',
  })

  const fetchPayments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          students(student_first_name, student_last_name),
          courses!class_id(name),
          package_types(name, amount, lesson_count)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPayments(data || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchStudents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')
        .eq('status', 'active')

      if (error) throw error
      setStudents(data || [])
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }, [supabase])

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }, [supabase])

  const fetchPackageTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('package_types')
        .select('*')
        .eq('status', 'active')

      if (error) throw error
      setPackageTypes(data || [])
    } catch (error) {
      console.error('Error fetching package types:', error)
    }
  }, [supabase])

  useEffect(() => {
    fetchPayments()
    fetchStudents()
    fetchClasses()
    fetchPackageTypes()
  }, [fetchPayments, fetchStudents, fetchClasses, fetchPackageTypes])

  const handleClassChange = (classId: string) => {
    setFormData({
      ...formData,
      class_id: classId,
      package_type_id: '', // Reset package type when class changes
    })
  }

  const handlePackageTypeChange = (packageTypeId: string) => {
    const packageType = packageTypes.find(pt => pt.id === packageTypeId)
    if (packageType) {
      setFormData({
        ...formData,
        package_type_id: packageTypeId,
        available_lesson_count: packageType.lesson_count,
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingPayment) {
        const { error } = await supabase
          .from('payments')
          .update(formData)
          .eq('id', editingPayment.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('payments')
          .insert([formData])
        if (error) throw error
      }

      await fetchPayments()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving payment:', error)
      alert(t('payments.errorSaving'))
    }
  }

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment)
    setFormData({
      student_id: payment.student_id,
      class_id: payment.class_id,
      package_type_id: payment.package_type_id,
      status: payment.status,
      type: payment.type,
      available_lesson_count: payment.available_lesson_count,
      comment: payment.comment || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchPayments()
    } catch (error) {
      console.error('Error deleting payment:', error)
      alert(t('common.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      student_id: '',
      class_id: '',
      package_type_id: '',
      status: 'pending',
      type: 'cash',
      available_lesson_count: 0,
      comment: '',
    })
    setEditingPayment(null)
  }

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      searchTerm === '' ||
      `${payment.students?.student_first_name} ${payment.students?.student_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.courses?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.comment && payment.comment.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter
    const matchesType = typeFilter === 'all' || payment.type === typeFilter
    const matchesCourse = courseFilter === 'all' || payment.class_id === courseFilter

    // Date range filter (created)
    let matchesDateRange = true
    if (dateRangeStart || dateRangeEnd) {
      const paymentDate = new Date(payment.created_at)
      if (dateRangeStart) {
        const startDate = new Date(dateRangeStart)
        startDate.setHours(0, 0, 0, 0)
        matchesDateRange = matchesDateRange && paymentDate >= startDate
      }
      if (dateRangeEnd) {
        const endDate = new Date(dateRangeEnd)
        endDate.setHours(23, 59, 59, 999)
        matchesDateRange = matchesDateRange && paymentDate <= endDate
      }
    }

    // Updated date range filter
    let matchesUpdatedRange = true
    if (updatedRangeStart || updatedRangeEnd) {
      const updatedDate = new Date(payment.updated_at || payment.created_at)
      if (updatedRangeStart) {
        const startUpdated = new Date(updatedRangeStart)
        startUpdated.setHours(0, 0, 0, 0)
        matchesUpdatedRange = matchesUpdatedRange && updatedDate >= startUpdated
      }
      if (updatedRangeEnd) {
        const endUpdated = new Date(updatedRangeEnd)
        endUpdated.setHours(23, 59, 59, 999)
        matchesUpdatedRange = matchesUpdatedRange && updatedDate <= endUpdated
      }
    }

    return matchesSearch && matchesStatus && matchesType && matchesCourse && matchesDateRange && matchesUpdatedRange
  })

  const sortedPayments = [...filteredPayments].sort((a, b) => {
    let aValue: string | number | Date = ''
    let bValue: string | number | Date = ''

    if (sortBy === 'created_at') {
      aValue = new Date(a.created_at)
      bValue = new Date(b.created_at)
    } else if (sortBy === 'student_name') {
      aValue = `${a.students?.student_first_name || ''} ${a.students?.student_last_name || ''}`.trim().toLowerCase()
      bValue = `${b.students?.student_first_name || ''} ${b.students?.student_last_name || ''}`.trim().toLowerCase()
    } else if (sortBy === 'course') {
      aValue = (a.courses?.name || '').toLowerCase()
      bValue = (b.courses?.name || '').toLowerCase()
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })

  const paginatedPayments = sortedPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage)

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

  const availablePackageTypes = formData.class_id
    ? packageTypes.filter(pt => pt.class_id === formData.class_id)
    : []

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('payments.student'), accessor: (row) => `${row.students?.student_first_name || ''} ${row.students?.student_last_name || ''}`.trim() },
      { header: t('payments.class'), accessor: (row) => row.courses?.name || '' },
      { header: t('payments.packageType'), accessor: (row) => row.package_types?.name || '' },
      { header: t('payments.amount'), accessor: (row) => row.package_types?.amount || 0 },
      { header: t('common.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : t('payments.pending') },
      { header: t('payments.paymentType'), accessor: (row) => row.type === 'cash' ? t('payments.cash') : row.type === 'card' ? t('payments.card') : t('payments.free') },
      { header: t('payments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
      { header: t('payments.comment'), accessor: (row) => row.comment || '' },
    ]
    exportToXLS(sortedPayments, columns, 'payments')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('payments.student'), accessor: (row) => `${row.students?.student_first_name || ''} ${row.students?.student_last_name || ''}`.trim() },
      { header: t('payments.class'), accessor: (row) => row.courses?.name || '' },
      { header: t('payments.packageType'), accessor: (row) => row.package_types?.name || '' },
      { header: t('payments.amount'), accessor: (row) => row.package_types?.amount || 0 },
      { header: t('common.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : t('payments.pending') },
      { header: t('payments.paymentType'), accessor: (row) => row.type === 'cash' ? t('payments.cash') : row.type === 'card' ? t('payments.card') : t('payments.free') },
      { header: t('payments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
      { header: t('payments.comment'), accessor: (row) => row.comment || '' },
    ]
    exportToCSV(sortedPayments, columns, 'payments')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('payments.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedPayments.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('payments.addPayment')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('payments.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('common.statuses')}</option>
            <option value="paid">{t('payments.paid')}</option>
            <option value="pending">{t('payments.pending')}</option>
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('common.types')}</option>
            <option value="cash">{t('payments.cash')}</option>
            <option value="card">{t('payments.card')}</option>
            <option value="free">{t('payments.free')}</option>
          </Select>
          <Select
            value={courseFilter}
            onChange={(e) => { setCourseFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('payments.courses')}</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.updatedFrom')}</label>
            <Input
              type="date"
              value={updatedRangeStart}
              onChange={(e) => { setUpdatedRangeStart(e.target.value); setCurrentPage(1) }}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.updatedTo')}</label>
            <Input
              type="date"
              value={updatedRangeEnd}
              onChange={(e) => { setUpdatedRangeEnd(e.target.value); setCurrentPage(1) }}
              className="w-48"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                  onClick={() => handleSort('student_name')}
                >
                  {t('payments.student')}
                  {getSortIcon('student_name')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('course')}
                >
                  {t('payments.class')}
                  {getSortIcon('course')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.packageType')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.amount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.paymentType')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.availableLessons')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('created_at')}
                >
                  {t('common.createdAt')}
                  {getSortIcon('created_at')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.updatedAt')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.comment')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
                    {payment.students ? `${payment.students.student_first_name} ${payment.students.student_last_name}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.courses?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.package_types?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.package_types?.amount ? `${payment.package_types.amount} грн` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      payment.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {payment.status === 'paid' ? t('payments.paid') : t('payments.pending')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.type === 'cash' ? t('payments.cash') : payment.type === 'card' ? t('payments.card') : t('payments.free')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-medium ${
                      payment.available_lesson_count > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {payment.available_lesson_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(payment.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(payment.updated_at || payment.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={payment.comment || ''}>
                    {payment.comment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(payment)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(payment.id)}
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
            <select
              value={itemsPerPage.toString()}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
            <span className="text-sm text-gray-700">
              {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedPayments.length)} {t('common.of')} {sortedPayments.length}
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
        title={editingPayment ? t('payments.editPayment') : t('payments.addPayment')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.student')} *</label>
            <Select
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              required
            >
              <option value="">{t('common.selectStudent')}</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_first_name} {student.student_last_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.class')} *</label>
            <Select
              value={formData.class_id}
              onChange={(e) => handleClassChange(e.target.value)}
              required
            >
              <option value="">{t('common.selectClass')}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.packageType')} *</label>
            <Select
              value={formData.package_type_id}
              onChange={(e) => handlePackageTypeChange(e.target.value)}
              required
              disabled={!formData.class_id}
            >
              <option value="">{t('common.selectPackageType')}</option>
              {availablePackageTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name} ({pt.lesson_count} {t('common.lessons')}, {pt.amount} {t('common.uah')})
                </option>
              ))}
            </Select>
            {!formData.class_id && (
              <p className="mt-1 text-sm text-gray-500">{t('payments.selectClassFirst')}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.status')} *</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="pending">{t('payments.pending')}</option>
                <option value="paid">{t('payments.paid')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.paymentType')} *</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
              >
                <option value="cash">{t('payments.cash')}</option>
                <option value="card">{t('payments.card')}</option>
                <option value="free">{t('payments.free')}</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.comment')}</label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              rows={3}
              placeholder={t('payments.commentPlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingPayment ? "default" : "success"}>
              {editingPayment ? t('common.save') : t('payments.addPayment')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

