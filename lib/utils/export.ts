'use client'

import * as XLSX from 'xlsx'

export interface ExportColumn<T = Record<string, unknown>> {
  header: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accessor: (row: T | Record<string, unknown> | any) => string | number | null
}

export type ExportColumnAny = ExportColumn<Record<string, unknown>>

export function exportToXLS<T = Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[] | ExportColumnAny[],
  filename: string = 'export'
) {
  try {
    // Prepare data for Excel
    const headers = columns.map(col => col.header)
    const rows = data.map(row =>
      columns.map(col => {
        const value = col.accessor(row)
        // Preserve number types, convert other types to string
        if (value === null || value === undefined) return ''
        if (typeof value === 'number') return value
        return String(value)
      })
    )

    // Create workbook and worksheet
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])

    // Set column widths (auto-width)
    const columnWidths = headers.map((_, index) => {
      const maxLength = Math.max(
        headers[index]?.length || 10,
        ...rows.map(row => String(row[index] || '').length)
      )
      return { wch: Math.min(maxLength + 2, 50) } // Max width 50
    })
    worksheet['!cols'] = columnWidths

    // Create workbook
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xls', type: 'array' })

    // Create blob and download
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.ms-excel',
    })

    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.xls`
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error generating XLS:', error)
    alert('Error generating XLS file. Please try again.')
  }
}

export function exportToCSV<T = Record<string, unknown>>(
  data: T[],
  columns: ExportColumn<T>[] | ExportColumnAny[],
  filename: string = 'export'
) {
  try {
    // Prepare CSV data
    const headers = columns.map(col => col.header)
    const rows = data.map(row =>
      columns.map(col => {
        const value = col.accessor(row)
        return value !== null && value !== undefined ? String(value) : ''
      })
    )

    const csvContent = [headers, ...rows]
      .map(row =>
        row
          .map(cell => {
            const str = String(cell)
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      )
      .join('\n')

    // Add BOM for Excel compatibility with Cyrillic
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })

    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `${filename}-${new Date().toISOString().split('T')[0]}.csv`
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error generating CSV:', error)
    alert('Error generating CSV file. Please try again.')
  }
}
