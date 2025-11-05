'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useOwner() {
  const supabase = createClient()
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkOwner = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data } = await supabase
            .from('users')
            .select('role, status')
            .eq('id', user.id)
            .single()

          if (data && data.role === 'owner' && data.status === 'approved') {
            setIsOwner(true)
          }
        }
      } catch (error) {
        console.error('Error checking owner status:', error)
      } finally {
        setLoading(false)
      }
    }

    checkOwner()
  }, [supabase])

  return { isOwner, loading }
}

