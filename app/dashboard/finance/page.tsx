'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ExportButton } from '@/components/ui/export-button'
import { exportToXLS, exportToCSV, ExportColumn } from '@/lib/utils/export'
import { formatDate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { DataTable } from '@/components/ui/data-table'
import { ColumnDef } from '@tanstack/react-table'
import { Calendar } from 'lucide-react'

interface FinanceRow {
  date: string
  incomesCash: number
  incomesCard: number
  expendituresCash: number
  expendituresCard: number
  balanceCash: number
  balanceCard: number
  accumulatedBalanceCash: number
  accumulatedBalanceCard: number
  totalBalance: number
}

export default function FinancePage() {
  const supabase = createClient()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [financeData, setFinanceData] = useState<FinanceRow[]>([])
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [initialBalanceCash, setInitialBalanceCash] = useState<number>(0)
  const [initialBalanceCard, setInitialBalanceCard] = useState<number>(0)
  // Debounced values for actual data fetching
  const [debouncedDateStart, setDebouncedDateStart] = useState('')
  const [debouncedDateEnd, setDebouncedDateEnd] = useState('')
  const [debouncedInitialBalanceCash, setDebouncedInitialBalanceCash] = useState<number>(0)
  const [debouncedInitialBalanceCard, setDebouncedInitialBalanceCard] = useState<number>(0)
  const isInitialMount = useRef(true)

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

    const startDate = `${year}-${month}-${day}`
    const endDate = `${todayYear}-${todayMonth}-${todayDay}`
    
    setDateRangeStart(startDate)
    setDateRangeEnd(endDate)
    // Update debounced values immediately to trigger data fetch
    setDebouncedDateStart(startDate)
    setDebouncedDateEnd(endDate)
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

    const startDate = `${year}-${month}-${day}`
    const endDate = `${todayYear}-${todayMonth}-${todayDay}`
    
    setDateRangeStart(startDate)
    setDateRangeEnd(endDate)
    // Update debounced values immediately to trigger data fetch
    setDebouncedDateStart(startDate)
    setDebouncedDateEnd(endDate)
  }

  const fetchFinanceData = useCallback(async () => {
    if (!debouncedDateStart || !debouncedDateEnd) return

    try {
      setLoading(true)
      
      const startDate = new Date(debouncedDateStart)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(debouncedDateEnd)
      endDate.setHours(23, 59, 59, 999)
      
      // Use the debounced initial balance values
      const currentInitialBalanceCash = debouncedInitialBalanceCash
      const currentInitialBalanceCard = debouncedInitialBalanceCard

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

      // Get today's date to ensure we fetch today's transactions for balance calculation
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)
      
      // Determine the actual end date for fetching (use the later of endDate or today)
      const fetchEndDate = endDate > todayEnd ? endDate : todayEnd

      // Fetch payments (incomes) - include today's transactions for balance calculation
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('type, package_types(amount), created_at, updated_at, status')
        .eq('status', 'paid')
        .gte('updated_at', startDate.toISOString())
        .lte('updated_at', fetchEndDate.toISOString())

      if (paymentsError) throw paymentsError

      // Fetch expenditures - include today's transactions for balance calculation
      const { data: expenditures, error: expendituresError } = await supabase
        .from('expenditures')
        .select('amount, payment_type, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', fetchEndDate.toISOString())

      if (expendituresError) throw expendituresError

      // Fetch teacher salaries - include today's transactions for balance calculation
      const { data: salaries, error: salariesError } = await supabase
        .from('teacher_salaries')
        .select('amount, payment_type, created_at')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', fetchEndDate.toISOString())

      if (salariesError) throw salariesError

      // Use user-provided initial balances for cash and card
      // Otherwise, start with 0 for both cash and card

      // Now calculate data for each date in the range (for display)
      const rows: FinanceRow[] = []
      let runningBalanceCash = currentInitialBalanceCash
      let runningBalanceCard = currentInitialBalanceCard

      // Process each date
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
        const dateStr = dates[dateIndex]
        const date = new Date(dateStr)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)
        const isFirstDateInRange = dateIndex === 0

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
          if (payment.type === 'cash' || payment.type === 'free') {
            // Add 'free' (Безплатне/Тестове) to cash (Готівка)
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
          } else if (expenditure.payment_type === 'card') {
            expendituresCard += expenditure.amount
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        daySalaries.forEach((salary: any) => {
          if (salary.payment_type === 'cash') {
            expendituresCash += salary.amount
          } else if (salary.payment_type === 'card') {
            expendituresCard += salary.amount
          }
        })

        // For the first date, set running balances to match the initial balances
        if (isFirstDateInRange) {
          runningBalanceCash = currentInitialBalanceCash
          runningBalanceCard = currentInitialBalanceCard
        }

        // Calculate balances after today's transactions
        runningBalanceCash += incomesCash - expendituresCash
        runningBalanceCard += incomesCard - expendituresCard

        // For balance columns, calculate based on THIS DAY's data (not current day)
        // БАЛАНС (ГОТІВКА) = ДОХОДИ (ГОТІВКА) - ВИТРАТИ (ГОТІВКА) for this day
        const balanceCash = incomesCash - expendituresCash
        // БАЛАНС (КАРТКА) = ДОХОДИ (КАРТКА) - ВИТРАТИ (КАРТКА) for this day
        const balanceCard = incomesCard - expendituresCard
        // Accumulated balances are the running balances after today's transactions
        const accumulatedBalanceCash = runningBalanceCash
        const accumulatedBalanceCard = runningBalanceCard
        // ЗАГАЛЬНИЙ БАЛАНС = Accumulated Cash + Accumulated Card
        const totalBalance = accumulatedBalanceCash + accumulatedBalanceCard

        rows.push({
          date: dateStr,
          incomesCash,
          incomesCard,
          expendituresCash,
          expendituresCard,
          balanceCash,
          balanceCard,
          accumulatedBalanceCash,
          accumulatedBalanceCard,
          totalBalance,
        })
      }

      setFinanceData(rows)
    } catch (error) {
      console.error('Error fetching finance data:', error)
    } finally {
      setLoading(false)
    }
  }, [debouncedDateStart, debouncedDateEnd, debouncedInitialBalanceCash, debouncedInitialBalanceCard, supabase])

  // On initial mount, set debounced values immediately (no delay)
  useEffect(() => {
    if (isInitialMount.current && dateRangeStart && dateRangeEnd) {
      // Initial load - set immediately without debounce
      setDebouncedDateStart(dateRangeStart)
      setDebouncedDateEnd(dateRangeEnd)
      setDebouncedInitialBalanceCash(initialBalanceCash)
      setDebouncedInitialBalanceCard(initialBalanceCard)
      isInitialMount.current = false
    }
    // Note: Date fields now update on blur only via onBlur handlers, not via this useEffect
  }, [dateRangeStart, dateRangeEnd, initialBalanceCash, initialBalanceCard]) // Depend on date ranges so it runs when they're set

  // Debounce initial balance changes - wait 1 second after user stops typing
  useEffect(() => {
    if (isInitialMount.current) {
      // Initial load - set immediately
      setDebouncedInitialBalanceCash(initialBalanceCash)
    } else {
      // Subsequent changes - debounce for 1 second
      const timer = setTimeout(() => {
        setDebouncedInitialBalanceCash(initialBalanceCash)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [initialBalanceCash])

  useEffect(() => {
    if (isInitialMount.current) {
      // Initial load - set immediately
      setDebouncedInitialBalanceCard(initialBalanceCard)
    } else {
      // Subsequent changes - debounce for 1 second
      const timer = setTimeout(() => {
        setDebouncedInitialBalanceCard(initialBalanceCard)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [initialBalanceCard])

  useEffect(() => {
    if (debouncedDateStart && debouncedDateEnd) {
      fetchFinanceData()
    }
  }, [debouncedDateStart, debouncedDateEnd, debouncedInitialBalanceCash, debouncedInitialBalanceCard, fetchFinanceData])

  const totalIncomesCash = financeData.reduce((sum, row) => sum + row.incomesCash, 0)
  const totalIncomesCard = financeData.reduce((sum, row) => sum + row.incomesCard, 0)
  const totalExpendituresCash = financeData.reduce((sum, row) => sum + row.expendituresCash, 0)
  const totalExpendituresCard = financeData.reduce((sum, row) => sum + row.expendituresCard, 0)

  // Prepare data with totals row
  const tableData = useMemo(() => {
    if (financeData.length === 0) return []
    
    const data = [...financeData]
    const lastRow = financeData[financeData.length - 1]
    data.push({
      date: t('finance.total'),
      incomesCash: totalIncomesCash,
      incomesCard: totalIncomesCard,
      expendituresCash: totalExpendituresCash,
      expendituresCard: totalExpendituresCard,
      balanceCash: lastRow.balanceCash,
      balanceCard: lastRow.balanceCard,
      accumulatedBalanceCash: lastRow.accumulatedBalanceCash,
      accumulatedBalanceCard: lastRow.accumulatedBalanceCard,
      totalBalance: lastRow.totalBalance,
    } as FinanceRow)
    return data
  }, [financeData, totalIncomesCash, totalIncomesCard, totalExpendituresCash, totalExpendituresCard, t])

  // Column definitions for DataTable
  const columns: ColumnDef<FinanceRow>[] = useMemo(() => [
    {
      accessorKey: 'date',
      header: t('finance.date'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm ${isTotalRow ? 'font-semibold bg-gray-50' : 'text-gray-500'}`}>
            {isTotalRow ? row.original.date : formatDate(row.original.date)}
          </div>
        )
      },
    },
    {
      accessorKey: 'incomesCash',
      header: t('finance.incomesCash'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'text-green-600 bg-gray-50' : 'text-green-600'}`}>
            {row.original.incomesCash.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'incomesCard',
      header: t('finance.incomesCard'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'text-green-600 bg-gray-50' : 'text-green-600'}`}>
            {row.original.incomesCard.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'expendituresCash',
      header: t('finance.expendituresCash'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'text-red-600 bg-gray-50' : 'text-red-600'}`}>
            {row.original.expendituresCash.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'expendituresCard',
      header: t('finance.expendituresCard'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'text-red-600 bg-gray-50' : 'text-red-600'}`}>
            {row.original.expendituresCard.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'balanceCash',
      header: t('finance.balanceCash'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'bg-gray-50' : ''}`}>
            {isTotalRow ? '-' : `${row.original.balanceCash.toFixed(2)} ${t('common.uah')}`}
          </div>
        )
      },
    },
    {
      accessorKey: 'balanceCard',
      header: t('finance.balanceCard'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'bg-gray-50' : ''}`}>
            {isTotalRow ? '-' : `${row.original.balanceCard.toFixed(2)} ${t('common.uah')}`}
          </div>
        )
      },
    },
    {
      accessorKey: 'accumulatedBalanceCash',
      header: t('finance.accumulatedBalanceCash'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'bg-gray-50' : ''}`}>
            {row.original.accumulatedBalanceCash.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'accumulatedBalanceCard',
      header: t('finance.accumulatedBalanceCard'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm font-medium ${isTotalRow ? 'bg-gray-50' : ''}`}>
            {row.original.accumulatedBalanceCard.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
    {
      accessorKey: 'totalBalance',
      header: t('finance.totalBalance'),
      cell: ({ row }) => {
        const isTotalRow = row.original.date === t('finance.total')
        return (
          <div className={`text-sm ${isTotalRow ? 'font-bold bg-gray-50' : 'font-bold'}`}>
            {row.original.totalBalance.toFixed(2)} {t('common.uah')}
          </div>
        )
      },
    },
  ], [t])

  const handleExportXLS = () => {
    const columns: ExportColumn<FinanceRow>[] = [
      { 
        header: t('finance.date'), 
        accessor: (row) => formatDate(row.date) 
      },
      { 
        header: t('finance.incomesCash'), 
        accessor: (row) => Number(row.incomesCash.toFixed(2))
      },
      { 
        header: t('finance.incomesCard'), 
        accessor: (row) => Number(row.incomesCard.toFixed(2))
      },
      { 
        header: t('finance.expendituresCash'), 
        accessor: (row) => Number(row.expendituresCash.toFixed(2))
      },
      { 
        header: t('finance.expendituresCard'), 
        accessor: (row) => Number(row.expendituresCard.toFixed(2))
      },
      { 
        header: t('finance.balanceCash'), 
        accessor: (row) => row.date === t('finance.total') ? null : Number(row.balanceCash.toFixed(2))
      },
      { 
        header: t('finance.balanceCard'), 
        accessor: (row) => row.date === t('finance.total') ? null : Number(row.balanceCard.toFixed(2))
      },
      { 
        header: t('finance.accumulatedBalanceCash'), 
        accessor: (row) => Number(row.accumulatedBalanceCash.toFixed(2))
      },
      { 
        header: t('finance.accumulatedBalanceCard'), 
        accessor: (row) => Number(row.accumulatedBalanceCard.toFixed(2))
      },
      { 
        header: t('finance.totalBalance'), 
        accessor: (row) => Number(row.totalBalance.toFixed(2))
      },
    ]

    // Add totals row if there's data
    const exportData = [...financeData]
    if (financeData.length > 0) {
      const lastRow = financeData[financeData.length - 1]
      exportData.push({
        date: t('finance.total'),
        incomesCash: totalIncomesCash,
        incomesCard: totalIncomesCard,
        expendituresCash: totalExpendituresCash,
        expendituresCard: totalExpendituresCard,
        balanceCash: lastRow.balanceCash,
        balanceCard: lastRow.balanceCard,
        accumulatedBalanceCash: lastRow.accumulatedBalanceCash,
        accumulatedBalanceCard: lastRow.accumulatedBalanceCard,
        totalBalance: lastRow.totalBalance,
      } as FinanceRow)
    }

    exportToXLS(exportData, columns, 'finance')
  }

  const handleExportCSV = () => {
    const columns: ExportColumn<FinanceRow>[] = [
      { 
        header: t('finance.date'), 
        accessor: (row) => formatDate(row.date) 
      },
      { 
        header: t('finance.incomesCash'), 
        accessor: (row) => `${row.incomesCash.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.incomesCard'), 
        accessor: (row) => `${row.incomesCard.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.expendituresCash'), 
        accessor: (row) => `${row.expendituresCash.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.expendituresCard'), 
        accessor: (row) => `${row.expendituresCard.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.balanceCash'), 
        accessor: (row) => row.date === t('finance.total') ? '-' : `${row.balanceCash.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.balanceCard'), 
        accessor: (row) => row.date === t('finance.total') ? '-' : `${row.balanceCard.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.accumulatedBalanceCash'), 
        accessor: (row) => `${row.accumulatedBalanceCash.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.accumulatedBalanceCard'), 
        accessor: (row) => `${row.accumulatedBalanceCard.toFixed(2)} ${t('common.uah')}` 
      },
      { 
        header: t('finance.totalBalance'), 
        accessor: (row) => `${row.totalBalance.toFixed(2)} ${t('common.uah')}` 
      },
    ]

    // Add totals row if there's data
    const exportData = [...financeData]
    if (financeData.length > 0) {
      const lastRow = financeData[financeData.length - 1]
      exportData.push({
        date: t('finance.total'),
        incomesCash: totalIncomesCash,
        incomesCard: totalIncomesCard,
        expendituresCash: totalExpendituresCash,
        expendituresCard: totalExpendituresCard,
        balanceCash: lastRow.balanceCash,
        balanceCard: lastRow.balanceCard,
        accumulatedBalanceCash: lastRow.accumulatedBalanceCash,
        accumulatedBalanceCard: lastRow.accumulatedBalanceCard,
        totalBalance: lastRow.totalBalance,
      } as FinanceRow)
    }

    exportToCSV(exportData, columns, 'finance')
  }

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-gray-900 truncate min-w-0">{t('dashboard.finance')}</h1>
        <ExportButton 
          onExportXLS={handleExportXLS}
          onExportCSV={handleExportCSV}
          disabled={financeData.length === 0}
        />
      </div>

      {/* Date Range and Quick Buttons */}
      <div className="bg-white rounded-lg shadow p-4 mb-6 space-y-4">
        <div className="flex flex-col gap-4">
          {/* First row: Date inputs and buttons */}
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.from')}</label>
              <Input
                type="date"
                value={dateRangeStart}
                onChange={(e) => setDateRangeStart(e.target.value)}
                onBlur={(e) => {
                  // Apply changes only on blur - update both local and debounced state
                  const newValue = e.target.value
                  setDateRangeStart(newValue)
                  setDebouncedDateStart(newValue)
                }}
                className="w-full"
              />
            </div>
            <div className="w-full md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.to')}</label>
              <Input
                type="date"
                value={dateRangeEnd}
                onChange={(e) => setDateRangeEnd(e.target.value)}
                onBlur={(e) => {
                  // Apply changes only on blur - update both local and debounced state
                  const newValue = e.target.value
                  setDateRangeEnd(newValue)
                  setDebouncedDateEnd(newValue)
                }}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto flex-shrink-0">
              <Button onClick={getCurrentWeek} variant="outline" className="p-2 md:px-4 md:py-2" title={t('dashboard.thisWeek')}>
                <Calendar className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{t('dashboard.thisWeek')}</span>
              </Button>
              <Button onClick={getCurrentMonth} variant="outline" className="p-2 md:px-4 md:py-2" title={t('dashboard.thisMonth')}>
                <Calendar className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{t('dashboard.thisMonth')}</span>
              </Button>
            </div>
          </div>
          {/* Second row: Beginning Balance */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('finance.beginningBalance')}</label>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">{t('common.cash')}</label>
                <Input
                  type="number"
                  value={initialBalanceCash}
                  onChange={(e) => setInitialBalanceCash(parseFloat(e.target.value) || 0)}
                  className="w-full"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">{t('common.card')}</label>
                <Input
                  type="number"
                  value={initialBalanceCard}
                  onChange={(e) => setInitialBalanceCard(parseFloat(e.target.value) || 0)}
                  className="w-full"
                  placeholder="0"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={tableData}
        initialPageSize={10}
        stickyFirstColumn={true}
        maxHeight="calc(100vh-300px)"
      />
    </div>
  )
}

