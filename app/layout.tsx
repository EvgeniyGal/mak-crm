import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '@/components/i18n-provider'

export const metadata: Metadata = {
  title: 'MAK CRM',
  description: 'Comprehensive CRM system for educational centres',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="uk">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}

