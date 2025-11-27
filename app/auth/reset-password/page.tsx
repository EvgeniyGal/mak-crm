'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isValidLink, setIsValidLink] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Check for error from callback route
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setError(errorParam)
      setCheckingSession(false)
      return
    }

    // Check if we have a valid session (from callback route code exchange)
    const checkSession = async () => {
      console.log('Checking session. Full URL:', window.location.href)
      console.log('Search params:', window.location.search)
      console.log('Hash:', window.location.hash)
      
      // Check URL hash fragments first (Supabase password reset emails often use hash fragments)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const hashAccessToken = hashParams.get('access_token')
      const hashType = hashParams.get('type')
      const hashCode = hashParams.get('code')
      
      console.log('Hash params - access_token:', hashAccessToken ? 'present' : 'missing', 'type:', hashType, 'code:', hashCode ? 'present' : 'missing')
      
      // If we have hash fragments with access_token, use those
      if (hashAccessToken && hashType === 'recovery') {
        console.log('Found recovery token in hash, setting session...')
        try {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashParams.get('refresh_token') || '',
          })
          
          if (sessionError) {
            console.error('Error setting session from hash:', sessionError)
            setError(sessionError.message)
            setCheckingSession(false)
            return
          }
          
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            console.log('Session set successfully from hash')
            setIsValidLink(true)
            setCheckingSession(false)
            // Clean up URL by removing hash
            window.history.replaceState({}, '', window.location.pathname + window.location.search)
            return
          }
        } catch (err) {
          console.error('Error setting session from hash:', err)
          setError('Помилка при обробці посилання для відновлення пароля')
          setCheckingSession(false)
          return
        }
      }
      
      // Check URL search params for code (from callback route)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      const urlType = urlParams.get('type')
      
      console.log('URL params - code:', code ? 'present' : 'missing', 'type:', urlType)
      
      if (code && urlType === 'recovery') {
        // Exchange code for session on client side
        try {
          console.log('Attempting to exchange code for session...')
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(exchangeError.message || 'Помилка при обміні коду на сесію. Код може бути недійсним або вже використаний.')
            setCheckingSession(false)
            return
          }
          
          if (data.session) {
            console.log('Code exchanged successfully, session created')
            setIsValidLink(true)
            setCheckingSession(false)
            // Clean up URL by removing code parameter
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('code')
            newUrl.searchParams.delete('type')
            window.history.replaceState({}, '', newUrl.toString())
            return
          } else {
            console.error('Code exchange succeeded but no session returned')
            setError('Помилка: сесія не була створена після обміну коду')
            setCheckingSession(false)
            return
          }
        } catch (err) {
          console.error('Error exchanging code:', err)
          setError('Помилка при обробці посилання для відновлення пароля: ' + (err instanceof Error ? err.message : 'Невідома помилка'))
          setCheckingSession(false)
          return
        }
      }
      
      // Wait a bit for cookies to be set after redirect (if code was already exchanged server-side)
      // Try multiple times as cookies might take a moment to be available
      let session = null
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 200))
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          session = currentSession
          break
        }
      }
      
      if (session) {
        setIsValidLink(true)
        setCheckingSession(false)
        return
      }

      // Hash fragments already checked above, so skip this
      
      // No valid session or tokens found
      console.log('No valid session found. URL params:', window.location.search, 'Hash:', window.location.hash)
      
      // If we have no code and no hash token, the user might have accessed the page directly
      // or the email link format might be different
      if (!code && !hashAccessToken) {
        setError('Посилання для відновлення пароля недійсне або відсутнє. Будь ласка, використайте посилання з email листа. Якщо проблема повторюється, спробуйте запросити новий лист для відновлення пароля.')
      } else {
        setError('Невірне або відсутнє посилання для відновлення пароля. Будь ласка, використайте посилання з листа.')
      }
      setIsValidLink(false)
      setCheckingSession(false)
    }

    checkSession()
  }, [supabase, searchParams])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Паролі не співпадають')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Пароль повинен містити мінімум 6 символів')
      setLoading(false)
      return
    }

    try {
      // Check if we already have a session
      let { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        // Try to exchange code from URL first (most reliable method)
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        
        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message || 'Помилка при обміні коду на сесію')
            setLoading(false)
            return
          }
          if (data.session) {
            session = data.session
          }
        }
        
        // If still no session, try to set it from hash parameters (older format)
        if (!session) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          
          if (accessToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })

            if (sessionError) {
              setError(sessionError.message)
              setLoading(false)
              return
            }
            
            // Re-check session after setting it
            const { data: { session: newSession } } = await supabase.auth.getSession()
            session = newSession
          }
        }
        
        if (!session) {
          setError('Невірне посилання для відновлення пароля. Будь ласка, використайте посилання з листа.')
          setLoading(false)
          return
        }
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
      } else {
        setSuccess(true)
        setLoading(false)
        setTimeout(() => {
          router.push('/auth/login?message=Пароль успішно змінено. Тепер ви можете увійти.')
        }, 2000)
      }
    } catch {
      setError('Помилка при зміні пароля')
      setLoading(false)
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
            Встановлення нового пароля
          </p>
        </div>
        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              Пароль успішно змінено! Перенаправлення на сторінку входу...
            </div>
          </div>
        ) : checkingSession ? (
          <div className="space-y-4">
            <div className="text-center text-gray-600">
              Перевірка посилання...
            </div>
          </div>
        ) : !isValidLink ? (
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="text-center">
              <a href="/auth/login" className="text-sm text-blue-600 hover:text-blue-500">
                Повернутися до входу
              </a>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Новий пароль
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1"
                  placeholder="Мінімум 6 символів"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Підтвердіть пароль
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1"
                  placeholder="Повторіть пароль"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Зміна пароля...' : 'Змінити пароль'}
            </Button>

            <div className="text-center">
              <a href="/auth/login" className="text-sm text-blue-600 hover:text-blue-500">
                Повернутися до входу
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              MAK CRM
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Завантаження...
            </p>
          </div>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}

