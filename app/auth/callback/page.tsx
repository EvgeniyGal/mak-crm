'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient()
      
      // Check for hash fragments first (Supabase password reset emails use hash fragments)
      const hash = window.location.hash.substring(1)
      const type = searchParams.get('type')
      const code = searchParams.get('code')

      console.log('Callback - Hash:', hash ? 'present' : 'missing', 'Type:', type, 'Code:', code ? 'present' : 'missing')
      console.log('Full URL:', window.location.href)

      if (hash) {
        // Parse hash fragments
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const hashType = hashParams.get('type')
        const refreshToken = hashParams.get('refresh_token')

        console.log('Hash params - access_token:', accessToken ? 'present' : 'missing', 'type:', hashType)

        // If this is a password recovery with hash fragments, redirect to reset password page
        // and preserve the hash fragments
        if ((type === 'recovery' || hashType === 'recovery') && accessToken) {
          console.log('Redirecting to reset-password with hash')
          router.replace(`/auth/reset-password${window.location.hash}`)
          return
        }

        // For other auth flows with hash fragments, set session and redirect to dashboard
        if (accessToken) {
          try {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })
            router.push('/dashboard')
            return
          } catch (error) {
            console.error('Error setting session from hash:', error)
            router.push('/auth/login')
            return
          }
        }
      }

      // If no hash fragments, check for code in query params
      if (code) {
        if (type === 'recovery') {
          // Redirect to reset password page with code
          console.log('Redirecting to reset-password with code')
          router.replace(`/auth/reset-password?code=${code}&type=recovery`)
          return
        }

        // For other auth flows, exchange code for session
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error('Error exchanging code:', error)
            router.push('/auth/login')
            return
          }

          if (data.session) {
            router.push('/dashboard')
            return
          }
        } catch (error) {
          console.error('Error exchanging code:', error)
          router.push('/auth/login')
          return
        }
      }

      // If type is recovery but no hash/code, redirect to reset-password anyway
      // The reset-password page will show an appropriate error message
      if (type === 'recovery') {
        console.log('Type is recovery but no hash/code found, redirecting to reset-password')
        router.replace('/auth/reset-password')
        return
      }

      // Default redirect
      console.log('Default redirect to dashboard')
      router.push('/dashboard')
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-bold text-gray-900">Обробка...</h2>
        <p className="text-gray-600">Перенаправлення...</p>
      </div>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold text-gray-900">Завантаження...</h2>
        </div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  )
}
