import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MAK CRM',
  description: 'Comprehensive CRM system for educational centres',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  )
}

