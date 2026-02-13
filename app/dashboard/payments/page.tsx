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

interface Payment {
  id: string
  student_id: string
  class_id: string
  package_type_id: string
  status: string
  type: string
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
  enrolled_class_ids?: string[]
  parent_first_name?: string
  parent_middle_name?: string
  phone?: string
  email?: string
  student_date_of_birth?: string
  status?: string
  comment?: string
}

interface Class {
  id: string
  name: string
  status?: string
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
  const [itemsPerPage] = useState(10)
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [studentPayments, setStudentPayments] = useState<Payment[]>([])
  const [loadingStudentDetails, setLoadingStudentDetails] = useState(false)

  const [formData, setFormData] = useState({
    student_id: '',
    class_id: '',
    package_type_id: '',
    status: 'pending',
    type: 'cash',
    comment: '',
    payment_date: '',
  })

  const fetchPayments = useCallback(async () => {
    try {
      let allPayments: Payment[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            *,
            students(student_first_name, student_last_name),
            courses!class_id(name),
            package_types(name, amount, lesson_count)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allPayments = [...allPayments, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setPayments(allPayments)
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const fetchStudents = useCallback(async () => {
    try {
      let allStudents: Array<{ id: string; student_first_name: string; student_last_name: string; enrolled_class_ids: string[] }> = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('students')
          .select('id, student_first_name, student_last_name, enrolled_class_ids')
          .eq('status', 'active')
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allStudents = [...allStudents, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setStudents(allStudents)
    } catch (error) {
      console.error('Error fetching students:', error)
    }
  }, [supabase])

  const fetchClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, status')

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
      student_id: '', // Reset student when class changes
      package_type_id: '', // Reset package type when class changes
    })
  }

  const handlePackageTypeChange = (packageTypeId: string) => {
    setFormData({
      ...formData,
      package_type_id: packageTypeId,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingPayment) {
        const updateData: {
          status: string
          comment?: string
          type?: string
          created_at?: string
          updated_at?: string
        } = {
          status: formData.status,
          comment: formData.comment,
        }

        // Only allow type change when changing status from pending to paid
        const isChangingToPaid = editingPayment.status === 'pending' && formData.status === 'paid'
        if (isChangingToPaid) {
          updateData.type = formData.type
        }

        // Update payment date (created_at and updated_at) if provided
        if (formData.payment_date) {
          const paymentDate = new Date(formData.payment_date)
          paymentDate.setHours(12, 0, 0, 0) // Set to noon to avoid timezone issues
          const dateISO = paymentDate.toISOString()
          updateData.created_at = dateISO
          updateData.updated_at = dateISO // Set both dates to the selected date
        }

        const { error } = await supabase
          .from('payments')
          .update(updateData)
          .eq('id', editingPayment.id)
        if (error) throw error
      } else {
        // Create payment
        const { error } = await supabase
          .from('payments')
          .insert([formData])
        if (error) throw error

        // Add lessons to student_class_lessons regardless of payment status
        if (formData.student_id && formData.class_id && formData.package_type_id) {
          // Get package type to get lesson_count
          const packageType = packageTypes.find(pt => pt.id === formData.package_type_id)
          if (packageType && packageType.lesson_count > 0) {
            // Get or create student_class_lessons record
            const { data: existingRecord, error: fetchError } = await supabase
              .from('student_class_lessons')
              .select('id, lesson_count')
              .eq('student_id', formData.student_id)
              .eq('class_id', formData.class_id)
              .single()

            if (fetchError && fetchError.code !== 'PGRST116') {
              console.error('Error fetching student_class_lessons:', fetchError)
            } else if (existingRecord) {
              // Update existing record - add lessons
              const { error: updateError } = await supabase
                .from('student_class_lessons')
                .update({
                  lesson_count: existingRecord.lesson_count + packageType.lesson_count
                })
                .eq('id', existingRecord.id)
              if (updateError) {
                console.error('Error updating student_class_lessons:', updateError)
              }
            } else {
              // Create new record
              const { error: insertError } = await supabase
                .from('student_class_lessons')
                .insert({
                  student_id: formData.student_id,
                  class_id: formData.class_id,
                  lesson_count: packageType.lesson_count
                })
              if (insertError) {
                console.error('Error creating student_class_lessons:', insertError)
              }
            }
          }
        }
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
    // Format payment date for date input (YYYY-MM-DD)
    const paymentDate = payment.created_at ? new Date(payment.created_at).toISOString().split('T')[0] : ''
    setFormData({
      student_id: payment.student_id,
      class_id: payment.class_id,
      package_type_id: payment.package_type_id,
      status: payment.status,
      type: payment.type,
      comment: payment.comment || '',
      payment_date: paymentDate,
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
      comment: '',
      payment_date: '',
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
    const matchesCourse = courseFilter === 'all' || (payment.class_id && payment.class_id === courseFilter)

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

  // DataTable handles sorting internally, so we just pass filteredPayments
  const sortedPayments = filteredPayments

  const availablePackageTypes = formData.class_id
    ? packageTypes.filter(pt => pt.class_id === formData.class_id)
    : []

  // Filter students by selected course
  // When editing, include the current student even if not in filtered list
  const availableStudents = formData.class_id
    ? students.filter(student => {
        const isEnrolled = student.enrolled_class_ids && 
          student.enrolled_class_ids.includes(formData.class_id)
        const isCurrentStudent = editingPayment && student.id === formData.student_id
        return isEnrolled || isCurrentStudent
      })
    : []

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('payments.student'), accessor: (row) => `${row.students?.student_first_name || ''} ${row.students?.student_last_name || ''}`.trim() },
      { header: t('payments.class'), accessor: (row) => row.courses?.name || '' },
      { header: t('payments.packageType'), accessor: (row) => row.package_types?.name || '' },
      { header: t('payments.amount'), accessor: (row) => row.package_types?.amount || 0 },
      { header: t('common.status'), accessor: (row) => row.status === 'paid' ? t('payments.paid') : t('payments.pending') },
      { header: t('payments.paymentType'), accessor: (row) => row.type === 'cash' ? t('payments.cash') : row.type === 'card' ? t('payments.card') : t('payments.free') },
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
      { header: t('common.createdAt'), accessor: (row) => formatDate(row.created_at) },
      { header: t('payments.comment'), accessor: (row) => row.comment || '' },
    ]
    exportToCSV(sortedPayments, columns, 'payments')
  }

  const fetchStudentDetails = async (studentId: string) => {
    setLoadingStudentDetails(true)
    try {
      // Fetch student details
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single()

      if (studentError) throw studentError
      if (studentData) {
        setSelectedStudent(studentData as Student)
      }

      // Fetch all payments for this student
      let allStudentPayments: Payment[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('payments')
          .select(`
            *,
            students(student_first_name, student_last_name),
            courses!class_id(name),
            package_types(name, amount, lesson_count)
          `)
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allStudentPayments = [...allStudentPayments, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setStudentPayments(allStudentPayments)
    } catch (error) {
      console.error('Error fetching student details:', error)
      alert(t('common.errorSaving'))
    } finally {
      setLoadingStudentDetails(false)
    }
  }

  const handleStudentClick = async (studentId: string) => {
    setIsStudentModalOpen(true)
    await fetchStudentDetails(studentId)
  }

  // Column definitions for DataTable - must be after handler functions are defined
  const columns: ColumnDef<Payment>[] = useMemo(() => [
    {
      accessorKey: 'student_name',
      header: t('payments.student'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = `${rowA.original.students?.student_first_name || ''} ${rowA.original.students?.student_last_name || ''}`.trim().toLowerCase()
        const b = `${rowB.original.students?.student_first_name || ''} ${rowB.original.students?.student_last_name || ''}`.trim().toLowerCase()
        return a.localeCompare(b)
      },
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.students ? (
            <button
              onClick={() => handleStudentClick(row.original.student_id)}
              className="text-blue-600 hover:text-blue-900 hover:underline cursor-pointer"
            >
              {row.original.students.student_first_name} {row.original.students.student_last_name}
            </button>
          ) : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'course',
      header: t('payments.class'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = (rowA.original.courses?.name || '').toLowerCase()
        const b = (rowB.original.courses?.name || '').toLowerCase()
        return a.localeCompare(b)
      },
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.courses?.name || '-'}</div>
      ),
    },
    {
      accessorKey: 'package_type',
      header: t('payments.packageType'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.package_types?.name || '-'}</div>
      ),
    },
    {
      accessorKey: 'amount',
      header: t('payments.amount'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.package_types?.amount ? `${row.original.package_types.amount} грн` : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <span className={`px-2 py-1 text-xs rounded-full ${
            status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {status === 'paid' ? t('payments.paid') : t('payments.pending')}
          </span>
        )
      },
    },
    {
      accessorKey: 'type',
      header: t('payments.paymentType'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">
          {row.original.type === 'cash' ? t('payments.cash') : row.original.type === 'card' ? t('payments.card') : t('payments.free')}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: t('common.createdAt'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </div>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: t('common.updatedAt'),
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {formatDate(row.original.updated_at || row.original.created_at)}
        </div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('payments.comment'),
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
        const payment = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(payment)}
              className="text-blue-600 hover:text-blue-900"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(payment.id)}
              className="text-red-600 hover:text-red-900"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, handleStudentClick, handleEdit, handleDelete])

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-gray-900 truncate min-w-0">{t('payments.title')}</h1>
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
              placeholder={t('payments.searchPlaceholder')}
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
            <option value="all">{t('common.all')} {t('common.statuses')}</option>
            <option value="paid">{t('payments.paid')}</option>
            <option value="pending">{t('payments.pending')}</option>
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('common.all')} {t('common.types')}</option>
            <option value="cash">{t('payments.cash')}</option>
            <option value="card">{t('payments.card')}</option>
            <option value="free">{t('payments.free')}</option>
          </Select>
          <Select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">{t('common.all')} {t('payments.courses')}</option>
            {classes
              .filter(cls => cls.status === 'active')
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((cls) => (
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
              onChange={(e) => setDateRangeStart(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.to')}</label>
            <Input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.updatedFrom')}</label>
            <Input
              type="date"
              value={updatedRangeStart}
              onChange={(e) => setUpdatedRangeStart(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.updatedTo')}</label>
            <Input
              type="date"
              value={updatedRangeEnd}
              onChange={(e) => setUpdatedRangeEnd(e.target.value)}
              className="w-48"
            />
          </div>
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingPayment ? t('payments.editPayment') : t('payments.addPayment')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.class')} *</label>
            <Select
              value={formData.class_id}
              onChange={(e) => handleClassChange(e.target.value)}
              required
              disabled={!!editingPayment}
            >
              <option value="">{t('common.selectClass')}</option>
              {classes
                .filter(cls => {
                  // When editing, include the current class even if inactive
                  if (editingPayment && cls.id === formData.class_id) {
                    return true
                  }
                  // Otherwise, only show active classes
                  return cls.status === 'active'
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.student')} *</label>
            <Select
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              required
              disabled={!!editingPayment || !formData.class_id}
            >
              <option value="">{t('common.selectStudent')}</option>
              {availableStudents
                .sort((a, b) => {
                  const nameA = `${a.student_first_name} ${a.student_last_name}`.toLowerCase()
                  const nameB = `${b.student_first_name} ${b.student_last_name}`.toLowerCase()
                  return nameA.localeCompare(nameB)
                })
                .map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.student_first_name} {student.student_last_name}
                  </option>
                ))}
            </Select>
            {!formData.class_id && (
              <p className="mt-1 text-sm text-gray-500">{t('payments.selectClassFirst')}</p>
            )}
            {formData.class_id && availableStudents.length === 0 && (
              <p className="mt-1 text-sm text-yellow-600">{t('payments.noStudentsInCourse')}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.packageType')} *</label>
            <Select
              value={formData.package_type_id}
              onChange={(e) => handlePackageTypeChange(e.target.value)}
              required
              disabled={!formData.class_id || !!editingPayment}
            >
              <option value="">{t('common.selectPackageType')}</option>
              {availablePackageTypes
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((pt) => (
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
                disabled={!!editingPayment && !(editingPayment.status === 'pending' && formData.status === 'paid')}
              >
                <option value="cash">{t('payments.cash')}</option>
                <option value="card">{t('payments.card')}</option>
                <option value="free">{t('payments.free')}</option>
              </Select>
              {editingPayment && editingPayment.status === 'pending' && formData.status !== 'paid' && (
                <p className="mt-1 text-sm text-gray-500">{t('payments.paymentTypeChangeHint')}</p>
              )}
            </div>
          </div>
          {editingPayment && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.paymentDate')}</label>
              <Input
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className="w-full"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('payments.comment')}</label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={3}
              placeholder={t('payments.commentPlaceholder')}
              disabled={!!editingPayment}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              variant={editingPayment ? "default" : "success"}
              disabled={editingPayment ? (() => {
                const statusChanged = formData.status !== editingPayment.status
                const commentChanged = formData.comment !== (editingPayment.comment || '')
                const originalDate = editingPayment.created_at ? new Date(editingPayment.created_at).toISOString().split('T')[0] : ''
                const dateChanged = formData.payment_date && formData.payment_date !== originalDate
                const typeChanged = editingPayment.status === 'pending' && formData.status === 'paid' && formData.type !== editingPayment.type
                // Button is enabled if any field changed
                return !statusChanged && !commentChanged && !dateChanged && !typeChanged
              })() : false}
            >
              {editingPayment ? t('common.save') : t('payments.addPayment')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Student Details Modal */}
      <Modal
        isOpen={isStudentModalOpen}
        onClose={() => { setIsStudentModalOpen(false); setSelectedStudent(null); setStudentPayments([]) }}
        title={selectedStudent ? `${selectedStudent.student_first_name} ${selectedStudent.student_last_name}` : t('students.studentSummary')}
        size="lg"
      >
        {loadingStudentDetails ? (
          <div className="text-center py-8">{t('common.loading')}</div>
        ) : selectedStudent ? (
          <div className="space-y-6">
            {/* Student Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-900">{t('students.studentName')}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">{t('students.parentName')}:</span>
                  <span className="ml-2 text-gray-900">
                    {selectedStudent.parent_first_name} {selectedStudent.parent_middle_name || ''}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">{t('students.phone')}:</span>
                  <span className="ml-2 text-gray-900">{selectedStudent.phone}</span>
                </div>
                {selectedStudent.email && (
                  <div>
                    <span className="font-medium text-gray-700">{t('common.email')}:</span>
                    <span className="ml-2 text-gray-900">{selectedStudent.email}</span>
                  </div>
                )}
                {selectedStudent.student_date_of_birth && (
                  <div>
                    <span className="font-medium text-gray-700">{t('students.dateOfBirth')}:</span>
                    <span className="ml-2 text-gray-900">{formatDate(selectedStudent.student_date_of_birth)}</span>
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-700">{t('common.status')}:</span>
                  <span className="ml-2 text-gray-900">
                    {selectedStudent.status === 'active' ? t('common.active') : 
                     selectedStudent.status === 'inactive' ? t('common.inactive') : 
                     selectedStudent.status === 'moved' ? t('common.moved') : 
                     t('common.dontDisturb')}
                  </span>
                </div>
              </div>
              {selectedStudent.comment && (
                <div className="mt-3">
                  <span className="font-medium text-gray-700">{t('students.comment')}:</span>
                  <p className="mt-1 text-sm text-gray-900">{selectedStudent.comment}</p>
                </div>
              )}
            </div>

            {/* Payments */}
            <div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900">{t('payments.title')} ({studentPayments.length})</h3>
              {studentPayments.length > 0 ? (
                <div className="border rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.date')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.class')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.packageType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.amount')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.paymentType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('payments.comment')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {studentPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{formatDate(payment.created_at)}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.courses?.name || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.package_types?.name || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {payment.package_types?.amount ? `${payment.package_types.amount} ${t('common.uah')}` : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              payment.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {payment.status === 'paid' ? t('payments.paid') : t('payments.pending')}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {payment.type === 'cash' ? t('payments.cash') : 
                             payment.type === 'card' ? t('payments.card') : 
                             t('payments.free')}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{payment.comment || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">{t('students.noPayments')}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">{t('common.noData')}</div>
        )}
      </Modal>
    </div>
  )
}

