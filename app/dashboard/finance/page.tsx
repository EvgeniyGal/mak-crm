'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

interface FinanceRow {
  date: string
  balanceAsOfStartDay: number
  incomesCash: number
  incomesCard: number
  expendituresCash: number
  expendituresCard: number
  balanceCash: number
  balanceCard: number
  totalBalance: number
}

export default function FinancePage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [financeData, setFinanceData] = useState<FinanceRow[]>([])
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')

  // Set default to current week (Monday to today)
  useEffect(() => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Calculate days to subtract to get to Monday
    // If Sunday (0), subtract 6 days. Otherwise subtract (dayOfWeek - 1) days
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysToMonday)
    monday.setHours(0, 0, 0, 0)

    const year = monday.getFullYear()
    const month = String(monday.getMonth() + 1).padStart(2, '0')
    const day = String(monday.getDate()).padStart(2, '0')
    const todayYear = today.getFullYear()
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0')
    const todayDay = String(today.getDate()).padStart(2, '0')

    setDateRangeStart(`${year}-${month}-${day}`)
    setDateRangeEnd(`${todayYear}-${todayMonth}-${todayDay}`)
  }, [])

  const getCurrentWeek = () => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Calculate days to subtract to get to Monday
    // If Sunday (0), subtract 6 days. Otherwise subtract (dayOfWeek - 1) days
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysToMonday)
    monday.setHours(0, 0, 0, 0)

    const year = monday.getFullYear()
    const month = String(monday.getMonth() + 1).padStart(2, '0')
    const day = String(monday.getDate()).padStart(2, '0')
    const todayYear = today.getFullYear()
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0')
    const todayDay = String(today.getDate()).padStart(2, '0')

    setDateRangeStart(`${year}-${month}-${day}`)
    setDateRangeEnd(`${todayYear}-${todayMonth}-${todayDay}`)
  }

  const getCurrentMonth = () => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    
    const year = firstDay.getFullYear()
    const month = String(firstDay.getMonth() + 1).padStart(2, '0')
    const day = String(firstDay.getDate()).padStart(2, '0')
    const todayYear = today.getFullYear()
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0')
    const todayDay = String(today.getDate()).padStart(2, '0')

    setDateRangeStart(`${year}-${month}-${day}`)
    setDateRangeEnd(`${todayYear}-${todayMonth}-${todayDay}`)
  }

  const fetchFinanceData = useCallback(async () => {
    if (!dateRangeStart || !dateRangeEnd) return

    try {
      setLoading(true)
      
      const startDate = new Date(dateRangeStart)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(dateRangeEnd)
      endDate.setHours(23, 59, 59, 999)

      // Get all dates in range
      const dates: string[] = []
      const currentDate = new Date(startDate)
      const endDateOnly = new Date(endDate)
      endDateOnly.setHours(23, 59, 59, 999)
      
      while (currentDate <= endDateOnly) {
        // Format date as YYYY-MM-DD using local time
        const year = currentDate.getFullYear()
        const month = String(currentDate.getMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        dates.push(dateStr)
        currentDate.setDate(currentDate.getDate() + 1)
      }

      // Fetch payments (incomes)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('type, package_types(amount), created_at, updated_at, status')
        .eq('status', 'paid')
        .gte('updated_at', startDate.toISOString())
        .lte('updated_at', endDate.toISOString())

      if (paymentsError) throw paymentsError

      // Fetch expenditures
      const { data: expenditures, error: expendituresError } = await supabase
        .from('expenditures')
        .select('amount, payment_type, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (expendituresError) throw expendituresError

      // Fetch teacher salaries
      const { data: salaries, error: salariesError } = await supabase
        .from('teacher_salaries')
        .select('amount, payment_type, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())

      if (salariesError) throw salariesError

      // Calculate initial balance (balance from previous days in the week)
      const firstDate = new Date(startDate)
      const dayOfWeek = firstDate.getDay()
      // Monday is day 1, but getDay() returns 0 for Sunday, 1 for Monday, etc.
      const isMonday = dayOfWeek === 1

      let initialBalanceCash = 0
      let initialBalanceCard = 0

      if (!isMonday) {
        // Get previous days in the week (from Monday of current week to start date)
        const weekStart = new Date(firstDate)
        weekStart.setDate(firstDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(firstDate)
        weekEnd.setHours(0, 0, 0, 0)

        // Fetch previous payments
        const { data: prevPayments } = await supabase
          .from('payments')
          .select('type, package_types(amount), created_at, updated_at, status')
          .eq('status', 'paid')
          .gte('updated_at', weekStart.toISOString())
          .lt('updated_at', weekEnd.toISOString())

        // Fetch previous expenditures
        const { data: prevExpenditures } = await supabase
          .from('expenditures')
          .select('amount, payment_type, created_at')
          .gte('created_at', weekStart.toISOString())
          .lt('created_at', weekEnd.toISOString())

        // Fetch previous salaries
        const { data: prevSalaries } = await supabase
          .from('teacher_salaries')
          .select('amount, payment_type, created_at')
          .gte('created_at', weekStart.toISOString())
          .lt('created_at', weekEnd.toISOString())

        // Calculate previous balances
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prevPayments?.forEach((payment: any) => {
          const amount = payment.package_types?.amount || 0
          if (payment.type === 'cash') {
            initialBalanceCash += amount
          } else if (payment.type === 'card') {
            initialBalanceCard += amount
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prevExpenditures?.forEach((expenditure: any) => {
          if (expenditure.payment_type === 'cash') {
            initialBalanceCash -= expenditure.amount
          } else if (expenditure.payment_type === 'till') {
            initialBalanceCard -= expenditure.amount
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prevSalaries?.forEach((salary: any) => {
          if (salary.payment_type === 'cash') {
            initialBalanceCash -= salary.amount
          } else if (salary.payment_type === 'till') {
            initialBalanceCard -= salary.amount
          }
        })
      }

      // Calculate data for each date
      const rows: FinanceRow[] = []
      let runningBalanceCash = initialBalanceCash
      let runningBalanceCard = initialBalanceCard

      // Process each date
      for (const dateStr of dates) {
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        // Filter transactions for this date
        // Compare dates by creating date objects and comparing year, month, day
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dayPayments = payments?.filter((p: any) => {
          const paymentDate = new Date(p.updated_at || p.created_at)
          return paymentDate.getFullYear() === date.getFullYear() &&
                 paymentDate.getMonth() === date.getMonth() &&
                 paymentDate.getDate() === date.getDate()
        }) || []

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dayExpenditures = expenditures?.filter((e: any) => {
          const expDate = new Date(e.created_at)
          return expDate.getFullYear() === date.getFullYear() &&
                 expDate.getMonth() === date.getMonth() &&
                 expDate.getDate() === date.getDate()
        }) || []

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const daySalaries = salaries?.filter((s: any) => {
          const salDate = new Date(s.created_at)
          return salDate.getFullYear() === date.getFullYear() &&
                 salDate.getMonth() === date.getMonth() &&
                 salDate.getDate() === date.getDate()
        }) || []

        // Calculate incomes
        let incomesCash = 0
        let incomesCard = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dayPayments.forEach((payment: any) => {
          const amount = payment.package_types?.amount || 0
          if (payment.type === 'cash') {
            incomesCash += amount
          } else if (payment.type === 'card') {
            incomesCard += amount
          }
        })

        // Calculate expenditures
        let expendituresCash = 0
        let expendituresCard = 0
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dayExpenditures.forEach((expenditure: any) => {
          if (expenditure.payment_type === 'cash') {
            expendituresCash += expenditure.amount
          } else if (expenditure.payment_type === 'till') {
            expendituresCard += expenditure.amount
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        daySalaries.forEach((salary: any) => {
          if (salary.payment_type === 'cash') {
            expendituresCash += salary.amount
          } else if (salary.payment_type === 'till') {
            expendituresCard += salary.amount
          }
        })

        // Store balance before adding today's transactions (this is the balance as of start of day)
        const balanceAsOfStartDay = runningBalanceCash + runningBalanceCard

        // Calculate balances after today's transactions
        runningBalanceCash += incomesCash - expendituresCash
        runningBalanceCard += incomesCard - expendituresCard

        rows.push({
          date: dateStr,
          balanceAsOfStartDay: balanceAsOfStartDay,
          incomesCash,
          incomesCard,
          expendituresCash,
          expendituresCard,
          balanceCash: runningBalanceCash,
          balanceCard: runningBalanceCard,
          totalBalance: runningBalanceCash + runningBalanceCard,
        })
      }

      setFinanceData(rows)
    } catch (error) {
      console.error('Error fetching finance data:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRangeStart, dateRangeEnd, supabase])

  useEffect(() => {
    if (dateRangeStart && dateRangeEnd) {
      fetchFinanceData()
    }
  }, [dateRangeStart, dateRangeEnd, fetchFinanceData])

  const totalIncomesCash = financeData.reduce((sum, row) => sum + row.incomesCash, 0)
  const totalIncomesCard = financeData.reduce((sum, row) => sum + row.incomesCard, 0)
  const totalExpendituresCash = financeData.reduce((sum, row) => sum + row.expendituresCash, 0)
  const totalExpendituresCard = financeData.reduce((sum, row) => sum + row.expendituresCard, 0)

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.finance')}</h1>
      </div>

      {/* Date Range and Quick Buttons */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.from')}</label>
            <Input
              type="date"
              value={dateRangeStart}
              onChange={(e) => setDateRangeStart(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.to')}</label>
            <Input
              type="date"
              value={dateRangeEnd}
              onChange={(e) => setDateRangeEnd(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={getCurrentWeek} variant="outline">
              {t('dashboard.thisWeek')}
            </Button>
            <Button onClick={getCurrentMonth} variant="outline">
              {t('dashboard.thisMonth')}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.date')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.balanceAsOfStartDay')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.incomesCash')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.incomesCard')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.expendituresCash')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.expendituresCard')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.balanceCash')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.balanceCard')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('finance.totalBalance')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {financeData.map((row, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {row.balanceAsOfStartDay.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    {row.incomesCash.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    {row.incomesCard.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                    {row.expendituresCash.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                    {row.expendituresCard.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {row.balanceCash.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {row.balanceCard.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                    {row.totalBalance.toFixed(2)} {t('common.uah')}
                  </td>
                </tr>
              ))}
              {financeData.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {t('finance.total')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    -
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {totalIncomesCash.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {totalIncomesCard.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {totalExpendituresCash.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                    {totalExpendituresCard.toFixed(2)} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {financeData[financeData.length - 1]?.balanceCash.toFixed(2) || '0.00'} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {financeData[financeData.length - 1]?.balanceCard.toFixed(2) || '0.00'} {t('common.uah')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {financeData[financeData.length - 1]?.totalBalance.toFixed(2) || '0.00'} {t('common.uah')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

