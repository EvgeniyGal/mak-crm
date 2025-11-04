import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && user) {
      // Check if user profile exists, if not create it
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!existingUser) {
        // Extract name from user metadata or email
        const email = user.email || ''
        const nameParts = (user.user_metadata?.full_name || email.split('@')[0]).split(' ')
        
        await supabase
          .from('users')
          .insert({
            id: user.id,
            email: email,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
            middle_name: null,
            role: 'admin',
            status: 'pending',
          })
      }
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}

