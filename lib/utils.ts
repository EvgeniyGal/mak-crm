import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAge(dateOfBirth: Date | string): string {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth
  const today = new Date()
  const years = today.getFullYear() - dob.getFullYear()
  const months = today.getMonth() - dob.getMonth()
  const days = today.getDate() - dob.getDate()
  
  let totalMonths = years * 12 + months
  if (days < 0) totalMonths -= 1
  
  const yearsPart = Math.floor(totalMonths / 12)
  const monthsPart = totalMonths % 12
  
  if (yearsPart === 0) {
    return `${(monthsPart / 10).toFixed(1)} years`
  }
  return `${yearsPart}.${Math.floor(monthsPart / 1.2)} years`
}

export function formatDate(date: Date | string | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

