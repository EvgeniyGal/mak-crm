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

interface Expenditure {
  id: string
  type: string
  payment_type: string | null
  person: string | null
  amount: number
  comment: string | null
  created_at: string
}

export default function ExpendituresPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const { isOwner } = useOwner()
  const [expenditures, setExpenditures] = useState<Expenditure[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpenditure, setEditingExpenditure] = useState<Expenditure | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')

  const [formData, setFormData] = useState({
    type: 'regular',
    payment_type: 'cash',
    person: '',
    amount: 0,
    comment: '',
    expenditure_date: '',
  })

  const fetchExpenditures = useCallback(async () => {
    try {
      let allExpenditures: Expenditure[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('expenditures')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allExpenditures = [...allExpenditures, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setExpenditures(allExpenditures)
    } catch (error) {
      console.error('Error fetching expenditures:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchExpenditures()
  }, [fetchExpenditures])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingExpenditure) {
        const updateData: {
          type: string
          payment_type: string | null
          person: string | null
          amount: number
          comment: string | null
          created_at?: string
          updated_at?: string
        } = {
          type: formData.type,
          payment_type: formData.payment_type || null,
          person: formData.person || null,
          amount: formData.amount,
          comment: formData.comment || null,
        }

        // Update expenditure date (created_at and updated_at) if provided
        if (formData.expenditure_date) {
          const expenditureDate = new Date(formData.expenditure_date)
          expenditureDate.setHours(12, 0, 0, 0) // Set to noon to avoid timezone issues
          const dateISO = expenditureDate.toISOString()
          updateData.created_at = dateISO
          updateData.updated_at = dateISO // Set both dates to the selected date
        }

        const { error } = await supabase
          .from('expenditures')
          .update(updateData)
          .eq('id', editingExpenditure.id)
        if (error) throw error
      } else {
        const submitData = {
          type: formData.type,
          payment_type: formData.payment_type || null,
          person: formData.person || null,
          amount: formData.amount,
          comment: formData.comment || null,
        }
        const { error } = await supabase
          .from('expenditures')
          .insert([submitData])
        if (error) throw error
      }

      await fetchExpenditures()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving expenditure:', error)
      alert(t('expenditures.errorSaving'))
    }
  }

  const handleEdit = useCallback((expenditure: Expenditure) => {
    setEditingExpenditure(expenditure)
    // Format expenditure date for date input (YYYY-MM-DD)
    const expenditureDate = expenditure.created_at ? new Date(expenditure.created_at).toISOString().split('T')[0] : ''
    setFormData({
      type: expenditure.type,
      payment_type: expenditure.payment_type || 'cash',
      person: expenditure.person || '',
      amount: expenditure.amount,
      comment: expenditure.comment || '',
      expenditure_date: expenditureDate,
    })
    setIsModalOpen(true)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm(t('expenditures.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('expenditures')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchExpenditures()
    } catch (error) {
      console.error('Error deleting expenditure:', error)
      alert(t('expenditures.errorDeleting'))
    }
  }, [supabase, fetchExpenditures, t])

  const resetForm = () => {
    setFormData({
      type: 'regular',
      payment_type: 'cash',
      person: '',
      amount: 0,
      comment: '',
      expenditure_date: '',
    })
    setEditingExpenditure(null)
  }

  const filteredExpenditures = expenditures.filter((expenditure) => {
    const matchesSearch =
      searchTerm === '' ||
      (expenditure.person && expenditure.person.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (expenditure.comment && expenditure.comment.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesType = typeFilter === 'all' || expenditure.type === typeFilter

    const matchesPaymentType = paymentTypeFilter === 'all' || expenditure.payment_type === paymentTypeFilter

    // Date range filter
    let matchesDateRange = true
    if (dateRangeStart || dateRangeEnd) {
      const expenditureDate = new Date(expenditure.created_at)
      if (dateRangeStart) {
        const startDate = new Date(dateRangeStart)
        startDate.setHours(0, 0, 0, 0)
        matchesDateRange = matchesDateRange && expenditureDate >= startDate
      }
      if (dateRangeEnd) {
        const endDate = new Date(dateRangeEnd)
        endDate.setHours(23, 59, 59, 999)
        matchesDateRange = matchesDateRange && expenditureDate <= endDate
      }
    }

    return matchesSearch && matchesType && matchesPaymentType && matchesDateRange
  })

  // Column definitions for DataTable
  const columns: ColumnDef<Expenditure>[] = useMemo(() => [
    {
      accessorKey: 'type',
      header: t('expenditures.expenditureType'),
      enableSorting: true,
      cell: ({ row }) => {
        const expenditure = row.original
        return (
          <span className={`px-2 py-1 text-xs rounded-full ${
            expenditure.type === 'regular' ? 'bg-blue-100 text-blue-800' :
            expenditure.type === 'staff' ? 'bg-purple-100 text-purple-800' :
            expenditure.type === 'utilities' ? 'bg-cyan-100 text-cyan-800' :
            expenditure.type === 'rent' ? 'bg-orange-100 text-orange-800' :
            expenditure.type === 'office' ? 'bg-indigo-100 text-indigo-800' :
            expenditure.type === 'repair' ? 'bg-red-100 text-red-800' :
            expenditure.type === 'classes' ? 'bg-pink-100 text-pink-800' :
            expenditure.type === 'other' ? 'bg-gray-100 text-gray-800' :
            'bg-green-100 text-green-800'
          }`}>
            {expenditure.type === 'regular' ? t('expenditures.typeRegular') :
             expenditure.type === 'staff' ? t('expenditures.typeStaff') :
             expenditure.type === 'utilities' ? t('expenditures.typeUtilities') :
             expenditure.type === 'rent' ? t('expenditures.typeRent') :
             expenditure.type === 'office' ? t('expenditures.typeOffice') :
             expenditure.type === 'repair' ? t('expenditures.typeRepair') :
             expenditure.type === 'classes' ? t('expenditures.typeClasses') :
             expenditure.type === 'other' ? t('expenditures.typeOther') :
             expenditure.type === 'till' ? t('expenditures.typeTill') :
             expenditure.type}
          </span>
        )
      },
    },
    {
      accessorKey: 'person',
      header: t('expenditures.person'),
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = (rowA.original.person || '').toLowerCase()
        const b = (rowB.original.person || '').toLowerCase()
        return a.localeCompare(b, 'uk')
      },
      cell: ({ row }) => (
        <div className="text-sm text-gray-500">{row.original.person || '-'}</div>
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
      header: t('expenditures.amount'),
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm font-medium">
          {row.original.amount.toFixed(2)} {t('common.uah')}
        </div>
      ),
    },
    {
      accessorKey: 'comment',
      header: t('expenditures.comment'),
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
        const expenditure = row.original
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleEdit(expenditure)}
              className="text-blue-600 hover:text-blue-900"
              title={t('common.edit')}
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(expenditure.id)}
              className="text-red-600 hover:text-red-900"
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      },
    },
  ], [t, handleEdit, handleDelete])

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('expenditures.type'), accessor: (row) => row.type },
      { header: t('expenditures.person'), accessor: (row) => row.person || '' },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'card' ? t('expenditures.paymentTypeCard') : '' },
      { header: t('expenditures.amount'), accessor: (row) => row.amount },
      { header: t('expenditures.description'), accessor: (row) => row.comment || '' },
      { header: t('expenditures.date'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(filteredExpenditures, columns, 'expenditures')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('expenditures.type'), accessor: (row) => row.type },
      { header: t('expenditures.person'), accessor: (row) => row.person || '' },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'card' ? t('expenditures.paymentTypeCard') : '' },
      { header: t('expenditures.amount'), accessor: (row) => row.amount },
      { header: t('expenditures.description'), accessor: (row) => row.comment || '' },
      { header: t('expenditures.date'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(filteredExpenditures, columns, 'expenditures')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('expenditures.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={filteredExpenditures.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success" className="p-2 md:px-4 md:py-2" title={t('expenditures.addExpenditure')}>
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('expenditures.addExpenditure')}</span>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('expenditures.searchPlaceholder')}
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
            <option value="all">{t('expenditures.allExpenditureTypes')}</option>
            <option value="regular">{t('expenditures.typeRegular')}</option>
            <option value="staff">{t('expenditures.typeStaff')}</option>
            <option value="utilities">{t('expenditures.typeUtilities')}</option>
            <option value="rent">{t('expenditures.typeRent')}</option>
            <option value="office">{t('expenditures.typeOffice')}</option>
            <option value="repair">{t('expenditures.typeRepair')}</option>
            <option value="classes">{t('expenditures.typeClasses')}</option>
            <option value="other">{t('expenditures.typeOther')}</option>
          </Select>
          <Select
            value={paymentTypeFilter}
            onChange={(e) => setPaymentTypeFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
          >
            <option value="all">{t('expenditures.allPaymentTypes')}</option>
            <option value="cash">{t('expenditures.paymentTypeCash')}</option>
            <option value="card">{t('expenditures.paymentTypeCard')}</option>
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
        data={filteredExpenditures}
        initialPageSize={10}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingExpenditure ? t('expenditures.editExpenditure') : t('expenditures.addExpenditure')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('expenditures.type')} *
            </label>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="regular">{t('expenditures.typeRegular')}</option>
              <option value="staff">{t('expenditures.typeStaff')}</option>
              <option value="utilities">{t('expenditures.typeUtilities')}</option>
              <option value="rent">{t('expenditures.typeRent')}</option>
              <option value="office">{t('expenditures.typeOffice')}</option>
              <option value="repair">{t('expenditures.typeRepair')}</option>
              <option value="classes">{t('expenditures.typeClasses')}</option>
              <option value="other">{t('expenditures.typeOther')}</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('expenditures.person')}
            </label>
            <Input
              value={formData.person}
              onChange={(e) => setFormData({ ...formData, person: e.target.value })}
            />
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
              {t('expenditures.amount')} *
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
              {t('expenditures.comment')}
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-gray-50 focus:border-blue-500 focus:bg-white"
              rows={3}
            />
          </div>
          {editingExpenditure && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('expenditures.date')}
              </label>
              <Input
                type="date"
                value={formData.expenditure_date}
                onChange={(e) => setFormData({ ...formData, expenditure_date: e.target.value })}
                className="w-full"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={editingExpenditure ? "default" : "success"}>
              {editingExpenditure ? t('common.saveChanges') : t('expenditures.addExpenditure')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
