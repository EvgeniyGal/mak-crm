'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface Payment {
  id: string
  student_id: string
  class_id: string
  package_type_id: string
  status: string
  type: string
  available_lesson_count: number
  created_at: string
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
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    package_type_id: '',
    status: 'pending',
    type: 'cash',
    available_lesson_count: 0,
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
    })
    setEditingPayment(null)
  }

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      searchTerm === '' ||
      `${payment.students?.student_first_name} ${payment.students?.student_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.courses?.name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter
    const matchesType = typeFilter === 'all' || payment.type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage)

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
      { header: t('payments.paymentType'), accessor: (row) => row.type === 'cash' ? t('payments.cash') : row.type === 'card' ? t('payments.card') : t('payments.test') },
      { header: t('payments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredPayments, columns, 'payments')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('payments.student'), accessor: (row) => `${row.students?.student_first_name || ''} ${row.students?.student_last_name || ''}`.trim() },
      { header: t('payments.class'), accessor: (row) => row.courses?.name || '' },
      { header: t('payments.packageType'), accessor: (row) => row.package_types?.name || '' },
      { header: t('payments.amount'), accessor: (row) => row.package_types?.amount || 0 },
      { header: t('common.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : t('payments.pending') },
      { header: t('payments.paymentType'), accessor: (row) => row.type === 'cash' ? t('payments.cash') : row.type === 'card' ? t('payments.card') : t('payments.test') },
      { header: t('payments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredPayments, columns, 'payments')
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
              disabled={filteredPayments.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />
            {t('payments.addPayment')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
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
            <option value="test">{t('payments.test')}</option>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.student')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('payments.class')}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.createdAt')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
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
                    {payment.type === 'cash' ? t('payments.cash') : payment.type === 'card' ? t('payments.card') : t('payments.test')}
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
              {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredPayments.length)} {t('common.of')} {filteredPayments.length}
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
                <option value="test">{t('payments.test')}</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {editingPayment ? t('common.save') : t('payments.addPayment')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

