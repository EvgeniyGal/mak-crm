'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

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
  const [itemsPerPage] = useState(10)

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
      let allStudents: Array<{ id: string; student_first_name: string; student_last_name: string }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error: studentsError } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name')
          .eq('status', 'active')
          .range(from, from + batchSize - 1)

        if (studentsError) throw studentsError

        if (data && data.length > 0) {
          allStudents = [...allStudents, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setStudents(allStudents)

      // Get package types for filtering
      const { data: packages, error: packagesError } = await supabase
        .from('package_types')
        .select('id, name, lesson_count, class_id')
        .eq('status', 'active')

      if (packagesError) throw packagesError
      setPackageTypes(packages || [])

      // Get classes for selection
      const { data: classesData, error: classesError } = await supabase
        .from('courses')
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
        .in('student_id', allStudents.map(s => s.id))
        .order('created_at', { ascending: false })

      if (paymentsError) throw paymentsError

      // Build payment data per student (latest payment)
      const paymentMap = new Map<string, PaymentData>()

      if (paymentsData) {
        for (const payment of paymentsData) {
          const student = allStudents.find(s => s.id === payment.student_id)
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
      for (const student of allStudents) {
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

  // DataTable handles sorting internally, so we just pass filteredPayments
  const sortedPayments = filteredPayments

  // Column definitions for DataTable
  const columns: ColumnDef<PaymentData>[] = useMemo(() => [
    {
      accessorKey: 'student_name',
      header: 'Студент',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="font-medium">{row.original.student_name}</div>
      ),
    },
    {
      accessorKey: 'package_type_name',
      header: 'Тип пакету',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.package_type_name || '-'}</div>
      ),
    },
    {
      accessorKey: 'lesson_count',
      header: 'Уроків у пакеті',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.lesson_count !== null ? row.original.lesson_count : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'available_lesson_count',
      header: 'Доступно уроків',
      enableSorting: true,
      cell: ({ row }) => {
        const count = row.original.available_lesson_count
        return (
          <span className={`px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ${
            count === 0 ? 'bg-red-100 text-red-800' :
            count <= 3 ? 'bg-yellow-100 text-yellow-800' :
            'bg-green-100 text-green-800'
          }`}>
            {count}
          </span>
        )
      },
    },
    {
      accessorKey: 'payment_type',
      header: 'Тип платежу',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.payment_type || '-'}</div>
      ),
    },
    {
      accessorKey: 'payment_date',
      header: 'Дата платежу',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {row.original.payment_date ? formatDate(row.original.payment_date) : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div>
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
          </div>
        )
      },
    },
  ], [setFormData, setEditingPaymentId, setIsModalOpen])

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('studentPayments.student'), accessor: (row) => row.student_name },
      { header: t('studentPayments.class') || 'Клас', accessor: (row) => row.class_name || '' },
      { header: t('studentPayments.packageType'), accessor: (row) => row.package_type_name || '' },
      { header: t('studentPayments.type'), accessor: (row) => row.payment_type },
      { header: t('studentPayments.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : row.status === 'pending' ? t('payments.pending') : row.status || '' },
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
      { header: t('studentPayments.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : row.status === 'pending' ? t('payments.pending') : row.status || '' },
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.status')}</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="pending">{tt('common.pending', 'Очікує')}</option>
                <option value="approved">{tt('common.approved', 'Підтверджено')}</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.paymentType')}</label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="cash">{t('payments.cash')}</option>
                <option value="card">{t('payments.card')}</option>
                <option value="free">{t('payments.free')}</option>
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
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('studentPayments.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedPayments.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('payments.addPayment')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('payments.addPayment')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('studentPayments.searchPlaceholder') || "Пошук за ім'ям студента або типом пакету..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
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
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('common.allPaymentTypes')}</option>
            <option value="cash">{t('payments.cash')}</option>
            <option value="card">{t('payments.card')}</option>
            <option value="free">{t('payments.free')}</option>
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
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedPayments}
        initialPageSize={itemsPerPage}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />
    </div>
  )
}

// Modal form rendered at the end to keep JSX tidy
// Note: Rendering inside the same component return for clarity
