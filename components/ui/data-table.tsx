'use client'

import React, { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select } from './select'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (value: string) => void
  searchValue?: string
  initialPageSize?: number
  className?: string
  stickyFirstColumn?: boolean
  maxHeight?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  initialPageSize = 10,
  className,
  stickyFirstColumn = false,
  maxHeight = 'calc(100vh-300px)',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: () => {},
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  })

  const getSortIcon = (columnId: string) => {
    const column = table.getColumn(columnId)
    if (!column) return null
    
    const isSorted = column.getIsSorted()
    if (isSorted === 'asc') {
      return <ArrowUp className="ml-1 h-3 w-3 inline" />
    }
    if (isSorted === 'desc') {
      return <ArrowDown className="ml-1 h-3 w-3 inline" />
    }
    return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-50" />
  }

  return (
    <div className={cn('bg-white rounded-lg shadow overflow-hidden', className)}>
      {/* Mobile Card View */}
      <div className="block md:hidden">
        <div className="divide-y divide-gray-200">
          {table.getRowModel().rows.map((row) => (
            <div key={row.id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
              <div className="space-y-2">
                {row.getVisibleCells().map((cell) => {
                  const column = cell.column
                  const header = column.columnDef.header
                  const headerText = typeof header === 'string' ? header : column.id
                  
                  // Skip action columns on mobile or show them at the bottom
                  if (column.id === 'actions' || column.id === 'action') {
                    return null
                  }

                  return (
                    <div key={cell.id} className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider sm:w-1/3">
                        {headerText}:
                      </span>
                      <div className="text-sm text-gray-900 sm:w-2/3 sm:text-right">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </div>
                  )
                })}
                {/* Actions row for mobile */}
                {row.getVisibleCells().some(cell => cell.column.id === 'actions' || cell.column.id === 'action') && (
                  <div className="pt-2 border-t border-gray-200 flex gap-2">
                    {row.getVisibleCells()
                      .filter(cell => cell.column.id === 'actions' || cell.column.id === 'action')
                      .map((cell) => (
                        <div key={cell.id} className="flex-1">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-auto" style={{ maxHeight }}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-30">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  const canSort = header.column.getCanSort()
                  const isFirstColumn = index === 0
                  
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                        canSort && 'cursor-pointer hover:bg-gray-200',
                        stickyFirstColumn && isFirstColumn && 'sticky left-0 bg-gray-100 z-40 shadow-[2px_0_4px_rgba(0,0,0,0.1)]'
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && getSortIcon(header.column.id)}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell, index) => {
                  const isFirstColumn = index === 0
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'px-6 py-4 text-sm text-gray-500',
                        stickyFirstColumn && isFirstColumn && 'sticky left-0 bg-white z-10'
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm text-gray-700 whitespace-nowrap">Показати:</label>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onChange={(e) => {
              table.setPageSize(Number(e.target.value))
            }}
            className="w-20"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
          <span className="text-sm text-gray-700 whitespace-nowrap">
            Показано {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}{' '}
            з {table.getFilteredRowModel().rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className={cn(
              'p-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-700 px-2">
            Сторінка {table.getState().pagination.pageIndex + 1} з {table.getPageCount()}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className={cn(
              'p-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
