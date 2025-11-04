import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
          {
            'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500 shadow-sm': variant === 'default',
            'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500 shadow-sm': variant === 'destructive',
            'border-2 border-gray-400 bg-white text-gray-900 hover:bg-gray-50 hover:border-gray-500 active:bg-gray-100 focus-visible:ring-blue-500 shadow-sm': variant === 'outline',
            'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400 focus-visible:ring-gray-500 shadow-sm': variant === 'secondary',
            'bg-transparent text-gray-900 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-500': variant === 'ghost',
            'bg-transparent text-blue-600 underline-offset-4 hover:underline hover:text-blue-700 active:text-blue-800 focus-visible:ring-blue-500': variant === 'link',
          },
          {
            'h-10 py-2 px-4': size === 'default',
            'h-9 px-3 text-sm': size === 'sm',
            'h-11 px-8 text-base': size === 'lg',
            'h-10 w-10': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }

