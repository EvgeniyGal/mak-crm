'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Teacher {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  date_of_birth: string | null
  phone: string | null
  email: string | null
  status: string
  comment: string | null
  assigned_class_ids: string[]
  created_at: string
}

interface Class {
  id: string
  name: string
}

export default function TeachersPage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    date_of_birth: '',
    phone: '',
    email: '',
    status: 'active',
    comment: '',
    assigned_class_ids: [] as string[],
  })

  useEffect(() => {
    fetchTeachers()
    fetchClasses()
  }, [])

  const fetchTeachers = async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTeachers(data || [])
    } catch (error) {
      console.error('Error fetching teachers:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const submitData = {
        ...formData,
        assigned_class_ids: formData.assigned_class_ids,
        middle_name: formData.middle_name || null,
        phone: formData.phone || null,
        email: formData.email || null,
        comment: formData.comment || null,
        date_of_birth: formData.date_of_birth || null,
      }

      if (editingTeacher) {
        const { error } = await supabase
          .from('teachers')
          .update(submitData)
          .eq('id', editingTeacher.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('teachers')
          .insert([submitData])
        if (error) throw error
      }

      await fetchTeachers()
      setIsModalOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving teacher:', error)
      alert(t('teachers.errorSaving'))
    }
  }

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setFormData({
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      middle_name: teacher.middle_name || '',
      date_of_birth: teacher.date_of_birth || '',
      phone: teacher.phone || '',
      email: teacher.email || '',
      status: teacher.status,
      comment: teacher.comment || '',
      assigned_class_ids: teacher.assigned_class_ids,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('teachers.confirmDelete'))) return

    try {
      const { error } = await supabase
        .from('teachers')
        .delete()
        .eq('id', id)
      if (error) throw error
      await fetchTeachers()
    } catch (error) {
      console.error('Error deleting teacher:', error)
      alert(t('teachers.errorDeleting'))
    }
  }

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      middle_name: '',
      date_of_birth: '',
      phone: '',
      email: '',
      status: 'active',
      comment: '',
      assigned_class_ids: [],
    })
    setEditingTeacher(null)
  }

  const filteredTeachers = teachers.filter((teacher) => {
    const matchesSearch =
      searchTerm === '' ||
      `${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.phone && teacher.phone.includes(searchTerm)) ||
      (teacher.email && teacher.email.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || teacher.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const paginatedTeachers = filteredTeachers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const totalPages = Math.ceil(filteredTeachers.length / itemsPerPage)

  const getClassName = (classId: string) => {
    return classes.find(c => c.id === classId)?.name || classId
  }

  if (loading) {
    return <div className="p-8">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('teachers.title')}</h1>
        <Button onClick={() => { resetForm(); setIsModalOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          {t('teachers.addTeacher')}
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder={t('common.search') + '...'}
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
            <option value="all">{t('teachers.allStatuses')}</option>
            <option value="active">{t('teachers.active')}</option>
            <option value="probational">{t('teachers.probational')}</option>
            <option value="fired">{t('teachers.fired')}</option>
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
                  {t('teachers.teacher')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.dateOfBirth')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.phone')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.email')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.assignedClasses')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('teachers.comment')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.createdAt')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedTeachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {teacher.first_name} {teacher.last_name} {teacher.middle_name || ''}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {teacher.date_of_birth ? formatDate(teacher.date_of_birth) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {teacher.phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {teacher.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      teacher.status === 'active' ? 'bg-green-100 text-green-800' :
                      teacher.status === 'probational' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {teacher.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {teacher.assigned_class_ids.length > 0
                      ? teacher.assigned_class_ids.map(id => getClassName(id)).join(', ')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {teacher.comment || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(teacher.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleEdit(teacher)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(teacher.id)}
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
              {t('common.showing')} {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredTeachers.length)} {t('common.of')} {filteredTeachers.length}
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
        title={editingTeacher ? t('teachers.editTeacher') : t('teachers.addTeacher')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.firstName')} *
              </label>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.lastName')} *
              </label>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.middleName')}
              </label>
              <Input
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.dateOfBirth')}
              </label>
              <Input
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.phone')}
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.email')}
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('teachers.status')} *
              </label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="active">{t('teachers.active')}</option>
                <option value="probational">{t('teachers.probational')}</option>
                <option value="fired">{t('teachers.fired')}</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('teachers.comment')}
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
              {t('teachers.assignedClasses')}
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
              {classes.map((cls) => (
                <label key={cls.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.assigned_class_ids.includes(cls.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          assigned_class_ids: [...formData.assigned_class_ids, cls.id],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          assigned_class_ids: formData.assigned_class_ids.filter(id => id !== cls.id),
                        })
                      }
                    }}
                    className="mr-2"
                  />
                  {cls.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm() }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {editingTeacher ? t('common.save') : t('teachers.addTeacher')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

