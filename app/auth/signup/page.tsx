'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    middleName: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      // Wait a moment for session to be established
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Refresh the session to ensure auth.uid() is available
      await supabase.auth.getSession()

      // Create user profile using database function (bypasses RLS)
      const { error: profileError } = await supabase.rpc('create_user_profile', {
        user_id: authData.user.id,
        user_email: formData.email,
        user_first_name: formData.firstName,
        user_last_name: formData.lastName,
        user_middle_name: formData.middleName || null,
        user_phone: formData.phone || null,
        user_role: 'admin',
        user_status: 'pending',
      })

      if (profileError) {
        // Fallback to direct insert if function doesn't exist (for backward compatibility)
        // After signUp(), auth.uid() should be available
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            email: formData.email,
            first_name: formData.firstName,
            last_name: formData.lastName,
            middle_name: formData.middleName || null,
            phone: formData.phone || null,
            role: 'admin',
            status: 'pending',
          })

        if (insertError) {
          setError(insertError.message)
          setLoading(false)
          return
        }
      }

      router.push('/auth/login?message=Реєстрація успішна. Очікуйте підтвердження.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            MAK CRM
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Реєстрація нового користувача
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignup}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                Ім&apos;я
              </label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                Прізвище
              </label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="middleName" className="block text-sm font-medium text-gray-700">
                По батькові (необов&apos;язково)
              </label>
              <Input
                id="middleName"
                value={formData.middleName}
                onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Телефон (необов&apos;язково)
              </label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Електронна пошта
              </label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Пароль
              </label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                className="mt-1"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Реєстрація...' : 'Зареєструватися'}
          </Button>

          <div className="text-center">
            <a href="/auth/login" className="text-sm text-blue-600 hover:text-blue-500">
              Вже є акаунт? Увійти
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}

