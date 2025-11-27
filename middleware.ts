import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Avoid noisy aborted fetch errors by skipping redirects on prefetch requests
  // Next.js sets `x-middleware-prefetch` for link prefetch/background router requests.
  const isPrefetch = request.headers.get('x-middleware-prefetch') === '1'
  if (isPrefetch) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    // Check user status
    const { data: userProfile } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .single()

    if (!userProfile || userProfile.status !== 'approved') {
      return NextResponse.redirect(new URL('/auth/pending', request.url))
    }
  }

  // Redirect authenticated users away from auth pages
  if (request.nextUrl.pathname.startsWith('/auth/login') || request.nextUrl.pathname.startsWith('/auth/signup')) {
    if (user) {
      const { data: userProfile } = await supabase
        .from('users')
        .select('status')
        .eq('id', user.id)
        .single()

      if (userProfile && userProfile.status === 'approved') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }
  }

  // Don't interfere with callback or reset-password routes
  if (request.nextUrl.pathname.startsWith('/auth/callback') || request.nextUrl.pathname.startsWith('/auth/reset-password')) {
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/auth/:path*',
  ],
}

