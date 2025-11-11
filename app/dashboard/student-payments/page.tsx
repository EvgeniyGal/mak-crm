'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Search, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOwner } from '@/lib/hooks/useOwner'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

interface PaymentData {
  student_id: string
  student_name: string
  package_type_name: string | null
  lesson_count: number | null
  available_lesson_count: number
  payment_type: string
  payment_date: string
  payment_id: string
}

interface PackageType {
  id: string
  name: string
  lesson_count?: number
  class_id?: string
}

export default function StudentPaymentsPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const tt = (key: string, fallback: string) => {
    const v = t(key)
    return v === key ? fallback : v
  }
  const { isOwner } = useOwner()
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([])
  const [students, setStudents] = useState<{ id: string; student_first_name: string; student_last_name: string }[]>([])
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [packageFilter, setPackageFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [availableLessonsFilter, setAvailableLessonsFilter] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [sortBy, setSortBy] = useState<string>('student_name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    package_type_id: '',
    status: 'pending',
    type: 'cash',
    available_lesson_count: 0,
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Get all active students
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, student_first_name, student_last_name')
        .eq('status', 'active')

      if (studentsError) throw studentsError
      setStudents(students || [])

      // Get package types for filtering
      const { data: packages, error: packagesError } = await supabase
        .from('package_types')
        .select('id, name, lesson_count, class_id')
        .eq('status', 'active')

      if (packagesError) throw packagesError
      setPackageTypes(packages || [])

      // Get classes for selection
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('id, name')
        .eq('status', 'active')

      if (classesError) throw classesError
      setClasses(classesData || [])

      // Get all payments for active students
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          student_id,
          package_type_id,
          type,
          available_lesson_count,
          created_at,
          package_types!inner(name, lesson_count)
        `)
        .in('student_id', students?.map(s => s.id) || [])
        .order('created_at', { ascending: false })

      if (paymentsError) throw paymentsError

      // Build payment data per student (latest payment)
      const paymentMap = new Map<string, PaymentData>()

      if (paymentsData) {
        for (const payment of paymentsData) {
          const student = students?.find(s => s.id === payment.student_id)
          if (!student) continue

          // Get the latest payment for each student
          const existing = paymentMap.get(payment.student_id)
          if (!existing || new Date(payment.created_at) > new Date(existing.payment_date)) {
            paymentMap.set(payment.student_id, {
              student_id: payment.student_id,
              student_name: `${student.student_first_name} ${student.student_last_name}`,
              package_type_name: (payment.package_types as { name?: string } | null)?.name || null,
              lesson_count: (payment.package_types as { lesson_count?: number } | null)?.lesson_count || null,
              available_lesson_count: payment.available_lesson_count,
              payment_type: payment.type,
              payment_date: payment.created_at,
              payment_id: payment.id,
            })
          }
        }
      }

      // Add students without payments
      if (students) {
        for (const student of students) {
          if (!paymentMap.has(student.id)) {
            paymentMap.set(student.id, {
              student_id: student.id,
              student_name: `${student.student_first_name} ${student.student_last_name}`,
              package_type_name: null,
              lesson_count: null,
              available_lesson_count: 0,
              payment_type: '',
              payment_date: '',
              payment_id: '',
            })
          }
        }
      }

      setPayments(Array.from(paymentMap.values()))
    } catch (error) {
      console.error('Error fetching student payments:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const availablePackageTypes: PackageType[] = formData.class_id
    ? packageTypes.filter(pt => pt.class_id === formData.class_id)
    : []

  const handleClassChange = (classId: string) => {
    setFormData({
      ...formData,
      class_id: classId,
      package_type_id: '',
      available_lesson_count: 0,
    })
  }

  const handlePackageTypeChange = (packageTypeId: string) => {
    const pkg = packageTypes.find(pt => pt.id === packageTypeId)
    if (pkg) {
      setFormData({
        ...formData,
        package_type_id: packageTypeId,
        available_lesson_count: pkg.lesson_count || 0,
      })
    } else {
      setFormData({
        ...formData,
        package_type_id: packageTypeId,
      })
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
    setEditingPaymentId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingPaymentId) {
        const { error } = await supabase
          .from('payments')
          .update(formData)
          .eq('id', editingPaymentId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('payments')
          .insert([formData])
        if (error) throw error
      }

      await fetchData()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving payment:', error)
      alert(t('payments.errorSaving') || 'Помилка збереження платежу')
    }
  }

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      searchTerm === '' ||
      payment.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.package_type_name && payment.package_type_name.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesPackage = packageFilter === 'all' || 
      (payment.package_type_name && payment.package_type_name === packageTypes.find(p => p.id === packageFilter)?.name)

    const matchesType = typeFilter === 'all' || payment.payment_type === typeFilter

    let matchesAvailable = true
    if (availableLessonsFilter !== 'all') {
      const count = payment.available_lesson_count
      if (availableLessonsFilter === 'zero') {
        matchesAvailable = count === 0
      } else if (availableLessonsFilter === 'low') {
        matchesAvailable = count > 0 && count <= 3
      } else if (availableLessonsFilter === 'medium') {
        matchesAvailable = count > 3 && count <= 10
      } else if (availableLessonsFilter === 'high') {
        matchesAvailable = count > 10
      }
    }

    const matchesDateRange =
      (!dateRangeStart || !payment.payment_date || payment.payment_date >= dateRangeStart) &&
      (!dateRangeEnd || !payment.payment_date || payment.payment_date <= dateRangeEnd)

    return matchesSearch && matchesPackage && matchesType && matchesAvailable && matchesDateRange
  })

  const sortedPayments = [...filteredPayments].sort((a, b) => {
    let aValue: string | number
    let bValue: string | number

    if (sortBy === 'student_name') {
      aValue = a.student_name
      bValue = b.student_name
    } else if (sortBy === 'package_type') {
      aValue = a.package_type_name || ''
      bValue = b.package_type_name || ''
    } else if (sortBy === 'lessons') {
      aValue = a.lesson_count || 0
      bValue = b.lesson_count || 0
    } else if (sortBy === 'available_lessons') {
      aValue = a.available_lesson_count
      bValue = b.available_lesson_count
    } else if (sortBy === 'payment_date') {
      aValue = a.payment_date ? new Date(a.payment_date).getTime() : 0
      bValue = b.payment_date ? new Date(b.payment_date).getTime() : 0
    } else {
      return 0
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

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('studentPayments.student'), accessor: (row) => row.student_name },
      { header: t('studentPayments.class') || 'Клас', accessor: (row) => row.class_name || '' },
      { header: t('studentPayments.packageType'), accessor: (row) => row.package_type_name || '' },
      { header: t('studentPayments.type'), accessor: (row) => row.payment_type },
      { header: t('studentPayments.status') || 'Статус', accessor: (row) => row.status || '' },
      { header: t('studentPayments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('studentPayments.createdAt'), accessor: (row) => formatDate(row.payment_date) },
    ]
    exportToXLS(sortedPayments, columns, 'student-payments')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('studentPayments.student'), accessor: (row) => row.student_name },
      { header: t('studentPayments.class') || 'Клас', accessor: (row) => row.class_name || '' },
      { header: t('studentPayments.packageType'), accessor: (row) => row.package_type_name || '' },
      { header: t('studentPayments.type'), accessor: (row) => row.payment_type },
      { header: t('studentPayments.status') || 'Статус', accessor: (row) => row.status || '' },
      { header: t('studentPayments.availableLessons'), accessor: (row) => row.available_lesson_count },
      { header: t('studentPayments.createdAt'), accessor: (row) => formatDate(row.payment_date) },
    ]
    exportToCSV(sortedPayments, columns, 'student-payments')
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={tt('payments.addPayment', 'Додати платіж')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('payments.student', 'Студент')}</label>
              <Select
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              >
                <option value="">{tt('common.select', 'Виберіть...')}</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.student_first_name} {s.student_last_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('payments.class', 'Клас')}</label>
              <Select
                value={formData.class_id}
                onChange={(e) => handleClassChange(e.target.value)}
              >
                <option value="">{tt('common.select', 'Виберіть...')}</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('payments.packageType', 'Тип пакету')}</label>
              <Select
                value={formData.package_type_id}
                onChange={(e) => handlePackageTypeChange(e.target.value)}
                disabled={!formData.class_id}
              >
                <option value="">{tt('common.select', 'Виберіть...')}</option>
                {formData.class_id && availablePackageTypes.length === 0 && (
                  <option value="" disabled>
                    {tt('payments.noPackagesForClass', 'Немає пакетів для вибраного класу')}
                  </option>
                )}
                {availablePackageTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('payments.availableLessons', 'Доступні уроки')}</label>
              <Input
                type="number"
                value={formData.available_lesson_count}
                min={0}
                readOnly
                disabled
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('common.status', 'Статус')}</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="pending">{tt('common.pending', 'Очікує')}</option>
                <option value="approved">{tt('common.approved', 'Підтверджено')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{tt('payments.paymentType', 'Тип платежу')}</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="cash">{tt('common.cash', 'Готівка')}</option>
                <option value="card">{tt('common.card', 'Картка')}</option>
                <option value="test">{tt('common.test', 'Тестовий')}</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {tt('common.cancel', 'Скасувати')}
            </Button>
            <Button type="submit">
              {editingPaymentId ? tt('payments.updatePayment', 'Оновити платіж') : tt('payments.createPayment', 'Створити платіж')}
            </Button>
          </div>
        </form>
      </Modal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('studentPayments.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedPayments.length === 0}
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
              placeholder={t('studentPayments.searchPlaceholder') || "Пошук за ім'ям студента або типом пакету..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.allPackageTypes')}</option>
            {packageTypes.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.allPaymentTypes')}</option>
            <option value="cash">{t('common.cash')}</option>
            <option value="card">{t('common.card')}</option>
            <option value="test">{t('common.test')}</option>
          </Select>
        </div>
        <div className="flex gap-4">
          <Select
            value={availableLessonsFilter}
            onChange={(e) => setAvailableLessonsFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.allLessons')}</option>
            <option value="zero">0 уроків</option>
            <option value="low">1-3 уроки</option>
            <option value="medium">4-10 уроків</option>
            <option value="high">11+ уроків</option>
          </Select>
          <Input
            type="date"
            placeholder={t('common.from')}
            value={dateRangeStart}
            onChange={(e) => setDateRangeStart(e.target.value)}
            className="w-48"
          />
          <Input
            type="date"
            placeholder={t('common.to')}
            value={dateRangeEnd}
            onChange={(e) => setDateRangeEnd(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium">{t('common.sortBy')}</label>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-48"
          >
            <option value="student_name">Ім&apos;ям студента</option>
            <option value="package_type">Типом пакету</option>
            <option value="lessons">Кількістю уроків</option>
            <option value="available_lessons">Доступними уроками</option>
            <option value="payment_date">Датою платежу</option>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Студент
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип пакету
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Уроків у пакеті
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Доступно уроків
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип платежу
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата платежу
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPayments.map((payment) => (
                <tr key={payment.student_id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    {payment.student_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.package_type_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.lesson_count !== null ? payment.lesson_count : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      payment.available_lesson_count === 0 ? 'bg-red-100 text-red-800' :
                      payment.available_lesson_count <= 3 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {payment.available_lesson_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.payment_type || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.payment_date ? formatDate(payment.payment_date) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {payment.available_lesson_count <= 3 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            student_id: payment.student_id,
                          }))
                          setEditingPaymentId(payment.payment_id || null)
                          setIsModalOpen(true)
                        }}
                      >
                        Створити/Оновити платіж
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-700">{t('common.show')}</label>
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
    </div>
  )
}

// Modal form rendered at the end to keep JSX tidy
// Note: Rendering inside the same component return for clarity
