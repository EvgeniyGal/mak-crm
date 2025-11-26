import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAge(dateOfBirth: Date | string): string {
  // Kept for backward compatibility in places that expect a string label
  const years = ageInYears(dateOfBirth)
  return `${years.toFixed(1)} years`
}

export function ageInYears(dateOfBirth: Date | string): number {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth
  const now = new Date()
  const diffMs = now.getTime() - dob.getTime()
  const years = diffMs / (365.2425 * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.round(years * 10) / 10)
}

export function formatAge(dateOfBirth: Date | string, yearsLabel: string, monthsLabel: string): string {
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth
  const now = new Date()
  
  let years = now.getFullYear() - dob.getFullYear()
  let months = now.getMonth() - dob.getMonth()
  
  if (months < 0) {
    years--
    months += 12
  }
  
  if (now.getDate() < dob.getDate()) {
    months--
    if (months < 0) {
      years--
      months += 12
    }
  }
  
  if (years === 0 && months === 0) {
    return `0${monthsLabel}`
  }
  
  if (years === 0) {
    return `${months}${monthsLabel}`
  }
  
  if (months === 0) {
    return `${years}${yearsLabel}`
  }
  
  return `${years}${yearsLabel} ${months}${monthsLabel}`
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

