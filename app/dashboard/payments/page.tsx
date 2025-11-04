'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'

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
  classes?: { name: string }
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

  useEffect(() => {
    fetchPayments()
    fetchStudents()
    fetchClasses()
    fetchPackageTypes()
  }, [])

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          students(student_first_name, student_last_name),
          classes(name),
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
  }

  const fetchStudents = async () => {
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
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  const fetchPackageTypes = async () => {
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
  }

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
      alert('Помилка збереження платежу')
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
    if (!confirm('Ви впевнені, що хочете видалити цей платіж?')) return

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchPayments()
    } catch (error) {
      console.error('Error deleting payment:', error)
      alert('Помилка видалення платежу')
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
      payment.classes?.name.toLowerCase().includes(searchTerm.toLowerCase())

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

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Платежі</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          Додати платіж
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за студентом або класом..."
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
            <option value="all">Всі статуси</option>
            <option value="paid">Оплачено</option>
            <option value="pending">Очікує</option>
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі типи</option>
            <option value="cash">Готівка</option>
            <option value="card">Картка</option>
            <option value="test">Тест</option>
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
                  Студент
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Клас
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Пакет
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Доступно уроків
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сума
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
              {paginatedPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {payment.students ? `${payment.students.student_first_name} ${payment.students.student_last_name}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.classes?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.package_types?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      payment.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-medium ${
                      payment.available_lesson_count > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {payment.available_lesson_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {payment.package_types?.amount ? `${payment.package_types.amount} грн` : '-'}
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
            <label className="text-sm text-gray-700">Показати:</label>
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredPayments.length)} з {filteredPayments.length}
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
        title={editingPayment ? 'Редагувати платіж' : 'Додати платіж'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Студент *
            </label>
            <Select
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              required
            >
              <option value="">Вибрати студента</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.student_first_name} {student.student_last_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Клас *
            </label>
            <Select
              value={formData.class_id}
              onChange={(e) => handleClassChange(e.target.value)}
              required
            >
              <option value="">Вибрати клас</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип пакету *
            </label>
            <Select
              value={formData.package_type_id}
              onChange={(e) => handlePackageTypeChange(e.target.value)}
              required
              disabled={!formData.class_id}
            >
              <option value="">Вибрати тип пакету</option>
              {availablePackageTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name} ({pt.lesson_count} уроків, {pt.amount} грн)
                </option>
              ))}
            </Select>
            {!formData.class_id && (
              <p className="mt-1 text-sm text-gray-500">Спочатку виберіть клас</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Статус *
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="pending">Очікує</option>
                <option value="paid">Оплачено</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип платежу *
              </label>
              <Select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
              >
                <option value="cash">Готівка</option>
                <option value="card">Картка</option>
                <option value="test">Тест</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Доступно уроків
            </label>
            <Input
              type="number"
              min="0"
              value={formData.available_lesson_count}
              onChange={(e) => setFormData({ ...formData, available_lesson_count: Number(e.target.value) })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">
              {editingPayment ? 'Зберегти зміни' : 'Додати платіж'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

