'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import { User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  phone: string | null
  email: string
  day_of_birth: string | null
  role: string
  status: string
  created_at: string
}

export default function ProfilePage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    middle_name: '',
    phone: '',
    email: '',
    day_of_birth: '',
  })

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error
      if (data) {
        setUserProfile(data)
        setFormData({
          first_name: data.first_name,
          last_name: data.last_name,
          middle_name: data.middle_name || '',
          phone: data.phone || '',
          email: data.email,
          day_of_birth: data.day_of_birth || '',
        })
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      alert('Помилка завантаження профілю')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('users')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          middle_name: formData.middle_name || null,
          phone: formData.phone || null,
          day_of_birth: formData.day_of_birth || null,
        })
        .eq('id', user.id)

      if (error) throw error

      // Update email in auth if changed
      if (formData.email !== userProfile?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        })
        if (emailError) {
          console.error('Error updating email:', emailError)
          alert('Помилка оновлення електронної пошти. Можливо, ця адреса вже використовується.')
        }
      }

      alert('Профіль успішно оновлено')
      await fetchProfile()
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Помилка збереження профілю')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-900">Завантаження...</div>
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-8 w-8 text-gray-900" />
        <h1 className="text-3xl font-bold text-gray-900">Мій профіль</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ім&apos;я *
              </label>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Прізвище *
              </label>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                По батькові
              </label>
              <Input
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Телефон
              </label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Електронна пошта *
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Дата народження
              </label>
              <Input
                type="date"
                value={formData.day_of_birth}
                onChange={(e) => setFormData({ ...formData, day_of_birth: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Роль:</span>{' '}
                <span className="text-gray-900">{userProfile?.role === 'owner' ? 'Власник' : 'Адміністратор'}</span>
              </div>
              <div>
                <span className="font-medium">{t('profile.status')}:</span>{' '}
                <span className={`text-gray-900 ${
                  userProfile?.status === 'approved' ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {userProfile?.status === 'approved' ? t('profile.approved') : t('profile.pending')}
                </span>
              </div>
              <div className="col-span-2">
                <span className="font-medium">Дата реєстрації:</span>{' '}
                <span className="text-gray-900">{formatDate(userProfile?.created_at || '')}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? 'Збереження...' : 'Зберегти зміни'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

