'use client'

import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Очікування підтвердження
        </h2>
        <p className="text-gray-600">
          Ваш акаунт очікує на підтвердження адміністратором. Ви отримаєте доступ до системи після схвалення.
        </p>
        <Link href="/auth/login" className="inline-block w-full">
          <Button variant="default" className="w-full">
            Повернутися до входу
          </Button>
        </Link>
      </div>
    </div>
  )
}

