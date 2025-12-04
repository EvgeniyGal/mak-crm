'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Search, Edit, CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'

interface User {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  role: string
  phone: string | null
  email: string
  status: string
  created_at: string
}

export default function UsersPage() {
  const supabase = createClient()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    email: '',
    role: 'admin',
    status: 'pending',
  })

  const checkAccess = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data && data.role === 'owner') {
        setCurrentUser(data)
      } else {
        router.push('/dashboard')
      }
    } else {
      router.push('/auth/login')
    }
  }, [supabase, router])

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    checkAccess()
    fetchUsers()
  }, [checkAccess, fetchUsers])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        middle_name: formData.middle_name || null,
        phone: formData.phone || null,
      }

      if (editingUser) {
        const { error } = await supabase
          .from('users')
          .update(submitData)
          .eq('id', editingUser.id)
        if (error) throw error
      }

      await fetchUsers()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving user:', error)
      alert('Помилка збереження користувача')
    }
  }

  const handleEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      middle_name: user.middle_name || '',
      phone: user.phone || '',
      email: user.email,
      role: user.role,
      status: user.status,
    })
    setIsModalOpen(true)
  }

  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'approved' })
        .eq('id', id)
      if (error) throw error
      await fetchUsers()
    } catch (error) {
      console.error('Error approving user:', error)
      alert('Помилка підтвердження користувача')
    }
  }

  const handleFire = async (id: string) => {
    if (!confirm('Ви впевнені, що хочете звільнити цього користувача?')) return

    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'fired' })
        .eq('id', id)
      if (error) throw error
      await fetchUsers()
    } catch (error) {
      console.error('Error firing user:', error)
      alert('Помилка звільнення користувача')
    }
  }

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      middle_name: '',
      phone: '',
      email: '',
      role: 'admin',
      status: 'pending',
    })
    setEditingUser(null)
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      searchTerm === '' ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone && user.phone.includes(searchTerm)) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesRole = roleFilter === 'all' || user.role === roleFilter
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter

    return matchesSearch && matchesRole && matchesStatus
  })

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aValue: string | number = a[sortBy as keyof User] as string | number
    let bValue: string | number = b[sortBy as keyof User] as string | number

    if (sortBy === 'full_name') {
      aValue = `${a.first_name} ${a.last_name}`
      bValue = `${b.first_name} ${b.last_name}`
    }

    // Handle null/undefined values
    if (aValue == null) aValue = ''
    if (bValue == null) bValue = ''

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1
    } else {
      return aValue < bValue ? 1 : -1
    }
  })

  const paginatedUsers = sortedUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage)

  const { t } = useTranslation()

  const handleExportXLS = () => {
    const columns: ExportColumn[] = [
      { header: t('users.firstName'), accessor: (row) => row.first_name },
      { header: t('users.lastName'), accessor: (row) => row.last_name },
      { header: t('users.middleName'), accessor: (row) => row.middle_name || '' },
      { header: t('users.phone'), accessor: (row) => row.phone || '' },
      { header: t('users.email'), accessor: (row) => row.email },
      { header: t('users.role'), accessor: (row) => row.role },
      { header: t('users.status'), accessor: (row) => row.status === 'approved' ? t('users.approved') : row.status === 'pending' ? t('users.pending') : t('users.fired') },
      { header: t('profile.registrationDate') || 'Дата реєстрації', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToXLS(sortedUsers, columns, 'users')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn[] = [
      { header: t('users.firstName'), accessor: (row) => row.first_name },
      { header: t('users.lastName'), accessor: (row) => row.last_name },
      { header: t('users.middleName'), accessor: (row) => row.middle_name || '' },
      { header: t('users.phone'), accessor: (row) => row.phone || '' },
      { header: t('users.email'), accessor: (row) => row.email },
      { header: t('users.role'), accessor: (row) => row.role },
      { header: t('users.status'), accessor: (row) => row.status === 'approved' ? t('users.approved') : row.status === 'pending' ? t('users.pending') : t('users.fired') },
      { header: t('profile.registrationDate') || 'Дата реєстрації', accessor: (row) => formatDate(row.created_at) },
    ]
    exportToCSV(sortedUsers, columns, 'users')
  }

  if (!currentUser || currentUser.role !== 'owner') {
    return <div className="p-8">Завантаження...</div>
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('users.title')}</h1>
        <ExportButton 
          onExportXLS={handleExportXLS}
          onExportCSV={handleExportCSV}
          disabled={sortedUsers.length === 0}
        />
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за ім'ям, телефоном або email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі ролі</option>
            <option value="admin">Адміністратор</option>
            <option value="owner">Власник</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          >
            <option value="all">Всі статуси</option>
            <option value="approved">Підтверджені</option>
            <option value="pending">Очікують</option>
            <option value="fired">Звільнені</option>
          </Select>
        </div>
        <div className="flex gap-4 items-center">
          <label className="text-sm font-medium">Сортувати за:</label>
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-48"
          >
            <option value="full_name">Ім&apos;ям</option>
            <option value="role">Роллю</option>
            <option value="status">{t('common.status')}</option>
            <option value="created_at">Датою створення</option>
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
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0 z-30">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]">Ім&apos;я</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Роль</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Телефон</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('users.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Створено</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дії</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium sticky left-0 bg-white z-10">
                    {user.first_name} {user.last_name} {user.middle_name || ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      user.role === 'owner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      user.status === 'approved' ? 'bg-green-100 text-green-800' :
                      user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {user.status === 'approved' ? t('users.approved') :
                       user.status === 'pending' ? t('users.pending') :
                       t('users.fired')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      {user.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(user.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Підтвердити"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {user.status !== 'fired' && (
                        <button
                          onClick={() => handleFire(user.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Звільнити"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Редагувати"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
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
              Показано {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedUsers.length)} з {sortedUsers.length}
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

      {/* Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); resetForm() }}
        title="Редагувати користувача"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ім&apos;я *</label>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Прізвище *</label>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">По батькові</label>
              <Input
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль *</label>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              >
                <option value="admin">Адміністратор</option>
                <option value="owner">Власник</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('users.status')} *</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="approved">Підтверджено</option>
                <option value="pending">Очікує</option>
                <option value="fired">Звільнено</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              Скасувати
            </Button>
            <Button type="submit">Зберегти зміни</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
