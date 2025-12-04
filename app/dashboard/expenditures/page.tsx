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
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    type: 'regular',
    payment_type: 'cash',
    person: '',
    amount: 0,
    comment: '',
  })

  const fetchExpenditures = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('expenditures')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setExpenditures(data || [])
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
      const submitData = {
        ...formData,
        payment_type: formData.payment_type || null,
        person: formData.person || null,
        comment: formData.comment || null,
      }

      if (editingExpenditure) {
        const { error } = await supabase
          .from('expenditures')
          .update(submitData)
          .eq('id', editingExpenditure.id)
        if (error) throw error
      } else {
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

  const handleEdit = (expenditure: Expenditure) => {
    setEditingExpenditure(expenditure)
    setFormData({
      type: expenditure.type,
      payment_type: expenditure.payment_type || 'cash',
      person: expenditure.person || '',
      amount: expenditure.amount,
      comment: expenditure.comment || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
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
  }

  const resetForm = () => {
    setFormData({
      type: 'regular',
      payment_type: 'cash',
      person: '',
      amount: 0,
      comment: '',
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

  const sortedExpenditures = [...filteredExpenditures].sort((a, b) => {
    let aValue: string | number | Date = ''
    let bValue: string | number | Date = ''

    if (sortBy === 'created_at') {
      aValue = new Date(a.created_at)
      bValue = new Date(b.created_at)
    } else if (sortBy === 'amount') {
      aValue = a.amount
      bValue = b.amount
    } else if (sortBy === 'person') {
      aValue = (a.person || '').toLowerCase()
      bValue = (b.person || '').toLowerCase()
    } else if (sortBy === 'type') {
      aValue = a.type.toLowerCase()
      bValue = b.type.toLowerCase()
    } else if (sortBy === 'payment_type') {
      aValue = (a.payment_type || '').toLowerCase()
      bValue = (b.payment_type || '').toLowerCase()
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })

  const paginatedExpenditures = sortedExpenditures.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedExpenditures.length / itemsPerPage)

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
      { header: t('expenditures.type'), accessor: (row) => row.type },
      { header: t('expenditures.person'), accessor: (row) => row.person || '' },
      { header: t('expenditures.paymentType'), accessor: (row) => row.payment_type === 'cash' ? t('expenditures.paymentTypeCash') : row.payment_type === 'card' ? t('expenditures.paymentTypeCard') : '' },
      { header: t('expenditures.amount'), accessor: (row) => row.amount },
      { header: t('expenditures.description'), accessor: (row) => row.comment || '' },
      { header: t('expenditures.date'), accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(sortedExpenditures, columns, 'expenditures')
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
    exportToCSV(sortedExpenditures, columns, 'expenditures')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('expenditures.title')}</h1>
        <div className="flex gap-2">
          {isOwner && (
            <ExportButton 
              onExportXLS={handleExportXLS}
              onExportCSV={handleExportCSV}
              disabled={sortedExpenditures.length === 0}
            />
          )}
          <Button onClick={() => { resetForm(); setIsModalOpen(true) }} variant="success">
            <Plus className="h-4 w-4 mr-2" />
            {t('expenditures.addExpenditure')}
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('expenditures.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
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
            onChange={(e) => { setPaymentTypeFilter(e.target.value); setCurrentPage(1) }}
            className="w-48"
          >
            <option value="all">{t('expenditures.allPaymentTypes')}</option>
            <option value="cash">{t('expenditures.paymentTypeCash')}</option>
            <option value="card">{t('expenditures.paymentTypeCard')}</option>
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
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]"
                  onClick={() => handleSort('type')}
                >
                  {t('expenditures.expenditureType')}
                  {getSortIcon('type')}
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('person')}
                >
                  {t('expenditures.person')}
                  {getSortIcon('person')}
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
                  {t('expenditures.amount')}
                  {getSortIcon('amount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('expenditures.comment')}
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
              {paginatedExpenditures.map((expenditure) => (
                <tr key={expenditure.id}>
                  <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10">
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
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {expenditure.person || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {expenditure.payment_type === 'cash' ? t('expenditures.paymentTypeCash') :
                     expenditure.payment_type === 'card' ? t('expenditures.paymentTypeCard') :
                     '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {expenditure.amount.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {expenditure.comment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(expenditure.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(expenditure)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expenditure.id)}
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
              {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedExpenditures.length)} {t('common.of')} {sortedExpenditures.length}
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
