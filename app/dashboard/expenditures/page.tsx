'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'

interface Expenditure {
  id: string
  type: string
  person: string | null
  amount: number
  comment: string | null
  created_at: string
}

export default function ExpendituresPage() {
  const supabase = createClient()
  const [expenditures, setExpenditures] = useState<Expenditure[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpenditure, setEditingExpenditure] = useState<Expenditure | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    type: 'regular',
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
      alert('Помилка збереження витрати')
    }
  }

  const handleEdit = (expenditure: Expenditure) => {
    setEditingExpenditure(expenditure)
    setFormData({
      type: expenditure.type,
      person: expenditure.person || '',
      amount: expenditure.amount,
      comment: expenditure.comment || '',
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити цю витрату?')) return

    try {
      const { error } = await supabase
        .from('expenditures')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchExpenditures()
    } catch (error) {
      console.error('Error deleting expenditure:', error)
      alert('Помилка видалення витрати')
    }
  }

  const resetForm = () => {
    setFormData({
      type: 'regular',
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

    return matchesSearch && matchesType
  })

  const paginatedExpenditures = filteredExpenditures.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredExpenditures.length / itemsPerPage)

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Витрати</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Додати витрату
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за особою або коментарем..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі типи</option>
            <option value="regular">Регулярні</option>
            <option value="staff">Персонал</option>
            <option value="till">Каса</option>
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
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Особа
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сума
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Коментар
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Створено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedExpenditures.map((expenditure) => (
                <tr key={expenditure.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      expenditure.type === 'regular' ? 'bg-blue-100 text-blue-800' :
                      expenditure.type === 'staff' ? 'bg-purple-100 text-purple-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {expenditure.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {expenditure.person || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {expenditure.amount.toFixed(2)} грн
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
            <label className="text-sm text-gray-700">Показати:</label>
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredExpenditures.length)} з {filteredExpenditures.length}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Попередня
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Наступна
            </Button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title={editingExpenditure ? 'Редагувати витрату' : 'Додати витрату'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип *
            </label>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="regular">Регулярні</option>
              <option value="staff">Персонал</option>
              <option value="till">Каса</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Особа
            </label>
            <Input
              value={formData.person}
              onChange={(e) => setFormData({ ...formData, person: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Сума *
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
              Коментар
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              className="w-full border-2 border-gray-400 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">
              {editingExpenditure ? 'Зберегти зміни' : 'Додати витрату'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
