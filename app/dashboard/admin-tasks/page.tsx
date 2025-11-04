'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search, Archive } from 'lucide-react'

interface AdminTask {
  id: string
  title: string
  type: string
  comment: string | null
  status: string
  created_at: string
}

export default function AdminTasksPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    title: '',
    type: 'admin',
    comment: '',
    status: 'active',
  })

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        comment: formData.comment || null,
      }

      if (editingTask) {
        const { error } = await supabase
          .from('admin_tasks')
          .update(submitData)
          .eq('id', editingTask.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('admin_tasks')
          .insert([submitData])
        if (error) throw error
      }

      await fetchTasks()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving task:', error)
      alert('Помилка збереження завдання')
    }
  }

  const handleEdit = (task: AdminTask) => {
    setEditingTask(task)
    setFormData({
      title: task.title,
      type: task.type,
      comment: task.comment || '',
      status: task.status,
    })
    setIsModalOpen(true)
  }

  const handleArchive = async (id: string) => {
    const comment = prompt('Введіть примітку для архівування:')
    if (comment === null) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .update({
          status: 'archive',
          comment: comment,
        })
        .eq('id', id)
      if (error) throw error
      await fetchTasks()
    } catch (error) {
      console.error('Error archiving task:', error)
      alert('Помилка архівування завдання')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете видалити це завдання?')) return

    try {
      const { error } = await supabase
        .from('admin_tasks')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchTasks()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Помилка видалення завдання')
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'admin',
      comment: '',
      status: 'active',
    })
    setEditingTask(null)
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      searchTerm === '' ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.comment && task.comment.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesType = typeFilter === 'all' || task.type === typeFilter
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter

    return matchesSearch && matchesType && matchesStatus
  })

  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage)

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Завдання адміністратора</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Додати завдання
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за назвою або коментарем..."
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
            <option value="first lesson">Перший урок</option>
            <option value="absent">Відсутні</option>
            <option value="admin">Адмін</option>
            <option value="birthday">День народження</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="archive">Архів</option>
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
                  Назва
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Коментар
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
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
              {paginatedTasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium">
                    {task.title}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {task.type}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {task.comment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      task.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(task.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(task)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    {task.status === 'active' && (
                      <button
                        onClick={() => handleArchive(task.id)}
                        className="text-yellow-600 hover:text-yellow-900 mr-3"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
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
            <select
              value={itemsPerPage.toString()}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 bg-white"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
            <span className="text-sm text-gray-700">
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredTasks.length)} з {filteredTasks.length}
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
        title={editingTask ? 'Редагувати завдання' : 'Додати завдання'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Назва *
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип *
            </label>
            <Select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              <option value="first lesson">Перший урок</option>
              <option value="absent">Відсутні</option>
              <option value="admin">Адмін</option>
              <option value="birthday">День народження</option>
            </Select>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Статус *
            </label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="active">Активний</option>
              <option value="archive">Архів</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">
              {editingTask ? 'Зберегти зміни' : 'Додати завдання'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

