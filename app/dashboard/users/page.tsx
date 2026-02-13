'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'

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
  const [itemsPerPage] = useState(10)

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
      let allUsers: User[] = []
      let from = 0
      const batchSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allUsers = [...allUsers, ...data]
          hasMore = data.length === batchSize
          from += batchSize
        } else {
          hasMore = false
        }
      }

      setUsers(allUsers)
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

  // DataTable handles sorting internally, so we just pass filteredUsers
  const sortedUsers = filteredUsers

  const { t } = useTranslation()

  // Column definitions for DataTable
  const columns: ColumnDef<User>[] = useMemo(() => [
    {
      accessorKey: 'full_name',
      header: "Ім'я",
      enableSorting: true,
      sortingFn: (rowA, rowB) => {
        const a = `${rowA.original.first_name} ${rowA.original.last_name}`
        const b = `${rowB.original.first_name} ${rowB.original.last_name}`
        return a.localeCompare(b)
      },
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.first_name} {row.original.last_name} {row.original.middle_name || ''}
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Роль',
      cell: ({ row }) => (
        <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
          row.original.role === 'owner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
        }`}>
          {row.original.role}
        </span>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Телефон',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">{row.original.phone || '-'}</div>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">{row.original.email}</div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('users.status'),
      cell: ({ row }) => {
        const status = row.original.status
        return (
          <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
            status === 'approved' ? 'bg-green-100 text-green-800' :
            status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            {status === 'approved' ? t('users.approved') :
             status === 'pending' ? t('users.pending') :
             t('users.fired')}
          </span>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Створено',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {formatDate(row.original.created_at)}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => {
        const user = row.original
        return (
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
        )
      },
    },
  ], [t, handleApprove, handleFire, handleEdit])

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
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold truncate min-w-0">{t('users.title')}</h1>
        <div className="flex gap-2 flex-shrink-0">
          <ExportButton 
            onExportXLS={handleExportXLS}
            onExportCSV={handleExportCSV}
            disabled={sortedUsers.length === 0}
          />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Пошук за ім'ям, телефоном або email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full md:w-48 flex-shrink-0"
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
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={sortedUsers}
        initialPageSize={itemsPerPage}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />

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
